// 빈숲OS(포스기 HTML) 첫 화면에 "바뀐 레시피 N건" 배지를 띄우는 스크립트.
// 빈숲OS HTML의 </body> 바로 앞에 한 줄만 넣으면 된다:
//   <script src="https://beansoop-recipe-os.vercel.app/badge.js" defer></script>
// 건수만 가져오고 메뉴 이름은 가져오지 않는다. 누르면 레시피북(로그인 화면)으로 간다.
(function () {
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : "https://beansoop-recipe-os.vercel.app";

  function render(count, days) {
    var old = document.getElementById("beansoop-recipe-badge");
    if (old) old.remove();
    if (!count) return;
    var link = document.createElement("a");
    link.id = "beansoop-recipe-badge";
    link.href = origin + "/";
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "바뀐 레시피 " + count + "건 · 확인하기";
    link.setAttribute("aria-label", "최근 " + days + "일 안에 바뀐 레시피 " + count + "건, 레시피북 열기");
    link.style.cssText = [
      "position:fixed", "right:16px", "bottom:16px", "z-index:99999",
      "padding:12px 18px", "border-radius:999px", "background:#173f31", "color:#fff",
      "font:800 14px/1 system-ui,-apple-system,'Apple SD Gothic Neo','Malgun Gothic',sans-serif",
      "text-decoration:none", "box-shadow:0 10px 24px rgba(23,63,49,.35)",
    ].join(";");
    var dot = document.createElement("span");
    dot.style.cssText = "display:inline-block;width:8px;height:8px;margin-right:8px;border-radius:50%;background:#ff7a59;vertical-align:middle";
    link.prepend(dot);
    document.body.appendChild(link);
  }

  function refresh() {
    fetch(origin + "/api/badge", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (body) { render(Number(body.count || 0), body.days || 14); })
      .catch(function () {});
  }

  refresh();
  setInterval(refresh, 5 * 60 * 1000);
})();
