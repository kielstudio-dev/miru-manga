async function inspect(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      signal: AbortSignal.timeout(6000)
    });
    const text = await res.text();
    console.log(url, 'Title:', text.match(/<title>([^<]+)<\/title>/i)?.[1]);
    console.log(url, 'Sample hrefs:', text.match(/href="[^"]+"/g)?.slice(0, 15));
  } catch(e) {
    console.log(url, 'Error:', e.message);
  }
}

async function run() {
  await inspect('https://topmanhua.com');
  await inspect('https://coffeemanga.io');
}
run();
