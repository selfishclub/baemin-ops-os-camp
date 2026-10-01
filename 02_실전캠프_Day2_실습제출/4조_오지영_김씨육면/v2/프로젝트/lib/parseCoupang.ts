/**
 * 쿠팡 카드매출전표 PDF.
 *
 * 카드 내역서에는 가맹점명이 `쿠팡(쿠페이)` 하나로만 찍혀서 무엇을 샀는지 알 수 없다.
 * 전표에는 상품명이 있고 승인번호가 함께 있어 카드 한 줄과 1:1로 붙는다.
 *
 * pdf.js 는 브라우저에서만 돌므로 cdn 에서 받아 쓴다.
 */

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174";

export interface CoupangReceipt {
  /** 카드 내역과 붙이는 열쇠 */
  approvalNo: string;
  /** YYYY-MM-DD */
  date: string | null;
  amount: number;
  /** 상품명 원문. 가공하지 않는다 */
  product: string;
  installment: string | null;
  page: number;
}

export interface CoupangParseResult {
  receipts: CoupangReceipt[];
  pages: number;
  total: number;
  warnings: string[];
}

type PdfLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: unknown) => { promise: Promise<PdfDoc> };
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = { getTextContent: () => Promise<{ items: { str: string }[] }> };

declare global {
  interface Window {
    pdfjsLib?: PdfLib;
  }
}

async function loadPdfJs(): Promise<PdfLib> {
  if (typeof window === "undefined") throw new Error("PDF는 브라우저에서만 읽을 수 있습니다.");
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise<void>((ok, no) => {
    const s = document.createElement("script");
    s.src = `${PDFJS}/pdf.min.js`;
    s.onload = () => ok();
    s.onerror = () => no(new Error("PDF 읽기 도구를 내려받지 못했습니다. 인터넷 연결을 확인해 주세요."));
    document.head.appendChild(s);
  });
  const lib = window.pdfjsLib!;
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.js`;
  return lib;
}

/** 전표는 글자 사이에 공백이 흩어져 들어온다. 붙여서 읽는다. */
const tight = (s: string) => s.replace(/\s+/g, "");
const num = (s: string) => Number(s.replace(/[^\d]/g, "")) || 0;

export async function parseCoupangPdf(data: ArrayBuffer): Promise<CoupangParseResult> {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true }).promise;

  const receipts: CoupangReceipt[] = [];
  const warnings: string[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const flat = tight(tc.items.map((i) => i.str).join(""));

    const approvalNo = flat.match(/승인번호(\d+)/)?.[1] ?? null;
    const dt = flat.match(/거래일시(\d{4})\/(\d{2})\/(\d{2})/);
    const amount = num(flat.match(/합계금액([\d,]+)원/)?.[1] ?? "");
    const product = flat.match(/상품명(.+?)과세금액/)?.[1] ?? "";
    const installment = flat.match(/할부개월(.+?)카드번호/)?.[1] ?? null;

    if (!approvalNo) {
      warnings.push(`${p}쪽에서 승인번호를 찾지 못했습니다. 카드 내역과 붙일 수 없습니다.`);
      continue;
    }
    if (!amount) warnings.push(`${p}쪽(승인 ${approvalNo})에서 금액을 읽지 못했습니다.`);

    receipts.push({
      approvalNo,
      date: dt ? `${dt[1]}-${dt[2]}-${dt[3]}` : null,
      amount,
      product,
      installment,
      page: p,
    });
  }

  return {
    receipts,
    pages: doc.numPages,
    total: receipts.reduce((a, b) => a + b.amount, 0),
    warnings,
  };
}

export interface CoupangMatch {
  matched: number;
  /** 카드 줄은 있는데 전표가 없는 것 */
  cardOnly: number;
  /** 전표는 있는데 카드 줄이 없는 것 */
  receiptOnly: CoupangReceipt[];
  /** 금액이 다른 것 — 한 승인번호에 전표가 여러 장이면 합쳐서 본다 */
  amountGaps: { approvalNo: string; card: number; receipt: number }[];
}

/**
 * 승인번호로 카드 내역과 전표를 맞춘다.
 * 한 승인번호에 전표가 여러 장인 경우가 있다(묶음 결제) — 합쳐서 금액을 본다.
 */
export function matchCoupang(
  cardRows: { approvalNo: string | null; amount: number }[],
  receipts: CoupangReceipt[]
): CoupangMatch {
  const byNo = new Map<string, CoupangReceipt[]>();
  for (const r of receipts) {
    const list = byNo.get(r.approvalNo);
    if (list) list.push(r);
    else byNo.set(r.approvalNo, [r]);
  }
  const seen = new Set<string>();
  let matched = 0;
  let cardOnly = 0;
  const amountGaps: CoupangMatch["amountGaps"] = [];

  for (const c of cardRows) {
    const no = c.approvalNo?.trim();
    const list = no ? byNo.get(no) : undefined;
    if (!list) {
      cardOnly++;
      continue;
    }
    seen.add(no!);
    matched++;
    const sum = list.reduce((a, b) => a + b.amount, 0);
    if (sum !== c.amount) amountGaps.push({ approvalNo: no!, card: c.amount, receipt: sum });
  }

  return {
    matched,
    cardOnly,
    receiptOnly: receipts.filter((r) => !seen.has(r.approvalNo)),
    amountGaps,
  };
}
