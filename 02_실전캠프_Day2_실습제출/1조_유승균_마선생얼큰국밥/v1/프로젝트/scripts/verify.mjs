// typecheck + test + build 를 dev 서버와 충돌하지 않는 별도 폴더(.next-verify)로 실행
import { spawnSync } from "node:child_process";

const steps = [
  ["typecheck", ["npm", "run", "typecheck"]],
  ["test", ["npm", "run", "test"]],
  ["build", ["npm", "run", "build"], { NEXT_DIST_DIR: ".next-verify" }],
];

for (const [name, cmd, env] of steps) {
  console.log(`\n=== ${name} ===`);
  const res = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit", shell: true, env: { ...process.env, ...(env || {}) } });
  if (res.status !== 0) {
    console.error(`\n${name} 실패 (exit ${res.status})`);
    process.exit(res.status || 1);
  }
}
console.log("\n모두 통과 ✅");
