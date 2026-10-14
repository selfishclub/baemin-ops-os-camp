// 매뉴얼북 체험판 전용 가짜 서버 — Supabase 대신 이 브라우저 메모리 안에서만 읽고 써요.
// 새로 고침하면 처음 상태로 돌아가고, 어디에도 보내지 않아요.
(function(){
  var T = window.DEMO_MANUAL || {};
  function clone(x){ return JSON.parse(JSON.stringify(x)); }
  function newId(){ return 'd-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); }

  function Q(table){ this.t = table; this.f = []; this.o = []; this.op = 'select'; this.ret = false; }
  Q.prototype.select = function(){ if (this.op !== 'select') this.ret = true; return this; };
  Q.prototype.eq = function(c, v){ this.f.push(function(r){ return r[c] === v || String(r[c]) === String(v); }); return this; };
  Q.prototype['in'] = function(c, vs){ this.f.push(function(r){ return vs.indexOf(r[c]) >= 0; }); return this; };
  Q.prototype.order = function(c, o){ this.o.push([c, !(o && o.ascending === false)]); return this; };
  Q.prototype.insert = function(rows){ this.op = 'insert'; this.rows = [].concat(rows); return this; };
  Q.prototype.update = function(p){ this.op = 'update'; this.patch = p; return this; };
  Q.prototype['delete'] = function(){ this.op = 'delete'; return this; };
  Q.prototype.run = function(){
    var tab = T[this.t] || (T[this.t] = []), f = this.f, match = function(r){ return f.every(function(fn){ return fn(r); }); };
    if (this.op === 'insert'){
      var out = [], t = this.t;
      for (var i = 0; i < this.rows.length; i++){
        var row = clone(this.rows[i]);
        // 같은 사람이 같은 매뉴얼을 두 번 확인하면 실제 서버처럼 23505 오류
        if (t === 'manual_confirmations' && row.staff_id && tab.some(function(x){ return x.manual_id === row.manual_id && x.staff_id === row.staff_id; })) return { data: null, error: { code: '23505', message: '이미 확인한 기록이 있어요' } };
        if (row.id == null) row.id = newId();
        if (row.created_at == null) row.created_at = new Date().toISOString();
        if (t === 'manual_confirmations' && row.confirmed_at == null) row.confirmed_at = row.created_at;
        tab.push(row); out.push(clone(row));
      }
      return { data: out, error: null };
    }
    if (this.op === 'update'){ var hit = tab.filter(match); hit.forEach(function(x){ Object.assign(x, clone(this.patch)); }, this); return { data: clone(hit), error: null }; }
    if (this.op === 'delete'){ T[this.t] = tab.filter(function(x){ return !match(x); }); return { data: null, error: null }; }
    var rows = tab.filter(match);
    this.o.slice().reverse().forEach(function(o){ rows.sort(function(a, b){ var x = a[o[0]], y = b[o[0]]; if (x == y) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : 1) * (o[1] ? 1 : -1); }); });
    return { data: clone(rows), error: null };
  };
  Q.prototype.then = function(ok, bad){ var self = this; return new Promise(function(res){ setTimeout(function(){ res(self.run()); }, 40); }).then(ok, bad); };

  // 사진은 브라우저 안에서 data: 주소로만 들고 있어요 (어디에도 올라가지 않음)
  var blobs = {};
  function fileToDataUrl(file){ return new Promise(function(res, rej){ var r = new FileReader(); r.onload = function(){ res(r.result); }; r.onerror = rej; r.readAsDataURL(file); }); }
  window.makeFakeSb = function(){
    return {
      from: function(t){ return new Q(t); },
      storage: { from: function(){ return {
        upload: function(path, file){ return fileToDataUrl(file).then(function(u){ blobs[path] = u; return { data: { path: path }, error: null }; }); },
        getPublicUrl: function(path){ return { data: { publicUrl: blobs[path] || '' } }; },
        remove: function(paths){ (paths || []).forEach(function(p){ delete blobs[p]; }); return Promise.resolve({ data: null, error: null }); }
      }; } }
    };
  };
})();
