// 화면 3개: 오늘 할 일(#today) · 리뷰 상세(#review/<id>) · 리뷰 넣기(#add)
(function () {
  const view = document.getElementById("view");
  const toastEl = document.getElementById("toast");
  const PLATFORMS = ["배민", "쿠팡이츠"];

  // 리뷰 상세 화면의 상태 (다시 만들기 횟수, 고른 초안)
  const detailState = { id: null, seed: 0, selected: 0 };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (toastEl.hidden = true), 2600);
  }

  function todayStr(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function weekStartStr() {
    const d = new Date();
    const day = (d.getDay() + 6) % 7; // 월요일 = 0
    return todayStr(-day);
  }

  function shortDate(s) {
    if (!s) return "날짜 없음";
    const [, m, d] = s.split("-");
    return `${Number(m)}/${Number(d)}`;
  }

  function stars(rating) {
    return rating == null ? "별점 없음" : "★".repeat(rating) + "☆".repeat(5 - rating);
  }

  function chipsFor(review, tags) {
    const chips = [];
    if (tags.complaint) chips.push(`<span class="chip red">🔴 불만 · ${esc(tags.complaintTypes.join("·"))}</span>`);
    if (tags.regular) {
      const label = review.orderCount ? `${review.orderCount}번째 주문` : "단골";
      chips.push(`<span class="chip green">🟢 단골 · ${esc(label)}</span>`);
    }
    if (tags.praise) chips.push(`<span class="chip">⭐ 칭찬${tags.praiseTypes.length ? " · " + esc(tags.praiseTypes.join("·")) : ""}</span>`);
    if (tags.incomplete) chips.push(`<span class="chip amber">정보 부족</span>`);
    if (review.reply) chips.push(`<span class="chip">✅ 답글 완료</span>`);
    return `<div class="chips">${chips.join("")}</div>`;
  }

  function reviewCard(review) {
    const tags = Rules.classify(review);
    const cls = ["review", tags.complaint && !review.reply ? "complaint" : "", review.reply ? "done" : ""].join(" ");
    return `
      <button class="${cls}" data-open="${esc(review.id)}">
        <div class="review-head">
          <span>${esc(review.platform)} · ${esc(shortDate(review.date))} · ${esc(review.menu || "메뉴 없음")}</span>
          <span>${esc(stars(review.rating))}</span>
        </div>
        <div class="review-text">${esc(review.text)}</div>
        ${chipsFor(review, tags)}
      </button>`;
  }

  // 불만 먼저, 그다음 최신순
  function sortForToday(list) {
    return list.slice().sort((a, b) => {
      const ca = Rules.classify(a).complaint ? 0 : 1;
      const cb = Rules.classify(b).complaint ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return String(b.date).localeCompare(String(a.date));
    });
  }

  // ① 오늘 할 일
  function renderToday() {
    const all = Store.all();
    const pending = all.filter((r) => !r.reply);
    const pendingComplaints = pending.filter((r) => Rules.classify(r).complaint);
    const pendingOthers = pending.filter((r) => !Rules.classify(r).complaint);
    const weekStart = weekStartStr();
    const thisWeek = all.filter((r) => r.date >= weekStart);
    const rated = thisWeek.filter((r) => r.rating != null);
    const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : "-";
    const done = all.filter((r) => r.reply).sort((a, b) => String(b.reply.date).localeCompare(String(a.reply.date)));

    if (all.length === 0) {
      view.innerHTML = `
        <h2>오늘 할 일</h2>
        <div class="empty">
          아직 넣은 리뷰가 없어요.<br><br>
          <button class="btn primary" data-go="add">리뷰 넣으러 가기</button>
        </div>`;
      return;
    }

    view.innerHTML = `
      <h2>오늘 할 일</h2>
      <div class="stats">
        <div class="stat ${pending.length ? "alert" : ""}"><b>${pending.length}</b><span>답글 안 단 리뷰</span></div>
        <div class="stat"><b>${thisWeek.length}</b><span>이번 주 리뷰</span></div>
        <div class="stat"><b>${avg}</b><span>이번 주 별점</span></div>
      </div>

      <h2>🔴 불만 리뷰 먼저 (${pendingComplaints.length})</h2>
      <div class="list">
        ${pendingComplaints.length ? sortForToday(pendingComplaints).map(reviewCard).join("") : `<div class="empty">답글이 필요한 불만 리뷰가 없어요 👍</div>`}
      </div>

      <h2>답글 기다리는 리뷰 (${pendingOthers.length})</h2>
      <div class="list">
        ${pendingOthers.length ? sortForToday(pendingOthers).map(reviewCard).join("") : `<div class="empty">모두 답글을 달았어요 🎉</div>`}
      </div>

      ${done.length ? `<h2>✅ 답글 완료 (${done.length})</h2><div class="list">${done.slice(0, 10).map(reviewCard).join("")}</div>` : ""}
    `;
  }

  // ② 리뷰 상세
  function renderDetail(id) {
    const review = Store.get(id);
    if (!review) {
      view.innerHTML = `<div class="empty">리뷰를 찾을 수 없어요.<br><br><button class="btn" data-go="today">오늘 할 일로</button></div>`;
      return;
    }
    if (detailState.id !== id) Object.assign(detailState, { id, seed: 0, selected: 0 });

    const tags = Rules.classify(review);
    const drafts = review.reply ? [] : Rules.drafts(review, detailState.seed);
    if (detailState.selected >= drafts.length) detailState.selected = 0;

    const draftSection = review.reply
      ? `
        <div class="panel">
          <h2>✅ 답글 완료 (${esc(shortDate(review.reply.date))})</h2>
          <div class="done-box">${esc(review.reply.text)}</div>
          <p class="notice">이미 답글을 단 리뷰라 초안을 만들지 않아요.</p>
          <div class="actions">
            <button class="btn" data-action="copy-done">답글 다시 복사</button>
            <button class="btn" data-action="undo">완료 취소</button>
          </div>
        </div>`
      : `
        <div class="panel">
          <h2>답글 초안 — 하나를 골라 주세요</h2>
          <div class="drafts">
            ${drafts
              .map(
                (d, i) => `
              <button class="draft" data-pick="${i}" aria-pressed="${i === detailState.selected}">
                <small>${i === detailState.selected ? "✔ 고름 · " : ""}${esc(d.style)}</small>${esc(d.text)}
              </button>`
              )
              .join("")}
          </div>
          <div class="actions">
            <button class="btn primary wide" data-action="copy">📋 고른 초안 복사</button>
            <button class="btn" data-action="regen">🔄 다시 만들기</button>
            <button class="btn good" data-action="done">✅ 답글 완료</button>
          </div>
          <p class="notice">복사한 뒤 배민·쿠팡이츠 앱에 붙여넣고 <b>직접 등록</b>해 주세요. 등록했으면 "답글 완료"를 누르세요.</p>
        </div>`;

    const memoSection = tags.complaint
      ? `
        <div class="panel">
          <h2>무엇을 고쳤나요? (불만 대응 메모)</h2>
          <textarea id="memo" placeholder="예: 포장 테이프 두 줄로 바꿈">${esc(review.memo)}</textarea>
          <div class="actions"><button class="btn wide" data-action="memo">메모 저장</button></div>
        </div>`
      : "";

    view.innerHTML = `
      <button class="back" data-go="today">← 오늘 할 일</button>
      <div class="panel">
        ${chipsFor(review, tags)}
        <p class="full-text">${esc(review.text)}</p>
        <dl class="meta">
          <dt>플랫폼</dt><dd>${esc(review.platform)}</dd>
          <dt>날짜</dt><dd>${esc(review.date || "없음")}</dd>
          <dt>별점</dt><dd>${esc(stars(review.rating))}</dd>
          <dt>메뉴</dt><dd>${esc(review.menu || "없음")}</dd>
          <dt>주문 횟수</dt><dd>${review.orderCount ? esc(review.orderCount) + "번째" : "모름"}</dd>
        </dl>
        ${tags.incomplete ? `<p class="warn">정보 부족 — 별점이나 메뉴가 비어 있어요. 초안이 덜 구체적일 수 있어요.</p>` : ""}
      </div>
      ${draftSection}
      ${memoSection}
    `;
    view.dataset.drafts = JSON.stringify(drafts.map((d) => d.text));
  }

  // ③ 리뷰 넣기
  function renderAdd() {
    view.innerHTML = `
      <h2>리뷰 넣기</h2>
      <form id="add-form" class="panel" novalidate>
        <div class="row">
          <label>플랫폼
            <select name="platform">${PLATFORMS.map((p) => `<option>${p}</option>`).join("")}</select>
          </label>
          <label>날짜
            <input type="date" name="date" value="${todayStr()}" required>
          </label>
        </div>
        <div class="row">
          <label>별점
            <select name="rating">
              <option value="">모름</option>
              ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)} (${n})</option>`).join("")}
            </select>
          </label>
          <label>몇 번째 주문 <small>모르면 비워 두세요</small>
            <input type="number" name="orderCount" min="1" max="999" inputmode="numeric" placeholder="예: 5">
          </label>
        </div>
        <label>주문 메뉴
          <input name="menu" placeholder="예: 얼큰국밥 특">
        </label>
        <label>리뷰 내용 <small>손님 이름은 넣지 마세요</small>
          <textarea name="text" placeholder="배민 앱의 리뷰 내용을 붙여넣으세요" required></textarea>
        </label>
        <button class="btn primary" type="submit">저장</button>
      </form>

      <div class="panel">
        <h2>처음이라면</h2>
        <p class="notice">시연용 가짜 리뷰 5개(단골 1 · 불만 1 · 칭찬 3)를 넣어 한 바퀴 돌려 볼 수 있어요.</p>
        <div class="actions">
          <button class="btn wide" data-action="demo">시연용 가짜 리뷰 5개 넣기</button>
          <button class="btn wide" data-action="reset">모든 리뷰 지우기</button>
        </div>
      </div>
    `;
  }

  function demoReviews() {
    return [
      { id: "demo-1", platform: "배민", date: todayStr(0), rating: 5, menu: "얼큰국밥 특", orderCount: 5, text: "긴말 안 합니다. 또 시켰어요." },
      { id: "demo-2", platform: "쿠팡이츠", date: todayStr(-1), rating: 2, menu: "얼큰국밥 + 공깃밥", orderCount: 1, text: "공깃밥이 누락됐어요. 국밥만 와서 당황했습니다." },
      { id: "demo-3", platform: "배민", date: todayStr(-1), rating: 5, menu: "순대국밥", orderCount: 2, text: "국물이 진하고 칼칼해서 해장 제대로 했어요. 양도 푸짐합니다." },
      { id: "demo-4", platform: "배민", date: todayStr(-2), rating: 4, menu: "얼큰국밥", orderCount: null, text: "배달이 빨라서 뜨끈하게 먹었어요." },
      { id: "demo-5", platform: "쿠팡이츠", date: todayStr(-3), rating: 5, menu: "", orderCount: null, text: "맛있어요! 사장님 친절하세요." },
    ];
  }

  function withTags(review) {
    const tags = Rules.classify(review);
    return Object.assign(review, { incomplete: tags.incomplete });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }
      ta.remove();
      return ok;
    }
  }

  // 이벤트
  view.addEventListener("click", async (e) => {
    const go = e.target.closest("[data-go]");
    if (go) return navigate(go.dataset.go);

    const open = e.target.closest("[data-open]");
    if (open) return navigate("review/" + open.dataset.open);

    const pickBtn = e.target.closest("[data-pick]");
    if (pickBtn) {
      detailState.selected = Number(pickBtn.dataset.pick);
      return renderDetail(detailState.id);
    }

    const actionBtn = e.target.closest("[data-action]");
    if (!actionBtn) return;
    const action = actionBtn.dataset.action;
    const drafts = view.dataset.drafts ? JSON.parse(view.dataset.drafts) : [];

    if (action === "copy") {
      const ok = await copyText(drafts[detailState.selected] || "");
      toast(ok ? "복사했어요. 배민 앱에 붙여넣고 직접 등록해 주세요." : "복사가 안 됐어요. 초안을 길게 눌러 복사해 주세요.");
    } else if (action === "regen") {
      detailState.seed += 3;
      detailState.selected = 0;
      renderDetail(detailState.id);
      toast("새 초안을 만들었어요.");
    } else if (action === "done") {
      const text = drafts[detailState.selected];
      if (!text) return;
      Store.update(detailState.id, { reply: { text, date: todayStr() } });
      toast("답글 완료로 저장했어요.");
      renderDetail(detailState.id);
    } else if (action === "copy-done") {
      const r = Store.get(detailState.id);
      const ok = r && r.reply && (await copyText(r.reply.text));
      toast(ok ? "답글을 다시 복사했어요." : "복사가 안 됐어요.");
    } else if (action === "undo") {
      Store.update(detailState.id, { reply: null });
      toast("완료를 취소했어요.");
      renderDetail(detailState.id);
    } else if (action === "memo") {
      const memo = document.getElementById("memo").value.trim();
      Store.update(detailState.id, { memo });
      toast("메모를 저장했어요.");
    } else if (action === "demo") {
      let added = 0;
      demoReviews().forEach((r) => {
        if (Store.add(withTags(r)).review) added++;
      });
      toast(added ? `가짜 리뷰 ${added}개를 넣었어요.` : "시연용 리뷰가 이미 들어 있어요.");
      navigate("today");
    } else if (action === "reset") {
      if (confirm("이 폰에 저장된 리뷰를 모두 지울까요? 되돌릴 수 없어요.")) {
        Store.clear();
        toast("모두 지웠어요.");
        renderAdd();
      }
    }
  });

  view.addEventListener("submit", (e) => {
    if (e.target.id !== "add-form") return;
    e.preventDefault();
    const f = new FormData(e.target);
    const text = String(f.get("text") || "").trim();
    if (!text) {
      toast("리뷰 내용을 넣어 주세요.");
      return;
    }
    const rating = f.get("rating") ? Number(f.get("rating")) : null;
    const orderCount = f.get("orderCount") ? Number(f.get("orderCount")) : null;
    const review = withTags({
      platform: f.get("platform"),
      date: f.get("date") || todayStr(),
      rating,
      menu: String(f.get("menu") || "").trim(),
      orderCount: orderCount && orderCount > 0 ? Math.floor(orderCount) : null,
      text,
    });

    const result = Store.add(review);
    if (result.duplicate) {
      toast("이미 있는 리뷰예요.");
      return navigate("review/" + result.duplicate.id);
    }
    if (result.error) return toast(result.error);
    toast(review.incomplete ? "저장했어요. 별점이나 메뉴가 비어 '정보 부족'으로 표시돼요." : "저장했어요.");
    navigate("review/" + result.review.id);
  });

  // 화면 이동
  function navigate(route) {
    if (location.hash !== "#" + route) location.hash = route;
    else render();
  }

  function render() {
    const route = location.hash.replace(/^#/, "") || "today";
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", route === t.dataset.route || (t.dataset.route === "today" && route.startsWith("review/")));
    });
    if (route.startsWith("review/")) renderDetail(route.slice("review/".length));
    else if (route === "add") renderAdd();
    else renderToday();
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => navigate(t.dataset.route)));
  window.addEventListener("hashchange", render);

  // 주소 끝에 ?demo 를 붙여 열면, 리뷰가 하나도 없을 때 시연용 리뷰를 채운다.
  if (new URLSearchParams(location.search).has("demo") && Store.all().length === 0) {
    demoReviews().forEach((r) => Store.add(withTags(r)));
  }
  render();
})();
