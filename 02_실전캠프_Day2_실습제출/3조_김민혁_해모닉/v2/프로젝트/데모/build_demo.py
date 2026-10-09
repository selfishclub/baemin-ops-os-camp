#!/usr/bin/env python3
"""데모판 만들기 — 배포: cd 데모/dist && npx vercel@latest deploy --prod --yes  (주소 https://haemonic-demo.vercel.app)
데모판 만들기 — 실제 앱 파일을 그대로 복사하고 demo.js 한 줄만 끼워 넣는다.
결과: 데모/dist/ (Vercel 프로젝트 haemonic-demo 로 배포). 실제 기록·서버와는 완전히 분리된다."""
import shutil, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = root / '데모' / 'dist'
keep = None
if (out / '.vercel').exists():   # Vercel 프로젝트 연결 정보는 다시 만들 때도 남긴다
    keep = (out / '.vercel' / 'project.json').read_text()
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
if keep:
    (out / '.vercel').mkdir(); (out / '.vercel' / 'project.json').write_text(keep)
for f in ['app.js', 'data.js', 'store.js', 'style.css']:
    shutil.copy(root / f, out / f)
shutil.copytree(root / 'vendor', out / 'vendor')
shutil.copytree(root / '샘플', out / '샘플')
shutil.copy(root / '데모' / 'demo.js', out / 'demo.js')
html = (root / 'index.html').read_text(encoding='utf-8')
v = re.search(r'app\.js\?v=([0-9a-z]+)', html).group(1)
html = html.replace('<title>해모닉 업무 체크리스트</title>', '<title>해모닉 업무 체크리스트 · 데모</title>')
html = html.replace('<script src="data.js', f'<script src="demo.js?v={v}"></script>\n<script src="data.js', 1)
(out / 'index.html').write_text(html, encoding='utf-8')
(out / '.vercelignore').write_text('.env*\n.vercel\n', encoding='utf-8')   # vercel link 가 만드는 토큰 파일(.env.local)이 올라가지 않게
(out / 'vercel.json').write_text('{\n  "cleanUrls": true\n}\n', encoding='utf-8')
print('built', out, 'v=' + v)
