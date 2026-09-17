// 브랜드에서 오픈까지 — v1
// 저장은 이 브라우저 안(localStorage)에만 합니다. 서버로 보내지 않습니다.

const KEY = 'cafe-open-v1';
const EMPTY = { day:0, open:{0:1}, ans:{}, checks:{}, memo:{}, cost:{}, at:{} };
let st = load();

function load(){
  try{ const raw = localStorage.getItem(KEY);
       if(raw) return Object.assign({}, EMPTY, JSON.parse(raw)); }
  catch(e){ /* 저장소를 못 읽어도 앱은 돌아갑니다 */ }
  return JSON.parse(JSON.stringify(EMPTY));
}
let saveTimer=null;
function save(){
  clearTimeout(saveTimer);
  setSaved('저장 중…');
  saveTimer = setTimeout(()=>{
    try{ localStorage.setItem(KEY, JSON.stringify(st)); setSaved('저장됨'); }
    catch(e){ setSaved('저장 실패 — 브라우저 설정을 확인해 주세요'); }
  }, 400);
}
function setSaved(t){ const el=document.querySelector('#saved span'); if(el) el.textContent=t; }

const won = n => n.toLocaleString('ko-KR') + '원';
const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const today = () => { const d=new Date(); return (d.getMonth()+1)+'/'+d.getDate(); };

// 규칙 하나: 적을 게 있으면 다 적으면 끝, 할 일이면 체크하면 끝
const dayDone = (di,j) => {
  const it = DAYS[di].items[j];
  if(it.f) return it.f.every(f => (st.ans[f.k]||'').trim().length > 0);
  return !!st.checks['d'+di+'-'+j];
};
const listDone = (g,j) => !!st.checks[g+'-'+j];
const dCount = di => DAYS[di].items.filter((_,j)=>dayDone(di,j)).length;
const lCount = g => LIST[g].items.filter((_,j)=>listDone(g,j)).length;
const LTOT = LIST.reduce((n,g)=>n+g.items.length,0);

function renderJourney(){
  let h='';
  DAYS.forEach((d,i)=>{ h += '<div class="jseg" title="'+d.n+' '+dCount(i)+'/'+d.items.length+'"><i style="width:'+Math.round(dCount(i)/d.items.length*100)+'%"></i></div>'; });
  LIST.forEach((g,i)=>{ h += '<div class="jseg open" title="'+esc(g.name)+' '+lCount(i)+'/'+g.items.length+'"><i style="width:'+Math.round(lCount(i)/g.items.length*100)+'%"></i></div>'; });
  document.getElementById('jbar').innerHTML = h;
}

function renderTabs(){
  document.getElementById('tabs').innerHTML = DAYS.map((d,i)=>
    '<button class="tab d'+(i+1)+(st.day===i?' on':'')+'" data-d="'+i+'">'+d.n
    +'<span>'+esc(d.sub)+'</span><span class="cnt">'+dCount(i)+'/'+d.items.length+' 적음</span></button>').join('');
}

function renderDay(){
  const d = DAYS[st.day], done = dCount(st.day), p = Math.round(done/d.items.length*100);
  let base=0; for(let i=0;i<st.day;i++) base += DAYS[i].items.length;
  let h = '<div class="dayhead"><h3>'+d.n+' · '+esc(d.name)+'</h3><p>'+esc(d.sub)+' — 답을 다 적으면 그 항목이 완료됩니다</p>'
    + '<div class="dayprog"><span>'+done+'/'+d.items.length+' 적음</span><div class="track"><div class="fill" style="width:'+p+'%"></div></div><span>'+p+'%</span></div></div>';
  h += '<div class="stack">';
  d.items.forEach((it,j)=>{
    const k='d'+st.day+'-'+j, dn=dayDone(st.day,j);
    h += '<div class="card"><div class="item'+(dn?' done':'')+'">'
      + '<div class="mark'+(dn?' on':'')+(it.f?' auto':' hand')+'"'
      + (it.f ? ' title="답을 다 적으면 채워집니다"' : ' role="checkbox" tabindex="0" aria-checked="'+dn+'" data-dk="'+k+'"') + '>✓</div>'
      + '<div><div class="t"><span class="no">'+(base+j+1)+'</span>'+esc(it.t)+'</div>'
      + (it.h ? '<div class="hint">'+esc(it.h)+'</div>' : '')
      + (it.carry && st.ans[it.carry] ? '<div class="carry">앞에서 적은 것 → '+esc(st.ans[it.carry])+'</div>' : '');
    if(it.f) it.f.forEach((fl,m)=>{
      h += '<div class="fbox"><label for="a'+k+'-'+m+'">'+esc(fl.p)+'</label>'
        + (fl.help ? '<div class="fhelp">'+esc(fl.help)+'</div>' : '')
        + '<textarea id="a'+k+'-'+m+'" data-a="'+fl.k+'" rows="2">'+esc(st.ans[fl.k]||'')+'</textarea></div>';
    });
    h += '</div></div></div>';
  });
  h += '</div>';
  if(st.day === 2) h += '<div class="seam"><b>여기가 이음매입니다.</b> 위 "내일부터 할 세 가지"를 적으면 <b>왼쪽 체크리스트 첫 항목</b>에 그대로 뜹니다.</div>';
  document.getElementById('day').innerHTML = h;
}

function renderSide(){
  const done = LIST.reduce((n,_,i)=>n+lCount(i), 0);
  let h = '<h2>창업 준비 체크리스트 <b>'+done+'/'+LTOT+'</b></h2>'
    + '<div class="cap">브랜드를 정한 뒤 오픈까지. DAY 탭을 옮겨도 늘 여기 있습니다.</div>';
  LIST.forEach((g,i)=>{
    const o = st.open[i], gd = lCount(i);
    let sum=0; if(g.cost) g.items.forEach((_,j)=> sum += st.cost[i+'-'+j]||0);
    h += '<div class="grp"><button class="ghead" data-g="'+i+'" aria-expanded="'+(!!o)+'">'
      + '<span>'+(o?'▾':'▸')+' '+(i+4)+'. '+esc(g.name)+'</span>'
      + '<span class="c">'+(g.cost && sum ? won(sum) : gd+'/'+g.items.length)+'</span></button>';
    if(o){
      g.items.forEach((it,j)=>{
        const k=i+'-'+j, dn=listDone(i,j);
        h += '<div class="ck'+(dn?' done':'')+'">'
          + '<div class="mk'+(dn?' on':'')+'" role="checkbox" tabindex="0" aria-checked="'+dn+'" data-lk="'+k+'">✓</div><div>'
          + '<span class="lb">'+esc(it.t)+'</span>'
          + (it.s ? '<span class="sm">'+esc(it.s)+'</span>' : '')
          + (dn && st.at[k] ? '<span class="done-at">✓ '+esc(st.at[k])+'</span>' : '')
          + (it.carry && st.ans[it.carry] ? '<div class="carry">DAY 3에서 적은 것 → '+esc(st.ans[it.carry])+'</div>' : '')
          + '<input class="memo" data-m="'+k+'" placeholder="메모" value="'+esc(st.memo[k]||'')+'">'
          + (g.cost ? '<input class="cost" data-c="'+k+'" inputmode="numeric" placeholder="예상 비용" value="'+(st.cost[k]?st.cost[k].toLocaleString('ko-KR'):'')+'">' : '')
          + '</div></div>';
      });
      if(g.cost){
        const empty = g.items.filter((_,j)=>!st.cost[i+'-'+j]).length;
        h += '<div class="sumbox"><span>이 단계 합계</span><b>'+won(sum)+'</b></div>';
        if(empty) h += '<div class="warnbox">아직 안 적은 항목 '+empty+'개 — 여기서 빠지면 나중에 예산이 넘칩니다</div>';
      }
    }
    h += '</div>';
  });
  document.getElementById('side').innerHTML = h;
}

function render(){ renderJourney(); renderTabs(); renderDay(); renderSide(); bind(); }

function bind(){
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => { st.day = +b.dataset.d; save(); render(); });

  document.querySelectorAll('[data-a]').forEach(c => c.onchange = e => {
    st.ans[e.target.dataset.a] = e.target.value; save(); render();
  });

  const toggle = (k) => {
    if(st.checks[k]){ if(!confirm('완료를 취소할까요?')) return; st.checks[k]=0; delete st.at[k]; }
    else { st.checks[k]=1; st.at[k]=today(); }
    save(); render();
  };
  document.querySelectorAll('[data-dk]').forEach(c => {
    c.onclick = () => toggle(c.dataset.dk);
    c.onkeydown = e => { if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggle(c.dataset.dk); } };
  });
  document.querySelectorAll('[data-lk]').forEach(c => {
    c.onclick = () => toggle(c.dataset.lk);
    c.onkeydown = e => { if(e.key===' '||e.key==='Enter'){ e.preventDefault(); toggle(c.dataset.lk); } };
  });

  document.querySelectorAll('.ghead').forEach(b => b.onclick = () => {
    const g = b.dataset.g; st.open[g] = !st.open[g]; save(); renderSide(); bind();
  });

  document.querySelectorAll('[data-m]').forEach(c => c.onchange = e => {
    st.memo[e.target.dataset.m] = e.target.value; save();
  });

  document.querySelectorAll('[data-c]').forEach(c => c.onchange = e => {
    const k = e.target.dataset.c, v = e.target.value.replace(/,/g,'').trim();
    if(v !== '' && !/^\d+$/.test(v)){
      alert('숫자만 넣어 주세요');
      e.target.value = st.cost[k] ? st.cost[k].toLocaleString('ko-KR') : '';
      return;
    }
    if(v === '') delete st.cost[k]; else st.cost[k] = +v;
    save(); render();
  });
}

document.getElementById('btnFill').onclick = () => {
  if(!confirm('시연용 예시 답을 채울까요? 지금 적은 것은 덮어씁니다.')) return;
  st.ans = Object.assign({}, SAMPLE);
  st.cost = Object.assign({}, SAMPLE_COST);
  st.open = {0:1, 2:1};
  save(); render();
};
document.getElementById('btnClear').onclick = () => {
  if(!confirm('적은 것을 모두 지우고 처음부터 시작할까요? 되돌릴 수 없습니다.')) return;
  st = JSON.parse(JSON.stringify(EMPTY));
  save(); render();
};

render();
