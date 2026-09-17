// 이 파일은 데이터입니다. 첫 줄과 마지막 줄은 그대로 두고 { } 안만 고칩니다.
window.GAYOUNGENE_DATA = window.GAYOUNGENE_DATA || {};
window.GAYOUNGENE_DATA["menus"] =
{
  "_comment": "샘플 데이터입니다. 실제 값은 나중에 한 번에 채웁니다. 채우는 법은 README.md 참고. ingredients 값: contains / absent_verified / unknown. spiceLevel: 0~3 또는 null(미확인). publicationStatus: draft(안 보임) / approved. availability: available / sold_out / inactive(안 보임).",
  "categories": [
    { "id": "rice", "nameKo": "밥" },
    { "id": "noodles", "nameKo": "면" },
    { "id": "chicken", "nameKo": "치킨" },
    { "id": "snacks", "nameKo": "분식" }
  ],
  "ingredientKeys": ["pork", "beef", "chicken", "seafood", "egg", "dairy"],
  "menus": [
    {
      "id": "m-tteokbokki",
      "menuNumber": "001",
      "nameKo": "떡볶이",
      "categoryId": "snacks",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "쫄깃한 떡을 직접 만든 고추장 소스에 볶은 가영이네 대표 메뉴",
      "ingredients": { "pork": "absent_verified", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "contains", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "어묵이 들어갑니다 (해산물). 소스에 멸치 육수 사용.",
      "spiceLevel": 2,
      "translations": {
        "en": { "name": "Tteokbokki", "description": "Chewy rice cakes in our house-made sweet-spicy gochujang sauce.", "ingredientNote": "Contains fish cake (seafood). Sauce uses anchovy stock." },
        "ja": { "name": "トッポッキ" }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-gimbap",
      "menuNumber": "002",
      "nameKo": "김밥",
      "categoryId": "rice",
      "priceKrw": null,
      "servingKo": "1줄",
      "descriptionKo": "밥과 야채, 계란, 햄을 김에 말아 한 입 크기로 썬 메뉴",
      "ingredients": { "pork": "contains", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "absent_verified", "egg": "contains", "dairy": "absent_verified" },
      "ingredientNoteKo": "햄(돼지고기)과 계란이 들어갑니다.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Gimbap", "description": "Seaweed rice roll with vegetables, egg and ham, sliced bite-size.", "ingredientNote": "Contains ham (pork) and egg." },
        "ja": { "name": "キンパ" }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-sundae",
      "menuNumber": "003",
      "nameKo": "순대",
      "categoryId": "snacks",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "당면과 채소를 채운 한국식 소시지. 소금이나 떡볶이 소스에 찍어 먹습니다",
      "ingredients": { "pork": "contains", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "absent_verified", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "돼지 창자에 당면·채소를 채웁니다.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Sundae (blood sausage)", "description": "Korean sausage filled with glass noodles and vegetables. Dip in salt or tteokbokki sauce.", "ingredientNote": "Pork casing filled with glass noodles and vegetables." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-eomuk",
      "menuNumber": "004",
      "nameKo": "어묵탕",
      "categoryId": "snacks",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "따뜻한 멸치 육수에 꼬치 어묵을 넣은 국물 메뉴",
      "ingredients": { "pork": "absent_verified", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "contains", "egg": "unknown", "dairy": "absent_verified" },
      "ingredientNoteKo": "어묵과 멸치 육수(해산물). 어묵의 계란 포함 여부는 확인 필요.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Fish cake soup", "description": "Fish cake skewers in warm anchovy broth.", "ingredientNote": "Fish cake and anchovy broth (seafood). Egg content of fish cake not yet verified." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-galbi-mandu",
      "menuNumber": "005",
      "nameKo": "갈비만두",
      "categoryId": "snacks",
      "priceKrw": null,
      "servingKo": "6개",
      "descriptionKo": "갈비 양념한 고기소를 넣어 바삭하게 구운 만두",
      "ingredients": { "pork": "contains", "beef": "unknown", "chicken": "absent_verified", "seafood": "absent_verified", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "돼지고기 포함. 소고기 포함 여부 확인 필요.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Galbi dumplings", "description": "Pan-fried dumplings with galbi-marinated meat filling.", "ingredientNote": "Contains pork. Beef content not yet verified." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-udon",
      "menuNumber": "006",
      "nameKo": "우동",
      "categoryId": "noodles",
      "priceKrw": null,
      "servingKo": "1그릇",
      "descriptionKo": "굵은 면을 맑은 육수에 담아 낸 따뜻한 국수",
      "ingredients": { "pork": "absent_verified", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "contains", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "멸치·다시마 육수(해산물). 어묵 고명.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Udon", "description": "Thick wheat noodles in clear warm broth.", "ingredientNote": "Anchovy and kelp broth (seafood). Fish cake topping." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-kimchi-fried-rice",
      "menuNumber": "007",
      "nameKo": "김치볶음밥",
      "categoryId": "rice",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "김치와 밥을 볶고 계란 프라이를 올린 메뉴",
      "ingredients": { "pork": "unknown", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "unknown", "egg": "contains", "dairy": "absent_verified" },
      "ingredientNoteKo": "계란 프라이 포함. 김치의 젓갈(해산물)과 햄 포함 여부 확인 필요.",
      "spiceLevel": 1,
      "translations": {
        "en": { "name": "Kimchi fried rice", "description": "Fried rice with kimchi, topped with a fried egg.", "ingredientNote": "Contains egg. Fish sauce in kimchi (seafood) and ham not yet verified." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-rabokki",
      "menuNumber": "008",
      "nameKo": "라볶이",
      "categoryId": "noodles",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "떡볶이에 라면 사리를 넣은 메뉴",
      "ingredients": { "pork": "absent_verified", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "contains", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "어묵과 멸치 육수(해산물).",
      "spiceLevel": 2,
      "translations": {
        "en": { "name": "Rabokki", "description": "Tteokbokki with ramen noodles added.", "ingredientNote": "Fish cake and anchovy stock (seafood)." }
      },
      "publicationStatus": "approved",
      "availability": "sold_out",
      "sample": true
    },
    {
      "id": "m-donkatsu",
      "menuNumber": "009",
      "nameKo": "돈까스",
      "categoryId": "rice",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "빵가루를 입혀 튀긴 돼지고기 커틀릿과 밥, 소스",
      "ingredients": { "pork": "contains", "beef": "absent_verified", "chicken": "absent_verified", "seafood": "absent_verified", "egg": "contains", "dairy": "unknown" },
      "ingredientNoteKo": "돼지고기, 튀김옷에 계란. 소스의 유제품 포함 여부 확인 필요.",
      "spiceLevel": 0,
      "translations": {
        "en": { "name": "Pork cutlet (Donkatsu)", "description": "Breaded fried pork cutlet with rice and sauce.", "ingredientNote": "Pork, egg in batter. Dairy in sauce not yet verified." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-yangnyeom-chicken",
      "menuNumber": "010",
      "nameKo": "양념치킨",
      "categoryId": "chicken",
      "priceKrw": null,
      "servingKo": "1인분",
      "descriptionKo": "튀긴 닭에 매콤달콤한 양념을 버무린 메뉴",
      "ingredients": { "pork": "absent_verified", "beef": "absent_verified", "chicken": "contains", "seafood": "absent_verified", "egg": "absent_verified", "dairy": "absent_verified" },
      "ingredientNoteKo": "닭고기 포함.",
      "spiceLevel": 3,
      "translations": {
        "en": { "name": "Yangnyeom chicken", "description": "Fried chicken tossed in sweet-spicy sauce.", "ingredientNote": "Contains chicken." }
      },
      "publicationStatus": "approved",
      "availability": "available",
      "sample": true
    },
    {
      "id": "m-draft-example",
      "menuNumber": "011",
      "nameKo": "(초안 예시) 튀김",
      "categoryId": "snacks",
      "priceKrw": null,
      "servingKo": "",
      "descriptionKo": "publicationStatus가 draft라 손님 화면에 안 보이는 예시",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Fried snacks" } },
      "publicationStatus": "draft",
      "availability": "available",
      "sample": true
    }
  ]
}
;
