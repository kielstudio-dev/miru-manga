async function fetchTags() {
  const res = await fetch('https://api.mangadex.org/manga/tag');
  const json = await res.json();
  const map = {};
  for (const t of json.data) {
    const name = t.attributes.name.en;
    map[name] = t.id;
  }
  console.log(JSON.stringify(map, null, 2));
}
fetchTags();
