/* 저장소 — IndexedDB 우선, 불가하면 localStorage로 자동 대체.
   매장(안산점/안양점)마다 상태 문서를 따로 보관한다: state:<매장id>
   'meta' 문서가 매장 목록과 현재 선택을 기억한다. */

const Store = (() => {
  const DB_NAME = window.HM_DEMO ? 'haemonic-demo' : 'haemonic';   // 데모판(demo.js)은 실제 기록과 섞이지 않게 저장소를 따로 쓴다
  const STORE = 'kv';
  const LSP = 'haemonic:';

  let db = null;
  let mode = 'idb';
  let writable = false;
  let meta = null;
  let curKey = null;

  /* 클라우드 동기화 — claude.ai 아티팩트 안에서 열렸을 때만 켜진다.
     PC·휴대폰이 같은 문서를 보게 되고, 한쪽에서 체크하면 다른 쪽도 곧 따라온다.
     매장 상태는 본문(kv/state:매장) + 월별 날짜 조각(kv/state:매장/days/YYYY-MM)으로
     쪼개 올린다 — 문서 하나 256KB 제한 때문에 날짜 기록을 통째로 넣을 수 없다.
     'meta'(지금 보는 매장)는 기기마다 다른 게 맞으므로 올리지 않는다. */
  let cloud = null;            // db 네임스페이스 (claude.ai 아티팩트)
  /* Supabase 서버 — v2. 설정 › 서버 연결에 주소·anon 키를 붙여넣고 매장 공용 계정으로 로그인하면 켜진다.
     문서 하나를 표 docs 의 한 줄(key, doc jsonb, saved_at)로 통째로 저장한다 — 256KB 제한이 없어 조각내지 않는다. */
  const SUPA_KEY = 'hm.supa';
  let supa = null;             // { client, url, email } 로그인까지 된 상태
  let supaCfg = null;          // { url, key } 저장된 설정 (로그인 전에도 있음)
  const cloudOn = () => !!(supa || cloud);
  let cloudErr = null;         // 마지막 클라우드 오류 코드
  let remoteCb = null;         // 다른 기기에서 바뀌었을 때 앱에 알린다
  const lastUp = {};           // key -> 우리가 마지막으로 올린 savedAt (내 쓰기 되돌아오는 것 무시용)
  const monthSig = {};         // key -> { 'YYYY-MM': 올린 JSON } 바뀐 달만 다시 올린다
  let unsubs = [];
  const CLOUD_KEYS = (k) => k !== 'meta' && k !== 'state';

  function openDB() {
    return new Promise((resolve) => {
      let req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      setTimeout(() => resolve(req.readyState === 'done' ? req.result : null), 2500);
    });
  }

  function idbGet(k) {
    return new Promise((resolve) => {
      try {
        const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  function idbSet(k, v) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(v, k);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function lsGet(k) {
    try { const raw = localStorage.getItem(LSP + k); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  /* 양쪽을 다 읽어 최신본을 고른다 — 저장 방식이 오간 날에도 기록이 사라져 보이지 않게 */
  async function localGet(k) {
    const a = db ? await idbGet(k) : null;
    const b = lsGet(k);
    if (a && b) return (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
    return a || b;
  }

  async function localPut(k, v) {
    let done = false;
    if (mode === 'idb') done = await idbSet(k, v);
    if (!done) {
      try { localStorage.setItem(LSP + k, JSON.stringify(v)); done = true; }
      catch (e) { console.error('저장 실패', k, e); }
    }
    if (!done && writable) { writable = false; document.dispatchEvent(new Event('storage-broken')); }
    return done;
  }

  /* ── 클라우드 읽기/쓰기 ── */
  function cloudFail(e) {
    cloudErr = (e && e.code) || 'unavailable';
    console.error('클라우드 저장 실패', e);
    document.dispatchEvent(new Event('cloud-status'));
  }

  /* 첨부 파일·서명 이미지처럼 큰 데이터(blobs)는 본문과 따로 조각(≤180KB)으로 올린다.
     본문(contracts)에는 {id, chunks} 참조만 남는다 — 문서 하나 256KB 제한 때문.
     이미 받아둔 것(known)은 다시 내려받지 않는다. */
  const BLOB_CHUNK = 180 * 1024;
  const blobSig = {};              // key -> { blobId: chunks } 클라우드에 올라가 있다고 아는 것
  function blobRefs(doc) {
    const out = [];
    if (doc.settings && doc.settings.seal && doc.settings.seal.id) out.push({ id: doc.settings.seal.id, chunks: doc.settings.seal.chunks || 1 });
    (doc.contracts || []).forEach((c) => {
      (c.files || []).forEach((f) => { if (f && f.id) out.push({ id: f.id, chunks: f.chunks || 1 }); });
      Object.values(c.sig || {}).forEach((sg) => { if (sg && sg.img && sg.img.id) out.push({ id: sg.img.id, chunks: sg.img.chunks || 1 }); });
    });
    return out;
  }

  async function cloudGet(k, known) {
    if (supa) {
      try {
        const { data, error } = await supa.client.from('docs').select('doc, saved_at').eq('key', k).maybeSingle();
        if (error) throw error;
        if (!data || !data.doc) return null;
        const doc = data.doc; if (doc.savedAt == null) doc.savedAt = Number(data.saved_at) || 0;
        if (cloudErr) { cloudErr = null; document.dispatchEvent(new Event('cloud-status')); }
        return doc;
      } catch (e) { cloudFail(e); return null; }
    }
    try {
      const snap = await cloud.doc('kv/' + k).get();
      if (!snap.exists) return null;
      const doc = JSON.parse(JSON.stringify(snap.data()));
      if (k.startsWith('state:')) {
        doc.days = {};
        const q = await cloud.collection('kv/' + k + '/days').get();
        q.docs.forEach((d) => { const b = d.data(); Object.assign(doc.days, (b && b.inst) || {}); });
        doc.blobs = {};
        const bs = blobSig[k] = blobSig[k] || {};
        for (const ref of blobRefs(doc)) {
          if (known && known[ref.id]) { doc.blobs[ref.id] = known[ref.id]; bs[ref.id] = ref.chunks; continue; }
          const parts = [];
          for (let i = 0; i < ref.chunks; i++) {
            const cs = await cloud.doc('kv/' + k + '/blobs/' + ref.id + '_' + i).get();
            if (!cs.exists) { parts.length = 0; break; }
            parts.push((cs.data() || {}).data || '');
          }
          if (parts.length) { doc.blobs[ref.id] = parts.join(''); bs[ref.id] = ref.chunks; }
        }
      }
      return doc;
    } catch (e) { cloudFail(e); return null; }
  }

  async function cloudPut(k, v) {
    if (supa) {
      try {
        lastUp[k] = v.savedAt;
        const { error } = await supa.client.from('docs').upsert({ key: k, doc: v, saved_at: v.savedAt || Date.now(), updated_at: new Date().toISOString() }, { onConflict: 'key' });
        if (error) throw error;
        if (cloudErr) { cloudErr = null; document.dispatchEvent(new Event('cloud-status')); }
        return true;
      } catch (e) { cloudFail(e); return false; }
    }
    try {
      const core = { ...v };
      if (k.startsWith('state:')) {
        delete core.days;
        delete core.blobs;
        const bs = blobSig[k] = blobSig[k] || {};
        const want = {};
        for (const ref of blobRefs(v)) {
          const data = (v.blobs || {})[ref.id]; if (!data) continue;
          want[ref.id] = ref.chunks;
          if (bs[ref.id]) continue;
          for (let i = 0; i < ref.chunks; i++) {
            await cloud.doc('kv/' + k + '/blobs/' + ref.id + '_' + i).set({ savedAt: v.savedAt, id: ref.id, i, n: ref.chunks, data: data.slice(i * BLOB_CHUNK, (i + 1) * BLOB_CHUNK) });
          }
          bs[ref.id] = ref.chunks;
        }
        // 지운 첨부는 클라우드에서도 치운다 — 실패해도 본문 저장은 계속
        for (const [id, n] of Object.entries(bs)) {
          if (want[id]) continue;
          for (let i = 0; i < n; i++) {
            try { const r = cloud.doc('kv/' + k + '/blobs/' + id + '_' + i); if (typeof r.delete === 'function') await r.delete(); } catch (_) { /* 무시 */ }
          }
          delete bs[id];
        }
        const byMonth = {};
        Object.entries(v.days || {}).forEach(([d, rec]) => { (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || {})[d] = rec; });
        const sig = monthSig[k] = monthSig[k] || {};
        for (const [ym, inst] of Object.entries(byMonth)) {
          const j = JSON.stringify(inst);
          if (sig[ym] === j) continue;
          await cloud.doc('kv/' + k + '/days/' + ym).set({ savedAt: v.savedAt, inst });
          sig[ym] = j;
        }
      }
      lastUp[k] = v.savedAt;
      await cloud.doc('kv/' + k).set(core);
      if (cloudErr) { cloudErr = null; document.dispatchEvent(new Event('cloud-status')); }
      return true;
    } catch (e) { cloudFail(e); return false; }
  }

  async function getDoc(k) {
    const local = await localGet(k);
    if (!cloudOn() || !CLOUD_KEYS(k)) return local;
    const remote = await cloudGet(k, local && local.blobs);
    /* 처음 연결할 때의 안전장치 — 서버 쪽이 사실상 빈 문서인데 이 기기에는 기록이 있으면, 시각과 상관없이 이 기기 것을 올린다.
       (기록 없는 기기를 먼저 연결해 빈 문서가 올라간 뒤, 기록 있는 아이패드가 덮이는 사고를 막는다) */
    const isEmpty = (d) => !d || (!Object.keys(d.days || {}).length && !(d.purchases || []).length && !Object.keys(d.sales || {}).length && !(d.issues || []).length && !(d.contracts || []).length);
    if (remote && local && isEmpty(remote) && !isEmpty(local)) { await cloudPut(k, local); markSynced(k); return local; }
    /* 이 기기가 서버와 처음 만나는데 양쪽 다 기록이 있으면 — 한쪽을 버리지 않고 합친다 (날짜별 기록 · 매입 · 매출 · 직원 · 계약서 …).
       그 뒤부터는 '더 최근에 저장한 쪽'이 이긴다. */
    if (remote && local && !isSynced(k) && !isEmpty(remote) && !isEmpty(local) && (remote.savedAt || 0) !== (local.savedAt || 0)) {
      const merged = mergeDocs(remote, local);
      merged.savedAt = Date.now();
      await localPut(k, merged);
      await cloudPut(k, merged);
      markSynced(k);
      return merged;
    }
    if (remote && (!local || (remote.savedAt || 0) >= (local.savedAt || 0))) {
      await localPut(k, remote);          // 로컬은 캐시 — 오프라인에 대비해 최신본을 남겨둔다
      lastUp[k] = remote.savedAt;
      markSynced(k);
      return remote;
    }
    if (local) { await cloudPut(k, local); markSynced(k); } // 로컬이 더 새것(오프라인에서 썼거나 첫 연결)이면 올린다
    return local;
  }

  /* 이 브라우저가 문서 k 를 서버와 한 번이라도 맞춘 적이 있는지 (기기마다 기록) */
  const SYNCED = 'hm.synced:';
  function isSynced(k) { try { return !!localStorage.getItem(SYNCED + k); } catch (_) { return false; } }
  function markSynced(k) { try { localStorage.setItem(SYNCED + k, String(Date.now())); } catch (_) { /* 무시 */ } }

  /* 두 문서 합치기 — 더 최근 것(base)을 바탕으로, 목록은 합집합, 날짜별 기록은 진행된 쪽 우선 */
  function mergeDocs(a, b) {
    const newer = (a.savedAt || 0) >= (b.savedAt || 0) ? a : b;
    const older = newer === a ? b : a;
    const out = { ...older, ...newer };
    const idOf = (x, by) => (x && x[by] != null) ? String(x[by]) : JSON.stringify(x);
    const unionBy = (n, o, by) => {
      if (!Array.isArray(n) && !Array.isArray(o)) return undefined;
      const res = [...(n || [])]; const seen = new Set(res.map((x) => idOf(x, by)));
      (o || []).forEach((x) => { const id = idOf(x, by); if (!seen.has(id)) { seen.add(id); res.push(x); } });
      return res;
    };
    const unionObj = (n, o, each) => {
      if (!n && !o) return undefined;
      const res = { ...(o || {}), ...(n || {}) };
      if (each) Object.keys(res).forEach((key) => { if (n && o && n[key] && o[key]) res[key] = each(n[key], o[key]); });
      return res;
    };
    [['purchases', 'id'], ['contracts', 'id'], ['recipes', 'id'], ['notices', 'id'], ['issues', 'id'], ['training', 'id'], ['deaths', 'id'],
      ['health', 'id'], ['staff', 'name'], ['trainSeen', null]].forEach(([f, by]) => {
      const v = unionBy(newer[f], older[f], by); if (v !== undefined) out[f] = v;
    });
    /* 기본값으로 깔리는 자리표시 직원(사장님 · 홀 1 · 주방 1 · 매니저 · 점장, id s1~s3)은 한쪽에만 있으면 버린다.
       새 기기가 처음 연결될 때 빈 기본 상태의 이름이 서버 명단에 다시 섞여 들어오던 문제 (사장님 지적 2026-10-08) */
    if (Array.isArray(out.staff)) {
      const ph = (s) => s && /^s[1-3]$/.test(String(s.id)) && ['사장님', '홀 1', '주방 1', '매니저', '점장'].includes(s.name);
      const has = (list, s) => (list || []).some((x) => x && x.name === s.name);
      out.staff = out.staff.filter((s) => !ph(s) || (has(newer.staff, s) && has(older.staff, s)));
    }
    if (Array.isArray(out.issues)) out.issues = out.issues.map((i) => {
      const n = (newer.issues || []).find((x) => x.id === i.id), o = (older.issues || []).find((x) => x.id === i.id);
      return n && o ? { ...i, replies: unionBy(n.replies, o.replies, 'id') || [] } : i;
    });
    const mergeDay = (n, o) => ({
      ...o, ...n,
      inst: unionObj(n.inst, o.inst, (ni, oi) => ((ni.s && ni.s !== 'todo') || !(oi.s && oi.s !== 'todo')) ? ni : oi),
      extras: unionBy(n.extras, o.extras, 'id') || [],
      notified: { ...(o.notified || {}), ...(n.notified || {}) },
    });
    ['days', 'sales', 'roster', 'sched', 'payroll', 'hygiene', 'blobs', 'deadUse'].forEach((f) => {
      const v = unionObj(newer[f], older[f], f === 'days' ? mergeDay : null); if (v !== undefined) out[f] = v;
    });
    /* 설정은 최신 쪽이 이기되, 최신 쪽에 비어 있는 값(봇 토큰·대화방·PIN 등)은 예전 값을 지우지 않는다.
       (2026-10-07 안산점 토큰이 새 기기 연결 때 빈 값으로 덮인 사고 뒤 추가) */
    if (newer.settings || older.settings) {
      const ns = newer.settings || {}, os = older.settings || {};
      out.settings = { ...os, ...ns };
      Object.keys(os).forEach((key) => { const v = ns[key]; if ((v === '' || v === null || v === undefined) && os[key] !== '' && os[key] != null) out.settings[key] = os[key]; });
    }
    out.routineVer = Math.max(newer.routineVer || 0, older.routineVer || 0) || undefined;
    if (out.routineVer === undefined) delete out.routineVer;
    return out;
  }

  async function putDoc(k, v) {
    const ok = await localPut(k, v);
    if (cloudOn() && CLOUD_KEYS(k)) await cloudPut(k, v);
    return ok;
  }

  /* 다른 기기의 변경을 듣는다 — 내 쓰기가 되돌아오는 것(savedAt 같거나 이전)은 무시 */
  function supaWatch(k, list) {
    let timer = null;
    const poke = (savedAt) => {
      if (!(savedAt > (lastUp[k] || 0))) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (pending && k === curKey) return;   // 내 쪽에 아직 안 올라간 변경이 있으면 그게 곧 이긴다
        const doc = await cloudGet(k, null);
        if (!doc || !(doc.savedAt > (lastUp[k] || 0))) return;
        lastUp[k] = doc.savedAt;
        await localPut(k, doc);
        if (remoteCb) remoteCb(k, doc);
      }, 300);
    };
    const ch = supa.client.channel('doc-' + k.replace(/[^a-zA-Z0-9]/g, '_'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs_poke', filter: 'key=eq.' + k }, (payload) => { const row = payload.new || {}; poke(Number(row.saved_at) || 0); })
      .subscribe();
    list.push(() => { try { supa.client.removeChannel(ch); } catch (_) { /* 무시 */ } });
  }
  /* 다른 문서(예: 다른 매장)의 변경을 받는다 — 대시보드용. 돌려주는 함수를 부르면 구독을 끊는다 */
  function watchDoc(k, cb) {
    if (!supa || !supa.client) return () => {};
    let timer = null;
    const ch = supa.client.channel('dash-' + k.replace(/[^a-zA-Z0-9]/g, '_'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs_poke', filter: 'key=eq.' + k }, () => {
        clearTimeout(timer);
        timer = setTimeout(async () => { try { const doc = await cloudGet(k, null); if (doc) { await localPut(k, doc); cb(doc); } } catch (_) { /* 무시 */ } }, 300);
      }).subscribe();
    return () => { try { supa.client.removeChannel(ch); } catch (_) { /* 무시 */ } };
  }
  function watch(k) {
    unsubs.forEach((u) => u()); unsubs = [];
    if (!cloudOn() || !CLOUD_KEYS(k)) return;
    if (supa) { supaWatch(k, unsubs); return; }
    let timer = null;
    const poke = (savedAt) => {
      if (!(savedAt > (lastUp[k] || 0))) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (pending) return;                 // 내 쪽에 아직 안 올라간 변경이 있으면 그게 곧 이긴다
        const doc = await cloudGet(k, ((await localGet(k)) || {}).blobs);
        if (!doc || !(doc.savedAt > (lastUp[k] || 0))) return;
        lastUp[k] = doc.savedAt;
        await localPut(k, doc);
        if (remoteCb) remoteCb(k, doc);
      }, 400);
    };
    const onErr = (e) => cloudFail(e);
    unsubs.push(cloud.doc('kv/' + k).onSnapshot((snap) => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      poke(snap.data().savedAt || 0);
    }, onErr));
    unsubs.push(cloud.collection('kv/' + k + '/days').onSnapshot((qs) => {
      if (qs.metadata.hasPendingWrites) return;
      qs.docChanges().forEach((c) => { const b = c.doc.data(); if (b) poke(b.savedAt || 0); });
    }, onErr));
  }

  /* ── Supabase 서버 연결 ── */
  /* 기본 서버 설정 — 프로젝트 주소와 publishable(공개) 키. 비밀이 아니라 앱에 넣어 둔다 (service_role 키 아님).
     덕분에 새 기기·브라우저는 아무것도 입력하지 않아도 열자마자 서버에 연결된다(익명 세션). 설정에서 다른 값을 넣으면 그게 우선. */
  const SUPA_DEFAULT = { url: 'https://pmkxwcdoqqjeipqmukzw.supabase.co', key: 'sb_publishable_EXY0gMpArHtuYp-XkCYLeA_BFSMhfi3' };
  function supaConfig() { if (window.HM_DEMO) { supaCfg = null; return null; }   // 데모판은 서버에 절대 붙지 않는다
    try { supaCfg = JSON.parse(localStorage.getItem(SUPA_KEY) || 'null'); } catch (e) { supaCfg = null; } if (!supaCfg || !supaCfg.url || !supaCfg.key) supaCfg = { ...SUPA_DEFAULT }; return supaCfg; }
  /* 기기 등록제 (2026-10-08): 사장님이 등록한 기기만 서버가 기록을 내준다.
     기기 열쇠(hm.devkey)는 이 기기에만 저장되고 모든 요청에 x-device-key 헤더로 실린다. 서버는 해시만 가지고 있다.
     등록된 기기가 하나도 없는 동안(처음)은 서버가 모두 허용한다. */
  const DEV_KEY = 'hm.devkey', DEV_COOKIE = 'hm_devkey', DEV_RE = /^[a-f0-9]{48}$/;
  /* 열쇠는 세 군데(localStorage · 쿠키 400일 · IndexedDB)에 같이 두고, 하나라도 남아 있으면 되살린다.
     포스·태블릿 브라우저가 껐다 켤 때 저장소 일부를 지워 매일 다시 등록해야 하던 문제 (사장님 요청 2026-10-09).
     거기에 더해 "이 기기 전용 주소"(?dk=열쇠)를 홈 화면에 두면 전부 지워져도 그 주소로 열 때 자동 복구된다. */
  const devCookie = () => { try { const m = document.cookie.match(/(?:^|;\s*)hm_devkey=([a-f0-9]{48})/); return m ? m[1] : ''; } catch (_) { return ''; } };
  const devKey = () => { try { const k = localStorage.getItem(DEV_KEY); if (k) return k; } catch (_) { /* 무시 */ } return devCookie(); };
  function devSave(k) {
    if (!k) return;
    try { localStorage.setItem(DEV_KEY, k); } catch (_) { /* 무시 */ }
    try { document.cookie = `${DEV_COOKIE}=${k}; max-age=${400 * 86400}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`; } catch (_) { /* 무시 */ }
    if (db) idbSet('__devkey', k).then(() => {}, () => {});
  }
  async function devRecover() {
    try {   // 기기 전용 주소로 열었으면 열쇠를 저장하고 주소창에서는 지운다
      const u = new URL(location.href), q = u.searchParams.get('dk');
      if (q && DEV_RE.test(q)) { devSave(q); u.searchParams.delete('dk'); history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '') + u.hash); }
    } catch (_) { /* 무시 */ }
    let k = ''; try { k = localStorage.getItem(DEV_KEY) || ''; } catch (_) { /* 무시 */ }
    if (!k) k = devCookie();
    if (!k && db) { try { const v = await idbGet('__devkey'); if (v && DEV_RE.test(v)) k = v; } catch (_) { /* 무시 */ } }
    if (k) devSave(k);   // 빠진 곳을 다시 채운다
  }
  const deviceLink = () => { const k = devKey(); return k ? location.origin + location.pathname + '?dk=' + k : ''; };
  function mkClient(cfg) {
    const k = devKey();
    return window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true }, global: { headers: k ? { 'x-device-key': k } : {} } });
  }
  async function connectSupa() {
    supa = null;
    const cfg = supaConfig();
    if (!cfg || !cfg.url || !cfg.key || !window.supabase || !window.supabase.createClient) return null;
    try {
      const client = mkClient(cfg);
      let { data } = await client.auth.getSession();
      if (!data || !data.session) {
        /* 로그인 전이면 서버가 기기용 익명 세션을 만들어 준다 (Supabase › Authentication › Allow anonymous sign-ins 켜 둠).
           매장 직원이 비밀번호를 몰라도 바로 서버에 연결된다. 실패하면(인터넷 끊김 등) 이 기기에만 저장. */
        const r = await client.auth.signInAnonymously();
        if (r.error || !r.data || !r.data.session) { console.warn('서버 자동 연결 실패', r.error && r.error.message); return null; }
        data = r.data;
      }
      const u = data.session.user || {};
      let deviceOk = true;
      try { const r = await client.rpc('device_ok'); if (!r.error && typeof r.data === 'boolean') deviceOk = r.data; } catch (_) { /* 서버에 아직 없으면 허용 */ }
      supa = { client, url: cfg.url, email: u.email || '', anon: !!u.is_anonymous || !u.email, deviceOk, device: !!devKey() };
      if (deviceOk && devKey()) client.rpc('device_touch').then(() => {}, () => {});
      client.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { supa = null; document.dispatchEvent(new Event('cloud-status')); } });
      return supa;
    } catch (e) { cloudFail(e); return null; }
  }
  /* 서버 알림 — events 표에 한 줄 넣으면 서버(트리거)가 텔레그램으로 보낸다 */
  async function supaEvent(kind, text) {
    if (!supa) return { ok: false, err: '서버에 로그인되어 있지 않습니다' };
    try {
      const store = (meta && meta.current) || 'ansan';
      const { error } = await supa.client.from('events').insert({ store, kind, text });
      if (error) throw error;
      return { ok: true };
    } catch (e) { return { ok: false, err: e.message || String(e) }; }
  }
  /* 서버가 대신 텔레그램 getUpdates 를 호출해 준다 — 브라우저가 api.telegram.org 에 못 닿을 때를 위해 */
  async function supaTgUpdates() {
    if (!supa) return { ok: false, err: '서버에 로그인되어 있지 않습니다' };
    try {
      const store = (meta && meta.current) || 'ansan';
      const { data: id, error } = await supa.client.rpc('tg_updates_start', { p_store: store });
      if (error) throw error;
      if (!id) return { ok: false, err: '서버에 저장된 봇 토큰이 없습니다 — 토큰을 넣고 잠시 뒤 다시 누르세요' };
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const { data: res, error: e2 } = await supa.client.rpc('tg_updates_result', { p_id: id });
        if (e2) throw e2;
        if (res && res.status != null) {
          let body = null; try { body = JSON.parse(res.body); } catch (_) { /* 무시 */ }
          if (!body) return { ok: false, err: '텔레그램 응답을 읽지 못했습니다 (' + res.status + ')' };
          return body.ok ? { ok: true, result: body.result || [] } : { ok: false, err: body.description || ('HTTP ' + res.status) };
        }
        if (res && res.error) return { ok: false, err: res.error };
      }
      return { ok: false, err: '서버 응답이 늦습니다 — 잠시 뒤 다시 누르세요' };
    } catch (e) { return { ok: false, err: e.message || String(e) }; }
  }
  async function supaEvents(n) {
    if (!supa) return [];
    try {
      const { data, error } = await supa.client.from('events').select('id, store, kind, text, created_at, sent_at, tries, err').order('id', { ascending: false }).limit(n || 20);
      if (error) throw error;
      return data || [];
    } catch (e) { return []; }
  }

  /* 기기 등록: 사장님 비밀번호 해시 + 기기 이름 → 서버가 열쇠를 만들어 준다. 열쇠는 이 기기에만 저장 */
  async function deviceRegister(ownerHash, name, store) {
    const cfg = supaConfig();
    const client = (supa && supa.client) || mkClient(cfg);
    const { data, error } = await client.rpc('device_register', { p_owner_hash: ownerHash, p_name: name, p_store: store || null });
    if (error) throw new Error(error.message || String(error));
    if (!data) throw new Error('서버가 열쇠를 돌려주지 않았습니다');
    devSave(data);
    if (!devKey()) throw new Error('이 브라우저에 저장할 수 없습니다 (시크릿 모드?)');
    return true;
  }
  async function deviceList() {
    if (!supa) return [];
    const { data, error } = await supa.client.from('devices').select('id, name, store, created_at, last_seen, active, key_hash').order('created_at');
    if (error) throw new Error(error.message); return data || [];
  }
  async function deviceRevoke(id) {
    if (!supa) return false;
    const { error } = await supa.client.from('devices').update({ active: false }).eq('id', id);
    if (error) throw new Error(error.message); return true;
  }
  async function deviceHash() {   // 이 기기 열쇠의 해시 — 목록에서 "이 기기" 표시용
    const k = devKey(); if (!k || !(window.crypto && crypto.subtle)) return '';
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k));
    return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  function deviceForget() { try { localStorage.removeItem(DEV_KEY); } catch (_) { /* 무시 */ } try { document.cookie = `${DEV_COOKIE}=; max-age=0; path=/`; } catch (_) { /* 무시 */ } if (db) idbSet('__devkey', '').then(() => {}, () => {}); }
  /* 등록 안 된 기기용 — 교육 자료만 (직원 이름 · 교육 진도만 오간다) */
  async function trainingDoc(store) {
    if (!supa) return null;
    const { data, error } = await supa.client.rpc('training_doc', { p_store: store });
    if (error) throw new Error(error.message); return data || null;
  }
  async function trainingSave(store, patch) {
    if (!supa) return false;
    const { error } = await supa.client.rpc('training_save', { p_store: store, p_patch: patch });
    if (error) throw new Error(error.message); return true;
  }

  function supaSetConfig(url, key) {
    if (!url || !key) { localStorage.removeItem(SUPA_KEY); supaCfg = null; supa = null; return; }
    localStorage.setItem(SUPA_KEY, JSON.stringify({ url: url.trim().replace(/\/+$/, ''), key: key.trim() }));
    supaConfig();
  }
  async function supaSignIn(email, password) {
    const cfg = supaConfig();
    if (!cfg || !window.supabase) throw new Error('서버 주소와 열쇠를 먼저 넣어 주세요.');
    const client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return true;
  }
  async function supaSignOut() {
    if (supa) { try { await supa.client.auth.signOut(); } catch (_) { /* 무시 */ } }
    supa = null;
  }

  /* 아티팩트 안에서만 응답한다. 파일로 열었거나 PC 서버로 열었으면 조용히 로컬만 쓴다. */
  async function connectCloud() {
    if (!(window.claude && typeof window.claude.use === 'function')) return null;
    try { return await window.claude.use('db'); } catch (e) { return null; }
  }

  /* 저장소가 "있는지"가 아니라 "실제로 써지는지"를 확인한다 */
  async function probeIDB() {
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(1, '__probe');
        tx.oncomplete = () => {
          try { db.transaction(STORE, 'readwrite').objectStore(STORE).delete('__probe'); } catch (e) {}
          resolve(true);
        };
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch (e) { resolve(false); }
    });
  }

  function probeLS() {
    try {
      localStorage.setItem('__probe', '1');
      const v = localStorage.getItem('__probe') === '1';
      localStorage.removeItem('__probe');
      return v;
    } catch (e) { return false; }
  }

  async function init() {
    db = await openDB();
    if (await probeIDB()) { mode = 'idb'; writable = true; }
    else if (probeLS()) { mode = 'ls'; writable = true; }
    else { mode = 'none'; writable = false; }

    await devRecover();   // 기기 열쇠 복구는 서버 연결(헤더에 실림)보다 먼저
    cloud = await connectCloud();
    await connectSupa();

    meta = await getDoc('meta');
    if (!meta) {
      meta = {
        savedAt: Date.now(),
        current: 'ansan',
        stores: [{ id: 'ansan', name: '안산점' }, { id: 'anyang', name: '안양점' }],
      };
      // 매장 구분 이전에 쓰던 단일 저장분은 안산점으로 승계한다
      const legacy = await getDoc('state');
      if (legacy) await putDoc('state:ansan', legacy);
      await putDoc('meta', JSON.parse(JSON.stringify(meta)));
    }
    curKey = 'state:' + meta.current;
    return mode;
  }

  async function load() { const d = await getDoc(curKey); watch(curKey); return d; }

  let timer = null, pending = null;

  /* 변경 즉시 저장. 저장 버튼은 두지 않는다 — 누르는 걸 잊으면 그대로 소실되기 때문. */
  function save(state) {
    state.savedAt = Date.now();
    pending = state;
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  }

  async function flush() {
    if (!pending) return;
    const v = pending; pending = null;
    await putDoc(curKey, v);
  }

  async function setMeta(m) {
    meta = m; meta.savedAt = Date.now();
    await putDoc('meta', JSON.parse(JSON.stringify(meta)));
  }

  /* 매장 전환 — 현재 매장을 저장한 뒤 다른 매장 상태를 불러온다 */
  async function switchTo(id) {
    await flush();
    meta.current = id;
    await setMeta(meta);
    curKey = 'state:' + id;
    const d = await getDoc(curKey);
    watch(curKey);
    return d;
  }

  /* 백업: 모든 매장 + meta 를 한 파일로 */
  async function dumpAll() {
    await flush();
    const out = { v: 2, exportedAt: Date.now(), meta: JSON.parse(JSON.stringify(meta)), states: {} };
    for (const st of meta.stores) {
      const doc = await getDoc('state:' + st.id);
      if (doc) out.states[st.id] = doc;
    }
    return out;
  }

  async function restoreAll(obj) {
    if (obj.meta) await setMeta(obj.meta);
    for (const [id, doc] of Object.entries(obj.states || {})) await putDoc('state:' + id, doc);
  }

  /* 다른 매장의 상태 문서를 직접 읽고 쓴다 — 설정에서 두 매장 직원을 한 화면에서 관리하기 위해 */
  async function loadStore(id) { return getDoc('state:' + id); }
  async function saveStore(id, doc) { doc.savedAt = Date.now(); return putDoc('state:' + id, doc); }

  /* 매장 공용 문서 (트러블시트 등) — 'shared:<이름>' 키. 클라우드에서도 같이 동기화된다 */
  let unsubs2 = [];
  async function loadShared(name) { return getDoc('shared:' + name); }
  async function saveShared(name, doc) { doc.savedAt = Date.now(); return putDoc('shared:' + name, doc); }
  function watchShared(name) {
    const k = 'shared:' + name;
    unsubs2.forEach((u) => u()); unsubs2 = [];
    if (!cloudOn()) return;
    if (supa) { supaWatch(k, unsubs2); return; }
    let timer = null;
    unsubs2.push(cloud.doc('kv/' + k).onSnapshot((snap) => {
      if (!snap.exists || snap.metadata.hasPendingWrites) return;
      const savedAt = snap.data().savedAt || 0;
      if (!(savedAt > (lastUp[k] || 0))) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const doc = await cloudGet(k, null);
        if (!doc || !(doc.savedAt > (lastUp[k] || 0))) return;
        lastUp[k] = doc.savedAt;
        await localPut(k, doc);
        if (remoteCb) remoteCb(k, doc);
      }, 400);
    }, (e) => cloudFail(e)));
  }

  return {
    init, load, save, flush, setMeta, switchTo, dumpAll, restoreAll, loadStore, saveStore, loadShared, saveShared, watchShared,
    supaSetConfig, supaSignIn, supaSignOut, supaEvent, supaEvents, supaTgUpdates, watchDoc,
    deviceRegister, deviceList, deviceRevoke, deviceHash, deviceForget, deviceLink, trainingDoc, trainingSave,
    get supa() { const cfg = supaCfg || supaConfig(); return { configured: !!(cfg && cfg.url && cfg.key), url: cfg ? cfg.url : '', signedIn: !!supa, anon: !!(supa && supa.anon), deviceOk: supa ? supa.deviceOk !== false : true, device: !!devKey(), email: supa ? supa.email : '', libLoaded: !!(window.supabase && window.supabase.createClient) }; },
    get mode() { return mode; },
    get ok() { return writable; },
    get label() {
      const l = { idb: 'IndexedDB', ls: '브라우저 저장소 (localStorage)', none: '저장 안 됨' }[mode];
      return supa ? `서버 실시간 동기화 (Supabase) + ${l} 캐시` : cloud ? `클라우드 동기화 (claude.ai) + ${l} 캐시` : l;
    },
    get meta() { return meta; },
    get cloud() { return cloudOn(); },
    get cloudErr() { return cloudErr; },
    onRemote(cb) { remoteCb = cb; },
    BLOB_CHUNK,
  };
})();
