import { ExtensionManifest, ExtensionRepository } from './types';
import { DynamicMadaraSource, createSourceFromManifest } from './engine';
import { sourceRegistry } from '../sources/registry';
import { getDatabase, safeDbRun } from '../storage';

// Safe, open-source default extensions shipped with the app bundle (compliant with Play Store policies)
export const DEFAULT_REPO_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'peppercarrot-open',
    name: 'Pepper & Carrot (Open)',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://www.peppercarrot.com/core/img/favicon.png',
    baseUrl: 'https://peppercarrot.com',
    type: 'madara',
    description: 'Free, open-source webcomic by David Revoy. 100% legal Creative Commons.',
  },
];

export const COMMUNITY_PRESET_URL = 'https://raw.githubusercontent.com/vortex-community/manga-repo/main/index.json';
export const COMMUNITY_NSFW_PRESET_URL = 'https://raw.githubusercontent.com/vortex-community/manga-repo/main/nsfw-index.json';

export const COMMUNITY_NSFW_FALLBACK_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'mangadex-18',
    name: 'MangaDex (18+ Adult & Erotica)',
    version: '1.2.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: '29,000+ uncensored 18+ adult manga, manhwa & doujinshi. Direct official API, 100% immune to ISP blocks.',
  },
  {
    id: 'manhwa18-net',
    name: 'Manhwa18 (18+)',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://manhwa18.net/favicon.ico',
    baseUrl: 'https://manhwa18.net',
    type: 'madara',
    isNsfw: true,
    description: '18+ Mature Korean webtoons, adult romance, and raw/translated manhwa.',
  },
  {
    id: 'hentai2read-com',
    name: 'Hentai2Read (18+)',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://hentai2read.com/favicon.ico',
    baseUrl: 'https://hentai2read.com',
    type: 'madara',
    isNsfw: true,
    description: '18+ Adult Japanese doujinshi, uncensored & colorized releases.',
  },
  {
    id: 'toongod-org',
    name: 'ToonGod (18+)',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://toongod.org/wp-content/uploads/2021/05/cropped-tg-fav-192x192.png',
    baseUrl: 'https://toongod.org',
    type: 'madara',
    isNsfw: true,
    description: '18+ Adult webtoons, mature manhwa drama, and uncensored comics.',
  },
];

export const COMMUNITY_FALLBACK_EXTENSIONS: ExtensionManifest[] = [
  {
    id: 'mangadex-org',
    name: 'MangaDex (70K+ Titles)',
    version: '1.2.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'High-speed global catalog. 70,000+ manga, manhwa & manhua with zero blockades.',
  },
  {
    id: 'mangaread-org',
    name: 'MangaRead',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://www.mangaread.org/wp-content/uploads/2017/10/log1.png',
    baseUrl: 'https://www.mangaread.org',
    type: 'madara',
    description: 'English translated Manga, Manhwa, and Manhua from MangaRead.',
  },
  {
    id: 'mangasushi-org',
    name: 'MangaSushi',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://mangasushi.org/wp-content/uploads/2022/01/cropped-MS_LOGO-192x192.png',
    baseUrl: 'https://mangasushi.org',
    type: 'madara',
    description: 'Isekai, fantasy, and adventure manga with high-speed chapter releases.',
  },
  {
    id: 'manhuaplus-com',
    name: 'ManhuaPlus',
    version: '1.0.0',
    lang: 'EN',
    icon: 'https://manhuaplus.com/wp-content/uploads/2020/07/cropped-manhua-vuong-den-1-192x192.jpg',
    baseUrl: 'https://manhuaplus.com',
    type: 'madara',
    description: 'Popular action, martial arts, and cultivation manhua & manhwa.',
  },
];

const DEFUNCT_IDS = new Set(['manhuaus-com', 'mangatx-to']);

let installedManifests: ExtensionManifest[] = [];
const extensionListeners = new Set<(extensions: ExtensionManifest[]) => void>();

export function subscribeToInstalledExtensions(callback: (extensions: ExtensionManifest[]) => void): () => void {
  extensionListeners.add(callback);
  getInstalledExtensions().then(callback);
  return () => {
    extensionListeners.delete(callback);
  };
}

function notifyInstalledListeners() {
  const copy = [...installedManifests];
  extensionListeners.forEach((cb) => {
    try {
      cb(copy);
    } catch (e) {
      // Ignore
    }
  });
}

export async function getInstalledExtensions(): Promise<ExtensionManifest[]> {
  if (installedManifests.length > 0) return installedManifests;

  return safeDbRun(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'installed_extensions';`
    );
    if (row && row.value) {
      const parsed: ExtensionManifest[] = JSON.parse(row.value);
      // Clean out any defunct extensions (e.g. dead domains like manhuaus)
      const cleaned = parsed.filter((m) => !DEFUNCT_IDS.has(m.id));
      if (cleaned.length !== parsed.length) {
        await db.runAsync(
          `INSERT OR REPLACE INTO settings (key, value) VALUES ('installed_extensions', ?);`,
          [JSON.stringify(cleaned)]
        );
      }
      installedManifests = cleaned;
    }
    return installedManifests;
  }, installedManifests);
}

export async function installExtension(manifest: ExtensionManifest): Promise<void> {
  const source = createSourceFromManifest(manifest);
  sourceRegistry.register(source);

  // Check if already in array
  const existingIdx = installedManifests.findIndex((m) => m.id === manifest.id);
  const updatedManifest = { ...manifest, installed: true };

  if (existingIdx >= 0) {
    installedManifests[existingIdx] = updatedManifest;
  } else {
    installedManifests.push(updatedManifest);
  }

  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('installed_extensions', ?);`,
      [JSON.stringify(installedManifests)]
    );
  }, undefined);

  notifyInstalledListeners();
}

export async function uninstallExtension(manifestId: string): Promise<void> {
  // Unregister source from live registry
  sourceRegistry.unregister(manifestId);

  installedManifests = installedManifests.filter((m) => m.id !== manifestId);

  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('installed_extensions', ?);`,
      [JSON.stringify(installedManifests)]
    );
  }, undefined);

  notifyInstalledListeners();
}

export async function getCustomRepos(): Promise<string[]> {
  return safeDbRun(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'custom_extension_repos';`
    );
    if (row && row.value) {
      return JSON.parse(row.value);
    }
    return [];
  }, []);
}

export async function addCustomRepo(url: string): Promise<void> {
  const cleanUrl = url.trim();
  if (!cleanUrl) return;
  const current = await getCustomRepos();
  if (current.includes(cleanUrl)) return;
  const updated = [...current, cleanUrl];

  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_extension_repos', ?);`,
      [JSON.stringify(updated)]
    );
  }, undefined);
}

export async function removeCustomRepo(url: string): Promise<void> {
  const current = await getCustomRepos();
  const updated = current.filter((r) => r !== url);
  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_extension_repos', ?);`,
      [JSON.stringify(updated)]
    );
  }, undefined);
}

export async function fetchRepositoryExtensions(repoUrl?: string): Promise<ExtensionManifest[]> {
  const installed = await getInstalledExtensions();

  if (repoUrl) {
    try {
      const res = await fetch(repoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ExtensionRepository | ExtensionManifest[] = await res.json();
      const list = Array.isArray(data) ? data : data.extensions || [];
      return list.map((ext) => ({
        ...ext,
        installed: installed.some((i) => i.id === ext.id),
      }));
    } catch (err) {
      if (repoUrl === COMMUNITY_NSFW_PRESET_URL || repoUrl.includes('nsfw')) {
        return COMMUNITY_NSFW_FALLBACK_EXTENSIONS.map((ext) => ({
          ...ext,
          installed: installed.some((i) => i.id === ext.id),
        }));
      }
      if (repoUrl === COMMUNITY_PRESET_URL || repoUrl.includes('community')) {
        return COMMUNITY_FALLBACK_EXTENSIONS.map((ext) => ({
          ...ext,
          installed: installed.some((i) => i.id === ext.id),
        }));
      }
      console.error('[ExtensionManager] Failed to fetch external repository:', err);
      throw err;
    }
  }

  // Check saved custom repos
  const savedRepos = await getCustomRepos();
  let combined: ExtensionManifest[] = [...DEFAULT_REPO_EXTENSIONS];

  for (const r of savedRepos) {
    try {
      const res = await fetch(r);
      if (res.ok) {
        const data: ExtensionRepository | ExtensionManifest[] = await res.json();
        const list = Array.isArray(data) ? data : data.extensions || [];
        combined = [...combined, ...list];
      } else if (r === COMMUNITY_NSFW_PRESET_URL || r.includes('nsfw')) {
        combined = [...combined, ...COMMUNITY_NSFW_FALLBACK_EXTENSIONS];
      } else if (r === COMMUNITY_PRESET_URL || r.includes('community')) {
        combined = [...combined, ...COMMUNITY_FALLBACK_EXTENSIONS];
      }
    } catch (e) {
      if (r === COMMUNITY_NSFW_PRESET_URL || r.includes('nsfw')) {
        combined = [...combined, ...COMMUNITY_NSFW_FALLBACK_EXTENSIONS];
      } else if (r === COMMUNITY_PRESET_URL || r.includes('community')) {
        combined = [...combined, ...COMMUNITY_FALLBACK_EXTENSIONS];
      }
    }
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = combined.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return unique.map((ext) => ({
    ...ext,
    installed: installed.some((i) => i.id === ext.id),
  }));
}

export async function initializeInstalledExtensions(): Promise<void> {
  const installed = await getInstalledExtensions();
  for (const manifest of installed) {
    const source = createSourceFromManifest(manifest);
    sourceRegistry.register(source);
  }
}
