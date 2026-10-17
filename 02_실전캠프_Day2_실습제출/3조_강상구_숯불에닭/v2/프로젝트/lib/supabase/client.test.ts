import { describe, expect, it } from "vitest";
import { parseLoginLink } from "./client";

describe("메일 로그인 링크 붙여넣기", () => {
  it("Supabase 기본 메일 링크에서 열쇠와 종류를 꺼낸다", () => {
    const link = "https://abcd.supabase.co/auth/v1/verify?token=pkce_123abc&type=magiclink&redirect_to=https://sootdak-ledger.vercel.app/";
    expect(parseLoginLink(link)).toEqual({ tokenHash: "pkce_123abc", type: "magiclink" });
  });
  it("처음 가입 메일(signup)도 된다, 앞뒤 글자가 섞여도 된다", () => {
    expect(parseLoginLink("로그인: https://abcd.supabase.co/auth/v1/verify?token=xyz&type=signup&redirect_to=x 끝")).toEqual({ tokenHash: "xyz", type: "signup" });
  });
  it("링크가 아니거나 열쇠가 없으면 null", () => {
    expect(parseLoginLink("123456")).toBeNull();
    expect(parseLoginLink("https://sootdak-ledger.vercel.app/")).toBeNull();
  });
});
