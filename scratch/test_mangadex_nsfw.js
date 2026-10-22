const nsfwTags = [
  '&includedTags[]=b13b2a48-c720-44a9-9c77-39c9979373fb', // Doujinshi
  '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d', // Romance
  '&includedTags[]=5920b825-4181-4a17-beeb-9918b0ff7a30', // Yaoi / BL
  '&includedTags[]=a3c67850-4684-404e-9b7f-c69850ee5da6', // Yuri / GL
  '&includedTags[]=aafb99c1-7f60-43fa-b75f-fc9502ce29c7', // Harem
  '&originalLanguage[]=ko', // Korean adult manhwa
  '&includedTags[]=fad12b5e-68ba-460e-b933-9ae8318f5b65', // Gyaru
  '&includedTags[]=dd1f77c5-dea9-4e2b-97ae-224af09caf99', // Monster Girls
  '&includedTags[]=2bd2e8d0-f146-434a-9b51-fc9ff2c5fe6a', // Genderswap
  '&includedTags[]=b29d6a3d-1569-4e7a-8caf-7557bc92cd5d', // Gore / Dark
  '&includedTags[]=65761a2a-415e-47f3-bef2-a9dababba7a6', // Reverse Harem
];

async function testNsfw() {
  let ok = 0;
  for (const filter of nsfwTags) {
    const url = `https://api.mangadex.org/manga?limit=3&contentRating[]=erotica&contentRating[]=pornographic&order[followedCount]=desc${filter}`;
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      if (j.data && j.data.length > 0) ok++;
    } else {
      console.log('FAILED filter:', filter, res.status);
    }
  }
  console.log(`TOTAL NSFW FILTERS PASSED: ${ok} / ${nsfwTags.length}`);
}

testNsfw();
