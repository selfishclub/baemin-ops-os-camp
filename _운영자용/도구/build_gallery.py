# 02 폴더 README의 "구경하기" 표를 제출서·결과물에서 자동 생성합니다.
# 실행: python3 _운영자용/도구/build_gallery.py   (저장소 루트에서)  → 그 뒤 커밋·push
import os, re, glob, urllib.parse
ROOT="02_실전캠프_Day2_실습제출"; README=f"{ROOT}/README.md"
ORDER=["1조_유승균_마선생얼큰국밥","1조_이범례_부찌대학","2조_양진서_빈숲카페","2조_손성필_본노엘","2조_김은정_떡기리",
       "3조_김민혁_해모닉","3조_강상구_숯불에닭","3조_이승신_바삭마차","4조_손민지_카페스이","4조_오지영_김씨육면","4조_박가영_가영이네"]
def field(text,label):
    m=re.search(r"^- \**"+re.escape(label.strip("*"))+r"\**[^:：\n]*[:：]\**[ \t]*(.*)$", text, re.M)
    v=(m.group(1).strip() if m else "")
    return "" if v.startswith("(") and v.endswith(")") else v
def first_image(folder):
    imgs=[p for p in glob.glob(f"{folder}/결과물/*") if p.lower().endswith((".png",".jpg",".jpeg",".gif",".webp"))]
    if not imgs: return None
    imgs.sort(key=lambda p:(0 if os.path.basename(p).startswith("첫화면") else 1, p))
    return imgs[0]
def link(path,label):
    rel=os.path.relpath(path,ROOT); return f"[{label}]({urllib.parse.quote(rel)})"
rows=[]
for d in ORDER:
    folder=f"{ROOT}/{d}"
    if not os.path.isdir(folder): continue
    g,name,store=d.split("_",2)
    cells=[]
    for v in ("v1","v2"):
        sub=f"{folder}/{v}"; sm=f"{sub}/제출서.md"
        text=open(sm).read() if os.path.exists(sm) else ""
        tool=field(text,"도구 이름"); desc=field(text,"한 줄 설명")
        url=field(text,"**Vercel 배포 주소**") or field(text,"Vercel 배포 주소"); url = url if url.startswith("http") else ""
        repo=field(text,"**내 GitHub 저장소 주소**") or field(text,"내 GitHub 저장소 주소"); repo = repo if repo.startswith("http") else ""
        proj=next((f"{sub}/{n}" for n in ("프로젝트","앱") if os.path.isdir(f"{sub}/{n}") and any(os.scandir(f"{sub}/{n}"))), None); has_proj=proj is not None
        img=first_image(sub)
        parts=[]
        if img: parts.append(f'<a href="{urllib.parse.quote(os.path.relpath(img,ROOT))}"><img src="{urllib.parse.quote(os.path.relpath(img,ROOT))}" width="180"></a>')
        if tool: parts.append(f"**{tool}**")
        if desc: parts.append(desc)
        links=[]
        if url: links.append(f"**[열어 보기 ↗]({url})**")
        if repo: links.append(f"[코드 보기]({repo})")
        if has_proj: links.append(link(proj,"만든 폴더(힌트)"))
        if os.path.exists(f"{sub}/PRD.md"): links.append(link(f"{sub}/PRD.md","PRD"))
        if os.path.exists(sm): links.append(link(sm,"제출서"))
        if links: parts.append(" · ".join(links))
        cells.append("<br>".join(parts) if parts else "—")
    rows.append(f"| {g} | **{store}**<br>{name}<br>{link(folder,'내 폴더')} | {cells[0]} | {cells[1]} |")
table="| 조 | 가게 · 이름 | v1 (9/17) | v2 (10/2 1차 · 10/17 최종) |\n|---|---|---|---|\n"+"\n".join(rows)
s=open(README).read()
s=re.sub(r"<!-- GALLERY:START -->.*?<!-- GALLERY:END -->", "<!-- GALLERY:START -->\n"+table+"\n<!-- GALLERY:END -->", s, flags=re.S)
open(README,"w").write(s); print("구경하기 표 갱신:",len(rows),"명")
