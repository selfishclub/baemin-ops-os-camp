/**
 * 아주 작은 zip 리더.
 *
 * xlsx 는 zip 이다. 엑셀 라이브러리를 통째로 받아오면 900KB가 넘는데,
 * 우리는 시트 하나만 꺼내면 된다. 브라우저·Node 모두 가진 DecompressionStream 으로 푼다.
 */

const td = new TextDecoder();

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** 파일 이름 → 내용. 못 읽는 항목은 건너뛴다 */
export async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const out = new Map<string, Uint8Array>();

  // 중앙 디렉터리 끝(EOCD)을 뒤에서 찾는다
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0 && i > u8.length - 70000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip 구조를 찾지 못했습니다. xlsx 파일이 맞는지 확인해 주세요.");

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    // 지역 헤더에서 실제 데이터 시작점을 다시 읽는다
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = u8.subarray(start, start + compSize);

    try {
      out.set(name, method === 0 ? raw : await inflateRaw(raw));
    } catch {
      /* 못 푸는 항목은 건너뛴다 — 우리가 쓰는 건 시트 하나뿐이다 */
    }
  }
  return out;
}

export const asText = (b: Uint8Array) => td.decode(b);
