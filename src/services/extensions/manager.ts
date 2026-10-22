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
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: '20,000+ uncensored 18+ adult manga, manhwa & doujinshi. Direct official API, 100% immune to ISP blocks.',
  },
  {
    id: 'mangadex-doujinshi-18',
    name: 'MangaDex (18+ Doujinshi & Hentai)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: '10,000+ uncensored adult Japanese doujinshi, colorized releases, and hentai manga.',
  },
  {
    id: 'mangadex-romance-18',
    name: 'MangaDex (18+ Mature Romance & Ecchi)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Mature romantic drama, modern adult manhwa, and uncensored ecchi series.',
  },
  {
    id: 'mangadex-manhwa-18',
    name: 'MangaDex (18+ Adult Manhwa Webtoons)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Full-color Korean adult manhwa, drama, and spicy webtoon releases.',
  },
  {
    id: 'mangadex-harem-18',
    name: 'MangaDex (18+ Adult Harem & Smut)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Uncensored adult harem, fantasy romance, and spicy smut manga.',
  },
  {
    id: 'mangadex-yaoi-18',
    name: 'MangaDex (18+ Boys Love & BL)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Adult BL, Yaoi, and mature romance webtoons and manga.',
  },
  {
    id: 'mangadex-yuri-18',
    name: 'MangaDex (18+ Girls Love & GL)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Adult GL, Yuri, and mature female romance webtoons and manga.',
  },
  {
    id: 'mangadex-gyaru-18',
    name: 'MangaDex (18+ Gyaru & School Ecchi)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Spicy gyaru romance, school life, and mature ecchi manga.',
  },
  {
    id: 'mangadex-monster-girls-18',
    name: 'MangaDex (18+ Monster Girls & Fantasy)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Mature fantasy, demi-humans, and monster girl erotica.',
  },
  {
    id: 'mangadex-genderswap-18',
    name: 'MangaDex (18+ Gender Bender & Ecchi)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Uncensored gender transformation, body swap, and crossdressing manga.',
  },
  {
    id: 'mangadex-bdsm-18',
    name: 'MangaDex (18+ BDSM & Kinky Romance)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Intense adult psychological romance, kinky relationships, and erotica.',
  },
  {
    id: 'mangadex-reverse-harem-18',
    name: 'MangaDex (18+ Reverse Harem & Smut)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    isNsfw: true,
    description: 'Spicy female-lead reverse harem webtoons and adult romance.',
  },
];

export const COMMUNITY_FALLBACK_EXTENSIONS: ExtensionManifest[] = [
  // 1. Top Verified Madara Scanlation Providers
  {
    id: 'asura-comic',
    name: 'Asura Scans',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://asurascans.com/icons/apple-touch-icon.png',
    baseUrl: 'https://asurascans.com',
    type: 'madara',
    description: 'Top-tier action, dungeon hunter, cultivation, and regression manhwa.',
  },
  {
    id: 'flamecomics-xyz',
    name: 'Flame Comics',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://flamecomics.xyz/favicon.ico',
    baseUrl: 'https://flamecomics.xyz',
    type: 'madara',
    description: 'High-quality translated fantasy, martial arts, and leveling webtoons.',
  },
  {
    id: 'mangaread-org',
    name: 'MangaRead',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://www.mangaread.org/wp-content/uploads/2017/10/log1.png',
    baseUrl: 'https://www.mangaread.org',
    type: 'madara',
    description: 'English translated Manga, Manhwa, and Manhua from MangaRead.',
  },
  {
    id: 'mangasushi-org',
    name: 'MangaSushi',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://mangasushi.org/wp-content/uploads/2022/01/cropped-MS_LOGO-192x192.png',
    baseUrl: 'https://mangasushi.org',
    type: 'madara',
    description: 'Isekai, fantasy, and adventure manga with high-speed chapter releases.',
  },
  {
    id: 'manhuaplus-com',
    name: 'ManhuaPlus',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://manhuaplus.com/wp-content/uploads/2020/07/cropped-manhua-vuong-den-1-192x192.jpg',
    baseUrl: 'https://manhuaplus.com',
    type: 'madara',
    description: 'Popular action, martial arts, and cultivation manhua & manhwa.',
  },
  {
    id: 'mangaeffect-com',
    name: 'MangaEffect',
    version: '1.4.0',
    lang: 'EN',
    icon: 'https://mangaeffect.com/favicon.ico',
    baseUrl: 'https://mangaeffect.com',
    type: 'madara',
    description: 'High-speed English translated manga, manhwa, and webtoon chapters.',
  },

  // 2. MangaDex Global & Origin Catalogs
  {
    id: 'mangadex-org',
    name: 'MangaDex (70K+ Global)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'High-speed global catalog. 70,000+ manga, manhwa & manhua with zero blockades.',
  },
  {
    id: 'mangadex-manhwa',
    name: 'MangaDex (Korean Manhwa)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Over 8,800+ full-color Korean webtoons, leveling, and dungeon manhwa.',
  },
  {
    id: 'mangadex-manhua',
    name: 'MangaDex (Chinese Manhua)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Over 6,000+ cultivation, martial arts, and fantasy Chinese manhua.',
  },
  {
    id: 'mangadex-manga',
    name: 'MangaDex (Japanese Manga)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Over 76,000+ classic & ongoing Japanese Shonen, Seinen, and Shojo manga.',
  },

  // 3. MangaDex Demographics
  {
    id: 'mangadex-shonen',
    name: 'MangaDex (Shonen Manga)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Action-packed adventures, inspiring rivalries, and hero journeys.',
  },
  {
    id: 'mangadex-seinen',
    name: 'MangaDex (Seinen Manga)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Mature plots, psychological depth, gritty battles, and complex storytelling.',
  },
  {
    id: 'mangadex-shojo',
    name: 'MangaDex (Shojo Manga)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Heartfelt romances, emotional dramas, and school youth stories.',
  },
  {
    id: 'mangadex-josei',
    name: 'MangaDex (Josei Manga)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Realistic adult life, workplace romance, and mature modern relationships.',
  },

  // 4. MangaDex Genres & Niches
  {
    id: 'mangadex-action',
    name: 'MangaDex (Action & Adventure)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Top trending high-adrenaline action, superpowers, martial arts, and dungeon stories.',
  },
  {
    id: 'mangadex-adventure',
    name: 'MangaDex (Adventure & Quest)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Epic journeys across vast worlds, ancient relics, and legendary quests.',
  },
  {
    id: 'mangadex-isekai',
    name: 'MangaDex (Isekai & Reincarnation)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Popular other-world reincarnation, fantasy adventure, and overpowered MC stories.',
  },
  {
    id: 'mangadex-fantasy',
    name: 'MangaDex (Fantasy & Magic)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Magical realms, swordplay, mythical creatures, and wondrous sorcery.',
  },
  {
    id: 'mangadex-romance',
    name: 'MangaDex (Romance & Drama)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Sweet rom-coms, wholesome love stories, and emotional drama.',
  },
  {
    id: 'mangadex-comedy',
    name: 'MangaDex (Comedy & Gag)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Laugh-out-loud humor, parody, daily hijinks, and hilarious situations.',
  },
  {
    id: 'mangadex-slice-of-life',
    name: 'MangaDex (Slice of Life)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Heartwarming daily life, relaxing friendships, and cozy episodic tales.',
  },
  {
    id: 'mangadex-scifi',
    name: 'MangaDex (Sci-Fi & Cyberpunk)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Futuristic technologies, cyberpunk cities, AI, and space exploration.',
  },
  {
    id: 'mangadex-supernatural',
    name: 'MangaDex (Supernatural & Occult)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Spirits, exorcists, demonic entities, and mystical modern phenomena.',
  },
  {
    id: 'mangadex-mystery',
    name: 'MangaDex (Mystery & Detective)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Unsolved crimes, detective investigations, puzzles, and enigmatic thrillers.',
  },
  {
    id: 'mangadex-psychological',
    name: 'MangaDex (Psychological & Mind Games)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'High-stakes intellect battles, psychological manipulation, and intense suspense.',
  },
  {
    id: 'mangadex-horror',
    name: 'MangaDex (Horror & Thriller)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Chilling ghost stories, macabre mysteries, and eerie survival situations.',
  },
  {
    id: 'mangadex-thriller',
    name: 'MangaDex (Suspense & Thriller)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Fast-paced conspiracies, chase scenes, and edge-of-your-seat tension.',
  },
  {
    id: 'mangadex-martial-arts',
    name: 'MangaDex (Martial Arts & Wuxia)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Hand-to-hand combat, ancient martial clans, and internal qi techniques.',
  },
  {
    id: 'mangadex-dungeon-rpg',
    name: 'MangaDex (Dungeon, Leveling & RPG)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Awakened hunters, dungeon towers, system status windows, and solo leveling.',
  },
  {
    id: 'mangadex-school-life',
    name: 'MangaDex (School Life & Youth)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'High school friendships, classroom comedies, and youthful club activities.',
  },
  {
    id: 'mangadex-historical',
    name: 'MangaDex (Historical & Period)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Ancient empires, samurai eras, historical dramas, and royal dynasties.',
  },
  {
    id: 'mangadex-mecha',
    name: 'MangaDex (Mecha & Sci-Fi Robots)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Giant robot warfare, mechanized armor, and sci-fi tactical combat.',
  },
  {
    id: 'mangadex-survival',
    name: 'MangaDex (Survival & Battle Royale)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Desperate survival games, deserted island challenges, and apocalyptic trials.',
  },
  {
    id: 'mangadex-superhero',
    name: 'MangaDex (Superhero & Powers)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Mutant abilities, vigilante crimefighters, and superpower hero leagues.',
  },
  {
    id: 'mangadex-time-travel',
    name: 'MangaDex (Time Travel & Regression)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Going back to the past, second-chance regressions, and changing destiny.',
  },
  {
    id: 'mangadex-villainess',
    name: 'MangaDex (Villainess & Rebirth)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Otome game villainesses reincarnated to rewrite tragic doom endings.',
  },
  {
    id: 'mangadex-monsters',
    name: 'MangaDex (Monsters & Beast Taming)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Creature taming, legendary beasts, familiars, and pet companions.',
  },
  {
    id: 'mangadex-cooking',
    name: 'MangaDex (Cooking & Gourmet)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Mouthwatering culinary battles, tavern cooking, and gourmet recipes.',
  },
  {
    id: 'mangadex-music',
    name: 'MangaDex (Music & Performing Arts)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Bands, classical musicians, idols, and inspirational musical dreams.',
  },
  {
    id: 'mangadex-medical',
    name: 'MangaDex (Medical & Science)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Genius surgeons, medical breakthroughs, hospital drama, and alchemy.',
  },
  {
    id: 'mangadex-tragedy',
    name: 'MangaDex (Tragedy & Dark Drama)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Deep heartbreak, tearjerker sacrifices, and poignant human stories.',
  },
  {
    id: 'mangadex-crime',
    name: 'MangaDex (Crime & Mafia Underground)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Underworld syndicates, yakuza clans, heists, and gritty noir thrillers.',
  },
  {
    id: 'mangadex-demons',
    name: 'MangaDex (Demons & Mythical Beasts)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Demon kings, gothic vampire aristocrats, and supernatural lore.',
  },
  {
    id: 'mangadex-military',
    name: 'MangaDex (Military & Tactical Warfare)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Battlefield tactics, warfare strategy, historical soldiers, and commanders.',
  },
  {
    id: 'mangadex-wuxia',
    name: 'MangaDex (Wuxia & Cultivation)',
    version: '1.4.0',
    lang: 'ALL',
    icon: 'https://mangadex.org/favicon.ico',
    baseUrl: 'https://api.mangadex.org',
    type: 'mangadex',
    description: 'Immortal cultivation, dantian breakthrough, dao comprehension, and sect rivalries.',
  },
];

const DEFUNCT_IDS = new Set([
  'manhuaus-com',
  'mangatx-to',
  'mangaclash-com',
  'reaperscans-com',
  'manhwa18-net',
  'hentai2read-com',
  'toongod-org',
  'flamecomics-me',
]);

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

  // Check saved custom repos and ensure community catalog is available by default
  const savedRepos = await getCustomRepos();
  let combined: ExtensionManifest[] = [
    ...DEFAULT_REPO_EXTENSIONS,
    ...COMMUNITY_FALLBACK_EXTENSIONS,
    ...COMMUNITY_NSFW_FALLBACK_EXTENSIONS,
  ];

  // Fetch all saved repos concurrently with an AbortController timeout so it never hangs or lags
  const fetchedLists = await Promise.all(
    savedRepos.map(async (r) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(r, { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
          const data: ExtensionRepository | ExtensionManifest[] = await res.json();
          return Array.isArray(data) ? data : data.extensions || [];
        }
      } catch (e) {
        // Fallback gracefully on timeout or network error
      }
      if (r === COMMUNITY_NSFW_PRESET_URL || r.includes('nsfw')) {
        return COMMUNITY_NSFW_FALLBACK_EXTENSIONS;
      }
      if (r === COMMUNITY_PRESET_URL || r.includes('community')) {
        return COMMUNITY_FALLBACK_EXTENSIONS;
      }
      return [];
    })
  );

  for (const list of fetchedLists) {
    combined = [...combined, ...list];
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
