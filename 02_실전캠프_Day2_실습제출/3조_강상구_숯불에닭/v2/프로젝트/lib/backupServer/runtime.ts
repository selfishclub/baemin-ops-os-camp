import { readBackupConfig } from "./config";
import { SessionStore } from "./guard";
import type { ServerCtx } from "./handlers";

// 서버 프로세스 안에서 하나만 두는 상태(세션 목록). dev 서버가 코드를 다시 읽어도 globalThis 에 남아 세션이 끊기지 않는다.
const KEY = "__sootdakBackupCtx";

export function getServerCtx(): ServerCtx {
  const g = globalThis as unknown as Record<string, ServerCtx | undefined>;
  if (!g[KEY]) g[KEY] = { config: readBackupConfig(), sessions: new SessionStore() };
  else g[KEY].config = readBackupConfig(); // 환경변수가 바뀌면 바로 반영
  return g[KEY]!;
}
