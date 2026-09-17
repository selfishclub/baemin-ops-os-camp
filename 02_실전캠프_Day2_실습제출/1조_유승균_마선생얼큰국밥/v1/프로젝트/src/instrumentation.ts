/** 서버가 켜질 때 한 번 실행. 노트북(로컬)에서만 클라우드 수집 요청 감시를 시작합니다.
 *  NEXT_RUNTIME 조건은 빌드 시 상수로 치환되어, edge 번들에는 아래 import 가 포함되지 않습니다. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
