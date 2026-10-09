import { describe, expect, it } from "vitest";
import { APP_NAME, appTitle, EMPTY_PROFILE, locationLabel, queryVariants, rankResults, taxFileName, type GeoResult } from "./storeProfile";

describe("가게 이름", () => {
  it("안 넣었으면 앱 이름만 보여 준다", () => {
    expect(appTitle(EMPTY_PROFILE)).toBe(APP_NAME);
    expect(appTitle(null)).toBe(APP_NAME);
    expect(appTitle({ name: "   ", location: null })).toBe(APP_NAME);
  });
  it("넣었으면 앞에 붙인다", () => {
    expect(appTitle({ name: "숯불에닭", location: null })).toBe("숯불에닭 한눈 손익 장부");
    expect(appTitle({ name: " 가나분식 ", location: null })).toBe("가나분식 한눈 손익 장부");
  });
});

describe("세무사용 엑셀 파일 이름", () => {
  it("가게 이름을 앞에 붙인다", () => {
    expect(taxFileName({ name: "숯불에닭", location: null }, "2026-09")).toBe("숯불에닭_세무사용_2026-09.xlsx");
  });
  it("안 넣었으면 가게 이름 없이", () => {
    expect(taxFileName(EMPTY_PROFILE, "2026-09")).toBe("세무사용_2026-09.xlsx");
  });
  it("파일 이름에 못 쓰는 글자는 뺀다", () => {
    expect(taxFileName({ name: "가나/분식:2호점", location: null }, "2026-09")).toBe("가나분식2호점_세무사용_2026-09.xlsx");
  });
});

describe("지역 이름 만들기", () => {
  it("큰 단위부터 붙인다", () => {
    expect(locationLabel({ name: "율량동", latitude: 0, longitude: 0, admin1: "충청북도", admin2: "청주시" })).toBe("충청북도 청주시 율량동");
  });
  it("같은 말이 두 번 오면 한 번만", () => {
    expect(locationLabel({ name: "청주시", latitude: 0, longitude: 0, admin1: "충청북도", admin2: "청주시" })).toBe("충청북도 청주시");
  });
  it("큰 단위가 없어도 이름은 나온다", () => {
    expect(locationLabel({ name: "서울", latitude: 0, longitude: 0 })).toBe("서울");
  });
});

describe("지역 찾기 — 무엇으로 물어보나", () => {
  it("접미사가 없으면 시·군·구를 붙여서도 물어본다 ('청주'로는 아무것도 안 나온다)", () => {
    expect(queryVariants("청주")).toContain("청주시");
    expect(queryVariants("청주")).toContain("청주군");
    expect(queryVariants("대전")).toContain("대전광역시");
  });
  it("이미 접미사가 있으면 시·군·구는 더 붙이지 않는다", () => {
    expect(queryVariants("청주시")).not.toContain("청주시시");
  });
  it("빈 글자는 묻지 않는다", () => {
    expect(queryVariants("  ")).toEqual([]);
  });
});

const geo = (name: string, feature_code: string, extra: Partial<GeoResult> = {}): GeoResult => ({
  name,
  feature_code,
  country_code: "KR",
  latitude: Math.random(),
  longitude: Math.random(),
  ...extra,
});

describe("지역 찾기 — 어떤 순서로 보여 주나", () => {
  it("작은 마을보다 시·군을 먼저 (대전 치면 고흥군 대전리 말고 대전광역시)", () => {
    const got = rankResults([geo("대전", "PPL", { admin1: "전라남도", admin2: "고흥군" }), geo("대전광역시", "PPLA")]);
    expect(got[0].name).toBe("대전광역시");
  });
  it("한국이 아니거나 사람 사는 곳이 아니면 뺀다 (고개·산 같은 것)", () => {
    const got = rankResults([geo("강남구렁고개", "PASS"), geo("Pusan", "PPL", { country_code: "JP" }), geo("부산광역시", "PPLA")]);
    expect(got.map((g) => g.name)).toEqual(["부산광역시"]);
  });
  it("같은 좌표가 두 번 오면 한 번만", () => {
    const a = geo("청주시", "PPLA", { admin1: "충청북도", admin2: "청주시", latitude: 36.63, longitude: 127.48 });
    const b = { ...a };
    expect(rankResults([a, b])).toHaveLength(1);
  });
  it("같은 단위면 사람이 많은 곳부터", () => {
    const got = rankResults([geo("작은시", "PPLA2", { population: 1000 }), geo("큰시", "PPLA2", { population: 500000 })]);
    expect(got[0].name).toBe("큰시");
  });
});
