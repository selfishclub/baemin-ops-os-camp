// .env.local (내 컴퓨터) 또는 환경변수 (Vercel) → config.js 를 만든다.
// config.js 는 git 에 올리지 않는다. 열쇠 값은 여기 코드에 적지 않는다.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const url = process.env.SUPABASE_URL || '';
const anon = process.env.SUPABASE_ANON_KEY || '';
const pin = process.env.OWNER_PIN || '0000';

if (!url || !anon) {
  console.warn('[make-config] SUPABASE_URL / SUPABASE_ANON_KEY 가 비어 있습니다. 서버 저장 없이(폰 저장만) 동작합니다.');
}
const out = '/* 자동 생성. .env.local 또는 환경변수에서 만듦. git에 올리지 않음 */\n' +
  'window.SB = ' + JSON.stringify({ url: url, anon: anon, ownerPin: pin }) + ';\n';
fs.writeFileSync(path.join(__dirname, 'config.js'), out);
console.log('[make-config] config.js 생성 완료' + (url ? ' (서버 연결 켜짐)' : ' (서버 연결 없음)'));
