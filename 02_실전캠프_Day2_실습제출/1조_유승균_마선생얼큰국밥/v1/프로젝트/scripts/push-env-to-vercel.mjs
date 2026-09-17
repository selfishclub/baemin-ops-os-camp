// 노트북 .env.local 의 값을 Vercel(인터넷 서버) 환경변수로 올립니다.
// 사용: npm run env:push   (처음 한 번 `npx vercel login` 으로 로그인 필요)
import { spawnSync } from "node:child_process";
import { loadEnvLocal } from "./lib/common.mjs";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_MODEL", "OPENAI_MODEL", "APP_PASSWORD", "INGEST_TOKEN", "STUDIO_INGEST_URL"];
const ENVS = ["production", "preview"];

loadEnvLocal();

function vercel(args, input) {
  const r = spawnSync("npx", ["--yes", "vercel", ...args], { input, encoding: "utf8", shell: true });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const who = vercel(["whoami"]);
if (who.code !== 0 || /Error|not logged/i.test(who.out)) {
  console.error("Vercel에 로그인돼 있지 않습니다. 먼저 이 명령을 실행해 브라우저에서 로그인해주세요:\n\n  npx vercel login\n");
  process.exit(1);
}
console.log("Vercel 계정:", who.out.trim().split("\n").pop());

const link = vercel(["link", "--yes", "--project", "review-content-studio"]);
if (link.code !== 0) { console.error("프로젝트 연결 실패:\n" + link.out); process.exit(1); }

let done = 0;
const failed = [];
for (const key of KEYS) {
  const value = (process.env[key] || "").trim();
  if (!value) { console.log(`- ${key}: .env.local에 값이 없어 건너뜀`); continue; }
  let ok = true;
  for (const env of ENVS) {
    vercel(["env", "rm", key, env, "--yes"]); // 기존 값이 있으면 지우고 다시 넣음 (없으면 무시)
    const r = vercel(["env", "add", key, env], value + "\n");
    if (r.code !== 0) { ok = false; console.error(`  ✗ ${key} (${env}) 실패: ${r.out.trim().split("\n").pop()}`); }
  }
  if (ok) { console.log(`✓ ${key} 올림 (값 길이 ${value.length})`); done++; } else failed.push(key);
}
console.log(`\n${done}개 변수 반영${failed.length ? `, 실패: ${failed.join(", ")}` : ""}. 재배포를 시작합니다…`);
// 최근 프로덕션 배포를 찾아 다시 배포 (환경변수는 새 배포부터 적용됨)
const ls = vercel(["ls", "--prod"]);
const url = (ls.out.match(/https:\/\/[^\s]+\.vercel\.app/) || [])[0];
const dep = url ? vercel(["redeploy", url]) : { code: 1, out: "배포 목록을 읽지 못했습니다" };
if (dep.code !== 0) {
  console.log("자동 재배포는 실패했습니다. Vercel 화면의 Deployments → ⋯ → Redeploy 를 눌러주세요.\n" + dep.out.slice(-400));
} else {
  console.log("재배포 요청 완료 ✅ 1~2분 뒤 인터넷 사이트에서 AI 연결 상태를 확인하세요.");
}
