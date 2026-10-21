import { describe, expect, it } from "vitest";
import { fileDate, fileStamp } from "./format";

describe("파일 이름 날짜", () => {
  it("한국 시각으로 찍는다 — 영국 시각 16:46 은 한국 다음 날 01:46", () => {
    const t = new Date("2026-10-21T16:46:07.756Z");
    expect(fileDate(t)).toBe("2026-10-22");
    expect(fileStamp(t)).toBe("2026-10-22_01-46-07");
  });
});
