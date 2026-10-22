const tags = [
  '&publicationDemographic[]=shounen',
  '&publicationDemographic[]=seinen',
  '&publicationDemographic[]=shoujo',
  '&publicationDemographic[]=josei',
  '&originalLanguage[]=ko',
  '&originalLanguage[]=zh',
  '&originalLanguage[]=ja',
  '&includedTags[]=391b0423-d847-456f-aff0-8b0cfc03066b', // Action
  '&includedTags[]=ace04997-f6bd-436e-b261-779182193d3d', // Isekai
  '&includedTags[]=cdc58593-87dd-415e-bbc0-2ec27bf404cc', // Fantasy
  '&includedTags[]=423e2eae-a7a2-4a8b-ac03-a8351462d71d', // Romance
  '&includedTags[]=4d32cc48-9f00-4cca-9b5a-a839f0764984', // Comedy
  '&includedTags[]=256c8bd9-4904-4360-bf4f-508a76d67183', // Sci-Fi
  '&includedTags[]=cdad7e68-1419-41dd-bdce-27753074a640', // Horror
  '&includedTags[]=ee968100-4191-4968-93d3-f82d72be7e46', // Mystery
  '&includedTags[]=3b60b75c-a2d7-4860-ab56-05f391bb889c', // Psychological
  '&includedTags[]=e5301a23-ebd9-49dd-a0cb-2add944c7fe9', // Slice of Life
  '&includedTags[]=69964a64-2f90-4d33-beeb-f3ed2875eb4c', // Sports
  '&includedTags[]=eabc5b4c-6aff-42f3-b657-3e90cbd00b75', // Supernatural
  '&includedTags[]=07251805-a27e-4d59-b488-f0bfbec15168', // Thriller
  '&includedTags[]=799c202e-7daa-44eb-9cf7-8a3c0441531e', // Martial Arts
  '&includedTags[]=9438db5a-7e2a-4ac0-b39e-e0d95a34b8a8', // Video Games / RPG
  '&includedTags[]=caaa44eb-cd40-4177-b930-79d3ef2afe87', // School Life
  '&includedTags[]=33771934-028e-4cb3-8744-691e866a923e', // Historical
  '&includedTags[]=50880a9d-5440-4732-9afb-8f457127e836', // Mecha
  '&includedTags[]=5fff9cde-849c-4d78-aab0-0d52b2ee1d25', // Survival
  '&includedTags[]=7064a261-a137-4d3a-8848-2d385de3a99c', // Superhero
  '&includedTags[]=292e862b-2d17-4062-90a2-0356caa4ae27', // Time Travel
  '&includedTags[]=d14322ac-4d6f-4e9b-afd9-629d5f4d8a41', // Villainess
  '&includedTags[]=36fd93ea-e8b8-445e-b836-358f02b3d33d', // Monsters
  '&includedTags[]=ea2bc92d-1c26-4930-9b7c-d5c0dc1b6869', // Cooking
  '&includedTags[]=f42fbf9e-188a-447b-9fdc-f19dc1e4d685', // Music
  '&includedTags[]=c8cbe35b-1b2b-4a3f-9c37-db84c4514856', // Medical
  '&includedTags[]=f8f62932-27da-4fe4-8ee1-6779a8c5edba', // Tragedy
  '&includedTags[]=5ca48985-9a9d-4bd8-be29-80dc0303db72', // Crime
  '&includedTags[]=39730448-9a5f-48a2-85b0-a70db87b1233', // Demons
  '&includedTags[]=ac72833b-c4e9-4878-b9db-6c8a4a99444a', // Military
  '&includedTags[]=acc803a4-c95a-4c22-86fc-eb6b582d82a2', // Wuxia
];

async function testAll() {
  let ok = 0;
  for (const filter of tags) {
    const url = `https://api.mangadex.org/manga?limit=3&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc${filter}`;
    const res = await fetch(url);
    if (res.ok) {
      const j = await res.json();
      if (j.data && j.data.length > 0) ok++;
    } else {
      console.log('FAILED filter:', filter, res.status);
    }
  }
  console.log(`TOTAL FILTERS PASSED: ${ok} / ${tags.length}`);
}

testAll();
