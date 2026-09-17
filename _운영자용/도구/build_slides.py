# 발표 자료 HTML 생성기. 실행: python3 _운영자용/도구/build_slides.py
# 슬라이드 내용을 고치려면 아래 DECKS 를 수정하고 다시 실행합니다.
import os, sys
OUT = "04_실전캠프_Day2_수업자료/발표자료"
SCRATCH = sys.argv[1] if len(sys.argv) > 1 else None

CSS = """
:root{--ink:#14140F;--cream:#F2EFE6;--acid:#E8EC14;--stone:#B3B1A6;--rule-dark:#34342C;--paper:#FFFFFF;--paper-ink:#16160F;--paper-muted:#6E6C64;--rule-light:#E4E4DC;--row-hi:#FAFAE0;--olive:#7A7A00;--s:1;--body:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;--mono:"IBM Plex Mono",ui-monospace,Menlo,monospace}
*{box-sizing:border-box}html,body{height:100%}
body{margin:0;word-break:keep-all;overflow-wrap:break-word;background:var(--ink);color:var(--cream);font-family:var(--body);overflow:hidden}
.stage{position:absolute;left:50%;top:50%;width:1920px;height:1080px;transform:translate(-50%,-50%) scale(var(--s));transform-origin:center}
.slide{position:absolute;inset:0;padding:88px 110px 80px;display:flex;flex-direction:column;overflow:hidden;background:var(--ink);color:var(--cream);opacity:0;visibility:hidden;transition:opacity .22s}
.slide.on{opacity:1;visibility:visible}.slide.light{background:var(--paper);color:var(--paper-ink)}
.eyebrow{font-family:var(--mono);font-size:24px;letter-spacing:.2em;color:var(--stone);margin:0 0 26px}.light .eyebrow{color:var(--paper-muted)}
h1,h2,h3{font-weight:900;letter-spacing:-.025em;line-height:1.22;margin:0;text-wrap:balance}h2{font-size:80px}
.y{color:var(--acid)}mark{color:var(--acid);background:none;padding:0}
.light mark{color:inherit;background:linear-gradient(transparent 58%,var(--acid) 58%,var(--acid) 94%,transparent 94%);padding:0 .04em}
.lead{font-size:36px;line-height:1.6;margin:34px 0 0;max-width:1500px}.light .lead{color:#3F3E38}.lead b{font-weight:700}.slide:not(.light) .lead b{color:var(--acid)}
.foot{margin-top:auto;padding-top:28px}.note{font-size:23px;color:var(--stone);margin:0;line-height:1.5}.light .note{color:var(--paper-muted)}
.cover{justify-content:center;align-items:center;text-align:center}.cover .eyebrow{letter-spacing:.3em;font-size:30px;font-family:var(--body)}
.cover h1{font-size:104px;line-height:1.18}.cover .by{font-size:36px;color:var(--stone);margin-top:56px;line-height:1.5}
.sec{justify-content:center}.sec .num{font-family:var(--mono);font-size:120px;color:var(--acid);line-height:1;margin-bottom:40px}.sec h2{font-size:92px}
.cards{display:grid;gap:0;margin-top:50px;border:2px solid var(--rule-dark)}
.cards>div{padding:38px 36px 40px;border-right:2px solid var(--rule-dark);min-height:240px}.cards>div:last-child{border-right:0}
.cards .k{font-family:var(--mono);font-size:23px;color:var(--acid);margin:0 0 20px;letter-spacing:.06em}
.cards .t{text-wrap:balance;font-size:36px;font-weight:700;line-height:1.4;margin:0}.cards .d{font-size:26px;line-height:1.55;color:var(--stone);margin:18px 0 0}
.cards .on-acid{background:var(--acid);color:var(--ink)}.cards .on-acid .k,.cards .on-acid .d{color:var(--ink)}
.light .cards,.light .cards>div{border-color:var(--rule-light)}.light .cards .k{color:var(--olive)}.light .cards .d{color:#4A4943}
.scenes{display:grid;grid-template-columns:repeat(3,1fr);gap:32px;margin-top:54px}
.scene{background:#1E1E17;border:2px solid var(--rule-dark);border-radius:6px;padding:40px 38px;display:flex;flex-direction:column;min-height:460px}
.scene .when{font-family:var(--mono);font-size:22px;color:var(--acid);letter-spacing:.1em;margin:0 0 26px}
.scene .q{text-wrap:balance;font-size:40px;font-weight:700;line-height:1.4;margin:0}.scene .q::before{content:"\\201C";color:var(--acid)}.scene .q::after{content:"\\201D";color:var(--acid)}
.scene .d{font-size:26px;color:var(--stone);line-height:1.55;margin:auto 0 0;padding-top:30px}
.table{width:100%;border-collapse:collapse;margin-top:44px;font-size:28px;table-layout:fixed}
.table th{text-align:left;font-weight:500;font-size:22px;color:var(--paper-muted);padding:0 26px 18px;border-bottom:2px solid var(--rule-light)}
.table td{padding:20px 24px;border-bottom:1px solid var(--rule-light);vertical-align:top;line-height:1.45;color:#3F3E38}
.table td:first-child{font-weight:700;color:var(--paper-ink)}.table tr.hi td{background:var(--row-hi)}.table tr.hi td:first-child{box-shadow:inset 7px 0 0 var(--olive)}
.table tr:last-child td{border-bottom:0}
.slide:not(.light) .table th{color:var(--stone);border-color:var(--rule-dark)}.slide:not(.light) .table td{color:#E4E1D6;border-color:var(--rule-dark)}
.slide:not(.light) .table td:first-child{color:var(--cream)}
.split{display:grid;grid-template-columns:1fr 1fr;margin-top:56px;border:2px solid var(--rule-dark)}
.split>div{padding:46px 50px}.split>div+div{border-left:2px solid var(--rule-dark)}
.split .head{display:flex;align-items:baseline;gap:20px;margin:0 0 28px;flex-wrap:wrap}.split .head strong{font-size:42px;font-weight:900}.split .head span{font-family:var(--mono);font-size:23px;color:var(--stone)}
.split ul{list-style:none;margin:0;padding:0;display:grid;gap:20px}.split li{font-size:30px;line-height:1.45;padding-left:40px;position:relative}
.split li::before{content:"";position:absolute;left:0;top:.62em;width:18px;height:3px;background:var(--stone)}.split li b{font-weight:700}
.split .on-acid{background:var(--acid);color:var(--ink)}.split .on-acid .head span{color:var(--ink)}.split .on-acid li::before{background:var(--ink)}
.split .never li::before{width:20px;height:20px;top:.38em;background:none;border:3px solid var(--acid);border-radius:50%}
.split .never li::after{content:"";position:absolute;left:-2px;top:calc(.38em + 9px);width:24px;height:3px;background:var(--acid);transform:rotate(-45deg)}
.light .split,.light .split>div+div{border-color:var(--rule-light)}.light .split .head span{color:var(--paper-muted)}.light .split li::before{background:var(--paper-muted)}
.steps{display:grid;grid-template-columns:repeat(4,1fr);margin-top:54px;border-top:3px solid currentColor}.steps.three{grid-template-columns:repeat(3,1fr)}
.steps>div{padding:38px 44px 0 0}.steps>div+div{padding-left:44px;border-left:1px solid var(--rule-dark)}.light .steps>div+div{border-color:var(--rule-light)}
.steps .k{font-family:var(--mono);font-size:23px;color:var(--stone);margin:0 0 18px;letter-spacing:.1em}.light .steps .k{color:var(--paper-muted)}
.steps .t{text-wrap:balance;font-size:38px;font-weight:900;line-height:1.3;margin:0 0 20px}.steps .d{font-size:27px;line-height:1.6;color:var(--stone);margin:0}.light .steps .d{color:#4A4943}
.steps .hi .t{color:var(--acid)}.light .steps .hi .t{color:inherit;display:inline;background:linear-gradient(transparent 58%,var(--acid) 58%,var(--acid) 94%,transparent 94%)}
.flowbox{margin-top:56px;display:flex;align-items:center;justify-content:center;gap:0;flex-wrap:wrap}
.flowbox .n{border:3px solid var(--rule-dark);border-radius:8px;padding:34px 40px;min-width:380px;text-align:center}
.flowbox .n b{display:block;font-size:38px;font-weight:900}.flowbox .n span{display:block;font-size:24px;color:var(--stone);margin-top:10px;line-height:1.4}
.flowbox .n.hi{border-color:var(--acid);background:var(--acid);color:var(--ink)}.flowbox .n.hi span{color:var(--ink)}
.flowbox .a{font-family:var(--mono);font-size:26px;color:var(--acid);padding:0 26px;text-align:center;line-height:1.3}
.light .flowbox .n{border-color:var(--rule-light);background:#FBFBF7}.light .flowbox .n span{color:var(--paper-muted)}.light .flowbox .a{color:var(--olive)}
.prompt{margin-top:40px;background:#1E1E17;border-left:6px solid var(--acid);padding:30px 40px;font-size:30px;line-height:1.55;border-radius:4px}
.prompt .w{font-family:var(--mono);font-size:21px;color:var(--stone);display:block;margin-bottom:10px;letter-spacing:.1em}
.light .prompt{background:#FBFBF7;color:#3F3E38}
.big{font-size:120px;font-weight:900;color:var(--acid);line-height:1.1;margin:40px 0 0;letter-spacing:-.03em}
.ui{position:fixed;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;font-family:var(--mono);font-size:13px;color:var(--stone);z-index:9}
.ui button{background:none;border:1px solid var(--rule-dark);color:var(--cream);font-family:var(--mono);font-size:13px;padding:8px 14px;border-radius:4px;cursor:pointer}
.bar{position:fixed;left:0;top:0;height:4px;background:var(--acid);width:0;z-index:9;transition:width .2s}
.hint{position:fixed;top:14px;right:20px;font-family:var(--mono);font-size:12px;color:var(--stone);z-index:9}
"""
JS = """
(function(){var s=Array.prototype.slice.call(document.querySelectorAll('.slide')),c=document.getElementById('count'),p=document.getElementById('progress'),i=0;
function pad(n){return(n<10?'0':'')+n}function fit(){var k=Math.min(window.innerWidth/1920,window.innerHeight/1080);document.documentElement.style.setProperty('--s',k)}
function show(n){i=Math.max(0,Math.min(s.length-1,n));s.forEach(function(e,k){e.classList.toggle('on',k===i)});c.textContent=pad(i+1)+' / '+pad(s.length);p.style.width=((i+1)/s.length*100)+'%';try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
document.getElementById('prev').addEventListener('click',function(e){e.stopPropagation();show(i-1)});document.getElementById('next').addEventListener('click',function(e){e.stopPropagation();show(i+1)});
document.addEventListener('keydown',function(e){if(['ArrowRight','PageDown',' ','Enter'].indexOf(e.key)>=0){e.preventDefault();show(i+1)}else if(['ArrowLeft','PageUp','Backspace'].indexOf(e.key)>=0){e.preventDefault();show(i-1)}else if(e.key==='Home')show(0);else if(e.key==='End')show(s.length-1)});
document.getElementById('stage').addEventListener('click',function(e){if(e.clientX<window.innerWidth/3)show(i-1);else show(i+1)});
window.addEventListener('resize',fit);fit();var st=parseInt((location.hash||'').replace('#',''),10);show(isNaN(st)?0:st-1)})();
"""

def page(title, slides, standalone=True):
    body = f"""<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>{CSS}</style>
<div class="bar" id="progress"></div><div class="hint">← → 키 또는 화면 클릭</div>
<div class="stage" id="stage">
{''.join(slides)}
</div>
<div class="ui"><button id="prev">← 이전</button><span id="count">01 / {len(slides):02d}</span><button id="next">다음 →</button></div>
<script>{JS}</script>"""
    if standalone:
        return f'<!DOCTYPE html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">{body}</head><body></body></html>'.replace('</head><body></body></html>','').replace('<style>'+CSS+'</style>', '<style>'+CSS+'</style></head><body>') + '\n</body></html>'
    return body

def S(cls, html, on=False): return f'<section class="slide {cls}{" on" if on else ""}">{html}</section>\n'

# ---------------- 발표 01 ----------------
d1 = []
d1.append(S("cover", """<p class="eyebrow">배민 AI 장사사관학교 · 실전 캠프 Day 2 · 가게 운영 편</p>
<h1>GitHub, <span class="y">왜</span> 쓰고<br><span class="y">어떻게</span> 쓰나</h1>
<p class="by">오늘 만든 걸 안 잃어버리고, 집에서 이어 만들고, 서로 보는 법<br><span style="font-size:28px">2026. 9. 17</span></p>""", on=True))
d1.append(S("", """<p class="eyebrow">먼저 여쭤볼게요</p><h2>이런 경험, <mark>없으셨나요?</mark></h2>
<div class="scenes">
<div class="scene"><p class="when">지난주 · 캠프 Day 1 다음 날</p><p class="q">어제 AI로 만든 거… 어디 갔지?</p><p class="d">바탕화면, 다운로드 폴더, 카톡 나에게 보내기. 파일이 세 군데에 흩어져 있고 어느 게 최신인지 모릅니다.</p></div>
<div class="scene"><p class="when">저녁 · 집에서</p><p class="q">가게 컴퓨터엔 있는데 집엔 없네.</p><p class="d">이어서 만들고 싶은데 파일이 가게에 있습니다. USB로 옮기다가 옛날 버전을 덮어씁니다.</p></div>
<div class="scene"><p class="when">늘</p><p class="q">최종, 최종2, 진짜최종… 뭐가 진짜지?</p><p class="d">고친 기록이 없으니 어제 것으로 되돌릴 수도 없습니다. AI가 뭘 바꿨는지도 모릅니다.</p></div>
</div>"""))
d1.append(S("sec", """<p class="eyebrow">한 줄로 말하면</p>
<h2>GitHub은<br>내 프로젝트를 보관하는 <span class="y">온라인 금고</span> +<br>고친 기록이 남는 <span class="y">노트</span>예요</h2>
<p class="lead">가게 레시피 노트를 금고에 넣어 두면, 가게에서도 집에서도 같은 노트를 꺼내 이어 씁니다.<br>이 금고는 <b>언제 · 무엇을 · 왜 고쳤는지</b>를 자동으로 적어 둡니다.</p>"""))
d1.append(S("light", """<p class="eyebrow">GitHub이 있는 이유</p><h2>이유는 <mark>네 가지</mark>예요</h2>
<div class="cards" style="grid-template-columns:repeat(4,1fr)">
<div><p class="k">01</p><p class="t">안 잃어버려요</p><p class="d">컴퓨터가 고장 나도, 실수로 지워도 금고에 그대로 있어요.</p></div>
<div><p class="k">02</p><p class="t">어디서든 이어 만들어요</p><p class="d">가게에서 만들고 올리면, 집에서 받아서 이어 만들어요. 다음 날 가게에서 또 받아요.</p></div>
<div><p class="k">03</p><p class="t">되돌릴 수 있어요</p><p class="d">고친 기록이 다 남아요. "어제 버전으로 돌려 줘"가 됩니다.</p></div>
<div class="on-acid"><p class="k">04</p><p class="t">같이 봐요</p><p class="d">다른 사장님 기획안을 보고 배워요. AI에게 "저 폴더 읽고 알려 줘"도 돼요.</p></div>
</div>
<div class="foot"><p class="note">오늘 캠프에서 제일 중요한 건 04예요. 12명이 같은 주제를 각자 만들고 서로 보면서 좋은 걸 가져옵니다.</p></div>"""))
d1.append(S("", """<p class="eyebrow">이번 캠프에서</p><h2>저장소는 <span class="y">두 개</span>를 써요</h2>
<div class="split">
<div class="on-acid"><p class="head"><strong>공동 저장소</strong><span>교실 겸 공동 작업실 · 오늘은 전부 여기</span></p><ul>
<li>지금 화면에 보이는 <b>baemin-ops-os-camp</b></li><li>우리 가게 소개 · 기획안(PRD)</li><li><b>만든 앱(코드)</b> — 내 폴더 v1/앱 안에</li><li>제출서 · 스크린샷</li><li>다른 사장님 앱을 열어 보고 <b>끌어다 써요</b></li><li>보는 건 누구나, 올리는 건 초대받은 12명</li></ul></div>
<div><p class="head"><strong>내 개인 저장소</strong><span>내 창고 · 완성 후(10/17 이후)에 만듦</span></p><ul>
<li>완성한 앱을 <b>옮겨 두는 곳</b></li><li>Vercel이 여기를 읽어 인터넷 주소를 만들어요</li><li>누구나 볼 수 있게 <b>공개(Public)</b></li><li>캠프 끝나도 계속 내 것</li><li>오늘은 안 만들어요</li></ul></div>
</div>
<div class="foot"><p class="note">오늘은 코드도 공동 저장소 내 폴더에 올려요. 12명이 한곳에 있어야 서로 끌어다 쓰니까요. 완성되면 개인 저장소로 옮겨요.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">그림 한 장</p><h2>오늘은 <mark>공동 저장소 내 폴더</mark>까지, 완성 후에 인터넷 주소</h2>
<div class="flowbox">
<div class="n"><b>내 컴퓨터</b><span>AI와 함께 만든다</span></div><div class="a">push<br>올리기 →</div>
<div class="n hi"><b>공동 저장소 · 내 폴더 · v1/앱</b><span>12명이 한곳에 · 서로 pull해서 본다</span></div>
</div>
<div class="flowbox" style="margin-top:34px"><div class="a">↓ 다 완성되면 (10/17 이후)</div></div>
<div class="flowbox" style="margin-top:10px">
<div class="n"><b>내 개인 저장소</b><span>복사해서 옮김 · 공개</span></div><div class="a">자동으로<br>읽음 →</div>
<div class="n"><b>Vercel</b><span>인터넷 주소<br>누구나 폰으로</span></div>
</div>
<div class="foot"><p class="note">오늘 할 건 위 줄만. 아래 줄은 10/17 이후에 03 폴더 문서 보고 합니다.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">기억할 말 네 개</p><h2>금고 비유로 <mark>네 단어</mark>만</h2>
<table class="table"><colgroup><col style="width:22%"><col style="width:40%"><col style="width:38%"></colgroup>
<tr><th>말</th><th>쉬운 뜻</th><th>언제</th></tr>
<tr><td>Clone (클론)</td><td>금고에서 프로젝트를 <b>처음 한 번</b> 복사해 오기</td><td>새 컴퓨터에서 처음</td></tr>
<tr class="hi"><td>Pull (풀)</td><td>금고의 <b>최신 내용 받아오기</b></td><td>작업 시작할 때</td></tr>
<tr><td>Commit (커밋)</td><td>고친 내용에 <b>메모 붙여 저장</b>하기</td><td>작업 끝낼 때</td></tr>
<tr class="hi"><td>Push (푸시)</td><td>저장한 걸 <b>금고에 올리기</b></td><td>Commit 바로 다음</td></tr>
</table>
<div class="foot"><p class="note">Commit만 하면 내 컴퓨터에만 저장돼요. Push까지 해야 금고에 들어갑니다.</p></div>"""))
d1.append(S("sec", """<p class="eyebrow">이 한 줄만</p>
<h2>시작할 때 <span class="y">Pull</span>,<br>끝낼 때 <span class="y">Commit + Push</span></h2>
<p class="lead">새 컴퓨터면 처음 한 번만 Clone.<br>가게에서 Push → 집에서 Pull → 집에서 Push → 다음 날 가게에서 Pull. 이게 한 바퀴예요.</p>"""))
d1.append(S("", """<p class="eyebrow">직접 안 쳐도 돼요</p><h2>명령어 대신 <span class="y">AI에게 말</span>로 시켜요</h2>
<div class="prompt"><span class="w">처음 가져올 때</span>이 GitHub 저장소를 내 컴퓨터에 처음 가져와 줘. 주소는 https://github.com/selfishclub/baemin-ops-os-camp 야.</div>
<div class="prompt"><span class="w">작업 시작할 때</span>이 프로젝트에 아직 저장 안 한 수정이 있는지 먼저 확인해 줘. 없으면 GitHub의 최신 내용을 pull해 줘.</div>
<div class="prompt"><span class="w">작업 끝낼 때</span>오늘 바꾼 내용을 확인하고, 비밀번호나 API 키가 들어가지 않았는지 본 다음, 커밋하고 GitHub에 push해 줘.</div>
<div class="foot"><p class="note">이 문장들은 저장소의 「AI에게 말하기 프롬프트」 문서에 다 있어요. 복사해서 붙여넣으면 됩니다.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">오늘 실습 ①</p><h2>우리 가게 소개 올리기 — <mark>웹에서 3분</mark></h2>
<div class="steps">
<div><p class="k">STEP 1</p><p class="t">링크 누르기</p><p class="d">카톡에 올린 링크를 누르면 네 줄 양식이 미리 채워진 화면이 열려요. 설치 없음.</p></div>
<div><p class="k">STEP 2</p><p class="t">파일 이름 바꾸기</p><p class="d"><b>가게이름_이름.md</b>. 예) 부찌대학_이범례.md. 끝의 .md는 그대로.</p></div>
<div class="hi"><p class="k">STEP 3</p><p class="t">네 줄 채우기</p><p class="d">가게 이름 · 자랑 · 오늘 만들고 싶은 것 · 왜. 짧게 써도 돼요.</p></div>
<div><p class="k">STEP 4</p><p class="t">초록 버튼 두 번</p><p class="d">Commit changes… → 설명에 "우리 가게 소개 추가" → Commit changes. 끝.</p></div>
</div>
<div class="foot"><p class="note">웹에서 저장했으니 이미 GitHub에 올라간 거예요. 방금 하신 게 Commit + Push입니다.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">오늘 실습 ②</p><h2>AI에게 시켜서 <mark>내 폴더에 PRD 넣고 올리기</mark></h2>
<div class="steps">
<div><p class="k">1 · Clone</p><p class="t">저장소 받기</p><p class="d">"이 저장소를 내 컴퓨터에 처음 가져와 줘"</p></div>
<div><p class="k">2 · 내 폴더</p><p class="t">02 폴더 안 내 이름</p><p class="d">"내 폴더 1조_이범례_부찌대학 열어 줘". PRD_전체.md와 v1·v2 양식이 이미 있어요.</p></div>
<div class="hi"><p class="k">3 · PRD</p><p class="t">전체 → v1·v2</p><p class="d">AI와 인터뷰하며 PRD_전체를 먼저 채우고, 오늘 만들 것은 v1, 나머지는 v2 초안으로 나눠요.</p></div>
<div><p class="k">4 · Push</p><p class="t">올리기</p><p class="d">"내 폴더만 바뀌었는지 보고, 비밀 없는지 확인하고 커밋·push해 줘"</p></div>
</div>
<div class="foot"><p class="note">GitHub 웹에서 내 폴더를 열어 PRD_전체.md와 v1/PRD.md가 채워져 있으면 완료. 옆 사장님 것도 보여요. 그게 "같이 본다"예요.</p></div>"""))
d1.append(S("", """<p class="eyebrow">규칙</p><h2>지킬 것 <span class="y">세 가지</span>뿐이에요</h2>
<div class="split">
<div><p class="head"><strong>이렇게 해요</strong></p><ul>
<li><b>내 폴더만</b> 고쳐요. 남의 폴더는 보기만</li><li>끝낼 때 <b>push까지</b> 하고 GitHub에서 확인해요</li><li>막히면 <b>오류 메시지를 그대로 AI에게</b> 붙여넣어요</li><li>그래도 안 되면 <b>운영진을 불러요</b></li></ul></div>
<div class="never"><p class="head"><strong>절대 안 해요</strong></p><ul>
<li>비밀번호 · API 키 · 로그인 파일 올리기</li><li>직원 · 손님 실명, 실제 매출 파일 올리기</li><li>"강제로 올려 줘(force push)" — 남의 작업이 지워져요</li><li>다른 사장님 파일 고치기</li></ul></div>
</div>
<div class="foot"><p class="note">이 저장소에서 되돌릴 수 없는 일은 거의 없어요. 기록이 남는 게 GitHub의 존재 이유니까요. 딱 하나, 비밀만 조심하세요.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">사례 · 이범례 사장님 (부찌대학)</p><h2>「리뷰 원터치」는 <mark>있는 걸 받아서</mark> 시작했어요</h2>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div><p class="k">무엇</p><p class="t">배민 · 쿠팡이츠 · 네이버 리뷰를 한곳에, 답글 초안은 사장님 말투로</p><p class="d">밤에는 프로그램이 모으고, 아침에는 사장님이 확인하고 누르기만.</p></div>
<div><p class="k">어떻게 시작했나</p><p class="t">GitHub에 있는 스타터 키트를 받아 내 가게에 맞게</p><p class="d">뼈대 + 안전장치 + AI에게 시킬 순서. 처음부터 만들지 않았어요.</p></div>
<div class="on-acid"><p class="k">GitHub 덕분에</p><p class="t">남이 만든 뼈대를 내 것으로, 내 것을 또 남에게</p><p class="d">github.com/selfishclub/review-onetouch-starter — 리뷰 관리를 만들 분은 여기서 시작하세요.</p></div>
</div>
<div class="foot"><p class="note">이어서 이범례 사장님이 직접 발표합니다. 여러분 것도 이렇게 될 수 있어요.</p></div>"""))
d1.append(S("light", """<p class="eyebrow">제출 구조</p><h2>내 폴더 안에 <mark>v1 / v2</mark></h2>
<table class="table"><colgroup><col style="width:18%"><col style="width:41%"><col style="width:41%"></colgroup>
<tr><th></th><th>v1</th><th>v2</th></tr>
<tr><td>언제</td><td><b>오늘 9/17</b> 안</td><td><b>10/17(금)</b>까지 · 10/2 온라인 중간 점검</td></tr>
<tr><td>범위</td><td>오늘 안에 되는 것만. 외부 연결 없이</td><td>API · 배민 데이터 · 날씨 등 외부 데이터, 고도화</td></tr>
<tr class="hi"><td>제출물</td><td>PRD_전체 + v1 PRD + v2 PRD 초안 + <b>v1/앱(코드)</b> + 제출서 + 스크린샷</td><td>v2 PRD(사용메모로 고친 것) + <b>v2/앱</b> + 제출서 + 스크린샷</td></tr>
<tr><td>코드는</td><td>공동 저장소 내 폴더 <b>v1/앱/</b></td><td>내 폴더 v2/앱/ · 완성 후 개인 저장소로 옮김</td></tr>
</table>
<div class="foot"><p class="note">전체 PRD에서 [v2]를 붙인 게 v2의 시작점이에요. v1을 써 보고 사용메모에 적으면, 10/2 점검 때 v2를 고쳐요.</p></div>"""))
d1.append(S("sec", """<p class="eyebrow">정리하면</p>
<h2>사장님이 바뀌는 건 딱 하나,<br><span class="y">"끝낼 때 push"</span></h2>
<p class="lead">안 잃어버리고, 집에서 이어 만들고, 되돌릴 수 있고, 서로 봐요.<br>명령어는 AI가 치고, 사장님은 <b>말로 시키고 GitHub에서 확인</b>만 하면 됩니다.</p>"""))
d1.append(S("cover", """<p class="eyebrow">지금 바로</p><h1>실습 ①<br><span class="y">우리 가게 소개</span> 올리기</h1>
<p class="by">카톡에 올린 링크를 누르세요 · 3분<br><span style="font-size:28px">막히면 손 드세요. 운영진이 갑니다.</span></p>"""))

# ---------------- 발표 02 ----------------
d2 = []
d2.append(S("cover", """<p class="eyebrow">실전 캠프 Day 2 · 실습 ②</p><h1>제출은 <span class="y">어디에, 무엇을</span></h1><p class="by">v1은 오늘, v2는 10월 17일</p>""", on=True))
d2.append(S("light", """<p class="eyebrow">제출하는 곳</p><h2>02 폴더 안에 <mark>내 이름 폴더</mark>가 있어요</h2>
<div class="prompt" style="font-family:var(--mono);font-size:28px;line-height:1.7">02_실전캠프_Day2_실습제출/<br>├── 1조_유승균_마선생얼큰국밥/<br>├── 1조_이범례_부찌대학/<br>│&nbsp;&nbsp;&nbsp;├── README.md&nbsp;&nbsp;&nbsp;← 내 체크리스트<br>│&nbsp;&nbsp;&nbsp;├── PRD_전체.md&nbsp;← 전체 기획안 (먼저)<br>│&nbsp;&nbsp;&nbsp;├── 중간점검_1002.md<br>│&nbsp;&nbsp;&nbsp;├── v1/&nbsp;&nbsp;PRD.md · 제출서.md · 사용메모.md · 결과물/ · <b>앱/</b> ← 코드<br>│&nbsp;&nbsp;&nbsp;└── v2/&nbsp;&nbsp;PRD.md · 제출서.md · 결과물/ · <b>앱/</b><br>├── 2조_양진서_빈숲카페/<br>└── … 12명</div>
<div class="foot"><p class="note">폴더와 빈 양식은 운영진이 미리 만들어 뒀어요. 사장님은 채우기만 하면 됩니다. 내 폴더만 고쳐요.</p></div>"""))
d2.append(S("", """<p class="eyebrow">무엇을 제출하나</p><h2>다섯 가지 — <span class="y">코드도 여기에</span></h2>
<div class="cards" style="grid-template-columns:repeat(5,1fr)">
<div><p class="k">① PRD_전체.md</p><p class="t">전체 기획안</p><p class="d">다 만들었을 때의 모습. 기능마다 [v1]·[v2]·[나중].</p></div>
<div><p class="k">② v1/PRD.md</p><p class="t">오늘 만들 것</p><p class="d">전체에서 [v1]만. v2/PRD.md는 초안으로.</p></div>
<div class="on-acid"><p class="k">③ v1/앱/</p><p class="t">만든 코드</p><p class="d">내 폴더 안 v1/앱에 만들고 그대로 push. git init은 안 해요.</p></div>
<div><p class="k">④ 제출서.md</p><p class="t">실행 방법</p><p class="d">도구 이름, 실행 방법 세 줄, 스크린샷 파일명.</p></div>
<div><p class="k">⑤ 결과물/</p><p class="t">스크린샷</p><p class="d">화면 사진 1~3장. 폰으로 찍어도 돼요.</p></div>
</div>
<div class="foot"><p class="note">코드가 한곳에 모이니까 다른 사장님 앱을 열어 보고 끌어다 쓸 수 있어요. 완성되면(10/17 이후) 각자 개인 저장소로 옮겨요.</p></div>"""))
d2.append(S("light", """<p class="eyebrow">v1과 v2</p><h2>오늘은 <mark>v1</mark>, 한 달 뒤 <mark>v2</mark></h2>
<table class="table"><colgroup><col style="width:18%"><col style="width:41%"><col style="width:41%"></colgroup>
<tr><th></th><th>v1</th><th>v2</th></tr>
<tr><td>언제</td><td><b>오늘</b> 안</td><td><b>10/17</b> · 10/2 온라인 점검</td></tr>
<tr class="hi"><td>범위</td><td>오늘 안에 되는 것만. 외부 연결 없이. 화면 + 저장까지</td><td>API, 배민 데이터, 날씨, 카톡 알림 같은 외부 데이터·고도화</td></tr>
<tr><td>예</td><td>근무표 입력 → 주급 계산 → 저장</td><td>배민 매출 자동 불러오기, 날씨 API로 준비량 추천</td></tr>
<tr><td>어디</td><td>내폴더/v1/ · 코드는 v1/앱/</td><td>내폴더/v2/ · 코드는 v2/앱/ (v1/앱 복사해 이어 만듦)</td></tr>
</table>
<div class="foot"><p class="note">범위가 크면 AI에게 "PRD_전체에서 오늘 되는 것만 [v1]으로 남기고 나머지는 [v2]로 옮겨 줘"라고 하세요.</p></div>"""))
d2.append(S("", """<p class="eyebrow">실습 ② 순서</p><h2>AI에게 <span class="y">다섯 마디</span></h2>
<div class="prompt"><span class="w">1 · 받기</span>https://github.com/selfishclub/baemin-ops-os-camp 저장소를 내 컴퓨터에 처음 가져와 줘. 홈 폴더 아래에.</div>
<div class="prompt"><span class="w">2 · 내 폴더</span>02_실전캠프_Day2_실습제출 안의 내 폴더 [1조_이범례_부찌대학]을 열어 줘.</div>
<div class="prompt"><span class="w">3 · PRD</span>PRD_전체.md를 나와 인터뷰하면서 채우고, [v1]은 v1/PRD.md에, [v2]는 v2/PRD.md 초안으로 나눠 줘. (사전 과제 PRD가 있으면 먼저 붙여넣기) (없으면: 내 힘든 일은 ○○야. 양식대로 써 줘)</div>
<div class="prompt"><span class="w">4 · 올리기</span>내 폴더만 바뀌었는지 확인하고, 비밀 없는지 본 다음 "전체 PRD·v1 PRD 작성"으로 커밋하고 push해 줘.</div>
<div class="prompt"><span class="w">5 · 확인</span>GitHub 웹에서 내 폴더 → PRD_전체.md와 v1/PRD.md가 채워져 있으면 완료.</div>"""))
d2.append(S("light", """<p class="eyebrow">시간이 남으면</p><h2>같은 조 사장님 PRD를 <mark>AI에게 읽혀요</mark></h2>
<div class="prompt"><span class="w">프롬프트</span>02_실전캠프_Day2_실습제출 폴더에서 2조 사장님들 PRD를 읽고, 내 PRD에 빠진 것이나 참고할 점을 알려 줘.</div>
<p class="lead">같은 주제를 각자 만들고 서로 보는 게 이 캠프의 방식이에요.<br>좋은 건 가져오고, 내 것은 남에게 보여 줘요. GitHub이 그걸 가능하게 해요.</p>"""))
d2.append(S("cover", """<p class="eyebrow">실습 ②</p><h1>실습 ② <span class="y">시작</span></h1><p class="by">막히면 손 드세요 · 오류 메시지는 그대로 AI에게<br><span style="font-size:28px">끝나면 02 폴더 제출 현황표를 같이 봅니다</span></p>"""))

# ---------------- 발표 03 ----------------
d3 = []
d3.append(S("cover", """<p class="eyebrow">실전 캠프 Day 2 · v1 만들기</p><h1>내 폴더에 만들고,<br><span class="y">같이</span> 봐요</h1><p class="by">전체 PRD → v1 구현 → 내 폴더 v1/앱에 push<br><span style="font-size:28px">인터넷 주소는 완성 후에</span></p>""", on=True))
d3.append(S("light", """<p class="eyebrow">오늘 목표</p><h2>여기까지가 <mark>오늘</mark>이에요</h2>
<div class="steps">
<div><p class="k">1</p><p class="t">전체 PRD</p><p class="d">baemin-ops-prd 스킬로 인터뷰. 다 만들었을 때의 모습.</p></div>
<div><p class="k">2</p><p class="t">v1 · v2로 나누기</p><p class="d">오늘 되는 건 v1/PRD.md, 나머지는 v2/PRD.md 초안.</p></div>
<div class="hi"><p class="k">3</p><p class="t">v1 만들기</p><p class="d">내 폴더 v1/앱 안에. 외부 연결 없이, 가짜 데이터로.</p></div>
<div><p class="k">4</p><p class="t">push · 제출서</p><p class="d">한 기능 될 때마다 push. 제출서에 실행 방법과 스크린샷.</p></div>
</div>
<div class="foot"><p class="note">개인 저장소·Vercel 인터넷 주소는 오늘 안 해요. 10/17 다 만든 뒤에.</p></div>"""))
d3.append(S("", """<p class="eyebrow">제일 중요한 것</p><h2>앱은 <span class="y">내 폴더 v1/앱</span> 안에 만들어요</h2>
<div class="prompt"><span class="w">AI에게 · 시작할 때</span>v1/PRD.md를 읽고 v1 범위만 만들어 줘. <b>02_실전캠프_Day2_실습제출/[내폴더]/v1/앱 폴더 안에</b> 만들어. 이 폴더는 이미 GitHub 저장소 안이니 <b>git init은 하지 마.</b></div>
<div class="split" style="margin-top:36px">
<div><p class="head"><strong>이렇게 돼요</strong></p><ul>
<li>내 폴더 안에 <b>앱/</b>이 생기고 그 안에 코드</li><li>node_modules · .env는 <b>자동으로 빠져요</b> (.gitignore)</li><li>사장님마다 package.json이 있어도 폴더가 달라서 안 부딪혀요</li></ul></div>
<div class="never"><p class="head"><strong>이러면 꼬여요</strong></p><ul>
<li>내 폴더 안에서 <b>git init</b> — 저장소 안의 저장소</li><li>저장소 맨 위(루트)에 파일 만들기</li><li>남의 폴더에 파일 만들기</li></ul></div>
</div>
<div class="foot"><p class="note">꼬였으면 AI에게 "방금 만든 .git 폴더 지워 줘" 또는 "내 폴더 밖에 만든 파일을 v1/앱으로 옮겨 줘". 운영진도 불러요.</p></div>"""))
d3.append(S("light", """<p class="eyebrow">같이 만들기</p><h2>자주 pull, 자주 push — <mark>서로 끌어다 써요</mark></h2>
<div class="cards" style="grid-template-columns:repeat(3,1fr)">
<div><p class="k">시작할 때</p><p class="t">pull</p><p class="d">"GitHub 최신 내용 pull해 줘." 다른 사장님이 올린 앱이 내 컴퓨터에 들어와요.</p></div>
<div class="on-acid"><p class="k">한 기능 될 때마다</p><p class="t">push</p><p class="d">"지금까지 된 것 커밋하고 push해 줘." 30분에 한 번은 올려요. 컴퓨터가 꺼져도 안 잃어요.</p></div>
<div><p class="k">남의 것 볼 때</p><p class="t">읽고 복사만</p><p class="d">"[2조_양진서_빈숲카페]/v1/앱을 읽고 메뉴 카드 화면을 내 앱에 맞게 가져와 줘. 그 폴더는 고치지 마."</p></div>
</div>
<div class="foot"><p class="note">같은 조가 같은 주제를 만들어요. 옆 사장님이 먼저 만든 화면을 가져오면 30분이 줄어요. 그러라고 한곳에 모은 거예요.</p></div>"""))
d3.append(S("", """<p class="eyebrow">열쇠 이야기</p><h2>공개 저장소예요 — <span class="y">절대 안 되는 열쇠</span></h2>
<div class="split">
<div><p class="head"><strong>올라가도 돼요</strong></p><ul>
<li>코드 전부</li><li>시연용 <b>가짜 데이터</b></li><li>Supabase <b>Project URL</b>과 <b>anon</b> 키 — 단, 환경변수(.env.local)에만. 어차피 자동으로 빠져요</li></ul></div>
<div class="never"><p class="head"><strong>절대 안 돼요</strong><span>공개 저장소라 전 세계가 봐요</span></p><ul>
<li>Supabase <b>service_role</b> 키 · DB 비밀번호</li><li><b>.env</b> 파일 자체 · 로그인 세션 파일</li><li>실제 직원 · 손님 이름, 연락처, 실제 매출 파일</li></ul></div>
</div>
<div class="foot"><p class="note">push 전에 AI에게 "키 들어간 파일 없는지 확인해 줘". 실수로 올렸으면 파일 삭제가 아니라 키 재발급이에요. 운영진에게 바로 알려요.</p></div>"""))
d3.append(S("light", """<p class="eyebrow">제출 전</p><h2>네 개만 <mark>확인</mark></h2>
<table class="table"><colgroup><col style="width:8%"><col style="width:46%"><col style="width:46%"></colgroup>
<tr><th>#</th><th>확인</th><th>방법</th></tr>
<tr class="hi"><td>1</td><td>코드가 내 폴더 v1/앱 안에 있나</td><td>GitHub 웹에서 내 폴더 → v1 → 앱 열어 보기</td></tr>
<tr><td>2</td><td>.env · 키 · node_modules가 안 올라갔나</td><td>앱 폴더 파일 목록에 없음</td></tr>
<tr><td>3</td><td>제출서에 실행 방법과 스크린샷</td><td>v1/제출서.md · v1/결과물/</td></tr>
<tr class="hi"><td>4</td><td>push 했나</td><td>GitHub 웹에서 보이면 끝</td></tr>
</table>
<div class="foot"><p class="note">제출서 맨 아래에 이 네 칸이 있어요. AI에게 "제출서 채우고 네 개 확인하고 v1 제출로 커밋·push해 줘".</p></div>"""))
d3.append(S("light", """<p class="eyebrow">완성 후 · 10/17 이후</p><h2>다 만들면 <mark>개인 저장소</mark>로 옮기고 인터넷 주소</h2>
<div class="steps">
<div><p class="k">0</p><p class="t">복사해서 옮기기</p><p class="d">내 폴더 v2/앱을 새 폴더로 복사. 공동 저장소 쪽은 기록으로 남겨요.</p></div>
<div><p class="k">1</p><p class="t">내 GitHub 저장소</p><p class="d">복사본을 내 계정에 Public으로. 캠프 끝나도 내 것.</p></div>
<div><p class="k">2</p><p class="t">Supabase</p><p class="d">저장이 필요한 앱만. 열쇠는 환경변수에.</p></div>
<div class="hi"><p class="k">3</p><p class="t">Vercel</p><p class="d">저장소 하나 = 사이트 하나. 직원 폰에서 열리는 주소.</p></div>
</div>
<div class="foot"><p class="note">왜 나중에? 만드는 동안은 한곳이 편하고, Vercel은 저장소 하나에 사이트 하나라서요. 순서는 03 폴더 문서에 다 있어요.</p></div>"""))
d3.append(S("cover", """<p class="eyebrow">미니 해커톤</p><h1>각자 <span class="y">v1</span> 만들기</h1><p class="by">내 폴더 v1/앱 안에 · git init 없이 · 30분마다 push<br><span style="font-size:28px">막히면 오류 메시지 그대로 AI에게, 그다음 운영진</span></p>"""))

DECKS = [
 ("01_GitHub_왜쓰고_어떻게쓰나", "GitHub, 왜 쓰고 어떻게 쓰나 — 실전 캠프 Day 2", d1),
 ("02_실습제출과_v1v2", "제출은 어디에 무엇을 — 실전 캠프 Day 2", d2),
 ("03_v1만들기_내폴더에_같이", "v1 만들기, 내 폴더에 같이 — 실전 캠프 Day 2", d3),
]
os.makedirs(OUT, exist_ok=True)
for fn, title, slides in DECKS:
    open(f"{OUT}/{fn}.html","w").write(page(title, slides, True))
    if SCRATCH:
        os.makedirs(SCRATCH, exist_ok=True)
        open(f"{SCRATCH}/{fn}.html","w").write(page(title, slides, False))
    print(fn, len(slides), "slides")
