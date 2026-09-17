// 이 파일은 데이터입니다. 첫 줄과 마지막 줄은 그대로 두고 { } 안만 고칩니다.
// 출처: 구글 시트 「가영이네 외국인 메뉴·매장 안내 입력 시트」 메뉴 입력 탭 (2026-09-17 읽음)
// 재료 상태 규칙: 배민 설명란에 적힌 재료만 contains, 나머지는 unknown. absent_verified는 육수·소스까지 확인한 뒤 사장님이 직접 바꿉니다.
// 맵기: 시트에 전부 "미확인"이라 null. 영어 이름·설명은 초안(draft)이며 검수 전입니다.
window.GAYOUNGENE_DATA = window.GAYOUNGENE_DATA || {};
window.GAYOUNGENE_DATA["menus"] =
{
  "categories": [
    { "id": "bunsik", "nameKo": "가영이네 수제 분식" },
    { "id": "fried", "nameKo": "가영이네 수제 튀김" },
    { "id": "meals", "nameKo": "김밥/식사" },
    { "id": "bingsu", "nameKo": "여름 한정 빙수" },
    { "id": "side", "nameKo": "사이드 메뉴" },
    { "id": "drinks", "nameKo": "음료 / 주류" }
  ],
  "ingredientKeys": ["pork", "beef", "chicken", "seafood", "egg", "dairy"],
  "menus": [
    {
      "id": "m-patbingsu", "menuNumber": "001", "nameKo": "[대표] 추억의 옛날팥빙수", "categoryId": "bingsu",
      "priceKrw": 8900, "servingKo": "1.5~2인분", "salesNoteKo": "여름 한정 (종료일 미확인)",
      "descriptionKo": "얼음, 통단팥, 빙수떡, 시리얼, 연유, 딸기시럽, 후르츠칵테일과일",
      "imageAsset": "추억의_옛날팥빙수_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "연유(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Classic red bean shaved ice (Patbingsu)", "description": "Shaved ice with whole sweet red beans, rice cakes, cereal, condensed milk, strawberry syrup and fruit cocktail. Summer only.", "ingredientNote": "Contains condensed milk (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-injeolmi-bingsu", "menuNumber": "002", "nameKo": "할매 인절미 팥빙수", "categoryId": "bingsu",
      "priceKrw": 8900, "servingKo": "1.5~2인분", "salesNoteKo": "여름 한정 (종료일 미확인)",
      "descriptionKo": "얼음, 콩고물, 통단팥, 인절미떡, 시리얼, 연유",
      "imageAsset": "할매_인절미팥빙수_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "연유(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Injeolmi red bean shaved ice", "description": "Shaved ice with roasted soybean powder, whole sweet red beans, injeolmi rice cakes, cereal and condensed milk. Summer only.", "ingredientNote": "Contains condensed milk (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-pine-yuzu-bingsu", "menuNumber": "003", "nameKo": "[NEW] 상큼 파인유자 빙수", "categoryId": "bingsu",
      "priceKrw": 8900, "servingKo": "1.5~2인분", "salesNoteKo": "여름 한정 (종료일 미확인)",
      "descriptionKo": "얼음, 빙수떡, 시리얼, 연유, 파인애플, 유자청",
      "imageAsset": "상큼_파인유자빙수_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "연유(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Pineapple & yuzu shaved ice", "description": "Refreshing shaved ice with pineapple, yuzu preserve, rice cakes, cereal and condensed milk. Summer only.", "ingredientNote": "Contains condensed milk (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-strawberry-bingsu", "menuNumber": "004", "nameKo": "(직접만든 딸기수제청) 딸기 폭탄 빙수", "categoryId": "bingsu",
      "priceKrw": 12900, "servingKo": "1.5~2인분", "salesNoteKo": "여름 한정 (종료일 미확인)",
      "descriptionKo": "얼음, 수제딸기청, 냉동딸기, 빙수찰떡, 필라델피아 치즈큐브, 딸기시럽, 연유",
      "imageAsset": "딸기폭탄빙수.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "연유·크림치즈(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Strawberry bomb shaved ice", "description": "Shaved ice loaded with house-made strawberry preserve, frozen strawberries, chewy rice cakes, cream cheese cubes, strawberry syrup and condensed milk. Summer only.", "ingredientNote": "Contains condensed milk and cream cheese (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-dwaejibar-bingsu", "menuNumber": "005", "nameKo": "[인기] 첫사랑 돼지바 빙수", "categoryId": "bingsu",
      "priceKrw": 12900, "servingKo": "1.5~2인분", "salesNoteKo": "여름 한정 (종료일 미확인)",
      "descriptionKo": "얼음, 수제딸기청, 딸기소스, 연유, 돼지바 초코쿠키 크런치, 찹쌀떡",
      "imageAsset": "첫사랑_돼지바빙수_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "연유·아이스크림(우유) 포함. '돼지바'는 아이스크림 이름이며 돼지고기가 아닙니다 (성분 확인 전).",
      "spiceLevel": null,
      "translations": { "en": { "name": "'First Love' Dwaejibar shaved ice", "description": "Shaved ice with house-made strawberry preserve, strawberry sauce, condensed milk, crunchy choco-cookie ice cream bar pieces and rice cakes. Summer only.", "ingredientNote": "Contains condensed milk and ice cream (dairy). 'Dwaejibar' is the name of a Korean ice cream bar, not pork. Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-1988-tteokbokki", "menuNumber": "006", "nameKo": "1988옛날떡볶이", "categoryId": "bunsik",
      "priceKrw": 5000, "servingKo": "1인분 (기본 옵션)", "salesNoteKo": "",
      "descriptionKo": "가영이네 직접 만든 고추장 소스의 옛날식 떡볶이",
      "imageAsset": "1988옛날떡볶이_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "1988 old-style tteokbokki", "description": "Old-school tteokbokki in Gayoungene's house-made gochujang sauce.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-cheese-tteokbokki", "menuNumber": "007", "nameKo": "모짜렐라 99.5%자연치즈 떡볶이", "categoryId": "bunsik",
      "priceKrw": 7500, "servingKo": "1인분 (기본 옵션)", "salesNoteKo": "",
      "descriptionKo": "99.5% 자연 모짜렐라 치즈를 올린 떡볶이",
      "imageAsset": "모짜렐라_자연치즈떡볶이_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "모짜렐라 치즈(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Tteokbokki with 99.5% natural mozzarella", "description": "Tteokbokki topped with 99.5% natural mozzarella cheese.", "ingredientNote": "Contains mozzarella (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-odeng-tteokbokki", "menuNumber": "008", "nameKo": "오뎅만 떡볶이", "categoryId": "bunsik",
      "priceKrw": 7000, "servingKo": "1인분 (기본 옵션)", "salesNoteKo": "",
      "descriptionKo": "떡 대신 어묵(오뎅)만 넣은 떡볶이",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "어묵(해산물) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Fish-cake-only tteokbokki", "description": "Tteokbokki sauce with fish cake (odeng) instead of rice cakes.", "ingredientNote": "Contains fish cake (seafood). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-sundae", "menuNumber": "009", "nameKo": "국산 가마솥에 푸욱 찐 찰순대", "categoryId": "bunsik",
      "priceKrw": 5900, "servingKo": "", "salesNoteKo": "",
      "descriptionKo": "가마솥에 푹 찐 국산 찰순대",
      "imageAsset": "국산_가마솥찰순대_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Steamed chal-sundae (Korean sausage)", "description": "Domestic glutinous-rice sundae, a Korean sausage, steamed soft in an iron cauldron.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-rabokki", "menuNumber": "010", "nameKo": "[신메뉴] 라볶이", "categoryId": "bunsik",
      "priceKrw": 7900, "servingKo": "1인분", "salesNoteKo": "",
      "descriptionKo": "라면 1개, 떡 10개 이상, 오뎅, 삶은계란, 파, 깨",
      "imageAsset": "라볶이_01.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "contains", "dairy": "unknown" },
      "ingredientNoteKo": "어묵(해산물)·삶은 계란 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Rabokki (tteokbokki with ramen)", "description": "Ramen noodles, 10+ rice cakes, fish cake, a boiled egg, green onion and sesame in tteokbokki sauce.", "ingredientNote": "Contains fish cake (seafood) and egg. Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-busan-eomuk", "menuNumber": "011", "nameKo": "명태육수가 끝내주는 프리미엄 부산미도어묵", "categoryId": "bunsik",
      "priceKrw": 4000, "servingKo": "3개", "salesNoteKo": "",
      "descriptionKo": "명태 육수에 담아 낸 프리미엄 부산 어묵",
      "imageAsset": "프리미엄_부산미도어묵.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "어묵·명태 육수(해산물) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Premium Busan fish cake in pollock broth", "description": "Three skewers of premium Busan fish cake served in pollock broth.", "ingredientNote": "Contains fish cake and pollock broth (seafood). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-gimmari-basic", "menuNumber": "012", "nameKo": "[한정수량] 23cm수제왕김말이 (기본)", "categoryId": "fried",
      "priceKrw": 2500, "servingKo": "1줄", "salesNoteKo": "한정 수량",
      "descriptionKo": "23cm 길이의 수제 왕김말이 튀김, 기본",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "23 cm handmade king gimmari (original)", "description": "A 23 cm fried seaweed roll filled with glass noodles. Limited quantity.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-gimmari-meat-chili", "menuNumber": "013", "nameKo": "[시그니처] 23cm수제왕김말이(고기고추)", "categoryId": "fried",
      "priceKrw": 3900, "servingKo": "1개", "salesNoteKo": "",
      "descriptionKo": "고기와 고추를 넣은 23cm 수제 왕김말이",
      "imageAsset": "23센티수제왕김말이_고기고추.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "고기 포함 (종류 확인 전). 고추 포함.",
      "spiceLevel": null,
      "translations": { "en": { "name": "23 cm king gimmari (meat & chili)", "description": "Signature 23 cm fried seaweed roll with meat and chili pepper filling.", "ingredientNote": "Contains meat (type not yet verified) and chili pepper.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-gimmari-cheese", "menuNumber": "014", "nameKo": "[시그니처] 치즈듬뿍 23cm왕김말이", "categoryId": "fried",
      "priceKrw": 3900, "servingKo": "1개", "salesNoteKo": "",
      "descriptionKo": "치즈를 듬뿍 넣은 23cm 왕김말이",
      "imageAsset": "치즈듬뿍_23센티왕김말이.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "contains" },
      "ingredientNoteKo": "치즈(우유) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "23 cm king gimmari loaded with cheese", "description": "Signature 23 cm fried seaweed roll stuffed with plenty of cheese.", "ingredientNote": "Contains cheese (dairy). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-assorted-fried", "menuNumber": "015", "nameKo": "모듬튀김 3개(대체불가)", "categoryId": "fried",
      "priceKrw": 5900, "servingKo": "23cm수제왕김말이 1줄, 오징어 1개, 야채 1개", "salesNoteKo": "구성 변경 불가",
      "descriptionKo": "왕김말이·오징어튀김·야채튀김 3개 세트",
      "imageAsset": "모듬튀김_3개.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "오징어(해산물) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Assorted fried set (3 pcs)", "description": "One king gimmari, one fried squid and one vegetable fritter. No substitutions.", "ingredientNote": "Contains squid (seafood). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-fried-squid", "menuNumber": "016", "nameKo": "분식 고수의 수제 오징어튀김", "categoryId": "fried",
      "priceKrw": 3500, "servingKo": "2개", "salesNoteKo": "",
      "descriptionKo": "직접 만든 오징어튀김",
      "imageAsset": "수제오징어튀김.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "오징어(해산물) 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Handmade fried squid", "description": "Two pieces of house-battered fried squid.", "ingredientNote": "Contains squid (seafood). Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-fried-mandu", "menuNumber": "017", "nameKo": "만두 튀김", "categoryId": "fried",
      "priceKrw": 2900, "servingKo": "3개", "salesNoteKo": "",
      "descriptionKo": "바삭하게 튀긴 만두",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Fried dumplings", "description": "Three crispy fried dumplings.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-gayoungi-gimbap", "menuNumber": "018", "nameKo": "가영이김밥(계란4개&야채)", "categoryId": "meals",
      "priceKrw": 5500, "servingKo": "", "salesNoteKo": "반찬·국물 미제공",
      "descriptionKo": "계란 4개, 시금치(또는 부추), 당근, 수제우엉조림, 단무지",
      "imageAsset": "가영이김밥_계란4개야채.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "contains", "dairy": "unknown" },
      "ingredientNoteKo": "계란 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Gayoungi gimbap (4 eggs & vegetables)", "description": "Seaweed rice roll with four eggs, spinach (or chives), carrot, house-braised burdock and pickled radish. No side dishes or soup.", "ingredientNote": "Contains egg. Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-tuna-mayo-gimbap", "menuNumber": "019", "nameKo": "참치폭탄마요 김밥", "categoryId": "meals",
      "priceKrw": 5500, "servingKo": "", "salesNoteKo": "반찬·국물 미제공",
      "descriptionKo": "참치와 마요네즈를 듬뿍 넣은 김밥",
      "imageAsset": "참치폭탄마요김밥.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "contains", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "참치(해산물) 포함. 마요네즈의 계란 포함 여부 등 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Tuna mayo bomb gimbap", "description": "Seaweed rice roll packed with tuna and mayonnaise. No side dishes or soup.", "ingredientNote": "Contains tuna (seafood). Egg in mayonnaise and other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-jjolmyeon", "menuNumber": "020", "nameKo": "[계절메뉴] 수제비법소스 새콤달콤 쫄면", "categoryId": "meals",
      "priceKrw": 8500, "servingKo": "", "salesNoteKo": "계절 메뉴 (판매 기간 미확인)",
      "descriptionKo": "쫄면, 양배추, 상추, 당근, 콩나물, 적채, 삶은계란, 참깨, 가영이네 수제 비법쫄면소스",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "contains", "dairy": "unknown" },
      "ingredientNoteKo": "삶은 계란 포함. 소스 성분 등 나머지는 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Sweet & tangy jjolmyeon (chewy cold noodles)", "description": "Chewy cold noodles with cabbage, lettuce, carrot, bean sprouts, red cabbage, a boiled egg and sesame in Gayoungene's secret house sauce. Seasonal.", "ingredientNote": "Contains egg. Sauce and other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-kimchi-fried-rice", "menuNumber": "021", "nameKo": "12년동안 볶은 김치볶음밥", "categoryId": "meals",
      "priceKrw": 8500, "servingKo": "", "salesNoteKo": "반찬·국물 미제공",
      "descriptionKo": "12년 동안 볶아 온 가영이네 김치볶음밥",
      "imageAsset": "12년동안볶은_김치볶음밥.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Kimchi fried rice (12 years in the making)", "description": "Gayoungene's kimchi fried rice, perfected over 12 years. No side dishes or soup.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-jeyuk-deopbap", "menuNumber": "022", "nameKo": "[신메뉴] 수제 불맛 제육덮밥", "categoryId": "meals",
      "priceKrw": 9900, "servingKo": "1인분", "salesNoteKo": "반찬·국물 미제공",
      "descriptionKo": "돼지고기, 양파, 대파, 콩나물, 상추, 흰쌀밥, 깨",
      "imageAsset": "",
      "ingredients": { "pork": "contains", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "돼지고기 포함. 나머지 성분은 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Smoky stir-fried pork over rice (Jeyuk deopbap)", "description": "Stir-fried pork with onion, green onion, bean sprouts and lettuce over white rice, topped with sesame.", "ingredientNote": "Contains pork. Other ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-galbi-mandu", "menuNumber": "023", "nameKo": "갈비 만두", "categoryId": "meals",
      "priceKrw": 6500, "servingKo": "7개", "salesNoteKo": "",
      "descriptionKo": "갈비 양념 소를 넣은 만두",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "고기 포함 (종류 확인 전).",
      "spiceLevel": null,
      "translations": { "en": { "name": "Galbi dumplings", "description": "Seven dumplings with galbi-marinated meat filling.", "ingredientNote": "Contains meat (type not yet verified).", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-kimchi-mandu", "menuNumber": "024", "nameKo": "김치 만두", "categoryId": "meals",
      "priceKrw": 6500, "servingKo": "8개", "salesNoteKo": "",
      "descriptionKo": "김치 소를 넣은 만두",
      "imageAsset": "김치만두.jpg",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Kimchi dumplings", "description": "Eight dumplings with kimchi filling.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-meat-mandu", "menuNumber": "025", "nameKo": "고기 만두", "categoryId": "meals",
      "priceKrw": 6500, "servingKo": "8개", "salesNoteKo": "",
      "descriptionKo": "고기 소를 넣은 만두",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "고기 포함 (종류 확인 전).",
      "spiceLevel": null,
      "translations": { "en": { "name": "Meat dumplings", "description": "Eight dumplings with meat filling.", "ingredientNote": "Contains meat (type not yet verified).", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-coolpis", "menuNumber": "026", "nameKo": "쿨피스 캔 복숭아맛(350ml)", "categoryId": "drinks",
      "priceKrw": 2000, "servingKo": "350ml", "salesNoteKo": "",
      "descriptionKo": "복숭아맛 쿨피스 캔",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "성분 확인 전.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Coolpis peach drink (can, 350 ml)", "description": "Sweet peach-flavoured Korean drink, often paired with spicy food.", "ingredientNote": "Ingredients not yet verified.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-coke-zero", "menuNumber": "027", "nameKo": "제로 코카콜라 캔 355ml", "categoryId": "drinks",
      "priceKrw": 2500, "servingKo": "355ml", "salesNoteKo": "",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Coca-Cola Zero (can, 355 ml)", "description": "", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-cider", "menuNumber": "028", "nameKo": "사이다 캔 355ml", "categoryId": "drinks",
      "priceKrw": 2000, "servingKo": "355ml", "salesNoteKo": "",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Korean cider (lemon-lime soda, can 355 ml)", "description": "", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-coke", "menuNumber": "029", "nameKo": "코카콜라 캔 355ml", "categoryId": "drinks",
      "priceKrw": 2000, "servingKo": "355ml", "salesNoteKo": "",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Coca-Cola (can, 355 ml)", "description": "", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-soju", "menuNumber": "030", "nameKo": "참이슬후레쉬 (보냉백 포함)", "categoryId": "drinks",
      "priceKrw": 4000, "servingKo": "1병(360ml), 보냉백 포함", "salesNoteKo": "주류",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Chamisul Fresh soju (360 ml bottle)", "description": "Korean soju, served with a cooler bag. Alcoholic.", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-extra-egg", "menuNumber": "031", "nameKo": "삶은계란 추가", "categoryId": "side",
      "priceKrw": 1000, "servingKo": "1개", "salesNoteKo": "",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "contains", "dairy": "unknown" },
      "ingredientNoteKo": "계란.",
      "spiceLevel": null,
      "translations": { "en": { "name": "Extra boiled egg", "description": "", "ingredientNote": "Egg.", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-sotteok", "menuNumber": "032", "nameKo": "[추억의 간식] 휴게소 원조 소떡소떡", "categoryId": "side",
      "priceKrw": 3900, "servingKo": "1개", "salesNoteKo": "",
      "descriptionKo": "소시지와 떡을 번갈아 꽂아 구운 꼬치",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "소시지 포함 (성분 확인 전).",
      "spiceLevel": null,
      "translations": { "en": { "name": "Sotteok sotteok (sausage & rice cake skewer)", "description": "A rest-stop classic: sausage and rice cake pieces skewered and grilled with sauce.", "ingredientNote": "Contains sausage (meat type not yet verified).", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-danmuji", "menuNumber": "033", "nameKo": "재주문100% 단무지", "categoryId": "side",
      "priceKrw": 500, "servingKo": "", "salesNoteKo": "",
      "descriptionKo": "",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "Pickled radish (Danmuji)", "description": "Sweet yellow pickled radish.", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "approved", "availability": "available"
    },
    {
      "id": "m-tteok-skewer", "menuNumber": "034", "nameKo": "혼자만 먹을래 왕떡꼬치(10줄)", "categoryId": "side",
      "priceKrw": null, "servingKo": "10줄", "salesNoteKo": "",
      "descriptionKo": "시트에 가격·구성이 아직 없어 초안(draft)으로 둠 — 채우고 approved로 바꾸면 보입니다",
      "imageAsset": "",
      "ingredients": { "pork": "unknown", "beef": "unknown", "chicken": "unknown", "seafood": "unknown", "egg": "unknown", "dairy": "unknown" },
      "ingredientNoteKo": "",
      "spiceLevel": null,
      "translations": { "en": { "name": "King rice cake skewers (10 sticks)", "description": "", "ingredientNote": "", "status": "draft" } },
      "publicationStatus": "draft", "availability": "available"
    }
  ]
}
;
