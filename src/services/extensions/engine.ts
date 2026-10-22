import { ISource } from '../sources/types';
import { ExtensionManifest } from './types';
import { Manga, Chapter, Page } from '../../types';

/**
 * Safe HTTP fetcher that automatically catches ISP DNS sinkholes (such as 10.254.254.1 or network blocks)
 * and falls back to an uncensored global cloud proxy so adult/blocked manga loads without needing private DNS.
 */
async function fetchWithDnsFallback(
  url: string,
  headers: Record<string, string>,
  options?: RequestInit,
  timeoutMs: number = 7000
): Promise<Response> {
  // On local web dev runner, route through local proxy to bypass browser CORS completely
  if (
    typeof window !== 'undefined' &&
    window.location &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    try {
      const localProxyUrl = `http://127.0.0.1:8089/?url=${encodeURIComponent(url)}`;
      const lRes = await fetch(localProxyUrl, { ...options });
      if (lRes.ok) return lRes;
    } catch (lErr) {
      // fallback to normal fetch
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { headers, signal: controller.signal, ...options });
    clearTimeout(timer);
    if (res.ok) return res;
    if (res.status === 403 || res.status >= 500) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res;
  } catch (err: any) {
    clearTimeout(timer);
    const errMsg = String(err?.message || err);
    const isBlocked =
      errMsg.includes('10.254.254.1') ||
      errMsg.includes('ConnectException') ||
      errMsg.includes('Network request failed') ||
      errMsg.includes('Failed to fetch') ||
      errMsg.includes('aborted') ||
      errMsg.includes('403') ||
      errMsg.includes('503');

    if (isBlocked) {
      try {
        const proxyController = new AbortController();
        const pTimer = setTimeout(() => proxyController.abort(), 6000);
        const proxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(url)}`;
        const pRes = await fetch(proxyUrl, {
          headers: { 'User-Agent': headers['User-Agent'] || 'Mozilla/5.0' },
          signal: proxyController.signal,
        });
        clearTimeout(pTimer);
        if (pRes.ok) return pRes;
      } catch (pErr) {
        try {
          const aController = new AbortController();
          const aTimer = setTimeout(() => aController.abort(), 5000);
          const altProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
          const aRes = await fetch(altProxyUrl, { signal: aController.signal });
          clearTimeout(aTimer);
          if (aRes.ok) return aRes;
        } catch (aErr) {}
      }
    }
    throw err;
  }
}

/**
 * Normalizes remote image URLs:
 * - Decodes Next.js proxy URLs (e.g. Flame Comics: /_next/image?url=https%3A%2F%2F...&w=1920&q=75) into direct raw CDN URLs
 * - Resolves relative and protocol-relative paths
 * - Removes WordPress thumbnail resize dimensions (-150x150) for maximum image clarity
 */
export function cleanSourceImageUrl(rawUrl: string, baseUrl?: string): string {
  if (!rawUrl) return '';
  let url = rawUrl.trim();
  if (url.includes('_next/image') && url.includes('url=')) {
    const nextUrlMatch = url.match(/[?&]url=([^&]+)/);
    if (nextUrlMatch) {
      try {
        url = decodeURIComponent(nextUrlMatch[1]);
      } catch (e) {}
    }
  }
  if (url.startsWith('//')) {
    url = `https:${url}`;
  } else if (url.startsWith('/') && baseUrl) {
    url = `${baseUrl}${url}`;
  }
  url = url.replace(/-\d+x\d+(\.\w+)$/, '$1').trim();
  return url;
}

export class DynamicMadaraSource implements ISource {
  id: string;
  name: string;
  description: string;
  version: string;
  icon?: string;
  isLocal = false;
  baseUrl: string;
  headers: Record<string, string>;
  isNsfw: boolean = false;
  private flameCatalogCache: Manga[] | null = null;
  private flameFetchPromise: Promise<Manga[]> | null = null;

  constructor(manifest: ExtensionManifest) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.description = manifest.description || `Manga from ${manifest.baseUrl}`;
    this.version = manifest.version;
    this.icon = manifest.icon;
    this.isNsfw = Boolean(manifest.isNsfw);
    this.baseUrl = manifest.baseUrl.replace(/\/+$/, '');
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: `${this.baseUrl}/`,
      ...manifest.headers,
    };
  }

  getCategories(): { id: string; label: string }[] {
    if (this.baseUrl.includes('asurascans') || this.baseUrl.includes('asura')) {
      return [
        { id: 'all', label: '🔥 All Comics' },
        { id: 'ranking', label: '⭐ Top Ranking' },
      ];
    }
    if (this.baseUrl.includes('flamecomics')) {
      return [
        { id: 'all', label: '🔥 All Series' },
      ];
    }
    if (this.isNsfw) {
      return [
        { id: 'views', label: '🔥 Popular 18+' },
        { id: 'latest', label: '✨ Latest Releases' },
        { id: 'manhwa', label: '🔞 Adult Manhwa' },
        { id: 'doujinshi', label: '🎨 Doujinshi' },
        { id: 'completed', label: '✅ Completed' },
      ];
    }
    return [
      { id: 'views', label: '🔥 Popular' },
      { id: 'latest', label: '✨ Latest Chapters' },
      { id: 'new-manga', label: '🆕 New Manga' },
      { id: 'rating', label: '⭐ Top Rated' },
      { id: 'manhwa', label: '🇰🇷 Manhwa' },
      { id: 'manhua', label: '🇨🇳 Manhua' },
      { id: 'fantasy', label: '⚔️ Fantasy' },
      { id: 'action', label: '💥 Action' },
      { id: 'isekai', label: '🌀 Isekai' },
    ];
  }

  /**
   * Universal HTML parser to extract manga items from any Madara / webtoon HTML page
   */
  parseMangaListHtml(html: string): Manga[] {
    const linkRegex = /<a\s+([^>]*?)href=["'](?:https?:\/\/[^\/"'>]+)?\/(?:manga|series|comic|comics|webtoon|manhwa|scan|project|titre)\/([^"'\/#?]+)\/?[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi;
    const mangaLinks = [...html.matchAll(linkRegex)];

    const BADGES = new Set([
      'SS', 'HOT', 'NEW', 'RAW', 'COMPLETED', 'UP', '18+', 'TRENDING', 'HOT MANGA', 'POPULAR', 'TOP', 'BEST', 'RECOMMENDED'
    ]);

    const seen = new Set<string>();
    const results: Manga[] = [];

    for (const m of mangaLinks) {
      const attrs = (m[1] || '') + ' ' + (m[3] || '');
      const slug = m[2];
      if (!slug || ['comics', 'series', 'manga', 'webtoon', 'genre', 'genres', 'author', 'bookmark', 'bookmarks'].includes(slug) || slug.includes('?') || slug.includes('=') || seen.has(slug)) continue;
      seen.add(slug);

      const inner = m[4] || '';
      const pos = m.index || 0;
      const context = html.slice(Math.max(0, pos - 250), Math.min(html.length, pos + 1000));

      let coverUrl = '';
      const imgMatch =
        inner.match(/(?:data-src|data-lazy-src|data-cfsrc|src)=["']([^"']+)["']/i) ||
        context.match(/(?:data-src|data-lazy-src|data-cfsrc)=["']([^"']+)["']/i) ||
        context.match(/\bsrc=["']([^"']+)["']/i);

      if (imgMatch && imgMatch[1] && !imgMatch[1].includes('dflazy') && !imgMatch[1].includes('blank.gif')) {
        coverUrl = cleanSourceImageUrl(imgMatch[1], this.baseUrl);
      }

      // Title extraction: strictly filter out badge overlays like "SS", "HOT", "NEW"
      let title = '';
      const cleanInner = inner.replace(/<span\b[^>]*class=["'][^"']*badge[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '');

      // 1. Direct title attribute on <a> tag (e.g. <a title="Martial Peak">)
      const aTitleMatch = attrs.match(/\btitle=["']([^"']+)["']/i);
      if (aTitleMatch && !BADGES.has(aTitleMatch[1].toUpperCase().trim())) {
        title = aTitleMatch[1].replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").trim();
      }

      // 2. Heading inside cleanInner or post-title
      if (!title || BADGES.has(title.toUpperCase().trim())) {
        const headingMatch = cleanInner.match(/<(?:h[1-6]|span|div)\s+[^>]*class=["'][^"']*(?:title|name)[^"']*["'][^>]*>([^<]+)<\//i);
        if (headingMatch && !BADGES.has(headingMatch[1].toUpperCase().trim())) {
          title = headingMatch[1].replace(/&#8217;/g, "'").replace(/&#8216;/g, "'").trim();
        }
      }

      // 3. Clean image alt tag
      if (!title || BADGES.has(title.toUpperCase().trim())) {
        const altMatch = cleanInner.match(/alt=["']([^"']+)["']/i) || context.match(/alt=["']([^"']+)["']/i);
        if (altMatch && !BADGES.has(altMatch[1].toUpperCase().trim())) {
          const rawAlt = altMatch[1].replace(/^(?:Read\s+)?(?:Manga|Manhua|Manhwa)\s+/i, '').replace(/&#8217;/g, "'").trim();
          if (rawAlt.length > 2 && !BADGES.has(rawAlt.toUpperCase())) {
            title = rawAlt;
          }
        }
      }

      // 4. Context title
      if (!title || BADGES.has(title.toUpperCase().trim())) {
        const ctxTitle = context.match(/<(?:h[1-6]|a)[^>]*title=["']([^"']+)["']/i);
        if (ctxTitle && !BADGES.has(ctxTitle[1].toUpperCase().trim())) {
          title = ctxTitle[1].replace(/&#8217;/g, "'").trim();
        }
      }

      // 5. Fallback to clean slug
      if (!title || BADGES.has(title.toUpperCase().trim())) {
        title = slug.replace(/-\w{8}$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      }

      results.push({
        id: `${this.id}::${slug}`,
        title: title,
        coverUrl: coverUrl || 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600',
        author: this.name,
        description: '',
        status: 'ongoing',
        sourceId: this.id,
        sourceName: this.name,
        addedAt: Date.now(),
        isNsfw: this.isNsfw,
      });
    }

    return results;
  }

  async getMangaList(page: number = 1, category: string = 'views'): Promise<Manga[]> {
    try {
      // Flame Comics: single-page catalog of 150+ titles.
      // We fetch once, cache the complete catalog, and paginate client-side in lightweight batches of 12!
      if (this.baseUrl.includes('flamecomics')) {
        const PAGE_SIZE = 12; // 12 items per batch (6 rows of 2 columns) for instant rendering
        if (!this.flameCatalogCache) {
          if (!this.flameFetchPromise) {
            this.flameFetchPromise = (async () => {
              const res = await fetchWithDnsFallback(`${this.baseUrl}/browse`, this.headers);
              if (!res.ok) throw new Error(`HTTP ${res.status} from ${this.baseUrl}`);
              const html = await res.text();
              const items = this.parseMangaListHtml(html);
              this.flameCatalogCache = items;
              return items;
            })();
          }
          await this.flameFetchPromise;
          this.flameFetchPromise = null;
        }

        const all = this.flameCatalogCache || [];
        const start = (page - 1) * PAGE_SIZE;
        if (start >= all.length) return [];
        return all.slice(start, start + PAGE_SIZE);
      }

      let path = '';
      const catLower = (category || 'views').toLowerCase();

      if (this.baseUrl.includes('asurascans') || this.baseUrl.includes('asura')) {
        path = catLower === 'ranking' ? '/series-ranking' : (page === 1 ? '/comics' : `/comics?page=${page}`);
      } else if (catLower === 'views' || catLower === 'popular' || catLower === 'top') {
        path = page === 1 ? '/manga/?m_orderby=views' : `/manga/page/${page}/?m_orderby=views`;
      } else if (catLower === 'latest' || catLower === 'update') {
        path = page === 1 ? '/manga/?m_orderby=latest' : `/manga/page/${page}/?m_orderby=latest`;
      } else if (catLower === 'new-manga' || catLower === 'new') {
        path = page === 1 ? '/manga/?m_orderby=new-manga' : `/manga/page/${page}/?m_orderby=new-manga`;
      } else if (catLower === 'rating') {
        path = page === 1 ? '/manga/?m_orderby=rating' : `/manga/page/${page}/?m_orderby=rating`;
      } else if (catLower === 'alphabet') {
        path = page === 1 ? '/manga/?m_orderby=alphabet' : `/manga/page/${page}/?m_orderby=alphabet`;
      } else {
        path = page === 1 ? `/genres/${catLower}/` : `/genres/${catLower}/page/${page}/`;
      }

      let url = `${this.baseUrl}${path}`;
      let res = await fetchWithDnsFallback(url, this.headers);

      if (res.status === 404 && path.includes('/genres/')) {
        const altPath = page === 1 ? `/manga-genre/${catLower}/` : `/manga-genre/${catLower}/page/${page}/`;
        url = `${this.baseUrl}${altPath}`;
        res = await fetchWithDnsFallback(url, this.headers);
      }

      if (res.status === 404 && path.includes('/manga/')) {
        const altSeriesPath = path.replace('/manga/', '/series/');
        url = `${this.baseUrl}${altSeriesPath}`;
        res = await fetchWithDnsFallback(url, this.headers);
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} from ${this.baseUrl}`);
      const html = await res.text();
      return this.parseMangaListHtml(html);
    } catch (err: any) {
      console.warn(`[DynamicMadaraSource: ${this.name}] getMangaList failed:`, err?.message || err);
      return [];
    }
  }

  async searchManga(query: string): Promise<Manga[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    try {
      // 1. Flame Comics in-memory instant search across the whole catalog in 1ms!
      if (this.baseUrl.includes('flamecomics')) {
        if (!this.flameCatalogCache) {
          await this.getMangaList(1, 'all');
        }
        const all = this.flameCatalogCache || [];
        return all.filter(
          (m) =>
            m.title.toLowerCase().includes(q) ||
            m.id.toLowerCase().includes(q)
        );
      }

      // 2. Asura Scans search
      if (this.baseUrl.includes('asurascans') || this.baseUrl.includes('asura')) {
        const url = `${this.baseUrl}/comics?name=${encodeURIComponent(query)}`;
        const res = await fetchWithDnsFallback(url, this.headers);
        if (res.ok) {
          const html = await res.text();
          return this.parseMangaListHtml(html);
        }
      }

      // 3. WordPress Madara themes search
      const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await fetchWithDnsFallback(url, this.headers);
      if (res.ok) {
        const html = await res.text();
        return this.parseMangaListHtml(html);
      }
    } catch (err: any) {
      console.warn(`[DynamicMadaraSource: ${this.name}] searchManga failed:`, err?.message || err);
    }

    return [];
  }

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const slug = mangaId.replace(`${this.id}::`, '');
    let url = slug.includes('/') ? `${this.baseUrl}/${slug}/` : `${this.baseUrl}/manga/${slug}/`;
    if (this.baseUrl.includes('asurascans') || this.baseUrl.includes('asura')) {
      url = `${this.baseUrl}/comics/${slug}`;
    } else if (this.baseUrl.includes('flamecomics')) {
      url = `${this.baseUrl}/series/${slug}`;
    }
    const res = await fetchWithDnsFallback(url, this.headers);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching manga details`);
    const html = await res.text();

    const titleMatch =
      html.match(/<div class="post-title"[^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").trim() : slug;

    // Extract real cover image: prioritize og:image for crystal-clear full resolution
    const ogImg = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    let coverUrl = '';
    if (ogImg && ogImg[1] && !ogImg[1].includes('dflazy') && !ogImg[1].includes('blank.gif') && !ogImg[1].endsWith('.js')) {
      coverUrl = ogImg[1];
    }

    if (!coverUrl) {
      const summaryImgDiv = html.match(/<div class="summary_image"[^>]*>([\s\S]*?)<\/div>/i);
      const searchArea = summaryImgDiv ? summaryImgDiv[1] : html;
      const imgTags = [...searchArea.matchAll(/<img\s+[^>]*>/gi)];
      for (const t of imgTags) {
        const m = t[0].match(/(?:data-src|data-lazy-src|data-cfsrc|src)=["']([^"']+)["']/i);
        if (m && m[1]) {
          const u = m[1];
          if (!u.includes('dflazy') && !u.includes('blank.gif') && !u.includes('avatar') && !u.endsWith('.js')) {
            coverUrl = u;
            break;
          }
        }
      }
    }

    if (coverUrl.includes('_next/image') && coverUrl.includes('url=')) {
      const uMatch = coverUrl.match(/url=([^&]+)/);
      if (uMatch) coverUrl = decodeURIComponent(uMatch[1]);
    }

    if (coverUrl.startsWith('/')) {
      coverUrl = `${this.baseUrl}${coverUrl}`;
    }
    coverUrl = coverUrl.replace(/-\d+x\d+(\.\w+)$/, '$1').trim();

    // Author
    const authorMatch =
      html.match(/<div class="author-content"[^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div class="post-content_item">\s*<div class="summary-heading">\s*<h5>\s*Author\(s\)\s*<\/h5>[\s\S]*?<div class="summary-content">([\s\S]*?)<\/div>/i);
    let author = '';
    if (authorMatch) {
      author = authorMatch[1].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").replace(/\s+/g, ' ').trim();
    }

    // Status
    const statusMatch =
      html.match(/<div class="post-status"[\s\S]*?<div class="summary-content">([\s\S]*?)<\/div>/i) ||
      html.match(/<div class="summary-heading">\s*<h5>\s*Status\s*<\/h5>[\s\S]*?<div class="summary-content">([\s\S]*?)<\/div>/i);
    let status: 'ongoing' | 'completed' | 'unknown' = 'ongoing';
    if (statusMatch) {
      const s = statusMatch[1].replace(/<[^>]+>/g, '').trim().toLowerCase();
      if (s.includes('complete')) status = 'completed';
      else if (s.includes('on hold') || s.includes('hiatus')) status = 'unknown';
    }

    // Full Synopsis / Description
    let description = '';
    const descMatch2 = html.match(/<div class="summary__content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const descMatch1 = html.match(/<div class="description-summary"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
    const metaDesc =
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
      html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i);

    if (descMatch2) {
      description = descMatch2[1];
    } else if (descMatch1) {
      description = descMatch1[1];
    } else if (metaDesc) {
      description = metaDesc[1];
    }

    description = description
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&#8217;/g, "'")
      .replace(/&#8216;/g, "'")
      .replace(/&#8220;/g, '"')
      .replace(/&#8221;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();

    // Alternative / Other Names
    const altMatch =
      html.match(/(?:Alternative|Alternative Names|Other Names)[\s\S]*?<div\b[^>]*class=["'][^"']*summary-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ||
      html.match(/<div class="post-content_item">\s*<div class="summary-heading">\s*<h5>\s*Alt(?:ernative)?(?:\s*name)?\s*<\/h5>[\s\S]*?<div class="summary-content">([\s\S]*?)<\/div>/i);
    let altTitle = '';
    if (altMatch) {
      altTitle = altMatch[1].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").replace(/\s+/g, ' ').trim();
    }

    return {
      id: mangaId,
      title: title,
      altTitle: altTitle,
      coverUrl: coverUrl || 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600',
      author: author || this.name,
      description: description,
      status: status,
      sourceId: this.id,
      sourceName: this.name,
      addedAt: Date.now(),
      isNsfw: this.isNsfw,
    };
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const slug = mangaId.replace(`${this.id}::`, '');
    let mangaUrl = slug.includes('/') ? `${this.baseUrl}/${slug}/` : `${this.baseUrl}/manga/${slug}/`;
    if (this.baseUrl.includes('asurascans') || this.baseUrl.includes('asura')) {
      mangaUrl = `${this.baseUrl}/comics/${slug}`;
    } else if (this.baseUrl.includes('flamecomics')) {
      mangaUrl = `${this.baseUrl}/series/${slug}`;
    }

    interface RawChapterItem {
      url: string;
      rawInner: string;
      rawDate?: string;
    }

    let rawChapters: RawChapterItem[] = [];

    // In Madara WordPress themes, the main HTML only renders a truncated preview of recent chapters,
    // while the POST /ajax/chapters/ endpoint returns the full complete list from Chapter 1 to latest!
    try {
      const ajaxRes = await fetchWithDnsFallback(`${mangaUrl.replace(/\/+$/, '')}/ajax/chapters/`, {
        ...this.headers,
        'X-Requested-With': 'XMLHttpRequest',
      }, { method: 'POST' });
      if (ajaxRes.ok) {
        const ajaxHtml = await ajaxRes.text();
        const ajaxMatches = [
          ...ajaxHtml.matchAll(
            /<li\s+[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?<span\s+class="chapter-release-date"[^>]*>([\s\S]*?)<\/span>)?/gi
          ),
        ];
        if (ajaxMatches.length > 0) {
          rawChapters = ajaxMatches.map((m) => ({
            url: m[1].trim(),
            rawInner: m[2],
            rawDate: m[3] ? m[3].replace(/<[^>]+>/g, '').trim() : undefined,
          }));
        }
      }
    } catch (e) {
      // Fall back to main page if AJAX fails
    }

    // Fallback to scraping main manga page if AJAX returned 0
    if (rawChapters.length === 0) {
      try {
        const res = await fetchWithDnsFallback(mangaUrl, this.headers);
        if (res.ok) {
          const html = await res.text();
          // 1. Try wp-manga-chapter on main page
          const wpMatches = [
            ...html.matchAll(
              /<li\s+[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a\s+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>(?:[\s\S]*?<span\s+class="chapter-release-date"[^>]*>([\s\S]*?)<\/span>)?/gi
            ),
          ];
          if (wpMatches.length > 0) {
            rawChapters = wpMatches.map((m) => ({
              url: m[1].trim(),
              rawInner: m[2],
              rawDate: m[3] ? m[3].replace(/<[^>]+>/g, '').trim() : undefined,
            }));
          } else {
            // 2. Modern chapter links for Asura Scans, Flame Comics, and custom themes
            const generalMatches = [
              ...html.matchAll(
                /<a\s+[^>]*href=["']([^"']*(?:chapter|chapitre|capitulo|episode|\/comics\/[^\/]+\/chapter|\/series\/\d+\/[a-f0-9]+|\/leer\/|\/read\/|\/ch-|\/c\d+)[^"'#?]+)["'][^>]*>([\s\S]*?)<\/a>/gi
              ),
            ];
            for (const m of generalMatches) {
              const href = m[1].trim();
              const inner = m[2];
              // Skip top/bottom navigation buttons ("First Chapter", "Latest Chapter")
              if (
                inner.includes('data-continue-label') ||
                inner.includes('First Chapter') ||
                inner.includes('Latest Chapter')
              ) {
                continue;
              }
              rawChapters.push({
                url: href,
                rawInner: inner,
              });
            }
          }
        }
      } catch (err) {
        console.error(`[DynamicMadaraSource: ${this.name}] getChapters fetch error:`, err);
      }
    }

    const chapters: Chapter[] = [];
    const ordered = [...rawChapters].reverse();
    const seenUrls = new Set<string>();

    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      let chUrl = item.url;
      if (!chUrl.startsWith('http')) {
        chUrl = `${this.baseUrl}${chUrl.startsWith('/') ? '' : '/'}${chUrl}`;
      }
      if (!chUrl || seenUrls.has(chUrl)) continue;
      seenUrls.add(chUrl);

      let chTitle = '';
      let releaseDate = item.rawDate || '';

      // Pattern 1: Asura Scans structure
      // <span class="font-medium text-white...">Chapter <!-- -->20</span>
      // <span class="text-sm text-white/40">4 days ago</span>
      const asuraDateMatch = item.rawInner.match(/<span\s+[^>]*class=["'][^"']*text-white\/40[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      const asuraTitleMatch = item.rawInner.match(/<span\s+[^>]*class=["'][^"']*(?:font-medium|text-white)[^"']*["'][^>]*>([\s\S]*?)<\/span>/i);
      if (asuraTitleMatch) {
        chTitle = asuraTitleMatch[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim();
        if (asuraDateMatch && !releaseDate) {
          releaseDate = asuraDateMatch[1].replace(/<[^>]+>/g, '').trim();
        }
      }

      // Pattern 2: Flame Comics Mantine structure
      if (!chTitle) {
        const flameTitleMatch = item.rawInner.match(/<p\s+[^>]*class=["'][^"']*mantine-Text-root[^"']*["'][^>]*data-line-clamp=["']true["'][^>]*>([\s\S]*?)<\/p>/i);
        const flameDateMatch =
          item.rawInner.match(/<p\s+[^>]*class=["'][^"']*mantine-Text-root[^"']*["'][^>]*title=["']([^"']+)["']/i) ||
          item.rawInner.match(/<p\s+[^>]*class=["'][^"']*mantine-Text-root[^"']*["'][^>]*data-size=["']xs["'][^>]*>([\s\S]*?)<\/p>/i);
        if (flameTitleMatch) {
          chTitle = flameTitleMatch[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, '').trim();
          if (flameDateMatch && !releaseDate) {
            releaseDate = (flameDateMatch[1] || '').replace(/<[^>]+>/g, '').trim();
          }
        }
      }

      // Pattern 3: Standard & General fallbacks
      // Crucial: insert whitespace between HTML tags before stripping, so "Chapter 1" and "4 days ago" never merge!
      if (!chTitle) {
        const spaced = item.rawInner
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<\/p>|<\/div>|<\/span>|<\/li>|<br\s*\/?>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        // Check if there is a relative or absolute date pattern at the end of the text
        const dateMatch = spaced.match(/(.*?)(?:\s+)?(\d+\s+(?:days?|hours?|mins?|weeks?|months?|years?)\s+ago|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})$/i);
        if (dateMatch) {
          chTitle = dateMatch[1].trim();
          if (!releaseDate) releaseDate = dateMatch[2].trim();
        } else {
          chTitle = spaced;
        }
      }

      chTitle = chTitle.replace(/\s+/g, ' ').trim();

      // Extract accurate chapter number
      const prefixMatch = chTitle.match(/(?:chapter|chapitre|capitulo|episode|ep|ch|#)\.?\s*(\d+(?:\.\d+)?)/i);
      let chNum: number;
      if (prefixMatch) {
        chNum = parseFloat(prefixMatch[1]);
      } else {
        const allNums = [...chTitle.matchAll(/(\d+(?:\.\d+)?)/g)];
        if (allNums.length > 0) {
          chNum = parseFloat(allNums[allNums.length - 1][1]);
        } else {
          chNum = i + 1;
        }
      }

      chapters.push({
        id: chUrl,
        mangaId: mangaId,
        chapterNumber: chNum,
        title: chTitle || `Chapter ${chNum}`,
        releaseDate: releaseDate,
        isRead: false,
        lastReadPageIndex: 0,
        totalPages: 0,
        sourceId: this.id,
      });
    }

    // Ensure chapters are canonically ordered 1 -> N (ascending by chapterNumber)
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    return chapters;
  }

  async getPageList(chapterId: string): Promise<Page[]> {
    const res = await fetchWithDnsFallback(chapterId, {
      ...this.headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapter`);
    const html = await res.text();

    // 1. Detect if the remote server returned the parent manga overview instead of chapter pages
    // (This occurs when aggregators create upcoming chapter placeholders before uploading pages)
    const ogUrlMatch = html.match(/<meta property=["']og:url["'] content=["']([^"']+)["']/i);
    if (ogUrlMatch) {
      const ogUrl = ogUrlMatch[1].trim();
      if (ogUrl.match(/\/manga\/[^\/]+\/?$/i) && !chapterId.match(/\/manga\/[^\/]+\/?$/i)) {
        throw new Error('This chapter has not yet been published with pages by the source provider. It is currently an empty placeholder.');
      }
    }

    interface RawPageItem {
      url: string;
      explicitIndex: number | null;
      originalOrder: number;
    }

    const rawItems: RawPageItem[] = [];
    const seen = new Set<string>();

    const addUrl = (rawUrl: string, explicitIndex: number | null = null) => {
      if (!rawUrl) return;
      let clean = rawUrl.replace(/[\r\n\t\s]/g, '').trim();
      if (!clean) return;
      if (clean.startsWith('data:image')) return;
      if (clean.includes('blank.gif') || clean.includes('dflazy') || clean.includes('placeholder')) return;
      if (clean.includes('avatar') || clean.includes('logo') || clean.includes('favicon') || clean.includes('/ads/') || clean.includes('/covers/') || clean.includes('thumbnail')) return;
      if (clean.startsWith('//')) clean = `https:${clean}`;
      if (!seen.has(clean)) {
        seen.add(clean);
        rawItems.push({
          url: clean,
          explicitIndex,
          originalOrder: rawItems.length,
        });
      }
    };

    // Strategy A: Find all <img> with wp-manga-chapter-img class OR id containing image- OR chapter/reading classes
    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
    for (const tagMatch of imgTags) {
      const tag = tagMatch[0];
      const isChapterImg =
        /class=["'][^"']*wp-manga-chapter-img[^"']*["']/i.test(tag) ||
        /\bid=["']image-\d+["']/i.test(tag) ||
        /class=["'][^"']*(?:chapter-img|reading-image|page-break)[^"']*["']/i.test(tag);

      if (isChapterImg) {
        const indexMatch =
          tag.match(/\bid=["']image-(\d+)["']/i) ||
          tag.match(/data-page=["'](\d+)["']/i) ||
          tag.match(/data-index=["'](\d+)["']/i) ||
          tag.match(/data-number=["'](\d+)["']/i);
        const explicitIdx = indexMatch ? parseInt(indexMatch[1], 10) : null;

        const srcMatch = tag.match(/(?:data-src|data-lazy-src|data-cfsrc|data-full-url|src)\s*=\s*["']([^"']+)["']/i);
        if (srcMatch) {
          addUrl(srcMatch[1], explicitIdx);
        }
      }
    }

    // Strategy B: If no tagged images, search reading-content or chapter-video-frame containers
    if (rawItems.length === 0) {
      const readingDivMatches = [
        ...html.matchAll(
          /<div\b[^>]*class=["'][^"']*(?:reading-content|read-container|chapter-video-frame)[^"']*["'][^>]*>([\s\S]*?)(?:<div class=["'](?:c-breadcrumb|c-selectpicker|comments-area|entry-navigation)|<footer|<\/body)/gi
        ),
      ];
      for (const rMatch of readingDivMatches) {
        const blockImgs = [...rMatch[1].matchAll(/<img\b[^>]*>/gi)];
        for (const tagMatch of blockImgs) {
          const tag = tagMatch[0];
          const indexMatch =
            tag.match(/\bid=["']image-(\d+)["']/i) ||
            tag.match(/data-page=["'](\d+)["']/i) ||
            tag.match(/data-index=["'](\d+)["']/i) ||
            tag.match(/data-number=["'](\d+)["']/i);
          const explicitIdx = indexMatch ? parseInt(indexMatch[1], 10) : null;

          const srcMatch = tag.match(/(?:data-src|data-lazy-src|data-cfsrc|data-full-url|src)\s*=\s*["']([^"']+)["']/i);
          if (srcMatch) {
            addUrl(srcMatch[1], explicitIdx);
          }
        }
        if (rawItems.length > 0) break;
      }
    }

    // Strategy C: Check for inline JSON array
    if (rawItems.length === 0) {
      const jsonMatch = html.match(/(?:chapter_preloaded_images|wpmangaimg)\s*=\s*(\[[^\]]+\])/i);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsed)) {
            for (let idx = 0; idx < parsed.length; idx++) {
              const u = parsed[idx];
              if (typeof u === 'string') addUrl(u, idx);
            }
          }
        } catch (e) {}
      }
    }

    // Strategy D: General chapter images for modern webtoon sites like Asura and Flame Comics
    if (rawItems.length === 0) {
      const allImgs = [...html.matchAll(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi)];
      for (const m of allImgs) {
        let u = m[1];
        if (u && (u.includes('chapter') || u.includes('asura-images') || u.includes('/upload/') || u.includes('/manga/') || u.includes('flamecomics.xyz/uploads'))) {
          if (u.includes('read_on_flame') || u.includes('thumbnail.png') || u.includes('cover.png')) continue;
          if (u.includes('_next/image') && u.includes('url=')) {
            const uMatch = u.match(/url=([^&]+)/);
            if (uMatch) u = decodeURIComponent(uMatch[1]);
          }
          addUrl(u.startsWith('http') ? u : `${this.baseUrl}${u}`);
        }
      }
    }

    if (rawItems.length === 0) {
      throw new Error('This chapter has not yet been published with pages by the source provider.');
    }

    // Smart Sorting:
    // 1. If explicit page indices exist (e.g. id="image-N", data-page="N") across images, sort by explicit index
    const withExplicit = rawItems.filter((item) => item.explicitIndex !== null);
    if (withExplicit.length >= Math.ceil(rawItems.length * 0.4)) {
      rawItems.sort((a, b) => {
        if (a.explicitIndex !== null && b.explicitIndex !== null) {
          return a.explicitIndex - b.explicitIndex;
        }
        return a.originalOrder - b.originalOrder;
      });
    } else {
      // 2. Check if filenames have natural sequential numbers (e.g., 001.jpg, 002.jpg)
      const numRegex = /\/([a-zA-Z0-9_\-]+[_\-])?(\d+)\.(?:jpe?g|png|webp|avif)(?:\?.*)?$/i;
      const matchesNum = rawItems.every((item) => numRegex.test(item.url));
      if (matchesNum && rawItems.length > 1) {
        const fileNumbers = rawItems.map((item) => {
          const m = item.url.match(numRegex);
          return m ? parseInt(m[2], 10) : null;
        });
        const isAlreadySorted = fileNumbers.every((n, i) => i === 0 || (n !== null && fileNumbers[i - 1] !== null && n >= fileNumbers[i - 1]!));
        if (!isAlreadySorted) {
          rawItems.sort((a, b) => {
            const na = a.url.match(numRegex);
            const nb = b.url.match(numRegex);
            if (na && nb) {
              return parseInt(na[2], 10) - parseInt(nb[2], 10);
            }
            return a.originalOrder - b.originalOrder;
          });
        }
      }
    }

    return rawItems.map((item, idx) => ({
      index: idx,
      url: item.url,
    }));
  }
}

/**
 * Resolves English name and original language title from MangaDex attributes.
 * Prioritizes the official English name so users can search in English, while preserving
 * the original romanized title (e.g. "Solo Leveling (Na Honjaman Level-Up)").
 */
export function parseMangaDexTitle(item: any): { title: string; altTitle: string } {
  const titles = item.attributes?.title || {};
  const altTitles = item.attributes?.altTitles || [];

  // 1. Check if title object already has English
  let enTitle = titles.en;

  // 2. If not, look in altTitles for an English entry
  if (!enTitle) {
    const enAltObj = altTitles.find((a: any) => Boolean(a.en));
    if (enAltObj && enAltObj.en) {
      enTitle = enAltObj.en;
    }
  }

  // 3. Native/original title (e.g. ja-ro, ko-ro, zh-ro, or first available)
  const rawTitle = (titles['ja-ro'] || titles['ko-ro'] || titles['zh-ro'] || Object.values(titles)[0] || '') as string;

  // 4. Gather other alternate titles for rich multi-lingual searching
  const allAlts: string[] = [];
  for (const altObj of altTitles) {
    for (const [, val] of Object.entries(altObj)) {
      if (typeof val === 'string' && val.trim() && !allAlts.includes(val.trim())) {
        allAlts.push(val.trim());
      }
    }
  }

  if (rawTitle && !allAlts.includes(rawTitle)) {
    allAlts.push(rawTitle);
  }

  // 5. Construct display title with English prioritized, and original romanized title if different:
  let finalTitle = enTitle || rawTitle || 'Unknown Title';
  if (enTitle && rawTitle) {
    const cleanEn = enTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanRaw = rawTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanEn !== cleanRaw && !cleanRaw.includes(cleanEn) && !cleanEn.includes(cleanRaw)) {
      finalTitle = `${enTitle} (${rawTitle})`;
    }
  }

  const filteredAlts = allAlts.filter(
    (a) => a.toLowerCase() !== finalTitle.toLowerCase() && (!enTitle || a.toLowerCase() !== enTitle.toLowerCase())
  );

  return {
    title: finalTitle,
    altTitle: filteredAlts.slice(0, 8).join(', '),
  };
}

/**
 * Dynamic MangaDex API Source
 * Access over 70,000+ manga, manhwa & manhua with zero cloudflare blockades,
 * multi-language chapters, and high-speed image CDN servers.
 */
const MANGADEX_ID_FILTERS: Record<string, string> = {
  // Demographics
  'mangadex-shonen': '&publicationDemographic[]=shounen',
  'mangadex-seinen': '&publicationDemographic[]=seinen',
  'mangadex-shojo': '&publicationDemographic[]=shoujo',
  'mangadex-josei': '&publicationDemographic[]=josei',
  // Origins
  'mangadex-manhwa': '&originalLanguage[]=ko',
  'mangadex-manhua': '&originalLanguage[]=zh',
  'mangadex-manga': '&originalLanguage[]=ja',
  // Safe Genres & Tags
  'mangadex-action': '&includedTags[]=391b0423-d847-456f-aff0-8b0cfc03066b',
  'mangadex-adventure': '&includedTags[]=87cc87cd-a395-47af-b27a-93258283bbc6',
  'mangadex-isekai': '&includedTags[]=ace04997-f6bd-436e-b261-779182193d3d',
  'mangadex-fantasy': '&includedTags[]=cdc58593-87dd-415e-bbc0-2ec27bf404cc',
  'mangadex-romance': '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  'mangadex-comedy': '&includedTags[]=4d32cc48-9f00-4cca-9b5a-a839f0764984',
  'mangadex-scifi': '&includedTags[]=256c8bd9-4904-4360-bf4f-508a76d67183',
  'mangadex-horror': '&includedTags[]=cdad7e68-1419-41dd-bdce-27753074a640',
  'mangadex-mystery': '&includedTags[]=ee968100-4191-4968-93d3-f82d72be7e46',
  'mangadex-psychological': '&includedTags[]=3b60b75c-a2d7-4860-ab56-05f391bb889c',
  'mangadex-slice-of-life': '&includedTags[]=e5301a23-ebd9-49dd-a0cb-2add944c7fe9',
  'mangadex-sports': '&includedTags[]=69964a64-2f90-4d33-beeb-f3ed2875eb4c',
  'mangadex-supernatural': '&includedTags[]=eabc5b4c-6aff-42f3-b657-3e90cbd00b75',
  'mangadex-thriller': '&includedTags[]=07251805-a27e-4d59-b488-f0bfbec15168',
  'mangadex-martial-arts': '&includedTags[]=799c202e-7daa-44eb-9cf7-8a3c0441531e',
  'mangadex-dungeon-rpg': '&includedTags[]=9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8',
  'mangadex-school-life': '&includedTags[]=caaa44eb-cd40-4177-b930-79d3ef2afe87',
  'mangadex-historical': '&includedTags[]=33771934-028e-4cb3-8744-691e866a923e',
  'mangadex-mecha': '&includedTags[]=50880a9d-5440-4732-9afb-8f457127e836',
  'mangadex-survival': '&includedTags[]=5fff9cde-849c-4d78-aab0-0d52b2ee1d25',
  'mangadex-superhero': '&includedTags[]=7064a261-a137-4d3a-8848-2d385de3a99c',
  'mangadex-time-travel': '&includedTags[]=292e862b-2d17-4062-90a2-0356caa4ae27',
  'mangadex-villainess': '&includedTags[]=d14322ac-4d6f-4e9b-afd9-629d5f4d8a41',
  'mangadex-monsters': '&includedTags[]=36fd93ea-e8b8-445e-b836-358f02b3d33d',
  'mangadex-cooking': '&includedTags[]=ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869',
  'mangadex-music': '&includedTags[]=f42fbf9e-188a-447b-9fdc-f19dc1e4d685',
  'mangadex-medical': '&includedTags[]=c8cbe35b-1b2b-4a3f-9c37-db84c4514856',
  'mangadex-tragedy': '&includedTags[]=f8f62932-27da-4fe4-8ee1-6779a8c5edba',
  'mangadex-crime': '&includedTags[]=5ca48985-9a9d-4bd8-be29-80dc0303db72',
  'mangadex-demons': '&includedTags[]=39730448-9a5f-48a2-85b0-a70db87b1233',
  'mangadex-military': '&includedTags[]=ac72833b-c4e9-4878-b9db-6c8a4a99444a',
  'mangadex-wuxia': '&includedTags[]=acc803a4-c95a-4c22-86fc-eb6b582d82a2',
  // NSFW / 18+ Genres & Tags
  'mangadex-doujinshi-18': '&includedTags[]=b13b2a48-c720-44a9-9c77-39c9979373fb',
  'mangadex-romance-18': '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d',
  'mangadex-yaoi-18': '&includedTags[]=5920b825-4181-4a17-beeb-9918b0ff7a30',
  'mangadex-yuri-18': '&includedTags[]=a3c67850-4684-404e-9b7f-c69850ee5da6',
  'mangadex-harem-18': '&includedTags[]=aafb99c1-7f60-43fa-b75f-fc9502ce29c7',
  'mangadex-manhwa-18': '&originalLanguage[]=ko',
  'mangadex-gyaru-18': '&includedTags[]=fad12b5e-68ba-460e-b933-9ae8318f5b65',
  'mangadex-monster-girls-18': '&includedTags[]=dd1f77c5-dea9-4e2b-97ae-224af09caf99',
  'mangadex-genderswap-18': '&includedTags[]=2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a',
  'mangadex-bdsm-18': '&includedTags[]=b29d6a3d-1569-4e7a-8caf-7557bc92cd5d',
  'mangadex-reverse-harem-18': '&includedTags[]=65761a2a-415e-47f3-bef2-a9dababba7a6',
};

export class DynamicMangaDexSource implements ISource {
  id: string;
  name: string;
  baseUrl: string;
  description: string;
  version: string;
  isLocal: boolean = false;
  isNsfw: boolean = false;
  headers: Record<string, string>;

  constructor(manifest: ExtensionManifest) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.baseUrl = (manifest.baseUrl || 'https://api.mangadex.org').replace(/\/+$/, '');
    this.description = manifest.description || '';
    this.version = manifest.version || '1.0.0';
    this.isNsfw = Boolean(manifest.isNsfw);
    this.headers = {
      'User-Agent': 'MiruMangaReader/1.0',
      ...(manifest.headers || {}),
    };
  }

  getCategories(): { id: string; label: string }[] {
    return [
      { id: 'views', label: '🔥 Top Followed' },
      { id: 'updated', label: '🕒 Recently Updated' },
      { id: 'new', label: '✨ New Additions' },
      { id: 'rating', label: '⭐ Top Rated' },
      { id: 'manhwa', label: '🇰🇷 Manhwa (Korean)' },
      { id: 'manhua', label: '🇨🇳 Manhua (Chinese)' },
      { id: 'manga', label: '🇯🇵 Manga (Japanese)' },
      { id: 'action', label: '💥 Action' },
      { id: 'fantasy', label: '⚔️ Fantasy' },
      { id: 'isekai', label: '🌀 Isekai' },
      { id: 'romance', label: '❤️ Romance' },
    ];
  }

  async getMangaList(page: number = 1, category: string = 'views'): Promise<Manga[]> {
    try {
      const offset = (page - 1) * 20;
      const ratings = this.isNsfw
        ? '&contentRating[]=erotica&contentRating[]=pornographic'
        : '&contentRating[]=safe&contentRating[]=suggestive';

      const catLower = (category || 'views').toLowerCase();
      let orderParam = 'order[followedCount]=desc';
      let extraFilter = '';

      if (catLower === 'new' || catLower === 'new-manga') {
        orderParam = 'order[createdAt]=desc';
      } else if (catLower === 'updated' || catLower === 'latest') {
        orderParam = 'order[latestUploadedChapter]=desc';
      } else if (catLower === 'rating') {
        orderParam = 'order[rating]=desc';
      } else if (catLower === 'manhwa') {
        extraFilter = '&originalLanguage[]=ko';
      } else if (catLower === 'manhua') {
        extraFilter = '&originalLanguage[]=zh';
      } else if (catLower === 'manga') {
        extraFilter = '&originalLanguage[]=ja';
      } else if (catLower === 'action') {
        extraFilter = '&includedTags[]=391b0423-d847-456f-aff0-8b0cfc03066b';
      } else if (catLower === 'fantasy') {
        extraFilter = '&includedTags[]=cdc58593-87dd-415e-bbc0-2ec27bf404cc';
      } else if (catLower === 'isekai') {
        extraFilter = '&includedTags[]=ace04997-f6bd-436e-b261-779182193d3d';
      } else if (catLower === 'romance') {
        extraFilter = '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d';
      }

      if (MANGADEX_ID_FILTERS[this.id]) {
        extraFilter += MANGADEX_ID_FILTERS[this.id];
      } else if (this.id.includes('doujinshi')) {
        extraFilter += '&includedTags[]=b13b2a48-c720-44a9-9c77-39c9979373fb';
      } else if (this.id.includes('romance')) {
        extraFilter += '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d';
      } else if (this.id.includes('yaoi') || this.id.includes('bl')) {
        extraFilter += '&includedTags[]=5920b825-4181-4a17-beeb-9918b0ff7a30';
      } else if (this.id.includes('yuri') || this.id.includes('gl')) {
        extraFilter += '&includedTags[]=a3c67850-4684-404e-9b7f-c69850ee5da6';
      } else if (this.id.includes('harem')) {
        extraFilter += '&includedTags[]=aafb99c1-7f60-43fa-b75f-fc9502ce29c7';
      } else if (this.id.includes('manhwa')) {
        extraFilter += '&originalLanguage[]=ko';
      } else if (this.id.includes('manhua')) {
        extraFilter += '&originalLanguage[]=zh';
      } else if (this.id.includes('manga') && !this.id.includes('mangadex-org')) {
        extraFilter += '&originalLanguage[]=ja';
      } else if (this.id.includes('isekai')) {
        extraFilter += '&includedTags[]=ace04997-f6bd-436e-b261-779182193d3d';
      } else if (this.id.includes('action')) {
        extraFilter += '&includedTags[]=391b0423-d847-456f-aff0-8b0cfc03066b';
      }

      const url = `${this.baseUrl}/manga?limit=20&offset=${offset}&includes[]=cover_art&includes[]=author${ratings}&${orderParam}${extraFilter}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.data || []).map((item: any) => {
        const { title, altTitle } = parseMangaDexTitle(item);
        const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
          ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`
          : 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600';
        const authorRel = item.relationships?.find((r: any) => r.type === 'author');
        const author = authorRel?.attributes?.name || 'Unknown';
        const description = item.attributes?.description?.en || '';
        const status: 'ongoing' | 'completed' | 'unknown' =
          item.attributes?.status === 'completed' ? 'completed' : 'ongoing';

        return {
          id: `${this.id}::${item.id}`,
          title,
          altTitle,
          coverUrl,
          author,
          description,
          status,
          sourceId: this.id,
          sourceName: this.name,
          addedAt: Date.now(),
          isNsfw: this.isNsfw,
        };
      });
    } catch (err: any) {
      console.warn(`[MangaDex: ${this.name}] getMangaList failed:`, err?.message || err);
      return [];
    }
  }

  async searchManga(query: string): Promise<Manga[]> {
    try {
      const ratings = this.isNsfw
        ? '&contentRating[]=erotica&contentRating[]=pornographic'
        : '&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica';
      let extraFilter = '';
      if (MANGADEX_ID_FILTERS[this.id]) {
        extraFilter += MANGADEX_ID_FILTERS[this.id];
      } else if (this.id.includes('doujinshi')) {
        extraFilter += '&includedTags[]=b13b2a48-c720-44a9-9c77-39c9979373fb';
      } else if (this.id.includes('romance')) {
        extraFilter += '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d';
      } else if (this.id.includes('yaoi') || this.id.includes('bl')) {
        extraFilter += '&includedTags[]=5920b825-4181-4a17-beeb-9918b0ff7a30';
      } else if (this.id.includes('yuri') || this.id.includes('gl')) {
        extraFilter += '&includedTags[]=a3c67850-4684-404e-9b7f-c69850ee5da6';
      } else if (this.id.includes('harem')) {
        extraFilter += '&includedTags[]=aafb99c1-7f60-43fa-b75f-fc9502ce29c7';
      } else if (this.id.includes('manhwa')) {
        extraFilter += '&originalLanguage[]=ko';
      } else if (this.id.includes('manhua')) {
        extraFilter += '&originalLanguage[]=zh';
      } else if (this.id.includes('manga') && !this.id.includes('mangadex-org')) {
        extraFilter += '&originalLanguage[]=ja';
      }
      const url = `${this.baseUrl}/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art&includes[]=author${ratings}${extraFilter}`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json.data || []).map((item: any) => {
        const { title, altTitle } = parseMangaDexTitle(item);
        const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
        const coverFileName = coverRel?.attributes?.fileName;
        const coverUrl = coverFileName
          ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`
          : 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600';
        const authorRel = item.relationships?.find((r: any) => r.type === 'author');
        const author = authorRel?.attributes?.name || 'Unknown';
        const description = item.attributes?.description?.en || '';
        const status: 'ongoing' | 'completed' | 'unknown' =
          item.attributes?.status === 'completed' ? 'completed' : 'ongoing';

        return {
          id: `${this.id}::${item.id}`,
          title,
          altTitle,
          coverUrl,
          author,
          description,
          status,
          sourceId: this.id,
          sourceName: this.name,
          addedAt: Date.now(),
          isNsfw: this.isNsfw,
        };
      });
    } catch (err: any) {
      console.warn(`[MangaDex: ${this.name}] searchManga failed:`, err?.message || err);
      return [];
    }
  }

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const uuid = mangaId.replace(`${this.id}::`, '');
    const url = `${this.baseUrl}/manga/${uuid}?includes[]=cover_art&includes[]=author`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching details`);
    const json = await res.json();
    const item = json.data;
    const { title, altTitle } = parseMangaDexTitle(item);
    const coverRel = item.relationships?.find((r: any) => r.type === 'cover_art');
    const coverFileName = coverRel?.attributes?.fileName;
    const coverUrl = coverFileName
      ? `https://uploads.mangadex.org/covers/${item.id}/${coverFileName}.512.jpg`
      : 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=600';
    const authorRel = item.relationships?.find((r: any) => r.type === 'author');
    const author = authorRel?.attributes?.name || 'Unknown';
    const description = item.attributes?.description?.en || '';
    const status: 'ongoing' | 'completed' | 'unknown' =
      item.attributes?.status === 'completed' ? 'completed' : 'ongoing';

    return {
      id: mangaId,
      title,
      altTitle,
      coverUrl,
      author,
      description,
      status,
      sourceId: this.id,
      sourceName: this.name,
      addedAt: Date.now(),
    };
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const uuid = mangaId.replace(`${this.id}::`, '');
    const ratings = 'contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&contentRating[]=pornographic';
    let url = `${this.baseUrl}/manga/${uuid}/feed?translatedLanguage[]=en&order[chapter]=asc&limit=500&${ratings}`;
    let res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapters`);
    let json = await res.json();

    // If no English chapters found, fallback to all available languages so manga isn't blank
    if (!json.data || json.data.length === 0) {
      const fallbackUrl = `${this.baseUrl}/manga/${uuid}/feed?order[chapter]=asc&limit=100&${ratings}`;
      const fallbackRes = await fetch(fallbackUrl, { headers: this.headers });
      if (fallbackRes.ok) {
        json = await fallbackRes.json();
      }
    }

    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < (json.data || []).length; i++) {
      const ch = json.data[i];
      // Only include chapters that have real hosted page images on MangaDex
      if ((ch.attributes?.pages || 0) === 0 || ch.attributes?.externalUrl) continue;
      if (seen.has(ch.id)) continue;
      seen.add(ch.id);

      const chNum = parseFloat(ch.attributes?.chapter) || (i + 1);
      const chTitle = ch.attributes?.title
        ? `Ch. ${ch.attributes?.chapter || (i + 1)} - ${ch.attributes.title}`
        : `Chapter ${ch.attributes?.chapter || (i + 1)}`;

      chapters.push({
        id: ch.id,
        mangaId,
        chapterNumber: chNum,
        title: chTitle,
        releaseDate: ch.attributes?.publishAt?.slice(0, 10) || '',
        isRead: false,
        lastReadPageIndex: 0,
        totalPages: ch.attributes?.pages || 0,
        sourceId: this.id,
      });
    }

    // AUTOMATIC SMART IN-APP SCANLATION RESOLVER:
    // If MangaDex has 0 native readable scanlation chapters (or only a few teasers while having external publisher redirects):
    // Seamlessly query integrated scanlation sources so the user reads 100% inside the app!
    const hasExternalRedirects = (json.data || []).some((c: any) => Boolean(c.attributes?.externalUrl));
    if (chapters.length === 0 || (chapters.length < 5 && hasExternalRedirects)) {
      try {
        const details = await this.getMangaDetails(mangaId);
        if (details && details.title) {
          const inAppChapters = await this.resolveInAppScanlationChapters(mangaId, details.title);
          if (inAppChapters.length > chapters.length) {
            return inAppChapters;
          }
        }
      } catch (err) {
        console.warn(`[MangaDex: ${this.name}] Smart scanlation resolver failed:`, err);
      }
    }

    return chapters;
  }

  async resolveInAppScanlationChapters(mangaId: string, mangaTitle: string): Promise<Chapter[]> {
    const providers = [
      { id: 'mangaread-org', baseUrl: 'https://www.mangaread.org' },
      { id: 'manhuaplus-com', baseUrl: 'https://manhuaplus.com' },
      { id: 'mangasushi-org', baseUrl: 'https://mangasushi.org' },
    ];

    const cleanTitle = mangaTitle.replace(/[~:;!@#$%^&*()_+=\[\]{}'"]/g, ' ').replace(/\s+/g, ' ').trim();

    for (const prov of providers) {
      try {
        const sUrl = `${prov.baseUrl}/?s=${encodeURIComponent(cleanTitle)}&post_type=wp-manga`;
        const res = await fetch(sUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        if (!res.ok) continue;
        const html = await res.text();
        const matches = [...html.matchAll(/<a\s+[^>]*href="https?:\/\/[^\/]+\/manga\/([^"\/]+)\/?"[^>]*>([\s\S]*?)<\/a>/g)];
        const cleanSlugs = [...new Set(matches.map((m) => m[1]).filter((s) => s && !s.includes('?') && !s.includes('=') && s !== 'manga'))];

        if (cleanSlugs.length > 0) {
          const slug = cleanSlugs[0];
          const chRes = await fetch(`${prov.baseUrl}/manga/${slug}/ajax/chapters/`, {
            method: 'POST',
            headers: { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' },
          });
          if (!chRes.ok) continue;
          const chHtml = await chRes.text();
          const chMatches = [...chHtml.matchAll(/<li\s+[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];

          if (chMatches.length > 0) {
            const ordered = [...chMatches].reverse();
            const chapters: Chapter[] = [];
            const seen = new Set<string>();

            for (let i = 0; i < ordered.length; i++) {
              const m = ordered[i];
              const chUrl = m[1].trim();
              if (!chUrl || seen.has(chUrl)) continue;
              seen.add(chUrl);

              const chTitle = m[2].replace(/<[^>]+>/g, '').trim();
              const prefixMatch = chTitle.match(/(?:chapter|ch|ep|episode|#)\.?\s*(\d+(?:\.\d+)?)/i);
              const chNum = prefixMatch ? parseFloat(prefixMatch[1]) : i + 1;

              chapters.push({
                id: `source_proxy::${prov.id}::${chUrl}`,
                mangaId: mangaId,
                chapterNumber: chNum,
                title: chTitle || `Chapter ${chNum}`,
                releaseDate: '',
                isRead: false,
                lastReadPageIndex: 0,
                totalPages: 0,
                sourceId: this.id,
              });
            }
            if (chapters.length > 0) {
              chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
              return chapters;
            }
          }
        }
      } catch (e) {
        // Fallback to next provider
      }
    }
    return [];
  }

  async getPageList(chapterId: string): Promise<Page[]> {
    // 1. Handle in-app scanlation resolved chapters
    if (chapterId.startsWith('source_proxy::')) {
      const parts = chapterId.split('::');
      const targetSourceId = parts[1];
      const targetChUrl = parts.slice(2).join('::');
      const originMatch = targetChUrl.match(/https?:\/\/[^\/]+/);
      const origin = originMatch ? originMatch[0] : 'https://www.mangaread.org';
      const fallbackSource = new DynamicMadaraSource({
        id: targetSourceId,
        name: 'In-App Reader Engine',
        version: '1.0.0',
        lang: 'en',
        icon: '',
        baseUrl: origin,
        type: 'madara',
      });
      return fallbackSource.getPageList(targetChUrl);
    }

    // 2. Handle native MangaDex @home server with standard port 443
    const url = `${this.baseUrl}/at-home/server/${chapterId}?forcePort443=true`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapter pages`);
    const json = await res.json();
    const hash = json.chapter?.hash;
    const baseNode = json.baseUrl || 'https://uploads.mangadex.org';
    const isDataSaver = !Array.isArray(json.chapter?.data) || json.chapter.data.length === 0;
    const fileList: string[] = isDataSaver ? (json.chapter?.dataSaver || []) : json.chapter.data;
    const subFolder = isDataSaver ? 'data-saver' : 'data';

    const pages: Page[] = fileList.map((file: string, idx: number) => ({
      index: idx,
      url: `${baseNode}/${subFolder}/${hash}/${file}`,
    }));

    if (pages.length === 0) {
      throw new Error('This chapter has not yet been published with pages by the source provider.');
    }
    return pages;
  }
}

/**
 * Dedicated Single-Series Scraper Engine
 * Designed for dedicated scanlation project sites like w9.wistoriaswandandsword.com
 * where a domain is solely focused on a single popular manga, providing immediate day-one
 * chapter releases (e.g. Chapter 69+) before general aggregators upload them.
 */
export class DedicatedSeriesSource implements ISource {
  id: string;
  name: string;
  description: string;
  version: string;
  icon?: string;
  isLocal = false;
  baseUrl: string;
  headers: Record<string, string>;

  constructor(manifest: ExtensionManifest) {
    this.id = manifest.id;
    this.name = manifest.name;
    this.description = manifest.description || `Dedicated source for ${manifest.name}`;
    this.version = manifest.version;
    this.icon = manifest.icon;
    this.baseUrl = manifest.baseUrl.replace(/\/+$/, '');
    this.headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Referer: `${this.baseUrl}/`,
      ...manifest.headers,
    };
  }

  getCategories(): { id: string; label: string }[] {
    return [{ id: 'all', label: '🔥 All Chapters' }];
  }

  async getMangaList(page: number = 1, category?: string): Promise<Manga[]> {
    if (page > 1) return [];
    const item = await this.getMangaDetails(`${this.id}::main`);
    return [item];
  }

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const defaultCover = `${this.baseUrl}/wp-content/uploads/2024/07/Wistorias-Wand-and-Sword-cover.webp`;
    const defaultDesc =
      "Will Serfort dreams of keeping his promise to his childhood friend by becoming a Magia Vende, one of the mighty magicians who sit atop the Wizard's Tower. However, he is unable to use even the simplest of magic spells, leaving him to fight dungeon monsters to earn credits at the Regarden Magical Academy. As if that weren't enough, he finds himself putting his sword skills to the test against a bullying professor!";

    try {
      const res = await fetchWithDnsFallback(this.baseUrl, this.headers);
      if (res.ok) {
        const html = await res.text();
        const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)?.[1];
        const ogDesc = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)?.[1];
        const coverMatch = html.match(/<img[^>]+src=["']([^"']*(?:cover|poster|wp-content\/uploads)[^"']*)["']/i)?.[1];

        return {
          id: `${this.id}::main`,
          title: "Wistoria: Wand and Sword",
          altTitle: "杖と剣のウィストリア (Tsue to Tsurugi no Wistoria)",
          coverUrl: ogImage || coverMatch || defaultCover,
          author: "Omori Fujino / Aoi Toshi",
          description: ogDesc ? ogDesc.replace(/&#039;/g, "'").trim() : defaultDesc,
          status: "ongoing",
          sourceId: this.id,
          sourceName: this.name,
          addedAt: Date.now(),
        };
      }
    } catch (e) {
      // Gracefully fall back to verified metadata
    }

    return {
      id: `${this.id}::main`,
      title: "Wistoria: Wand and Sword",
      altTitle: "杖と剣のウィストリア (Tsue to Tsurugi no Wistoria)",
      coverUrl: defaultCover,
      author: "Omori Fujino / Aoi Toshi",
      description: defaultDesc,
      status: "ongoing",
      sourceId: this.id,
      sourceName: this.name,
      addedAt: Date.now(),
    };
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const res = await fetchWithDnsFallback(this.baseUrl, {
      ...this.headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapters from ${this.baseUrl}`);
    const html = await res.text();

    const aMatches = [...html.matchAll(/<a\s+[^>]*href=["']([^"']*(?:chapter|\/manga\/)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    const chapters: Chapter[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < aMatches.length; i++) {
      const m = aMatches[i];
      let url = m[1].trim();
      if (!url.startsWith('http')) {
        url = `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      }
      if (seen.has(url)) continue;
      seen.add(url);

      const spacedInner = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const chNumMatch = url.match(/chapter-?(\d+(?:\.\d+)?)/i) || spacedInner.match(/chapter\s*(\d+(?:\.\d+)?)/i);
      if (chNumMatch) {
        const chNum = parseFloat(chNumMatch[1]);
        const dateMatch = spacedInner.match(/(\d+\s+(?:days?|hours?|mins?|weeks?|months?|years?)\s+ago)/i);
        const releaseDate = dateMatch ? dateMatch[1] : '';
        let title = spacedInner
          .replace(/^(?:First Chapter|New Chapter)\s*/i, '')
          .replace(/(?:\d+\s+(?:days?|hours?|mins?|weeks?|months?|years?)\s+ago)/gi, '')
          .trim();
        if (!title || !title.toLowerCase().includes('chapter')) {
          title = `Chapter ${chNum}`;
        }

        chapters.push({
          id: url,
          mangaId: `${this.id}::main`,
          chapterNumber: chNum,
          title,
          releaseDate,
          isRead: false,
          lastReadPageIndex: 0,
          totalPages: 0,
          sourceId: this.id,
        });
      }
    }

    // Canonical order: Chapter 1 -> Chapter N (ascending)
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    return chapters;
  }

  async getPageList(chapterId: string): Promise<Page[]> {
    const res = await fetchWithDnsFallback(chapterId, {
      ...this.headers,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapter pages`);
    const html = await res.text();

    const imgTags = [...html.matchAll(/<img\b[^>]*>/gi)];
    const pages: Page[] = [];
    const seenUrls = new Set<string>();

    for (const tagMatch of imgTags) {
      const tag = tagMatch[0];
      // Skip non-page images (header background, logos, avatars, ads, cover images)
      if (
        tag.includes('header-background') ||
        tag.includes('logo') ||
        tag.includes('avatar') ||
        tag.includes('favicon') ||
        tag.includes('ads') ||
        tag.includes('cover')
      ) {
        continue;
      }

      const srcMatch = tag.match(/(?:data-src|data-lazy-src|src)\s*=\s*["']([^"']+)["']/i);
      if (srcMatch) {
        let u = srcMatch[1].replace(/[\r\n\t\s]/g, '').trim();
        if (!u || u.startsWith('data:image')) continue;
        if (u.startsWith('//')) u = `https:${u}`;
        if (!seenUrls.has(u)) {
          seenUrls.add(u);
          pages.push({
            index: pages.length,
            url: u,
          });
        }
      }
    }

    // Natural numeric sorting for page images (1.webp, 2.webp, ... 32.webp)
    const numRegex = /\/(\d+)\.(?:webp|jpe?g|png|avif)(?:\?.*)?$/i;
    const matchesNum = pages.every((p) => numRegex.test(p.url));
    if (matchesNum && pages.length > 1) {
      pages.sort((a, b) => {
        const ma = a.url.match(numRegex);
        const mb = b.url.match(numRegex);
        if (ma && mb) {
          return parseInt(ma[1], 10) - parseInt(mb[1], 10);
        }
        return a.index - b.index;
      });
      // Re-index sequentially
      pages.forEach((p, idx) => {
        p.index = idx;
      });
    }

    if (pages.length === 0) {
      throw new Error('This chapter has not yet been published with pages by the source provider.');
    }

    return pages;
  }

  async searchManga(query: string): Promise<Manga[]> {
    const q = (query || '').toLowerCase().trim();
    if (
      !q ||
      q.includes('wistoria') ||
      q.includes('wand') ||
      q.includes('sword') ||
      q.includes('tsue') ||
      q.includes('tsurugi') ||
      q.includes('will') ||
      q.includes('magic') ||
      'wistoria: wand and sword'.includes(q)
    ) {
      const item = await this.getMangaDetails(`${this.id}::main`);
      return [item];
    }
    return [];
  }
}

/**
 * Universal source factory by manifest type
 */
export function createSourceFromManifest(manifest: ExtensionManifest): ISource {
  if (manifest.type === 'dedicated-series' || manifest.baseUrl.includes('wistoriaswandandsword.com')) {
    return new DedicatedSeriesSource(manifest);
  }
  if (manifest.type === 'mangadex') {
    return new DynamicMangaDexSource(manifest);
  }
  return new DynamicMadaraSource(manifest);
}

