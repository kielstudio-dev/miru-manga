import { ISource } from '../sources/types';
import { ExtensionManifest } from './types';
import { Manga, Chapter, Page } from '../../types';

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

  async getMangaList(page: number = 1, category: string = 'views'): Promise<Manga[]> {
    try {
      let path = '';
      const catLower = (category || 'views').toLowerCase();

      if (catLower === 'views' || catLower === 'popular' || catLower === 'top') {
        path = page === 1 ? '/manga/?m_orderby=views' : `/manga/page/${page}/?m_orderby=views`;
      } else if (catLower === 'new-manga' || catLower === 'latest' || catLower === 'new') {
        path = page === 1 ? '/manga/?m_orderby=new-manga' : `/manga/page/${page}/?m_orderby=new-manga`;
      } else {
        // Specific genre or taxonomy: e.g. manhwa, manhua, manga, fantasy, isekai, school-life
        path = page === 1 ? `/genres/${catLower}/` : `/genres/${catLower}/page/${page}/`;
      }

      let url = `${this.baseUrl}${path}`;
      let res = await fetch(url, { headers: this.headers });

      // If /genres/ returned 404, fallback to /manga-genre/ (used by alternative Madara themes)
      if (res.status === 404 && path.includes('/genres/')) {
        const altPath = page === 1 ? `/manga-genre/${catLower}/` : `/manga-genre/${catLower}/page/${page}/`;
        url = `${this.baseUrl}${altPath}`;
        res = await fetch(url, { headers: this.headers });
      }

      if (!res.ok) throw new Error(`HTTP ${res.status} from ${this.baseUrl}`);
      const html = await res.text();

      const mangaLinks = [
        ...html.matchAll(
          new RegExp(`<a\\s+[^>]*href="https?:\/\/[^\/]+\/manga\/([^"\/]+)\/?(?:"|\\?)[^>]*>([\\s\\S]*?)<\/a>`, 'g')
        ),
      ];

      const seen = new Set<string>();
      const results: Manga[] = [];

      for (const m of mangaLinks) {
        const slug = m[1];
        if (!slug || slug === 'manga' || slug.includes('?') || slug.includes('=') || seen.has(slug)) continue;
        seen.add(slug);

        const pos = m.index || 0;
        const context = html.slice(Math.max(0, pos - 250), Math.min(html.length, pos + 1000));

        let coverUrl = '';
        const dataSrc = context.match(/(?:data-src|data-lazy-src|data-cfsrc)="([^"]+)"/);
        const src = context.match(/src="([^"]+)"/);
        if (dataSrc && dataSrc[1] && !dataSrc[1].includes('dflazy')) {
          coverUrl = dataSrc[1];
        } else if (src && src[1] && !src[1].includes('dflazy')) {
          coverUrl = src[1];
        }

        coverUrl = coverUrl.replace(/-\d+x\d+(\.\w+)$/, '$1').trim();

        const titleMatch =
          context.match(/<(?:h3|h4|a)[^>]*title="([^"]+)"/) ||
          context.match(/title="([^"]+)"/) ||
          context.match(/alt="([^"]+)"/);

        const title = titleMatch ? titleMatch[1].replace(/&#8217;/g, "'").trim() : slug;

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
    } catch (err: any) {
      const isDnsSinkhole =
        String(err?.message || err).includes('10.254.254.1') ||
        String(err?.message || err).includes('ConnectException');
      if (isDnsSinkhole) {
        console.warn(
          `[DynamicMadaraSource: ${this.name}] ISP DNS Sinkhole detected (10.254.254.1). Use MangaDex 18+ or enable Android Private DNS (one.one.one.one).`
        );
      } else {
        console.warn(`[DynamicMadaraSource: ${this.name}] getMangaList failed:`, err?.message || err);
      }
      return [];
    }
  }

  async searchManga(query: string): Promise<Manga[]> {
    try {
      const url = `${this.baseUrl}/?s=${encodeURIComponent(query)}&post_type=wp-manga`;
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();

      const mangaLinks = [
        ...html.matchAll(
          new RegExp(`<a\\s+[^>]*href="https?:\/\/[^\/]+\/manga\/([^"\/]+)\/?"[^>]*>([\\s\\S]*?)<\/a>`, 'g')
        ),
      ];

      const seen = new Set<string>();
      const results: Manga[] = [];

      for (const m of mangaLinks) {
        const slug = m[1];
        if (!slug || slug === 'manga' || slug.includes('?') || slug.includes('=') || seen.has(slug)) continue;
        seen.add(slug);

        const pos = m.index || 0;
        const context = html.slice(Math.max(0, pos - 250), Math.min(html.length, pos + 1000));

        let coverUrl = '';
        const dataSrc = context.match(/(?:data-src|data-lazy-src|data-cfsrc)="([^"]+)"/);
        const src = context.match(/src="([^"]+)"/);
        if (dataSrc && dataSrc[1] && !dataSrc[1].includes('dflazy')) {
          coverUrl = dataSrc[1];
        } else if (src && src[1] && !src[1].includes('dflazy')) {
          coverUrl = src[1];
        }

        coverUrl = coverUrl.replace(/-\d+x\d+(\.\w+)$/, '$1').trim();

        const titleMatch =
          context.match(/<(?:h3|h4|a)[^>]*title="([^"]+)"/) ||
          context.match(/title="([^"]+)"/) ||
          context.match(/alt="([^"]+)"/);

        const title = titleMatch ? titleMatch[1].replace(/&#8217;/g, "'").trim() : slug;
        const altMatch = context.match(/<div class="summary-content">([\s\S]*?)<\/div>/i);
        const altTitle = altMatch ? altMatch[1].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").trim() : '';

        results.push({
          id: `${this.id}::${slug}`,
          title: title,
          altTitle: altTitle,
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
    } catch (err: any) {
      console.warn(`[DynamicMadaraSource: ${this.name}] searchManga failed:`, err?.message || err);
      return [];
    }
  }

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const slug = mangaId.replace(`${this.id}::`, '');
    const url = `${this.baseUrl}/manga/${slug}/`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching manga details`);
    const html = await res.text();

    const titleMatch =
      html.match(/<div class="post-title"[^>]*>[\s\S]*?<h1>([\s\S]*?)<\/h1>/i) ||
      html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&#8217;/g, "'").trim() : slug;

    // Extract real cover image, strictly avoiding lazy-load placeholders (dflazy.jpg, blank.gif)
    const summaryImgDiv = html.match(/<div class="summary_image"[^>]*>([\s\S]*?)<\/div>/i);
    const searchArea = summaryImgDiv ? summaryImgDiv[1] : html;

    const dataSrc = searchArea.match(/(?:data-src|data-lazy-src|data-cfsrc)="([^"]+)"/i);
    const src = searchArea.match(/\bsrc="([^"]+)"/i);
    const ogImg = html.match(/<meta property=["']og:image["'] content=["']([^"']+)["']/i);

    let coverUrl = '';
    if (dataSrc && dataSrc[1] && !dataSrc[1].includes('dflazy') && !dataSrc[1].includes('blank.gif')) {
      coverUrl = dataSrc[1];
    } else if (src && src[1] && !src[1].includes('dflazy') && !src[1].includes('blank.gif')) {
      coverUrl = src[1];
    } else if (ogImg && ogImg[1] && !ogImg[1].includes('dflazy') && !ogImg[1].includes('blank.gif')) {
      coverUrl = ogImg[1];
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
    const mangaUrl = `${this.baseUrl}/manga/${slug}/`;

    // In Madara WordPress themes, the main HTML only renders a truncated preview of recent chapters,
    // while the POST /ajax/chapters/ endpoint returns the full complete list from Chapter 1 to latest!
    let chMatches: RegExpMatchArray[] = [];
    try {
      const ajaxRes = await fetch(`${mangaUrl}ajax/chapters/`, {
        method: 'POST',
        headers: {
          ...this.headers,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (ajaxRes.ok) {
        const ajaxHtml = await ajaxRes.text();
        chMatches = [
          ...ajaxHtml.matchAll(
            /<li\s+[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
          ),
        ];
      }
    } catch (e) {
      // Fall back to main page if AJAX fails
    }

    // Fallback to scraping main manga page if AJAX returned 0
    if (chMatches.length === 0) {
      try {
        const res = await fetch(mangaUrl, { headers: this.headers });
        if (res.ok) {
          const html = await res.text();
          chMatches = [
            ...html.matchAll(
              /<li\s+[^>]*class="[^"]*wp-manga-chapter[^"]*"[\s\S]*?<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
            ),
          ];
        }
      } catch (err) {
        console.error(`[DynamicMadaraSource: ${this.name}] getChapters fetch error:`, err);
      }
    }

    const chapters: Chapter[] = [];
    // Chapters in Madara are listed newest first, so reverse for 1 -> N ascending order
    const ordered = [...chMatches].reverse();
    const seenUrls = new Set<string>();

    for (let i = 0; i < ordered.length; i++) {
      const m = ordered[i];
      const chUrl = m[1].trim();
      if (!chUrl || seenUrls.has(chUrl)) continue;
      seenUrls.add(chUrl);

      const chTitle = m[2].replace(/<[^>]+>/g, '').trim();

      // Extract accurate chapter number:
      // Prefer prefix match ("Chapter 12", "Ch. 5", "#24") to avoid matching season/volume digits
      const prefixMatch = chTitle.match(/(?:chapter|ch|ep|episode|#)\.?\s*(\d+(?:\.\d+)?)/i);
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
        releaseDate: '',
        isRead: false,
        lastReadPageIndex: 0,
        totalPages: 0,
        sourceId: this.id,
      });
    }

    return chapters;
  }

  async getPageList(chapterId: string): Promise<Page[]> {
    const res = await fetch(chapterId, { headers: this.headers });
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

    const results: string[] = [];
    const seen = new Set<string>();

    const addUrl = (rawUrl: string) => {
      if (!rawUrl) return;
      const clean = rawUrl.replace(/[\r\n\t\s]/g, '').trim();
      if (!clean) return;
      if (clean.startsWith('data:image')) return;
      if (clean.includes('blank.gif') || clean.includes('dflazy') || clean.includes('placeholder')) return;
      if (clean.includes('avatar') || clean.includes('logo') || clean.includes('favicon') || clean.includes('/ads/')) return;
      if (!seen.has(clean)) {
        seen.add(clean);
        results.push(clean);
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
        const srcMatch = tag.match(/(?:data-src|data-lazy-src|data-cfsrc|data-full-url|src)\s*=\s*["']([^"']+)["']/i);
        if (srcMatch) {
          addUrl(srcMatch[1]);
        }
      }
    }

    // Strategy B: If no tagged images, search reading-content or chapter-video-frame containers
    if (results.length === 0) {
      const readingDivMatches = [
        ...html.matchAll(
          /<div\b[^>]*class=["'][^"']*(?:reading-content|read-container|chapter-video-frame)[^"']*["'][^>]*>([\s\S]*?)(?:<div class=["'](?:c-breadcrumb|c-selectpicker|comments-area|entry-navigation)|<footer|<\/body)/gi
        ),
      ];
      for (const rMatch of readingDivMatches) {
        const blockImgs = [...rMatch[1].matchAll(/<img\b[^>]*>/gi)];
        for (const tagMatch of blockImgs) {
          const tag = tagMatch[0];
          const srcMatch = tag.match(/(?:data-src|data-lazy-src|data-cfsrc|data-full-url|src)\s*=\s*["']([^"']+)["']/i);
          if (srcMatch) {
            addUrl(srcMatch[1]);
          }
        }
        if (results.length > 0) break;
      }
    }

    // Strategy C: Check for inline JSON array
    if (results.length === 0) {
      const jsonMatch = html.match(/(?:chapter_preloaded_images|wpmangaimg)\s*=\s*(\[[^\]]+\])/i);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (Array.isArray(parsed)) {
            for (const u of parsed) {
              if (typeof u === 'string') addUrl(u);
            }
          }
        } catch (e) {}
      }
    }

    if (results.length === 0) {
      throw new Error('This chapter has not yet been published with pages by the source provider.');
    }

    return results.map((url, idx) => ({
      index: idx,
      url: url,
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

  async getMangaList(page: number = 1, category: string = 'views'): Promise<Manga[]> {
    try {
      const offset = (page - 1) * 20;
      const ratings = this.isNsfw
        ? '&contentRating[]=erotica&contentRating[]=pornographic'
        : '&contentRating[]=safe&contentRating[]=suggestive';

      let orderParam = 'order[followedCount]=desc';
      if (category === 'new-manga' || category === 'new' || category === 'latest') {
        orderParam = 'order[createdAt]=desc';
      }

      const url = `${this.baseUrl}/manga?limit=20&offset=${offset}&includes[]=cover_art&includes[]=author${ratings}&${orderParam}`;
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
      const url = `${this.baseUrl}/manga?title=${encodeURIComponent(query)}&limit=20&includes[]=cover_art&includes[]=author${ratings}`;
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

    // 2. Handle native MangaDex @home server
    const url = `${this.baseUrl}/at-home/server/${chapterId}`;
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching chapter pages`);
    const json = await res.json();
    const hash = json.chapter?.hash;
    const pages = (json.chapter?.data || []).map((file: string, idx: number) => ({
      index: idx,
      url: `${json.baseUrl}/data/${hash}/${file}`,
    }));
    if (pages.length === 0) {
      throw new Error('This chapter has not yet been published with pages by the source provider.');
    }
    return pages;
  }
}

/**
 * Universal source factory by manifest type
 */
export function createSourceFromManifest(manifest: ExtensionManifest): ISource {
  if (manifest.type === 'mangadex') {
    return new DynamicMangaDexSource(manifest);
  }
  return new DynamicMadaraSource(manifest);
}

