#!/usr/bin/env python3
"""데모판 만들기 — 배포: 이 스크립트를 돌린 뒤  cd 데모/dist && git add -A && git commit -m "데모 갱신" && git push  (GitHub haemonic-demo → Vercel 이 자동 배포, 주소 https://haemonic-demo.vercel.app)
급하면 cd 데모/dist && npx vercel@latest deploy --prod --yes 로 바로 올릴 수도 있다.
데모판 만들기 — 실제 앱 파일을 그대로 복사하고 demo.js 한 줄만 끼워 넣는다.
결과: 데모/dist/ (Vercel 프로젝트 haemonic-demo 로 배포). 실제 기록·서버와는 완전히 분리된다."""
import shutil, re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = root / '데모' / 'dist'
# 데모/dist 는 자기 git 저장소(GitHub SUSANOO123/haemonic-demo → Vercel 자동 배포)다. .git 과 .vercel 은 남기고 나머지만 새로 만든다.
if not out.exists(): out.mkdir(parents=True)
for child in out.iterdir():
    if child.name in ('.git', '.vercel', '.gitignore'): continue
    shutil.rmtree(child) if child.is_dir() else child.unlink()
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
(out / '.gitignore').write_text('.env*\n.vercel/\n.DS_Store\n', encoding='utf-8')
(out / 'vercel.json').write_text('{\n  "cleanUrls": true\n}\n', encoding='utf-8')
print('built', out, 'v=' + v)
