// 자동 표시(불만·단골·칭찬)와 답글 초안 규칙 — AI 없이 정해 둔 단어와 문장 틀로 만든다.
(function () {
  const STORE_NAME = "마선생얼큰국밥";
  const REGULAR_MIN_ORDERS = 3;

  // 불만 유형: 리뷰에 이 단어가 있으면 불만으로 본다.
  const COMPLAINTS = {
    누락: ["누락", "빠졌", "빠져", "안 왔", "안왔", "안 들어", "안들어"],
    식음: ["식어", "식었", "차가", "미지근", "식은"],
    배달지연: ["늦게", "늦었", "지연", "오래 걸", "한참"],
    맛: ["짜요", "짰", "싱거", "싱겁", "맛없", "별로", "비려", "느끼"],
    양: ["양이 적", "양적", "적어요", "적었", "부족"],
    포장: ["샜", "새서", "흘러", "터져", "터졌", "엎어", "쏟아"],
    위생: ["머리카락", "이물", "벌레", "비닐"],
    서비스: ["불친절", "실망", "최악"],
  };

  // 칭찬 유형: 리뷰에서 짚어 줄 포인트.
  const PRAISES = {
    맛: ["맛있", "맛나", "최고", "진하", "진한", "칼칼", "얼큰", "시원", "깊", "감칠"],
    양: ["푸짐", "양 많", "양많", "넉넉", "든든"],
    배달: ["빠르", "빨리", "빨랐", "따뜻", "뜨끈", "뜨거"],
    포장: ["포장 꼼꼼", "포장이 꼼꼼", "깔끔"],
    서비스: ["친절", "감사", "센스"],
    재주문: ["또 시", "또시", "재주문", "또 주문", "자주 시", "단골", "번째"],
  };

  const REGULAR_WORDS = ["단골", "번째 주문", "또 시켰", "또시켰", "자주 시", "매번"];

  function has(text, words) {
    return words.some((w) => text.includes(w));
  }

  function classify(review) {
    const text = String(review.text || "");
    const rating = review.rating;
    const complaintTypes = Object.keys(COMPLAINTS).filter((k) => has(text, COMPLAINTS[k]));
    const praiseTypes = Object.keys(PRAISES).filter((k) => has(text, PRAISES[k]));

    const complaint = complaintTypes.length > 0 || (rating != null && rating <= 2);
    const regular =
      (review.orderCount != null && review.orderCount >= REGULAR_MIN_ORDERS) || has(text, REGULAR_WORDS);
    const praise = !complaint && (praiseTypes.length > 0 || (rating != null && rating >= 4));

    return {
      complaint,
      regular,
      praise,
      complaintTypes: complaint && complaintTypes.length === 0 ? ["기타"] : complaintTypes,
      praiseTypes,
      incomplete: rating == null || !review.menu,
      short: text.replace(/\s/g, "").length <= 25,
    };
  }

  // 문장 조각 — 같은 틀에서 다른 조합이 나오도록 여러 개씩 둔다.
  const OPEN = ["안녕하세요, {store}입니다.", "{store}입니다, 리뷰 남겨 주셔서 감사합니다.", "소중한 리뷰 감사합니다. {store}입니다."];

  const REGULAR = [
    "벌써 {n}번째 주문이시네요. 늘 잊지 않고 찾아 주셔서 정말 감사합니다.",
    "{n}번째 주문, 저희에겐 큰 힘이 됩니다. 믿고 또 시켜 주셔서 감사합니다.",
    "이번이 {n}번째 주문이시죠. 자주 찾아 주시는 만큼 한 그릇 한 그릇 더 신경 쓰겠습니다.",
  ];
  const REGULAR_NO_COUNT = [
    "늘 잊지 않고 또 찾아 주셔서 정말 감사합니다.",
    "믿고 다시 시켜 주시는 마음, 잘 알고 있습니다. 감사합니다.",
    "자주 찾아 주셔서 저희에겐 큰 힘이 됩니다.",
  ];

  // 짧은 리뷰("긴말 안 합니다")에 붙이는 한마디
  const SHORT_THANKS = [
    "짧은 한마디가 저희에겐 제일 큰 응원입니다.",
    "긴말 없이 또 찾아 주신 게 최고의 칭찬이네요.",
    "말씀은 짧아도 마음은 충분히 전해졌습니다.",
  ];

  const PRAISE = {
    맛: ["국물 맛을 좋게 봐 주셔서 기쁩니다. 끓이는 보람이 있네요.", "얼큰한 맛이 입에 맞으셨다니 다행입니다."],
    양: ["든든하게 드셨다니 저희도 뿌듯합니다.", "넉넉하게 담은 마음이 전해져서 기쁩니다."],
    배달: ["따뜻하게 받으셨다니 다행입니다.", "빠르게 받아 보셨다니 기쁩니다."],
    포장: ["포장까지 봐 주셔서 감사합니다.", "깔끔하게 받으셨다니 다행입니다."],
    서비스: ["따뜻한 말씀 감사합니다.", "좋게 봐 주셔서 힘이 납니다."],
    재주문: [],
  };
  const PRAISE_MENU = ["{menu} 맛있게 드셨다니 기쁩니다.", "{menu} 좋게 봐 주셔서 감사합니다."];
  const PRAISE_GENERIC = ["맛있게 드셨다니 저희도 기쁩니다.", "좋은 말씀 덕분에 오늘도 힘이 납니다."];

  const APOLOGY = [
    "불편을 드려 정말 죄송합니다.",
    "기대하신 만큼 만족스럽게 드리지 못해 진심으로 죄송합니다.",
    "먼저 불편을 끼쳐 드린 점 사과드립니다.",
  ];
  const FIX = {
    누락: "빠진 메뉴가 없도록 포장 마지막에 주문서와 한 번 더 맞춰 보겠습니다.",
    식음: "따뜻하게 받으실 수 있도록 포장과 보온을 다시 점검하겠습니다.",
    배달지연: "조리와 배차 시간을 다시 살펴 늦어지지 않도록 하겠습니다.",
    맛: "말씀하신 맛 부분은 레시피대로 나가는지 다시 확인하겠습니다.",
    양: "양이 부족하지 않도록 담는 기준을 다시 점검하겠습니다.",
    포장: "새거나 흘러넘치지 않도록 포장 방법을 바꿔 보겠습니다.",
    위생: "주방 위생을 바로 다시 점검하겠습니다.",
    서비스: "응대 하나하나 더 신경 쓰겠습니다.",
    기타: "말씀해 주신 부분을 꼭 확인하고 고치겠습니다.",
  };

  const CLOSE = ["다음에도 맛있는 한 그릇으로 보답하겠습니다.", "앞으로도 정성껏 끓이겠습니다.", "또 뵙겠습니다. 감사합니다!"];
  const CLOSE_COMPLAINT = [
    "다음에는 꼭 만족하실 수 있도록 하겠습니다.",
    "소중한 의견 덕분에 더 나아지겠습니다.",
    "다시 한번 죄송하고, 말씀 감사합니다.",
  ];

  // 문장 조각 고르기. round(다시 만들기 횟수)마다 조각 묶음(slot)별로 다르게 밀어서 새 조합을 만든다.
  function pick(list, seed, slot) {
    const round = Math.floor(seed / 3);
    const i = seed + round * (slot || 0);
    return list[((i % list.length) + list.length) % list.length];
  }

  function fill(sentence, review) {
    return sentence
      .replace("{store}", STORE_NAME)
      .replace("{n}", review.orderCount)
      .replace("{menu}", review.menu);
  }

  function praiseLine(review, tags, seed) {
    const lines = tags.praiseTypes.flatMap((t) => PRAISE[t] || []);
    if (lines.length) return pick(lines, seed, 7);
    if (review.menu) return pick(PRAISE_MENU, seed, 7);
    return pick(PRAISE_GENERIC, seed, 7);
  }

  function draftOne(review, tags, seed, variant) {
    const parts = [];
    if (tags.complaint) {
      parts.push(pick(OPEN, seed + variant, 1));
      if (tags.regular) parts.push(review.orderCount ? pick(REGULAR, seed + variant, 2) : pick(REGULAR_NO_COUNT, seed + variant, 2));
      parts.push(pick(APOLOGY, seed + variant, 2));
      tags.complaintTypes.forEach((t) => parts.push(FIX[t] || FIX.기타));
      parts.push(pick(CLOSE_COMPLAINT, seed + variant, 3));
      return parts.map((p) => fill(p, review)).join(" ");
    }

    // 짧은 리뷰("긴말 안 합니다")에는 짧고 담백하게.
    const shortStyle = tags.short || variant === 2;
    if (!shortStyle) parts.push(pick(OPEN, seed + variant, 1));
    if (tags.regular) {
      parts.push(review.orderCount ? pick(REGULAR, seed + variant, 2) : pick(REGULAR_NO_COUNT, seed + variant, 2));
    }
    if (shortStyle && tags.regular) {
      if (variant !== 0) parts.push(pick(SHORT_THANKS, seed + variant, 4));
    } else {
      parts.push(praiseLine(review, tags, seed + variant));
    }
    parts.push(pick(CLOSE, seed + variant, 3));
    return parts.map((p) => fill(p, review)).join(" ");
  }

  const STYLE_NAMES = ["기본", "다른 표현", "짧고 담백하게"];
  const STYLE_NAMES_COMPLAINT = ["기본", "다른 표현", "더 정중하게"];

  // 초안 3개. seed를 바꾸면(다시 만들기) 다른 조합이 나온다.
  function drafts(review, seed) {
    const tags = classify(review);
    const seen = new Set();
    const result = [];
    for (let v = 0; v < 3; v++) {
      const text = draftOne(review, tags, seed + v, v);
      if (seen.has(text)) continue;
      seen.add(text);
      result.push({ style: (tags.complaint ? STYLE_NAMES_COMPLAINT : STYLE_NAMES)[v], text });
    }
    return result;
  }

  window.Rules = { classify, drafts, REGULAR_MIN_ORDERS };
})();
