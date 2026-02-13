import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Download, Plus, Trash2, Calculator } from "lucide-react";
import jsPDF from "jspdf";

// IHT Seller Net Sheet Generator (Realtor-facing)
// Single-file React component.
// - Indiana tax proration (arrears)
// - IHT seller fee section
// - Owner’s policy premium auto-calc from chart

// -----------------------------
// Utilities
// -----------------------------

function isLeapYear(year: number) {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toMoney(n: number) {
  if (!Number.isFinite(n)) return "$0.00";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function parseNumber(value: string) {
  const cleaned = value.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatInputMoney(value: string) {
  return value.replace(/[^0-9.,$]/g, "");
}

function formatInputPercent(value: string) {
  return value.replace(/[^0-9.]/g, "");
}

function dateFromInput(v: string) {
  const [y, m, d] = v.split("-").map((x) => Number(x));
  if (!y || !m || !d) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isFinite(dt.getTime()) ? dt : null;
}

function ymd(dt: Date) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysUTC(dt: Date, days: number) {
  const copy = new Date(dt.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function daysBetweenInclusiveUTC(start: Date, end: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  if (e < s) return 0;
  return Math.floor((e - s) / msPerDay) + 1;
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

// -----------------------------
// Owner’s Policy Premium (from fee sheet chart)
// -----------------------------

type OwnerPremiumChoice = "mid" | "low" | "high";

type OwnerPolicyRow = { lo: number; hi: number; min: number; max: number };

const OWNER_POLICY_RANGE_CSV = `
0,50000,209,220
50001,60000,225,263
60001,70000,268,306
70001,80000,311,349
80001,90000,353,392
90001,100000,396,435
100001,110000,438,462
110001,120000,465,490
120001,130000,493,517
130001,140000,520,545
140001,150000,548,572
150001,160000,575,600
160001,170000,603,627
170001,180000,630,655
180001,190000,658,682
190001,200000,685,710
200001,210000,713,737
210001,220000,740,765
220001,230000,768,792
230001,240000,795,820
240001,250000,823,847
250001,260000,850,875
260001,270000,878,902
270001,280000,905,930
280001,290000,933,957
290001,300000,960,985
300001,310000,988,1012
310001,320000,1015,1040
320001,330000,1043,1067
330001,340000,1070,1095
340001,350000,1098,1122
350001,360000,1125,1147
360001,370000,1150,1172
370001,380000,1174,1197
380001,390000,1199,1221
390001,400000,1224,1246
400001,410000,1249,1271
410001,420000,1273,1296
420001,430000,1298,1320
430001,440000,1323,1345
440001,450000,1348,1370
450001,460000,1372,1395
460001,470000,1397,1419
470001,480000,1422,1444
480001,490000,1447,1469
490001,500000,1471,1494
500001,510000,1496,1518
510001,520000,1521,1543
520001,530000,1546,1568
530001,540000,1570,1593
540001,550000,1595,1617
550001,560000,1620,1642
560001,570000,1645,1667
570001,580000,1669,1692
580001,590000,1694,1716
590001,600000,1719,1741
600001,610000,1743,1762
610001,620000,1764,1783
620001,630000,1785,1804
630001,640000,1806,1825
640001,650000,1827,1846
650001,660000,1848,1868
660001,670000,1869,1894
670001,680000,1890,1919
680001,690000,1911,1944
690001,700000,1931,1969
700001,710000,1952,1995
710001,720000,1973,2020
720001,730000,1994,2045
730001,740000,2015,2071
740001,750000,2036,2096
750001,760000,2057,2121
760001,770000,2078,2147
770001,780000,2099,2172
780001,790000,2120,2197
790001,800000,2140,2222
800001,810000,2161,2248
810001,820000,2182,2273
820001,830000,2203,2298
830001,840000,2224,2324
840001,850000,2245,2349
850001,860000,2266,2374
860001,870000,2287,2400
870001,880000,2308,2425
880001,890000,2329,2450
890001,900000,2349,2475
900001,910000,2370,2501
910001,920000,2391,2526
920001,930000,2412,2551
930001,940000,2433,2577
940001,950000,2454,2602
950001,960000,2475,2627
960001,970000,2496,2653
970001,980000,2517,2678
980001,990000,2538,2703
990001,1000000,2558,2728
`;

const OWNER_POLICY_TABLE: OwnerPolicyRow[] = OWNER_POLICY_RANGE_CSV.trim()
  .split("\n")
  .map((line) => {
    const [lo, hi, min, max] = line.split(",").map((x) => Number(x));
    return { lo, hi, min, max };
  });

function calcOwnersPolicyPremium(liabilityAmount: number, choice: OwnerPremiumChoice = "mid") {
  const amt = Math.max(liabilityAmount || 0, 0);

  // Above $1,000,000: $2,728 + $22 per $10,000 (rounded up) over $1,000,000
  if (amt > 1_000_000) {
    const over = amt - 1_000_000;
    const tenThousands = Math.ceil(over / 10_000);
    const premium = 2728 + 22 * tenThousands;
    return { min: premium, max: premium, chosen: premium, mode: "above_1m" as const };
  }

  const row = OWNER_POLICY_TABLE.find((r) => amt >= r.lo && amt <= r.hi) || OWNER_POLICY_TABLE[0];
  const mid = round2((row.min + row.max) / 2);
  const chosen = choice === "low" ? row.min : choice === "high" ? row.max : mid;
  return { min: row.min, max: row.max, chosen: round2(chosen), mode: "table" as const };
}

// -----------------------------
// IHT Seller Title Fees
// -----------------------------

type TitleFeeItem = { label: string; amount: number };

type TitleFeeSettings = {
  transactionType: "with_loan" | "cash";
  countyType: "marion" | "other";
  useSimplifile: boolean;
  ownerPolicyPremium: number;
  includeSettlementFee: boolean;
  includeCPL: boolean;
  includeTIEFF: boolean;
  includeDeedRecording: boolean;
  includeTransferFeeSDF: boolean;
};

function calcIhtSellerTitleFees(s: TitleFeeSettings): { items: TitleFeeItem[]; total: number } {
  const items: TitleFeeItem[] = [];

  if (s.ownerPolicyPremium > 0) items.push({ label: "Owner’s title policy (estimate)", amount: s.ownerPolicyPremium });

  if (s.includeSettlementFee) {
    const settlement = s.transactionType === "with_loan" ? 390 : 290;
    items.push({ label: "Settlement / closing fee (seller)", amount: settlement });
  }

  items.push({ label: "Title processing fee (seller)", amount: 175 });
  items.push({ label: "Closing processing fee (seller)", amount: 150 });

  if (s.includeCPL) items.push({ label: "CPL (seller)", amount: 25 });
  if (s.includeTIEFF) items.push({ label: "TIEFF (seller)", amount: 5 });

  if (s.includeDeedRecording) {
    const deedRecording = s.countyType === "marion" ? 35 : 25;
    items.push({ label: "Recording fee: deed", amount: deedRecording });
    if (s.useSimplifile) items.push({ label: "Simplifile submission (deed)", amount: 4.25 });
  }

  if (s.includeTransferFeeSDF) items.push({ label: "County transfer fee + SDF", amount: 30 });

  const total = round2(items.reduce((sum, x) => sum + (x.amount || 0), 0));
  return { items: items.map((x) => ({ ...x, amount: round2(x.amount) })), total };
}

// -----------------------------
// Tax Proration (Indiana arrears)
// -----------------------------

type TaxSettings = {
  priorYearTax: number;
  springPaid: boolean;
  springPaidAmount: number;
  fallPaid: boolean;
  fallPaidAmount: number;
  prorateThrough: "day_before" | "closing_date";
  force365: boolean;
};

type TaxBreakdown = {
  prorationEndYMD: string;
  daysInYear: number;
  dailyRate: number;
  daysAccrued: number;
  accruedThisYear: number;
  paidTotal: number;
  unpaidPriorYear: number;
  totalDebit: number;
};

function calcIndianaTaxProration(closingUTC: Date, tax: TaxSettings): TaxBreakdown {
  const year = closingUTC.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const prorationEnd = tax.prorateThrough === "day_before" ? addDaysUTC(closingUTC, -1) : closingUTC;

  const daysInYear = tax.force365 ? 365 : isLeapYear(year) ? 366 : 365;
  const TY = Math.max(tax.priorYearTax || 0, 0);
  const dailyRate = TY / daysInYear;

  const daysAccrued = prorationEnd.getTime() < jan1.getTime() ? 0 : daysBetweenInclusiveUTC(jan1, prorationEnd);
  const accruedThisYear = dailyRate * daysAccrued;

  const paidTotal =
    (tax.springPaid ? Math.max(tax.springPaidAmount || 0, 0) : 0) +
    (tax.fallPaid ? Math.max(tax.fallPaidAmount || 0, 0) : 0);

  const unpaidPriorYear = Math.max(TY - paidTotal, 0);
  const totalDebit = unpaidPriorYear + accruedThisYear;

  return {
    prorationEndYMD: ymd(prorationEnd),
    daysInYear,
    dailyRate,
    daysAccrued,
    accruedThisYear,
    paidTotal,
    unpaidPriorYear,
    totalDebit,
  };
}

// -----------------------------
// PDF
// -----------------------------

function buildPdf(opts: {
  salePrice: number;
  closingYMD: string;
  commissionLabel: string;
  commissionAmount: number;
  mortgagePayoff: number;
  sellerConcessions: number;
  otherCosts: { label: string; amount: number }[];
  titleFees: TitleFeeItem[];
  titleFeesTotal: number;
  tax: TaxBreakdown;
  taxDebitRounded: number;
  estimatedNet: number;
}) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const margin = 48;
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Indiana Home Title", margin, 64);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text("Seller Net Sheet (Estimate)", margin, 86);

  doc.setDrawColor(0);
  doc.setLineWidth(0.75);
  doc.line(margin, 98, pageW - margin, 98);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Deal Summary", margin, 132);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);

  const leftX = margin;
  const rightX = pageW - margin;

  const otherTotal = opts.otherCosts.reduce((a, b) => a + (b.amount || 0), 0);

  const rows: Array<[string, string]> = [
    ["Sale price", toMoney(opts.salePrice)],
    ["Closing date", opts.closingYMD],
    ["Commission", `${opts.commissionLabel}  (${toMoney(opts.commissionAmount)})`],
    ["Mortgage payoff", `(${toMoney(opts.mortgagePayoff)})`],
    ["Seller concessions", `(${toMoney(opts.sellerConcessions)})`],
    ["Other seller-paid costs", `(${toMoney(otherTotal)})`],
    ["IHT title fees (seller)", `(${toMoney(opts.titleFeesTotal)})`],
    ["Estimated property tax proration (IN arrears)", `(${toMoney(opts.taxDebitRounded)})`],
  ];

  let y = 156;
  for (const [k, v] of rows) {
    doc.text(k, leftX, y);
    doc.text(v, rightX, y, { align: "right" });
    y += 18;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Estimated Net to Seller", leftX, y + 10);
  doc.text(toMoney(opts.estimatedNet), rightX, y + 10, { align: "right" });

  const tfTop = y + 44;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("IHT Seller Fees (Detail)", margin, tfTop);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);

  let tfy = tfTop + 18;
  for (const item of opts.titleFees.slice(0, 12)) {
    doc.text(item.label, leftX, tfy);
    doc.text(toMoney(item.amount), rightX, tfy, { align: "right" });
    tfy += 16;
  }

  const boxTop = tfy + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Indiana Tax Proration Detail", margin, boxTop);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);

  const t = opts.tax;
  const detailRows: Array<[string, string]> = [
    ["Proration through", t.prorationEndYMD],
    ["Days in year", String(t.daysInYear)],
    ["Daily rate", toMoney(round2(t.dailyRate))],
    ["Days accrued", String(t.daysAccrued)],
    ["Accrued this year", toMoney(round2(t.accruedThisYear))],
    ["Unpaid prior-year portion", toMoney(round2(t.unpaidPriorYear))],
    ["Total estimated proration", toMoney(opts.taxDebitRounded)],
  ];

  let yy = boxTop + 18;
  for (const [k, v] of detailRows) {
    doc.text(k, leftX, yy);
    doc.text(v, rightX, yy, { align: "right" });
    yy += 16;
  }

  doc.setFontSize(9);
  doc.setTextColor(60);
  const disclaimer =
    "Estimate only. Actual prorations, premiums, and settlement charges may differ based on county treasurer records, underwriting rules, and the final settlement statement.";
  doc.text(disclaimer, margin, 732, { maxWidth: pageW - margin * 2 });

  return doc;
}

// -----------------------------
// UI
// -----------------------------

export default function IHTSellerNetSheetApp() {
  const [salePriceInput, setSalePriceInput] = useState("330,000");
  const [closingInput, setClosingInput] = useState(() => {
    const now = new Date();
    const dt = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    return ymd(addDaysUTC(dt, 10));
  });

  const [commissionType, setCommissionType] = useState<"pct" | "flat">("pct");
  const [commissionPct, setCommissionPct] = useState("6");
  const [commissionFlatInput, setCommissionFlatInput] = useState("0");

  const [mortgagePayoffInput, setMortgagePayoffInput] = useState("0");
  const [sellerConcessionsInput, setSellerConcessionsInput] = useState("0");

  const [otherCosts, setOtherCosts] = useState<Array<{ id: string; label: string; amountInput: string }>>([
    { id: "c1", label: "Home warranty", amountInput: "0" },
  ]);

  // Title fee inputs (seller)
  const [transactionType, setTransactionType] = useState<"with_loan" | "cash">("with_loan");
  const [countyType, setCountyType] = useState<"marion" | "other">("marion");
  const [useSimplifile, setUseSimplifile] = useState(true);

  const [autoOwnerPolicy, setAutoOwnerPolicy] = useState(true);
  const [ownerPolicyChoice, setOwnerPolicyChoice] = useState<OwnerPremiumChoice>("mid");
  const [ownerPolicyPremiumInput, setOwnerPolicyPremiumInput] = useState("0");

  const [includeSettlementFee, setIncludeSettlementFee] = useState(true);
  const [includeCPL, setIncludeCPL] = useState(true);
  const [includeTIEFF, setIncludeTIEFF] = useState(true);
  const [includeDeedRecording, setIncludeDeedRecording] = useState(true);
  const [includeTransferFeeSDF, setIncludeTransferFeeSDF] = useState(true);

  // Tax inputs
  const [priorYearTaxInput, setPriorYearTaxInput] = useState("3,200");
  const [springPaid, setSpringPaid] = useState(false);
  const [fallPaid, setFallPaid] = useState(false);
  const [springPaidInput, setSpringPaidInput] = useState("1,600");
  const [fallPaidInput, setFallPaidInput] = useState("1,600");
  const [prorateThrough, setProrateThrough] = useState<TaxSettings["prorateThrough"]>("day_before");
  const [force365, setForce365] = useState(false);

  const salePrice = useMemo(() => parseNumber(salePriceInput), [salePriceInput]);
  const mortgagePayoff = useMemo(() => parseNumber(mortgagePayoffInput), [mortgagePayoffInput]);
  const sellerConcessions = useMemo(() => parseNumber(sellerConcessionsInput), [sellerConcessionsInput]);
  const priorYearTax = useMemo(() => parseNumber(priorYearTaxInput), [priorYearTaxInput]);

  const springPaidAmount = useMemo(() => parseNumber(springPaidInput), [springPaidInput]);
  const fallPaidAmount = useMemo(() => parseNumber(fallPaidInput), [fallPaidInput]);

  const closingUTC = useMemo(() => {
    const dt = dateFromInput(closingInput);
    return dt ?? new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
  }, [closingInput]);

  const commissionAmount = useMemo(() => {
    if (commissionType === "pct") {
      const pct = parseNumber(commissionPct);
      return salePrice * (pct / 100);
    }
    return parseNumber(commissionFlatInput);
  }, [commissionType, commissionPct, commissionFlatInput, salePrice]);

  const otherCostsTotal = useMemo(() => otherCosts.reduce((sum, c) => sum + parseNumber(c.amountInput), 0), [otherCosts]);

  const ownerPolicyAuto = useMemo(() => calcOwnersPolicyPremium(salePrice, ownerPolicyChoice), [salePrice, ownerPolicyChoice]);
  const ownerPolicyPremium = useMemo(
    () => (autoOwnerPolicy ? ownerPolicyAuto.chosen : parseNumber(ownerPolicyPremiumInput)),
    [autoOwnerPolicy, ownerPolicyAuto.chosen, ownerPolicyPremiumInput]
  );

  const sellerFeeCalc = useMemo(() => {
    return calcIhtSellerTitleFees({
      transactionType,
      countyType,
      useSimplifile,
      ownerPolicyPremium,
      includeSettlementFee,
      includeCPL,
      includeTIEFF,
      includeDeedRecording,
      includeTransferFeeSDF,
    });
  }, [
    transactionType,
    countyType,
    useSimplifile,
    ownerPolicyPremium,
    includeSettlementFee,
    includeCPL,
    includeTIEFF,
    includeDeedRecording,
    includeTransferFeeSDF,
  ]);

  const sellerTitleFees = sellerFeeCalc.items;
  const sellerTitleFeesTotal = sellerFeeCalc.total;

  const taxSettings: TaxSettings = useMemo(
    () => ({
      priorYearTax,
      springPaid,
      springPaidAmount: springPaidAmount || Math.max(priorYearTax / 2, 0),
      fallPaid,
      fallPaidAmount: fallPaidAmount || Math.max(priorYearTax / 2, 0),
      prorateThrough,
      force365,
    }),
    [priorYearTax, springPaid, springPaidAmount, fallPaid, fallPaidAmount, prorateThrough, force365]
  );

  const tax = useMemo(() => calcIndianaTaxProration(closingUTC, taxSettings), [closingUTC, taxSettings]);
  const taxDebitRounded = useMemo(() => round2(tax.totalDebit), [tax.totalDebit]);

  const estimatedNet = useMemo(() => {
    const net =
      salePrice -
      commissionAmount -
      mortgagePayoff -
      sellerConcessions -
      otherCostsTotal -
      sellerTitleFeesTotal -
      taxDebitRounded;
    return round2(net);
  }, [salePrice, commissionAmount, mortgagePayoff, sellerConcessions, otherCostsTotal, sellerTitleFeesTotal, taxDebitRounded]);

  const commissionLabel = useMemo(() => (commissionType === "pct" ? String(parseNumber(commissionPct)) + "%" : "Flat"), [commissionType, commissionPct]);

  function addOtherCost() {
    setOtherCosts((prev) => [...prev, { id: "c" + Math.random().toString(16).slice(2), label: "Other", amountInput: "0" }]);
  }

  function removeOtherCost(id: string) {
    setOtherCosts((prev) => prev.filter((x) => x.id !== id));
  }

  function downloadPdf() {
    const doc = buildPdf({
      salePrice,
      closingYMD: ymd(closingUTC),
      commissionLabel,
      commissionAmount: round2(commissionAmount),
      mortgagePayoff: round2(mortgagePayoff),
      sellerConcessions: round2(sellerConcessions),
      otherCosts: otherCosts.map((c) => ({ label: c.label, amount: round2(parseNumber(c.amountInput)) })),
      titleFees: sellerTitleFees,
      titleFeesTotal: sellerTitleFeesTotal,
      tax,
      taxDebitRounded,
      estimatedNet,
    });

    doc.save(`IHT_Seller_Net_Sheet_${ymmdSafe(ymd(closingUTC))}.pdf`);
  }

  const cardMotion = {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.25 },
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <motion.div {...cardMotion} className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-neutral-900 text-white shadow-sm">
              <Calculator size={18} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">IHT Seller Net Sheet Generator</h1>
              <p className="text-sm text-neutral-600">Indiana arrears tax proration + IHT seller fees.</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <button
              onClick={downloadPdf}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
              type="button"
            >
              <Download size={16} /> Download PDF
            </button>
            <p className="text-[11px] text-neutral-500 max-w-[340px] text-right">
              Estimate only. Actual prorations, premiums, and settlement charges may differ based on county records and the final settlement statement.
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <motion.div {...cardMotion} className="lg:col-span-2">
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
              <h2 className="text-lg font-semibold">1) Deal</h2>

              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Sale price" hint="Example: 330000">
                  <input
                    value={salePriceInput}
                    onChange={(e) => setSalePriceInput(formatInputMoney(e.target.value))}
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                    inputMode="decimal"
                  />
                </Field>

                <Field label="Closing date" hint="Used for tax accrual days">
                  <div className="relative">
                    <input
                      type="date"
                      value={closingInput}
                      onChange={(e) => setClosingInput(e.target.value)}
                      className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 pr-10 text-sm outline-none focus:border-neutral-900"
                    />
                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                  </div>
                </Field>

                <div className="sm:col-span-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-sm font-medium">Commission</div>
                    <div className="inline-flex rounded-2xl bg-neutral-100 p-1">
                      <button
                        onClick={() => setCommissionType("pct")}
                        className={cx("rounded-2xl px-3 py-2 text-sm", commissionType === "pct" ? "bg-white shadow-sm" : "text-neutral-600")}
                        type="button"
                      >
                        %
                      </button>
                      <button
                        onClick={() => setCommissionType("flat")}
                        className={cx("rounded-2xl px-3 py-2 text-sm", commissionType === "flat" ? "bg-white shadow-sm" : "text-neutral-600")}
                        type="button"
                      >
                        $
                      </button>
                    </div>

                    {commissionType === "pct" ? (
                      <div className="flex items-center gap-2">
                        <input
                          value={commissionPct}
                          onChange={(e) => setCommissionPct(formatInputPercent(e.target.value))}
                          className="w-28 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                          inputMode="decimal"
                        />
                        <span className="text-sm text-neutral-600">%</span>
                      </div>
                    ) : (
                      <input
                        value={commissionFlatInput}
                        onChange={(e) => setCommissionFlatInput(formatInputMoney(e.target.value))}
                        className="w-48 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                        inputMode="decimal"
                      />
                    )}
                  </div>
                  <div className="mt-2 text-xs text-neutral-500">Calculated commission: {toMoney(round2(commissionAmount))}</div>
                </div>

                <Field label="Mortgage payoff (optional)">
                  <input
                    value={mortgagePayoffInput}
                    onChange={(e) => setMortgagePayoffInput(formatInputMoney(e.target.value))}
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                    inputMode="decimal"
                  />
                </Field>

                <Field label="Seller concessions (optional)">
                  <input
                    value={sellerConcessionsInput}
                    onChange={(e) => setSellerConcessionsInput(formatInputMoney(e.target.value))}
                    className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                    inputMode="decimal"
                  />
                </Field>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Other seller-paid costs</h3>
                  <button
                    onClick={addOtherCost}
                    className="inline-flex items-center gap-2 rounded-2xl bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
                    type="button"
                  >
                    <Plus size={16} /> Add
                  </button>
                </div>

                <div className="mt-3 space-y-3">
                  {otherCosts.map((c) => (
                    <div key={c.id} className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                      <input
                        value={c.label}
                        onChange={(e) => setOtherCosts((prev) => prev.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)))}
                        className="sm:col-span-3 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                        placeholder="Label"
                      />
                      <input
                        value={c.amountInput}
                        onChange={(e) => setOtherCosts((prev) => prev.map((x) => (x.id === c.id ? { ...x, amountInput: formatInputMoney(e.target.value) } : x)))}
                        className="sm:col-span-2 w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                        inputMode="decimal"
                        placeholder="0"
                      />
                      <div className="sm:col-span-5 -mt-1 flex justify-end">
                        {otherCosts.length > 1 && (
                          <button
                            onClick={() => removeOtherCost(c.id)}
                            className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                            type="button"
                          >
                            <Trash2 size={14} /> Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 text-xs text-neutral-500">Other costs total: {toMoney(round2(otherCostsTotal))}</div>
              </div>

              <SectionTitleFees
                transactionType={transactionType}
                setTransactionType={setTransactionType}
                countyType={countyType}
                setCountyType={setCountyType}
                useSimplifile={useSimplifile}
                setUseSimplifile={setUseSimplifile}
                autoOwnerPolicy={autoOwnerPolicy}
                setAutoOwnerPolicy={setAutoOwnerPolicy}
                ownerPolicyChoice={ownerPolicyChoice}
                setOwnerPolicyChoice={setOwnerPolicyChoice}
                ownerPolicyAuto={ownerPolicyAuto}
                ownerPolicyPremiumInput={ownerPolicyPremiumInput}
                setOwnerPolicyPremiumInput={setOwnerPolicyPremiumInput}
                includeSettlementFee={includeSettlementFee}
                setIncludeSettlementFee={setIncludeSettlementFee}
                includeCPL={includeCPL}
                setIncludeCPL={setIncludeCPL}
                includeTIEFF={includeTIEFF}
                setIncludeTIEFF={setIncludeTIEFF}
                includeDeedRecording={includeDeedRecording}
                setIncludeDeedRecording={setIncludeDeedRecording}
                includeTransferFeeSDF={includeTransferFeeSDF}
                setIncludeTransferFeeSDF={setIncludeTransferFeeSDF}
                sellerTitleFees={sellerTitleFees}
                sellerTitleFeesTotal={sellerTitleFeesTotal}
              />

              <SectionTaxes
                priorYearTaxInput={priorYearTaxInput}
                setPriorYearTaxInput={setPriorYearTaxInput}
                springPaid={springPaid}
                setSpringPaid={setSpringPaid}
                fallPaid={fallPaid}
                setFallPaid={setFallPaid}
                springPaidInput={springPaidInput}
                setSpringPaidInput={setSpringPaidInput}
                fallPaidInput={fallPaidInput}
                setFallPaidInput={setFallPaidInput}
                prorateThrough={prorateThrough}
                setProrateThrough={setProrateThrough}
                force365={force365}
                setForce365={setForce365}
              />
            </div>
          </motion.div>

          <motion.div {...cardMotion} className="lg:col-span-1">
            <ResultsCard
              salePrice={salePrice}
              commissionAmount={commissionAmount}
              mortgagePayoff={mortgagePayoff}
              sellerConcessions={sellerConcessions}
              otherCostsTotal={otherCostsTotal}
              sellerTitleFeesTotal={sellerTitleFeesTotal}
              taxDebitRounded={taxDebitRounded}
              estimatedNet={estimatedNet}
              tax={tax}
              downloadPdf={downloadPdf}
            />
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function ymmdSafe(s: string) {
  // keep filename safe
  return String(s || "").replace(/[^0-9-]/g, "");
}

// -----------------------------
// Sections
// -----------------------------

function SectionTitleFees(props: {
  transactionType: "with_loan" | "cash";
  setTransactionType: (v: "with_loan" | "cash") => void;
  countyType: "marion" | "other";
  setCountyType: (v: "marion" | "other") => void;
  useSimplifile: boolean;
  setUseSimplifile: (v: boolean) => void;
  autoOwnerPolicy: boolean;
  setAutoOwnerPolicy: (v: boolean) => void;
  ownerPolicyChoice: OwnerPremiumChoice;
  setOwnerPolicyChoice: (v: OwnerPremiumChoice) => void;
  ownerPolicyAuto: { min: number; max: number; chosen: number; mode: "table" | "above_1m" };
  ownerPolicyPremiumInput: string;
  setOwnerPolicyPremiumInput: (v: string) => void;
  includeSettlementFee: boolean;
  setIncludeSettlementFee: (v: boolean) => void;
  includeCPL: boolean;
  setIncludeCPL: (v: boolean) => void;
  includeTIEFF: boolean;
  setIncludeTIEFF: (v: boolean) => void;
  includeDeedRecording: boolean;
  setIncludeDeedRecording: (v: boolean) => void;
  includeTransferFeeSDF: boolean;
  setIncludeTransferFeeSDF: (v: boolean) => void;
  sellerTitleFees: TitleFeeItem[];
  sellerTitleFeesTotal: number;
}) {
  return (
    <div className="mt-8 rounded-3xl bg-neutral-50 p-5 ring-1 ring-black/5">
      <h2 className="text-lg font-semibold">2) IHT Title Fees (Seller)</h2>
      <p className="mt-1 text-sm text-neutral-600">Toggle seller-paid items to match the contract. Owner’s Policy can auto-calc from the chart.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm font-medium">Transaction type</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill active={props.transactionType === "with_loan"} onClick={() => props.setTransactionType("with_loan")} label="Purchase w/ loan" />
            <Pill active={props.transactionType === "cash"} onClick={() => props.setTransactionType("cash")} label="Cash" />
          </div>

          <div className="mt-4 text-sm font-medium">County</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill active={props.countyType === "marion"} onClick={() => props.setCountyType("marion")} label="Marion" />
            <Pill active={props.countyType === "other"} onClick={() => props.setCountyType("other")} label="All other" />
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={props.useSimplifile}
              onChange={(e) => props.setUseSimplifile(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300"
            />
            Include Simplifile (if e-recording)
          </label>
        </div>

        <div>
          <Field label="Owner’s policy premium (estimate)" hint="Auto from sale price unless turned off">
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <input
                  type="checkbox"
                  checked={props.autoOwnerPolicy}
                  onChange={(e) => props.setAutoOwnerPolicy(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                Auto-calc from sale price (fee chart)
              </label>

              {props.autoOwnerPolicy ? (
                <div className="rounded-3xl bg-neutral-50 p-4 ring-1 ring-black/5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium text-neutral-600">Range from chart</div>
                      <div className="mt-1 text-sm font-semibold">
                        {toMoney(props.ownerPolicyAuto.min)} to {toMoney(props.ownerPolicyAuto.max)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-medium text-neutral-600">Using</div>
                      <select
                        value={props.ownerPolicyChoice}
                        onChange={(e) => props.setOwnerPolicyChoice(e.target.value as OwnerPremiumChoice)}
                        className="mt-1 rounded-2xl border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-neutral-900"
                      >
                        <option value="mid">Midpoint</option>
                        <option value="low">Low</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-neutral-600">
                    Chosen premium: <span className="font-semibold">{toMoney(props.ownerPolicyAuto.chosen)}</span>
                  </div>
                </div>
              ) : (
                <input
                  value={props.ownerPolicyPremiumInput}
                  onChange={(e) => props.setOwnerPolicyPremiumInput(formatInputMoney(e.target.value))}
                  className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
                  inputMode="decimal"
                  placeholder="0"
                />
              )}
            </div>
          </Field>

          <div className="mt-4 grid grid-cols-1 gap-2">
            <CheckRow label="Settlement / closing fee (seller)" checked={props.includeSettlementFee} onChange={props.setIncludeSettlementFee} />
            <CheckRow label="CPL (seller)" checked={props.includeCPL} onChange={props.setIncludeCPL} />
            <CheckRow label="TIEFF (seller)" checked={props.includeTIEFF} onChange={props.setIncludeTIEFF} />
            <CheckRow label="Deed recording + e-recording" checked={props.includeDeedRecording} onChange={props.setIncludeDeedRecording} />
            <CheckRow label="Transfer fee + SDF" checked={props.includeTransferFeeSDF} onChange={props.setIncludeTransferFeeSDF} />
          </div>

          <div className="mt-4 rounded-3xl bg-white p-4 ring-1 ring-black/5">
            <div className="text-xs font-medium text-neutral-600">IHT seller fees total</div>
            <div className="mt-1 text-lg font-semibold">{toMoney(props.sellerTitleFeesTotal)}</div>
          </div>
        </div>

        <div className="sm:col-span-2 rounded-3xl bg-white p-4 ring-1 ring-black/5">
          <div className="text-sm font-semibold">Fee detail</div>
          <div className="mt-2 space-y-2 text-sm">
            {props.sellerTitleFees.map((x) => (
              <Detail key={x.label} k={x.label} v={toMoney(x.amount)} />
            ))}
            <div className="border-t border-neutral-200 pt-2">
              <Detail k="Total IHT seller fees" v={toMoney(props.sellerTitleFeesTotal)} strong />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTaxes(props: {
  priorYearTaxInput: string;
  setPriorYearTaxInput: (v: string) => void;
  springPaid: boolean;
  setSpringPaid: (v: boolean) => void;
  fallPaid: boolean;
  setFallPaid: (v: boolean) => void;
  springPaidInput: string;
  setSpringPaidInput: (v: string) => void;
  fallPaidInput: string;
  setFallPaidInput: (v: string) => void;
  prorateThrough: "day_before" | "closing_date";
  setProrateThrough: (v: "day_before" | "closing_date") => void;
  force365: boolean;
  setForce365: (v: boolean) => void;
}) {
  return (
    <div className="mt-8 rounded-3xl bg-neutral-50 p-5 ring-1 ring-black/5">
      <h2 className="text-lg font-semibold">3) Indiana Property Taxes (Paid in Arrears)</h2>
      <p className="mt-1 text-sm text-neutral-600">Uses prior-year taxes as the basis for daily accrual, then reduces debit by any paid installments.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Prior-year annual tax amount" hint="From the tax bill / treasurer">
          <input
            value={props.priorYearTaxInput}
            onChange={(e) => props.setPriorYearTaxInput(formatInputMoney(e.target.value))}
            className="w-full rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-neutral-900"
            inputMode="decimal"
          />
        </Field>

        <div>
          <div className="text-sm font-medium">Prorate through</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Pill active={props.prorateThrough === "day_before"} onClick={() => props.setProrateThrough("day_before")} label="Day before closing" />
            <Pill active={props.prorateThrough === "closing_date"} onClick={() => props.setProrateThrough("closing_date")} label="Closing date" />
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={props.force365} onChange={(e) => props.setForce365(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
            Force 365-day year
          </label>

          <div className="mt-1 text-xs text-neutral-500">Default uses actual days in the closing year (leap years included).</div>
        </div>

        <div className="sm:col-span-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TaxInstallment
            title="Spring installment"
            subtitle="Typically due May 10"
            paid={props.springPaid}
            onPaid={props.setSpringPaid}
            amount={props.springPaidInput}
            onAmount={props.setSpringPaidInput}
          />
          <TaxInstallment
            title="Fall installment"
            subtitle="Typically due Nov 10"
            paid={props.fallPaid}
            onPaid={props.setFallPaid}
            amount={props.fallPaidInput}
            onAmount={props.setFallPaidInput}
          />
        </div>
      </div>
    </div>
  );
}

function ResultsCard(props: {
  salePrice: number;
  commissionAmount: number;
  mortgagePayoff: number;
  sellerConcessions: number;
  otherCostsTotal: number;
  sellerTitleFeesTotal: number;
  taxDebitRounded: number;
  estimatedNet: number;
  tax: TaxBreakdown;
  downloadPdf: () => void;
}) {
  return (
    <div className="sticky top-6 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-black/5">
      <h2 className="text-lg font-semibold">4) Results</h2>

      <div className="mt-4 space-y-3">
        <Row k="Sale price" v={toMoney(round2(props.salePrice))} />
        <Row k="Commission" v={`(${toMoney(round2(props.commissionAmount))})`} />
        <Row k="Mortgage payoff" v={`(${toMoney(round2(props.mortgagePayoff))})`} />
        <Row k="Seller concessions" v={`(${toMoney(round2(props.sellerConcessions))})`} />
        <Row k="Other costs" v={`(${toMoney(round2(props.otherCostsTotal))})`} />
        <Row k="IHT title fees (seller)" v={`(${toMoney(round2(props.sellerTitleFeesTotal))})`} />
        <Row k="Tax proration (IN arrears)" v={`(${toMoney(round2(props.taxDebitRounded))})`} />
      </div>

      <div className="mt-4 rounded-3xl bg-neutral-50 p-4 ring-1 ring-black/5">
        <div className="text-xs font-medium text-neutral-600">Estimated net to seller</div>
        <div className="mt-1 text-2xl font-semibold tracking-tight">{toMoney(props.estimatedNet)}</div>
      </div>

      <div className="mt-6">
        <div className="text-sm font-semibold">Tax proration detail</div>
        <div className="mt-2 rounded-3xl bg-white p-4 ring-1 ring-black/5">
          <div className="space-y-2 text-sm">
            <Detail k="Proration through" v={props.tax.prorationEndYMD} />
            <Detail k="Days accrued" v={String(props.tax.daysAccrued)} />
            <Detail k="Days in year" v={String(props.tax.daysInYear)} />
            <Detail k="Daily rate" v={toMoney(round2(props.tax.dailyRate))} />
            <Detail k="Accrued this year" v={toMoney(round2(props.tax.accruedThisYear))} />
            <Detail k="Unpaid prior-year" v={toMoney(round2(props.tax.unpaidPriorYear))} />
            <div className="border-t border-neutral-200 pt-2">
              <Detail k="Total proration" v={toMoney(round2(props.taxDebitRounded))} strong />
            </div>
          </div>
        </div>

        <div className="mt-3 text-[11px] text-neutral-500">
          Notes: Indiana property taxes are commonly prorated in arrears. Marking installments as paid reduces the seller debit.
        </div>
      </div>

      <button
        onClick={props.downloadPdf}
        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
        type="button"
      >
        <Download size={16} /> Download PDF
      </button>
    </div>
  );
}

// -----------------------------
// UI atoms
// -----------------------------

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-end justify-between gap-2">
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-neutral-500">{hint}</div> : null}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-2xl px-3 py-2 text-sm ring-1 transition",
        active ? "bg-neutral-900 text-white ring-neutral-900" : "bg-white text-neutral-700 ring-neutral-200 hover:bg-neutral-50"
      )}
      type="button"
    >
      {label}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="text-neutral-700">{k}</div>
      <div className="font-medium text-neutral-900">{v}</div>
    </div>
  );
}

function Detail({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-neutral-600">{k}</div>
      <div className={cx(strong ? "font-semibold" : "font-medium", "text-neutral-900")}>{v}</div>
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
      {label}
    </label>
  );
}

function TaxInstallment({
  title,
  subtitle,
  paid,
  onPaid,
  amount,
  onAmount,
}: {
  title: string;
  subtitle: string;
  paid: boolean;
  onPaid: (v: boolean) => void;
  amount: string;
  onAmount: (v: string) => void;
}) {
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-xs text-neutral-500">{subtitle}</div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => onPaid(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
          Paid
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-neutral-600">Amount paid</div>
        <input
          value={amount}
          onChange={(e) => onAmount(formatInputMoney(e.target.value))}
          disabled={!paid}
          className={cx(
            "mt-1 w-full rounded-2xl border px-4 py-3 text-sm outline-none",
            paid ? "border-neutral-200 bg-white focus:border-neutral-900" : "border-neutral-200 bg-neutral-100 text-neutral-400"
          )}
          inputMode="decimal"
        />
      </div>
    </div>
  );
}

// -----------------------------
// Minimal self-tests (no framework)
// -----------------------------

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runSelfTests() {
  const pLow50 = calcOwnersPolicyPremium(50_000, "low");
  assert(pLow50.chosen === 209, "Owner policy 50k low should be 209");

  const pHigh50 = calcOwnersPolicyPremium(50_000, "high");
  assert(pHigh50.chosen === 220, "Owner policy 50k high should be 220");

  const pMid50 = calcOwnersPolicyPremium(50_000, "mid");
  assert(pMid50.chosen === 214.5, "Owner policy 50k midpoint should be 214.5");

  const pJustOver = calcOwnersPolicyPremium(1_000_001, "mid");
  assert(pJustOver.chosen === 2750, "Owner policy just over 1M should be 2750");

  const pOver = calcOwnersPolicyPremium(1_010_000, "mid");
  assert(pOver.chosen === 2750, "Owner policy 1,010,000 should be 2750 (ceil)");

  const pOver2 = calcOwnersPolicyPremium(1_010_001, "mid");
  assert(pOver2.chosen === 2772, "Owner policy 1,010,001 should be 2772");

  const t = calcIndianaTaxProration(new Date(Date.UTC(2026, 0, 1)), {
    priorYearTax: 3650,
    springPaid: false,
    springPaidAmount: 0,
    fallPaid: false,
    fallPaidAmount: 0,
    prorateThrough: "day_before",
    force365: true,
  });
  assert(t.daysAccrued === 0, "Jan 1 closing day-before should accrue 0 days");
  assert(round2(t.dailyRate) === 10, "Daily rate 3650/365 should be 10");
}

try {
  const anyImportMeta: any = typeof import.meta !== "undefined" ? (import.meta as any) : null;
  const mode = anyImportMeta && anyImportMeta.env ? anyImportMeta.env.MODE : undefined;
  const nodeEnv = typeof process !== "undefined" && (process as any).env ? (process as any).env.NODE_ENV : undefined;
  if (mode === "test" || nodeEnv === "test") runSelfTests();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error("Self-tests failed:", e);
}
