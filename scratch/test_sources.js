async function testUrl(name, url, path = '/manga/') {
  try {
    const res = await fetch(url + path, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    const html = await res.text();
    const linkRegex = /<a\s+([^>]*?)href=["'](?:https?:\/\/[^/"'>]+)?\/(?:manga|series|comic|comics|webtoon|manhwa)\/([^"'/#?]+)\/?[^"']*["']([^>]*)>([\s\S]*?)<\/a>/gi;
    const matches = [...html.matchAll(linkRegex)];
    console.log(name, 'status:', res.status, 'found links:', matches.length);
  } catch (e) {
    console.log(name, 'FAILED:', e.message);
  }
}

async function run() {
  await testUrl('TopManhua', 'https://topmanhua.com');
  await testUrl('CoffeeManga', 'https://coffeemanga.io');
  await testUrl('MangaOnlineTeam', 'https://mangaonlineteam.com');
}

run();
