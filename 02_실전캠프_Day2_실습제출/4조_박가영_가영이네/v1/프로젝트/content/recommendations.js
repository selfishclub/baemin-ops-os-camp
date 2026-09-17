// 이 파일은 데이터입니다. 첫 줄과 마지막 줄은 그대로 두고 { } 안만 고칩니다.
window.GAYOUNGENE_DATA = window.GAYOUNGENE_DATA || {};
window.GAYOUNGENE_DATA["recommendations"] =
{
  "_comment": "type: owner(사장님 추천) / country_guest(나라별 손님 추천, v2). menuId는 menus.json의 id. status가 approved인 것만 보입니다. 샘플입니다.",
  "recommendations": [
    {
      "recommendationId": "r-owner-1",
      "type": "owner",
      "countryCode": null,
      "menuId": "m-1988-tteokbokki",
      "reasonKo": "직접 만든 고추장 소스. 가영이네에 처음 오셨다면 이것부터.",
      "reasonTranslations": { "en": "Our house-made gochujang sauce. If it is your first visit, start here." },
      "sourceType": "owner_pick",
      "sortOrder": 1,
      "status": "approved",
      "sample": true
    },
    {
      "recommendationId": "r-owner-2",
      "type": "owner",
      "countryCode": null,
      "menuId": "m-gayoungi-gimbap",
      "reasonKo": "맵지 않아서 누구나 편하게. 떡볶이 소스에 찍어 드셔 보세요.",
      "reasonTranslations": { "en": "Not spicy, easy for everyone. Try dipping it in tteokbokki sauce." },
      "sourceType": "owner_pick",
      "sortOrder": 2,
      "status": "approved",
      "sample": true
    },
    {
      "recommendationId": "r-owner-3",
      "type": "owner",
      "countryCode": null,
      "menuId": "m-sundae",
      "reasonKo": "외국 손님이 처음엔 낯설어하지만 드셔 보면 다시 찾는 메뉴.",
      "reasonTranslations": { "en": "Unfamiliar at first for many visitors, but a frequent repeat order." },
      "sourceType": "owner_pick",
      "sortOrder": 3,
      "status": "approved",
      "sample": true
    },
    {
      "recommendationId": "r-vn-1",
      "type": "country_guest",
      "countryCode": "VN",
      "menuId": "m-sundae",
      "reasonKo": "가영이네를 찾은 베트남 손님들이 좋아했던 메뉴 (관찰 기록, 실제 연결은 v2)",
      "reasonTranslations": {},
      "sourceType": "owner_observation",
      "sortOrder": 1,
      "status": "draft",
      "sample": true
    }
  ]
}
;
