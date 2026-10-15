import { randomBytes, timingSafeEqual } from "node:crypto";

// 요청이 "이 PC 의 이 앱 화면"에서 왔는지 가려내는 장치.
// localhost 라는 이유만으로 믿지 않는다. 네 겹:
//  1) Host 가 루프백(localhost·127.0.0.1·[::1])이어야 한다. 같은 와이파이의 다른 기기는 못 쓴다.
//  2) Origin 이 있으면 Host 와 같아야 하고, Sec-Fetch-Site 가 있으면 same-origin 이어야 한다 (다른 사이트에서 몰래 보내는 CSRF 차단).
//  3) 직접 만든 헤더(X-Backup-Client)가 있어야 한다. 브라우저는 다른 사이트의 폼·이미지 요청에 이 헤더를 못 붙인다.
//  4) 세션 토큰: 앱 화면이 처음 열릴 때 서버가 무작위로 발급해 메모리에만 둔다. 모든 업로드 요청에 붙인다.
// 한계: 이 PC 안에서 도는 다른 프로그램이 헤더를 흉내 내면 막지 못한다. 그래도 할 수 있는 일은 "백업 폴더에 파일을 하나 더 쓰는 것"뿐이다 (읽기·삭제 없음).

export const CLIENT_HEADER = "x-backup-client";
export const SESSION_HEADER = "x-backup-session";
const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

export function checkOrigin(headers: Headers): string | null {
  const host = headers.get("host") ?? "";
  if (!LOOPBACK.test(host)) return "이 PC 안에서만 쓸 수 있어요 (host 가 localhost 가 아님).";
  const origin = headers.get("origin");
  if (origin) {
    let o: URL;
    try {
      o = new URL(origin);
    } catch {
      return "요청 출처(origin)를 읽을 수 없어요.";
    }
    if (o.host.toLowerCase() !== host.toLowerCase() || (o.protocol !== "http:" && o.protocol !== "https:")) return "다른 곳에서 보낸 요청이에요 (origin 불일치).";
  }
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return "다른 사이트에서 보낸 요청이에요.";
  if (headers.get(CLIENT_HEADER) !== "1") return "앱 화면에서 보낸 요청이 아니에요.";
  return null;
}

// ── 세션 ─────────────────────────────────────────────────────────
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class SessionStore {
  private tokens = new Map<string, number>(); // token → 만료 시각
  constructor(private now: () => number = Date.now) {}
  issue(): string {
    this.prune();
    const t = randomBytes(32).toString("hex");
    this.tokens.set(t, this.now() + SESSION_TTL_MS);
    return t;
  }
  verify(token: string | null | undefined): boolean {
    if (!token || token.length !== 64) return false;
    this.prune();
    for (const [t, exp] of this.tokens) {
      if (t.length === token.length && timingSafeEqual(Buffer.from(t), Buffer.from(token))) return exp > this.now();
    }
    return false;
  }
  private prune() {
    const n = this.now();
    for (const [t, exp] of this.tokens) if (exp <= n) this.tokens.delete(t);
  }
}

export function checkSession(headers: Headers, sessions: SessionStore): string | null {
  return sessions.verify(headers.get(SESSION_HEADER)) ? null : "백업 세션이 없거나 만료됐어요. 화면을 새로고침해 주세요.";
}
