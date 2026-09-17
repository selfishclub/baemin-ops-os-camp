import { emptyData, readLocal, writeLocal, type LocalData } from "./local";

// 내 PC 모드는 브라우저에만 저장되므로, 브라우저 기록을 지우면 사라진다.
// 그래서 백업 파일(JSON)로 내려받고 다시 불러올 수 있게 한다. 백업 파일에는 실제 숫자가 들어 있으니 저장소에 올리지 않는다.
export function exportBackup(): string {
  return JSON.stringify({ app: "sootdak-ledger", version: 1, savedAt: new Date().toISOString(), data: readLocal() }, null, 2);
}

export function importBackup(text: string): LocalData {
  let parsed: { app?: string; data?: Partial<LocalData> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("백업 파일을 읽지 못했어요. 이 도구에서 저장한 .json 파일이 맞나요?");
  }
  if (parsed.app !== "sootdak-ledger" || !parsed.data || !Array.isArray(parsed.data.transactions)) {
    throw new Error("이 도구의 백업 파일이 아니에요.");
  }
  const data = { ...emptyData(), ...parsed.data };
  writeLocal(data);
  return data;
}
