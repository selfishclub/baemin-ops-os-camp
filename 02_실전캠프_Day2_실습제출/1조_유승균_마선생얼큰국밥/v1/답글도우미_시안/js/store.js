// 리뷰 저장소 — v1은 이 브라우저(폰) 안에 저장한다.
// Supabase로 옮길 때는 이 파일의 load/save만 바꾸면 된다.
(function () {
  const KEY = "masunsaeng-reviews-v1";

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function save(reviews) {
    try {
      localStorage.setItem(KEY, JSON.stringify(reviews));
      return true;
    } catch (e) {
      return false;
    }
  }

  function normalize(text) {
    return String(text || "").replace(/\s+/g, "").toLowerCase();
  }

  function dedupeKey(r) {
    return [r.platform, r.date, normalize(r.text)].join("|");
  }

  function newId() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  const Store = {
    all() {
      return load();
    },

    get(id) {
      return load().find((r) => r.id === id) || null;
    },

    // 새 리뷰를 넣는다. 같은 리뷰가 있으면 { duplicate: 기존 리뷰 }를 돌려준다.
    add(review) {
      const reviews = load();
      const key = dedupeKey(review);
      const existing = reviews.find((r) => dedupeKey(r) === key);
      if (existing) return { duplicate: existing };
      const saved = Object.assign(
        { id: newId(), reply: null, memo: "", createdAt: new Date().toISOString() },
        review
      );
      reviews.push(saved);
      if (!save(reviews)) return { error: "저장 공간이 부족해요." };
      return { review: saved };
    },

    update(id, changes) {
      const reviews = load();
      const i = reviews.findIndex((r) => r.id === id);
      if (i < 0) return null;
      reviews[i] = Object.assign({}, reviews[i], changes);
      save(reviews);
      return reviews[i];
    },

    clear() {
      save([]);
    },
  };

  window.Store = Store;
})();
