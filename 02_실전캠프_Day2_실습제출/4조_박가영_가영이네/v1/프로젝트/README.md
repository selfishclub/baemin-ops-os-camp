# Gayoungene Menu Finder · v1

외국인 손님이 피하는 재료·맵기·음식 종류를 고르면 맞는 메뉴만 보여 주고, 메뉴 번호·한국어 이름으로 키오스크에서 찾게 돕는 사이트. 기획은 [`../PRD.md`](../PRD.md), 상세 요구사항은 [`../../PRD_원본_GPT_v1.2.md`](../../PRD_원본_GPT_v1.2.md).

설치할 것 없는 정적 웹(HTML·CSS·JS + 데이터 파일)입니다. 외부 API·데이터베이스 없음.

## 실행 방법

`index.html`을 더블클릭하면 브라우저에서 바로 열립니다. 설치·서버 없음.
Vercel에 올릴 때는 이 폴더를 그대로 올리면 됩니다. 빌드 설정 없음.

## 폴더

```
프로젝트/
├── index.html          화면 뼈대
├── css/style.css       디자인
├── js/app.js           화면 그리기·이동
├── js/filter.js        조건 판정 (화면과 분리된 순수 함수)
└── content/             ★ 사장님이 채우는 곳
    ├── menus.js          메뉴
    ├── recommendations.js 사장님 추천·나라별 추천
    ├── store.js          주문 순서·주소·영업시간
    └── ui-text.js        화면 문구·언어 목록
```

## 데이터 채우는 법 — 한 번에 올릴 때

지금은 전부 **샘플**입니다 (`"sample": true`). 실제 값을 넣을 때 `sample`을 지우거나 `false`로 바꾸면 "Sample" 표시가 사라집니다.

### menus.js — 메뉴 하나

파일 첫 두 줄(`window.GAYOUNGENE_DATA...`)과 마지막 `;`는 그대로 두고 `{ }` 안만 고칩니다. 안은 JSON과 같은 모양입니다.

```json
{
  "id": "m-tteokbokki",          // 안 바뀌는 내부 이름 (영문, 중복 금지)
  "menuNumber": "001",           // 고객용 번호. 따옴표 안에 세 자리. 키오스크와 같은 번호
  "nameKo": "떡볶이",             // 키오스크에 있는 한국어 이름 그대로
  "categoryId": "snacks",        // rice / noodles / chicken / snacks
  "priceKrw": 4500,              // 원. 아직 모르면 null
  "servingKo": "1인분",
  "descriptionKo": "한국어 설명 원문",
  "ingredients": {               // 재료마다 셋 중 하나
    "pork": "contains",              //   contains        = 들어감
    "beef": "absent_verified",       //   absent_verified = 육수·소스까지 확인했는데 없음
    "chicken": "absent_verified",    //   unknown         = 아직 확인 안 함
    "seafood": "contains",
    "egg": "absent_verified",
    "dairy": "unknown"
  },
  "ingredientNoteKo": "어묵(해산물) 포함. 소스에 멸치 육수",
  "spiceLevel": 2,               // 0 안 매움 / 1 약간 / 2 매움 / 3 아주 매움 / null 미확인
  "translations": {
    "en": { "name": "Tteokbokki", "description": "...", "ingredientNote": "..." },
    "ja": { "name": "トッポッキ" }   // 비어 있으면 영어로 대체됨
  },
  "publicationStatus": "approved",   // draft면 화면에 안 보임
  "availability": "available"        // sold_out = 품절 표시·추천 제외 / inactive = 안 보임
}
```

**주의**
- `absent_verified`는 겉재료만 보고 적지 않습니다. 육수·소스·가공 재료까지 확인한 뒤에만.
- 확실하지 않으면 `unknown`. 그러면 그 재료를 피하는 손님 결과에서 자동으로 빠지고 "확인 필요"로 표시됩니다.
- 번호는 한 번 정하면 바꾸지 않고, 없어진 메뉴 번호를 다른 메뉴에 다시 쓰지 않습니다.

### recommendations.js

`type: "owner"`가 사장님 추천. `menuId`에 menus.js의 `id`를 적고 `reasonKo`·`reasonTranslations.en`에 이유를 씁니다. `status: "approved"`인 것만 보입니다. 나라별(`country_guest`)은 v2에서 씁니다.

### store.js

`howToOrder.steps`의 `bodyKo`·`bodyEn`, `visit`의 주소·영업시간을 채우고 `confirmed`를 `true`로 바꾸면 "확인 예정" 띠가 사라집니다.

### ui-text.js

`languages`에서 검수가 끝난 언어는 `reviewed: true`로 바꾸면 "Draft translations" 띠가 사라집니다. `strings.<언어>`에 없는 문구는 영어로 대체됩니다.

## 확인한 것 (v1 PRD 6번)

- English → Pork 제외 → Not spicy → 돼지고기 없음 확인 + 맵기 0인 메뉴만, 개수 일치, 미확인 제외 안내
- Chicken 종류 + Chicken 제외 → 결과 없음 (조건 완화 안 함)
- 상세 → Find this dish in store → 번호·한국어 이름 크게 → 뒤로
- 잘못된 주소(`#/menu/999`) → 목록 안내
- 언어 바꿔도 조건 유지, 영어 외 언어는 초안 띠
- 폭 320·390·430 가로 스크롤 없음
