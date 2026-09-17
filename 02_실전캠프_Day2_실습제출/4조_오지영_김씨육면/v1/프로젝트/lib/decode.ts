/**
 * 카드사에서 내려받는 CSV는 UTF-8이 아닌 경우가 많다(EUC-KR / CP949).
 * 그냥 file.text()로 읽으면 한글이 전부 깨지므로 바이트로 읽어 인코딩을 판별한다.
 */
export interface DecodedFile {
  text: string;
  encoding: string;
}

const KO_LABELS = ["euc-kr", "windows-949", "cp949"];

export function decodeBytes(buf: ArrayBuffer): DecodedFile {
  const head = new Uint8Array(buf.slice(0, 3));
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(buf), encoding: "UTF-8 (BOM)" };
  }
  try {
    // fatal:true → 잘못된 바이트가 있으면 예외. UTF-8이 아닌 걸 걸러낸다.
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buf), encoding: "UTF-8" };
  } catch {
    /* UTF-8이 아니다 */
  }
  for (const label of KO_LABELS) {
    try {
      const text = new TextDecoder(label).decode(buf);
      if (text.includes("�")) continue;
      return { text, encoding: "EUC-KR" };
    } catch {
      /* 다음 후보 */
    }
  }
  return { text: new TextDecoder("utf-8").decode(buf), encoding: "알 수 없음 (깨질 수 있음)" };
}

export async function readFileText(file: File): Promise<DecodedFile> {
  return decodeBytes(await file.arrayBuffer());
}
