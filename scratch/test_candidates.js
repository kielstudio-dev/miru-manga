const candidates = [
  'https://harimanga.com',
  'https://zinmanga.com',
  'https://nightcomic.com',
  'https://earlym.org',
  'https://kunmanga.org',
  'https://mangafire.to',
  'https://mangapill.com',
  'https://weebcentral.com',
  'https://api.comick.fun/top?type=manga',
  'https://batotoo.com',
  'https://dto.to',
  'https://readm.org',
  'https://manhwatop.com',
  'https://rawmangas.net',
  'https://manhwafreak.com',
  'https://void-scans.com',
  'https://hivetoons.com',
  'https://cosmic-scans.com',
  'https://reaperscans.com',
  'https://luminousscans.net'
];

async function check() {
  for (const u of candidates) {
    try {
      const res = await fetch(u, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0' },
        signal: AbortSignal.timeout(5000)
      });
      const text = await res.text();
      const title = text.match(/<title>([^<]+)<\/title>/i)?.[1] || '';
      console.log(res.status, u, title.slice(0, 40));
    } catch(e) {
      console.log('FAIL', u, e.message);
    }
  }
}
check();
