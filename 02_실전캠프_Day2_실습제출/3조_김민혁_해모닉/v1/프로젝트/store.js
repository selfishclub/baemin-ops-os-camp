/* 저장소 — IndexedDB 우선, 불가하면 localStorage로 자동 대체.
   매장(안산점/안양점)마다 상태 문서를 따로 보관한다: state:<매장id>
   'meta' 문서가 매장 목록과 현재 선택을 기억한다. */

const Store = (() => {
  const DB_NAME = 'haemonic';
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
    [['purchases', 'id'], ['contracts', 'id'], ['recipes', 'id'], ['notices', 'id'], ['issues', 'id'], ['training', 'id'],
      ['health', 'id'], ['staff', 'name'], ['trainSeen', null]].forEach(([f, by]) => {
      const v = unionBy(newer[f], older[f], by); if (v !== undefined) out[f] = v;
    });
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
    ['days', 'sales', 'roster', 'sched', 'payroll', 'hygiene', 'blobs'].forEach((f) => {
      const v = unionObj(newer[f], older[f], f === 'days' ? mergeDay : null); if (v !== undefined) out[f] = v;
    });
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'key=eq.' + k }, (payload) => { const row = payload.new || {}; poke(Number(row.saved_at) || 0); })
      .subscribe();
    list.push(() => { try { supa.client.removeChannel(ch); } catch (_) { /* 무시 */ } });
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
  function supaConfig() { try { supaCfg = JSON.parse(localStorage.getItem(SUPA_KEY) || 'null'); } catch (e) { supaCfg = null; } return supaCfg; }
  async function connectSupa() {
    supa = null;
    const cfg = supaConfig();
    if (!cfg || !cfg.url || !cfg.key || !window.supabase || !window.supabase.createClient) return null;
    try {
      const client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await client.auth.getSession();
      if (!data || !data.session) return null;   // 설정은 있지만 로그인 전
      supa = { client, url: cfg.url, email: data.session.user && data.session.user.email };
      client.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') { supa = null; document.dispatchEvent(new Event('cloud-status')); } });
      return supa;
    } catch (e) { cloudFail(e); return null; }
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
    supaSetConfig, supaSignIn, supaSignOut,
    get supa() { const cfg = supaCfg || supaConfig(); return { configured: !!(cfg && cfg.url && cfg.key), url: cfg ? cfg.url : '', signedIn: !!supa, email: supa ? supa.email : '', libLoaded: !!(window.supabase && window.supabase.createClient) }; },
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
