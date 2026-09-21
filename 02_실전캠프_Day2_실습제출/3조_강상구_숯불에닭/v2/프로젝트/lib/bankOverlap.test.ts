import { describe, expect, it } from "vitest";
import { monthsBetween, newBankRowsOnly } from "./month";

const r = (date: string, payee: string, out: number) => ({ date, payee, out, in: 0 });

describe("겹치는 거래내역 파일", () => {
  it("이미 있는 줄은 빼고 새 줄만 남긴다", () => {
    const existing = [r("2026-09-19", "NH체크 편의점", 10600)];
    const rows = [r("2026-09-19", "NH체크 편의점", 10600), r("2026-09-19", "NH체크 마트", 58800), r("2026-09-20", "NH체크 마트", 30000)];
    const { fresh, duplicates } = newBankRowsOnly(rows, existing);
    expect(duplicates).toBe(1);
    expect(fresh.map((x) => x.out)).toEqual([58800, 30000]);
  });

  it("같은 날 같은 금액이 두 번이면 개수만큼만 뺀다", () => {
    const existing = [r("2026-09-17", "NH체크 편의점", 9600)];
    const rows = [r("2026-09-17", "NH체크 편의점", 9600), r("2026-09-17", "NH체크 편의점", 9600)];
    expect(newBankRowsOnly(rows, existing).fresh).toHaveLength(1);
  });

  it("띄어쓰기 차이는 같은 거래처로 본다", () => {
    expect(newBankRowsOnly([r("2026-09-01", "NH체크  홈마트", 100)], [r("2026-09-01", "NH체크 홈마트", 100)]).fresh).toHaveLength(0);
  });

  it("기간의 달 목록", () => {
    expect(monthsBetween("2026-08-28", "2026-09-03")).toEqual(["2026-08", "2026-09"]);
    expect(monthsBetween("2026-09-19", "2026-09-20")).toEqual(["2026-09"]);
  });
});
