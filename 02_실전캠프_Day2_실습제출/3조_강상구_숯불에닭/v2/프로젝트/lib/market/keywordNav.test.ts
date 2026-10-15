import { describe, expect, it } from "vitest";
import { brandWordOf, buildCombos, compareSlots, draftSlots, mainRegions, menuCoverage, nicknameCountsAsDistrict, opportunities, parseWorkbook, regionGrade, volumeOf, type KeywordNavData } from "./keywordNav";

const data: KeywordNavData = {
  fileName: "t.xlsx",
  uploadedAt: "2026-10-15",
  regions: [
    { keyword: "청주", kind: "주소", volume: 123800, foodVolume: 122700 },
    { keyword: "율량동", kind: "주소", volume: 4630, foodVolume: 28190 },
    { keyword: "청원구", kind: "주소", volume: 1280, foodVolume: 260 },
    { keyword: "충청청주", kind: "주소", volume: 20, foodVolume: 0 },
    { keyword: "명암타워", kind: "랜드마크", volume: 1800, foodVolume: 4040 },
  ],
  menus: [
    { keyword: "닭갈비", volume: 3670 },
    { keyword: "닭발", volume: 910 },
  ],
  tpo: ["가성비", "회식"],
  nav: [
    { keyword: "청주맛집", volume: 123700, axis: "조합", type: "한참", guide: null, rankNote: null },
    { keyword: "명암타워맛집", volume: 3500, axis: "조합", type: "대표상호", guide: "대표키워드에 명암타워 삽입 완료", rankNote: 7 },
    { keyword: "청주포장맛집", volume: 890, axis: "조합", type: "대표상호", guide: null, rankNote: null },
    { keyword: "청주가성비맛집", volume: 790, axis: "조합", type: "대표상호", guide: null, rankNote: null },
    { keyword: "청주닭갈비", volume: 1900, axis: "조합", type: "손님리뷰", guide: null, rankNote: null },
    { keyword: "율량동닭갈비", volume: 1060, axis: "조합", type: "손님리뷰", guide: null, rankNote: null },
    { keyword: "청주율량동맛집", volume: 6720, axis: "조합", type: "한참", guide: null, rankNote: null },
    { keyword: "청주시맛집", volume: 820, axis: "조합", type: "대표상호", guide: null, rankNote: null },
    { keyword: "율량동저녁", volume: 120, axis: "조합", type: "대표상호", guide: null, rankNote: null },
  ],
  brandWords: [{ seen: "저녁맛집", input: "저녁" }],
};

describe("지역 등급", () => {
  it("지역+맛집 1,000 이상 1등 · 10~999 2등 · 그 밖 3등", () => {
    expect(regionGrade(28190)).toBe("1등");
    expect(regionGrade(260)).toBe("2등");
    expect(regionGrade(9)).toBe("3등");
    expect(regionGrade(null)).toBe("3등");
  });
  it("닉네임 주소가 구+맛집의 절반 이상이면 구처럼 쓴다", () => {
    expect(nicknameCountsAsDistrict(28190, 260)).toBe(true);
    expect(nicknameCountsAsDistrict(100, 260)).toBe(false);
  });
});

describe("메인 권역", () => {
  it("1등 주소 가운데 도 단위·겹치는 이름은 빼고 검색수 순", () => {
    const regs = [...data.regions, { keyword: "충청도", kind: "주소" as const, volume: 20150, foodVolume: 1720 }, { keyword: "청주율량동", kind: "주소" as const, volume: 2310, foodVolume: 6690 }];
    expect(mainRegions(regs).map((r) => r.keyword)).toEqual(["청주", "율량동"]);
  });
});

describe("조합", () => {
  const combos = buildCombos(data.regions, ["맛집", "닭갈비", "가성비"], ["닭갈비"]);
  it("1등은 모든 꼬리, 2등은 강한 꼬리·핵심 메뉴만, 3등은 없음", () => {
    const keys = combos.map((c) => c.keyword);
    expect(keys).toContain("청주가성비");
    expect(keys).toContain("청원구맛집");
    expect(keys).toContain("청원구닭갈비");
    expect(keys).not.toContain("청원구가성비");
    expect(keys.some((k) => k.startsWith("충청청주"))).toBe(false);
  });
  it("같은 조합은 한 번만", () => {
    expect(new Set(combos.map((c) => c.keyword)).size).toBe(combos.length);
  });
});

describe("검색수 찾기", () => {
  it("조회값이 엑셀값보다 먼저", () => {
    expect(volumeOf("청주 맛집", data, {})).toBe(123700);
    expect(volumeOf("청주맛집", data, { 청주맛집: { total: 130000, pc: 1, mobile: 2, under10: false, at: "2026-10-15" } })).toBe(130000);
    expect(volumeOf("없는말", data, {})).toBeNull();
  });
});

describe("기회 키워드", () => {
  it("검색수 있는데 상위가 아닌 것만, 검색수 큰 순", () => {
    const ops = opportunities(data, {}, { 청주맛집: null, 명암타워맛집: 3, "율량동 닭갈비": 4 }, ["청주맛집"], { minVolume: 100 });
    const keys = ops.map((o) => o.keyword);
    expect(keys[0]).toBe("청주맛집"); // 50위 밖
    expect(keys).not.toContain("명암타워맛집"); // 이미 3위
    expect(keys).not.toContain("율량동닭갈비"); // 4위 (띄어쓰기 달라도 같은 키워드)
    expect(ops[0].tracked).toBe(true);
    expect(ops.find((o) => o.keyword === "청주포장맛집")?.reason).toContain("안 재 봤어요");
  });
  it("조회해 둔 검색수 가운데 우리 지역 말이 없는 것(항공권)은 빼고, 있는 것(율량동회식)은 넣는다", () => {
    const v = { 항공권: { total: 1136500, pc: 1, mobile: 1, under10: false, at: "2026-10-15" }, 율량동회식: { total: 250, pc: 1, mobile: 1, under10: false, at: "2026-10-15" } };
    const keys = opportunities(data, v, {}, []).map((o) => o.keyword);
    expect(keys).not.toContain("항공권");
    expect(keys).toContain("율량동회식");
  });
});

describe("5칸 초안", () => {
  it("조합에서 지역·맛집을 뺀 말을 꺼낸다", () => {
    const regs = data.regions.map((r) => r.keyword);
    expect(brandWordOf("청주포장맛집", regs, data.brandWords)).toBe("포장");
    expect(brandWordOf("명암타워맛집", regs, data.brandWords)).toBe("명암타워");
    expect(brandWordOf("율량동저녁맛집", regs, data.brandWords)).toBe("저녁");
    expect(brandWordOf("청주시맛집", regs, data.brandWords)).toBe("청주시");
  });
  it("대표상호 유형만, 검색수 큰 순으로 15자 칸에 채우고 주소·상호 말은 뺀다", () => {
    const d = draftSlots(data, {}, { shopName: "숯불에닭 청주율량점" });
    expect(d.used.map((u) => u.word)).toEqual(["명암타워", "포장", "가성비", "저녁"]);
    expect(d.skipped.find((s) => s.word === "청주시")?.why).toContain("주소");
    expect(d.slots[0]).toBe("명암타워포장가성비저녁");
    expect(d.slots.every((s) => s.length <= 15)).toBe(true);
  });
  it("고정 칸을 주면 그 뒤에 채운다", () => {
    const d = draftSlots(data, {}, { fixed: ["청주닭갈비맛집숯불구이전문점"] }); // 14자 — 더 못 넣는다
    expect(d.slots[0]).toBe("청주닭갈비맛집숯불구이전문점");
    expect(d.slots[1].startsWith("명암타워")).toBe(true);
  });
  it("지금 칸과 비교 — 빠진 말과 근거 없는 말", () => {
    const d = draftSlots(data, {});
    const c = compareSlots(["가성비는좋숨은아이랑테라스야장", "명암저수지명암타워부모님먹거리"], d);
    expect(c.missing).toEqual(["포장", "저녁"]);
    expect(c.unknown).toContain("명암저수지");
    expect(c.unknown).not.toContain("명암타워");
  });
});

describe("엑셀 읽기", () => {
  it("키워드정리·네비게이션·대표상호키워드 시트를 읽는다", () => {
    const parsed = parseWorkbook(
      {
        sheets: {
          키워드정리: [
            ["구분", "키워드"],
            ["", "지역"],
            ["", "주소", "검색수", "(+맛집)", "랜드마크", "검색수", "(+맛집)", "메뉴", "(+청주)", "TPO"],
            ["1등", "청주", 123800, 122700, "상당산성", 6470, 2390, "고기집", 3770, "10명회식"],
            ["", "율량동", 4630, 28190, "", "", "", "닭갈비", 3670, ""],
          ],
          네비게이션: [
            ["키워드 네비게이션"],
            ["유형", "키워드", "월간 검색수", "", "", "순위", "유형", "", "가이드"],
            ["주소", "청주", 123800],
            ["조합", "청주맛집", 123700, "", "", "-", "한참", 5, "플레이스 지수↑"],
            ["조합", "명암타워맛집", 3500, "", "", 7, "대표상호", "-", "대표키워드에 명암타워 삽입 완료"],
          ],
          대표상호키워드: [
            ["대표지역", "보이는", "입력"],
            ["", "점심맛집", "점심"],
          ],
        },
      },
      "a.xlsx",
      "2026-10-15",
    );
    expect(parsed.regions.map((r) => r.keyword)).toEqual(["청주", "상당산성", "율량동"]);
    expect(parsed.regions[1].kind).toBe("랜드마크");
    expect(parsed.menus).toEqual([
      { keyword: "고기집", volume: 3770 },
      { keyword: "닭갈비", volume: 3670 },
    ]);
    expect(parsed.tpo).toEqual(["10명회식"]);
    expect(parsed.nav).toHaveLength(3);
    expect(parsed.nav[2]).toMatchObject({ keyword: "명암타워맛집", type: "대표상호", rankNote: 7 });
    expect(parsed.brandWords).toEqual([{ seen: "점심맛집", input: "점심" }]);
  });
});

describe("메뉴 장악 현황", () => {
  it("메인 권역 × 메뉴 가운데 검색수 있는 것", () => {
    const rows = menuCoverage(data, {}, { 청주닭갈비: 12 });
    expect(rows.map((r) => r.keyword)).toEqual(["청주닭갈비", "율량동닭갈비"]);
    expect(rows[0]).toMatchObject({ rank: 12, measured: true });
    expect(rows[1].measured).toBe(false);
  });
});
