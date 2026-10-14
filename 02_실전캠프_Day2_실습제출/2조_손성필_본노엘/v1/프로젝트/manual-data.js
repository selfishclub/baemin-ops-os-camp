// 매뉴얼북 체험판 데이터 — 가게·직원·매뉴얼 전부 가짜예요.
(function(){
  var DAY = 86400000, now = Date.now();
  function pad(n){ return String(n).padStart(2, '0'); }
  function ds(t){ var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ago(n){ return new Date(now - n * DAY).toISOString(); }
  function svg(label, bg){ return 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" rx="18" fill="' + bg + '"/><text x="50%" y="52%" font-family="sans-serif" font-size="26" fill="#5a4630" text-anchor="middle" dominant-baseline="middle">' + label + '</text></svg>'); }

  var branches = [ {id:'b1',name:'1호점',sort_order:1}, {id:'b2',name:'2호점',sort_order:2}, {id:'b3',name:'3호점',sort_order:3}, {id:'b4',name:'4호점',sort_order:4} ];
  var staff = [
    {id:'s1',name:'알바 A',branch_id:'b1',hire_on:ds(now - 40*DAY),created_at:ago(40),active:true},
    {id:'s2',name:'알바 B',branch_id:'b1',hire_on:ds(now - 3*DAY),created_at:ago(3),active:true},
    {id:'s3',name:'알바 C',branch_id:'b2',hire_on:ds(now - 12*DAY),created_at:ago(12),active:true},
    {id:'s4',name:'알바 D',branch_id:'b3',hire_on:ds(now - 200*DAY),created_at:ago(200),active:true},
    {id:'s5',name:'알바 E',branch_id:'b4',hire_on:ds(now - 9*DAY),created_at:ago(9),active:true},
    {id:'s6',name:'매니저 김',branch_id:'b1',hire_on:ds(now - 700*DAY),created_at:ago(700),active:true}
  ];
  var categories = [ {id:'c1',name:'포장',sort_order:0}, {id:'c2',name:'매장 청결',sort_order:1}, {id:'c3',name:'계산·응대',sort_order:2}, {id:'c4',name:'빵 진열',sort_order:3}, {id:'c5',name:'마감',sort_order:4} ];
  var supplies = [
    {id:'p1',name:'크라프트 봉투',photo_path:null,photo_url:svg('크라프트 봉투','#E9D9BE'),sort_order:0,created_at:ago(60)},
    {id:'p2',name:'케이크 상자(소)',photo_path:null,photo_url:svg('케이크 상자','#F7E6CC'),sort_order:1,created_at:ago(60)},
    {id:'p3',name:'테이크아웃 홀더',photo_path:null,photo_url:svg('컵 홀더','#F3EBDD'),sort_order:2,created_at:ago(60)}
  ];
  function m(id, cat, title, steps, tags, req, extra){ return Object.assign({ id:id, category_id:cat, title:title, steps:steps, tags:tags, is_required:!!req, photos:[], supply_ids:[], youtube_url:'', quiz_required:false, created_at:ago(30 + Number(id.slice(1))), updated_at:ago(5) }, extra || {}); }
  var manuals = [
    m('m1','c1','빵 봉투 포장하는 방법',['손을 씻고 위생 장갑을 낀다.','빵을 집게로 집어 봉투 입구에서 2cm 띄워 넣는다.','봉투 입구를 두 번 접고 로고 스티커로 고정한다.','따뜻한 빵은 식힌 뒤 포장한다 (김이 차면 눅눅해져요).'],['포장','봉투','스티커'],true,{supply_ids:['p1'],quiz_required:true,photos:[{path:null,url:svg('봉투 포장 예시','#E9D9BE')}]}),
    m('m2','c1','케이크 상자 접기',['상자를 펼쳐 바닥 네 모서리를 안으로 접는다.','옆면을 세우고 양쪽 날개를 홈에 끼운다.','케이크 받침을 가운데 놓고 상자에 넣는다.','뚜껑을 덮고 리본은 손님이 원할 때만 묶는다.'],['포장','케이크','상자'],true,{supply_ids:['p2']}),
    m('m3','c1','테이크아웃 음료 담기',['컵 홀더를 먼저 끼운다.','뚜껑이 딸깍 소리 날 때까지 눌러 닫는다.','빨대는 봉지째 드린다.'],['음료','테이크아웃'],false,{supply_ids:['p3']}),
    m('m4','c2','오픈 전 매장 청소 순서',['진열대 유리를 마른 걸레로 닦는다.','바닥을 쓸고 입구 매트를 턴다.','쇼케이스 온도를 확인하고 기록표에 적는다.','화장실 휴지·손세정제를 채운다.'],['청소','오픈'],true,{quiz_required:true}),
    m('m5','c3','계산할 때 꼭 확인할 것',['빵 개수를 손님과 같이 센다.','포인트 적립 여부를 먼저 묻는다.','영수증은 "필요하세요?"라고 묻고 드린다.','카드 결제 후 카드를 두 손으로 돌려 드린다.'],['계산','포스','응대'],true),
    m('m6','c3','손님이 빵에 대해 물어볼 때',['모르는 건 추측하지 말고 "확인해 드릴게요"라고 말한다.','알레르기 질문은 매니저에게 바로 넘긴다.','오늘 나온 시간은 진열 카드 뒷면을 본다.'],['응대','알레르기'],false),
    m('m7','c4','빵 진열 기본 규칙',['갓 나온 빵은 뒤쪽, 먼저 나온 빵은 앞쪽에 둔다.','가격표와 빵이 같은 줄에 오게 맞춘다.','빈 칸이 생기면 옆 빵을 옮겨 채운다.'],['진열','가격표'],true),
    m('m8','c5','마감 체크리스트',['남은 빵을 세어 마감 기록에 적는다.','쇼케이스 전원은 끄지 않는다.','커피 머신 세척 → 물통 비우기.','불·가스·문 잠금을 사진으로 남긴다.'],['마감','기록'],true,{quiz_required:true})
  ];
  var quiz = [
    {id:'q1',manual_id:'m1',type:'ox',question:'따뜻한 빵은 바로 봉투에 넣어도 된다.',options:[],answer_index:1,sort_order:0},
    {id:'q2',manual_id:'m1',type:'mc',question:'봉투 입구는 몇 번 접나요?',options:['한 번','두 번','세 번'],answer_index:1,sort_order:1},
    {id:'q3',manual_id:'m4',type:'ox',question:'쇼케이스 온도는 기록표에 적는다.',options:[],answer_index:0,sort_order:0},
    {id:'q4',manual_id:'m8',type:'mc',question:'마감 때 끄면 안 되는 것은?',options:['조명','쇼케이스','커피 머신'],answer_index:1,sort_order:0},
    {id:'q5',manual_id:'m8',type:'ox',question:'문 잠금은 사진으로 남긴다.',options:[],answer_index:0,sort_order:1}
  ];
  var confirmations = [];
  function c(mid, sid, d){ var s = staff.filter(function(x){ return x.id === sid; })[0]; confirmations.push({ id:'cf' + confirmations.length, manual_id:mid, staff_id:sid, staff_name:s.name, confirmed_at:ago(d), created_at:ago(d), quiz_tries:1 }); }
  ['m1','m2','m4','m5','m7','m8'].forEach(function(mid, i){ c(mid, 's1', 30 - i); c(mid, 's4', 180 - i); c(mid, 's6', 600 - i); });
  ['m1','m2','m4'].forEach(function(mid, i){ c(mid, 's3', 9 - i); });
  c('m1', 's2', 1);
  // 알바 E는 입사 9일째인데 필수 매뉴얼을 하나도 안 봄 → 관리자 화면에 빨간 배지가 뜨는 예시

  // 체험판 껍데기: 매뉴얼·퀴즈·포장 비품·카테고리·확인 기록 없음, 로그인용 직원 2명만
  staff = staff.filter(function(s){ return s.name === '알바 A' || s.name === '매니저 김'; });
  categories = []; supplies = []; manuals = []; quiz = []; confirmations = [];
  window.DEMO_MANUAL = { manual_branches: branches, manual_staff: staff, manual_categories: categories, manual_supplies: supplies, manuals: manuals, manual_quiz_questions: quiz, manual_confirmations: confirmations };
})();
