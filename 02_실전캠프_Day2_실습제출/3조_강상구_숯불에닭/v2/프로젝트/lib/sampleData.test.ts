import { describe, expect, it } from "vitest";
import { canOfferTour } from "./sampleData";

describe("빈 화면에 둘러보기를 띄울지", () => {
  it("장부가 통째로 비었으면 띄운다 (처음 온 사람)", () => {
    expect(canOfferTour(0, 0)).toBe(true);
  });
  it("일별 매출이 하나라도 있으면 안 띄운다", () => {
    // 사장님이 다음 달을 미리 열어 본 것 — 잘못 누르면 진짜 장부에 가짜 숫자가 들어간다
    expect(canOfferTour(361, 0)).toBe(false);
  });
  it("통장 파일을 올린 적이 있으면 안 띄운다", () => {
    expect(canOfferTour(0, 16)).toBe(false);
  });
  it("둘 다 있으면 당연히 안 띄운다", () => {
    expect(canOfferTour(361, 16)).toBe(false);
  });
});
