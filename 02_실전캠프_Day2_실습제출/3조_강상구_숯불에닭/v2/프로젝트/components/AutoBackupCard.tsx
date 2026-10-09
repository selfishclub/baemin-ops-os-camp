"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/ui";
import { isFullyBackedUp, ledgerDirty, photosDirty, requestManualBackup, shouldWarn, subscribeView, GIVE_UP_FAILURES, type AgentView } from "@/lib/autoBackup";
import { mbText } from "@/lib/photoBackup";

// 규칙 탭 "자동 백업" 카드. 상태는 AutoBackupAgent 가 흘려 주는 것을 보여 주기만 한다.
// "성공" 시각은 전부 서버가 검증을 끝내고 알려 준 것이다. 브라우저가 보낸 시각이 아니다.

const when = (iso: string | null) => {
  if (!iso) return "없음";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function AutoBackupCard() {
  const [v, setV] = useState<AgentView | null>(null);
  useEffect(() => subscribeView(setV), []);
  if (!v) return null;

  const { server, state, running, nextRetryAt } = v;
  const st = server?.status;

  return (
    <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">자동 백업 (이 PC 폴더)</span>
        <span className="text-xs text-stone-600">{server === null ? "확인 중…" : server.enabled ? "켜짐" : "꺼짐"}</span>
      </div>

      {server && !server.enabled && (
        <Notice tone="warn">
          자동 백업이 꺼져 있어요. {server.reason}
          <span className="block text-xs opacity-80">켜려면 앱 폴더의 .env.local 에 BACKUP_DIR=백업폴더경로 를 적고 앱을 다시 켜요. 백업 폴더는 앱 폴더 밖에 두세요.</span>
        </Notice>
      )}

      {server?.enabled && st && (
        <>
          <p className="text-xs text-stone-600">
            저장 폴더: <span className="num">{st.dir}</span>
          </p>
          <table className="w-full text-xs">
            <tbody className="num">
              <tr>
                <td className="py-0.5">마지막 장부 백업 성공 (서버 검증)</td>
                <td className="py-0.5 text-right">{when(st.lastLedgerOkAt)}</td>
              </tr>
              <tr>
                <td className="py-0.5">마지막 사진 백업 성공</td>
                <td className="py-0.5 text-right">{when(st.lastPhotosOkAt)}</td>
              </tr>
              <tr>
                <td className="py-0.5">마지막 통합(장부+사진) 백업 성공</td>
                <td className="py-0.5 text-right">{when(st.lastFullOkAt)}</td>
              </tr>
              <tr>
                <td className="py-0.5">백업 파일</td>
                <td className="py-0.5 text-right">
                  검증 완료 {st.verifiedCount}개 · {mbText(st.totalBytes)}
                  {st.incompleteCount > 0 && ` · 불완전 ${st.incompleteCount}개`}
                  {st.leftoverTempCount > 0 && ` · 임시 ${st.leftoverTempCount}개`}
                </td>
              </tr>
            </tbody>
          </table>

          {isFullyBackedUp(state) ? (
            <Notice tone="ok">지금 장부와 사진이 모두 백업돼 있어요.</Notice>
          ) : (
            <Notice tone={shouldWarn(state) ? "error" : "warn"}>
              {ledgerDirty(state) && "장부가 바뀐 뒤 아직 백업되지 않았어요. "}
              {photosDirty(state) && "사진이 바뀐 뒤 아직 사진 백업이 안 됐어요 — 장부만 백업돼도 '전체 완료'가 아니에요. "}
              {!ledgerDirty(state) && !photosDirty(state) && !state.lastFullOkAt && "아직 통합 백업이 한 번도 성공하지 않았어요. "}
              {running ? `지금 보내는 중 (${running === "full" ? "장부+사진" : "장부"})…` : nextRetryAt ? `다시 시도 예정: ${when(nextRetryAt)}` : ""}
            </Notice>
          )}

          {state.lastError && (
            <Notice tone={shouldWarn(state) ? "error" : "warn"}>
              {shouldWarn(state) ? `백업이 ${state.failures}번 연속 실패했어요. ` : "마지막 시도가 실패했어요. "}
              {state.lastError}
              {state.failures >= GIVE_UP_FAILURES && " 자동 재시도를 멈췄어요. 원인을 해결한 뒤 아래 버튼을 눌러 주세요."}
            </Notice>
          )}

          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost text-xs" disabled={!!running} onClick={() => requestManualBackup("ledger")}>
              지금 장부 백업
            </button>
            <button className="btn-primary text-xs" disabled={!!running} onClick={() => requestManualBackup("full")}>
              지금 장부+사진 백업
            </button>
          </div>
        </>
      )}

      <p className="text-[11px] text-stone-500">장부가 바뀌면 30초 뒤에, 사진은 하루 한 번 보내요. 서버가 파일을 다시 읽어 확인한 뒤에만 "성공"으로 적어요. 브라우저(이 화면)가 닫혀 있으면 자동 백업이 돌지 않아요. 오래된 백업 파일은 지우지 않아요 — 폴더가 커지면 사장님이 직접 정리하세요.</p>
    </div>
  );
}
