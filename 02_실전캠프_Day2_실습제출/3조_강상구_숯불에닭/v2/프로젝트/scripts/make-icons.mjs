// 홈 화면 아이콘 만들기 — 주황 둥근 사각형에 흰 막대 그래프 3개 (손익 장부).
// 외부 라이브러리 없이 픽셀을 직접 찍고 zlib로 PNG를 만든다. `node scripts/make-icons.mjs`
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [234, 88, 12]; // orange-600 — 앱 머리글 색과 같게
const FG = [255, 255, 255];

function crc32(buf) {
  let c, table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // 필터 없음
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8비트 RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 막대 3개가 오른쪽으로 갈수록 높아진다 (매출이 오르는 모양)
const BARS = [[0.18, 0.42], [0.42, 0.60], [0.66, 0.78]]; // [왼쪽 x 비율, 높이 비율]
const BAR_W = 0.16;

function draw(round) {
  return (x, y, size) => {
    const u = x / size, v = y / size;
    if (round) { // 둥근 사각형 바깥은 투명 (maskable은 꽉 채운다)
      const r = 0.22, dx = Math.max(r - u, u - (1 - r), 0), dy = Math.max(r - v, v - (1 - r), 0);
      if (Math.hypot(dx, dy) > r) return [0, 0, 0, 0];
    }
    for (const [bx, h] of BARS) {
      const top = 0.82 - h * 0.62;
      if (u >= bx && u <= bx + BAR_W && v >= top && v <= 0.82) return [...FG, 255];
    }
    return [...BG, 255];
  };
}

mkdirSync("public/icons", { recursive: true });
const out = [
  ["public/icons/icon-192.png", 192, true],
  ["public/icons/icon-512.png", 512, true],
  ["public/icons/icon-maskable-512.png", 512, false], // 안드로이드가 제 모양대로 잘라 쓴다
  ["public/icons/apple-touch-icon.png", 180, false],  // 아이폰은 투명을 검게 칠해서 꽉 채운다
];
for (const [path, size, round] of out) {
  writeFileSync(path, png(size, draw(round)));
  console.log(path, size);
}
