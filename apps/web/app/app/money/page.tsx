"use client";

import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  categoryLabelHe,
  categoryNature,
  mergeCategoryOptions,
} from "@moneytail/shared";
import { api, apiUpload, formatIls } from "@/lib/api";
import {
  PeriodBar,
  useSelectedMonth,
  appHref,
  labelMonthHe,
  currentMonthKey,
} from "@/components/PeriodBar";
import { PageHeader } from "@/components/PageHeader";
import { Pulse } from "@/components/Pulse";
import { WinStrip } from "@/components/WinStrip";
import { CategoryCombobox } from "@/components/CategoryCombobox";
import { ConfirmPanel } from "@/components/ConfirmPanel";
import Link from "next/link";

type Account = { id: string; name: string; kind: string; currentBalance: string };
type Tx = {
  id: string;
  direction: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: string;
  categoryKey: string;
  description: string | null;
  note?: string | null;
  merchantNorm?: string | null;
  bookedAt: string;
  economicRole?: string;
  loanId?: string | null;
  creditCardId?: string | null;
  installmentPlanId?: string | null;
  loan?: { id: string; name: string; provider: string | null } | null;
  creditCard?: {
    id: string;
    name: string;
    lastFour: string | null;
    provider: string | null;
  } | null;
};

type LoanOpt = { id: string; name: string };
type CardOpt = { id: string; name: string; lastFour: string | null };

type UserCat = {
  id: string;
  key: string;
  labelHe: string;
  nature: string;
  direction: string;
};

type FixedBudgetItem = {
  commitmentId?: string;
  titleHe: string;
  categoryKey: string;
  expected: number;
  actual: number;
  status: "paid" | "partial" | "pending" | "over";
  payVia?: "ACCOUNT" | "CREDIT_CARD";
  creditCardId?: string | null;
  startMonth?: string | null;
  endMonth?: string | null;
};

type BudgetSnap = {
  month: string;
  leftover: number;
  fixed: {
    actualTotal: number;
    expectedTotal: number;
    basisForLeftover?: "expected" | "actual";
    items: FixedBudgetItem[];
  };
  flexible: { actualTotal: number };
  allocatedToGoals: number;
};

/** Canonical month numbers from GET /month-facts */
type MonthFacts = {
  formulaVersion: string;
  month: string;
  checkingBalanceNow: number;
  flows: {
    income: number;
    expense: number;
    allocatedToGoals: number;
    net: number;
  };
  budget: {
    fixed: BudgetSnap["fixed"];
    flexible: BudgetSnap["flexible"];
    leftover: number;
  };
};

type EconomicRoleOpt =
  | "STANDARD"
  | "CARD_PURCHASE"
  | "CARD_SETTLEMENT"
  | "LOAN_PAYMENT";

type AddDraft = {
  mode: "expense" | "income";
  amount: string;
  description: string;
  categoryKey: string;
  bookedAt: string;
  economicRole: EconomicRoleOpt;
  loanId: string;
  creditCardId: string;
  /** "1" = one-time; >=2 = installments (CARD_PURCHASE only) */
  installmentCount: string;
};

type CommitmentOffer = {
  titleHe: string;
  categoryKey: string;
  amount: number;
};

type DraftRow = {
  direction: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  categoryKey: string;
  categoryLabelHe?: string;
  description: string;
  bookedAt: string;
  merchantNorm?: string;
  confidence?: number;
  evidence?: string[];
  duplicate?: boolean;
  recurringHint?: boolean;
  balance?: number | null;
  prevBalance?: number | null;
  balanceDelta?: number | null;
  needsReview?: boolean;
};

type ImportDirFilter = "ALL" | "INCOME" | "EXPENSE" | "REVIEW";

function evidenceLabelHe(code: string): string {
  if (code.startsWith("lex:")) return "מילון";
  if (code.startsWith("col:")) return "עמודת דוח";
  if (code === "bal:+") return "יתרה עלתה";
  if (code === "bal:-") return "יתרה ירדה";
  if (code.startsWith("bal:")) return "יתרה";
  if (code.startsWith("mem:") && code.endsWith("-skipped")) return "זיכרון נדחה";
  if (code.startsWith("mem:")) return "זיכרון";
  if (code.startsWith("rule:")) return "כלל";
  if (code.startsWith("type:")) return "סוג שורה";
  if (code === "transfer" || code === "recurring")
    return code === "transfer" ? "העברה" : "חוזר";
  if (code === "fallback:ambiguous") return "לא ברור";
  if (code === "fallback:bal") return "לפי יתרה";
  if (code === "fallback" || code.startsWith("fallback:")) return "ברירת מחדל";
  if (code.startsWith("user:")) return "עריכה";
  if (code.startsWith("conflict:")) return "קונפליקט";
  return code;
}

function rowNeedsReview(row: DraftRow): boolean {
  return Boolean(
    row.needsReview ||
      row.duplicate ||
      (row.confidence != null && row.confidence < 0.45) ||
      (row.evidence || []).some((e) => e.startsWith("fallback:ambiguous")),
  );
}

type UploadResult = {
  id: string;
  originalName: string;
  draft: DraftRow[];
  quality?: {
    income: number;
    expense: number;
    transfer: number;
    needsReview: number;
    duplicates: number;
    total: number;
    incomeSum?: number;
    expenseSum?: number;
    statementDelta?: number | null;
    signedSum?: number | null;
    reconcileWarn?: boolean;
  };
  period?: {
    defaultMonth?: string;
    statementFrom?: string;
    statementTo?: string;
  };
};

type TxListPage = {
  items: Tx[];
  hasMore: boolean;
  nextBefore: string | null;
  nextBeforeId: string | null;
};

const TX_PAGE_SIZE = 40;

type DocListItem = {
  id: string;
  originalName: string;
  status: string;
  sourceKind?: string;
  importedCount: number | null;
  fileKept: boolean;
  createdAt: string;
};

function defaultBookedDate(month: string) {
  const nowKey = currentMonthKey();
  if (month === nowKey) {
    const now = new Date();
    return `${month}-${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${month}-01`;
}

function categoriesForDirection(
  direction: "INCOME" | "EXPENSE" | "TRANSFER",
  userCats: UserCat[] = [],
) {
  if (direction === "TRANSFER") {
    return [{ key: "other", labelHe: "אחר", nature: "variable" as const }];
  }
  const builtIn =
    direction === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const custom = userCats.filter((c) => c.direction === direction);
  return mergeCategoryOptions(builtIn, custom);
}

function ensureCategoryForDirection(
  direction: "INCOME" | "EXPENSE" | "TRANSFER",
  categoryKey: string,
  userCats: UserCat[] = [],
) {
  const cats = categoriesForDirection(direction, userCats);
  if (cats.some((c) => c.key === categoryKey)) return categoryKey;
  return cats[0]?.key || "other";
}

function emptyAddDraft(mode: "expense" | "income", month: string): AddDraft {
  const direction = mode === "income" ? "INCOME" : "EXPENSE";
  const cats = categoriesForDirection(direction);
  return {
    mode,
    amount: "",
    description: "",
    categoryKey: cats[0]?.key || (mode === "income" ? "salary" : "food"),
    bookedAt: defaultBookedDate(month),
    economicRole: "STANDARD",
    loanId: "",
    creditCardId: "",
    installmentCount: "1",
  };
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabelHe(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function shortDateHe(iso: string) {
  return new Date(iso).toLocaleDateString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function dirHe(d: string) {
  if (d === "INCOME") return "הכנסה";
  if (d === "TRANSFER") return "העברה";
  return "הוצאה";
}

const TX_GROUP_BY_DAY_KEY = "moneytail.txGroupByDay";

type PendingConfirm =
  | { kind: "delete-tx"; tx: Tx }
  | { kind: "remove-commitment"; id: string; titleHe: string }
  | { kind: "undo-import"; docId: string; latestConfirmed: boolean };

function statusHe(status: string) {
  if (status === "CONFIRMED") return "אושר";
  if (status === "EXTRACTED") return "חולץ";
  if (status === "REJECTED") return "נדחה";
  if (status === "UPLOADED") return "הועלה";
  return status;
}

function MoneyInner() {
  const router = useRouter();
  const search = useSearchParams();
  const month = useSelectedMonth();
  const tabRaw = search.get("tab");
  const tab =
    tabRaw === "import" ? "import" : tabRaw === "fixed" ? "fixed" : "txs";
  const categoryFilter = search.get("category") || "";
  const loanFilter = search.get("loanId") || "";
  const cardFilter = search.get("creditCardId") || "";
  const dirFromUrl = search.get("dir");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [listHasMore, setListHasMore] = useState(false);
  const [listLoadingMore, setListLoadingMore] = useState(false);
  const [listScope, setListScope] = useState<"month" | "older">("month");
  const [listCursor, setListCursor] = useState<{
    before: string;
    beforeId: string;
  } | null>(null);
  const loadMoreLock = useRef(false);
  const listSentinelRef = useRef<HTMLDivElement | null>(null);
  const [loanOpts, setLoanOpts] = useState<LoanOpt[]>([]);
  const [cardOpts, setCardOpts] = useState<CardOpt[]>([]);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [budget, setBudget] = useState<BudgetSnap | null>(null);
  const [monthFacts, setMonthFacts] = useState<MonthFacts | null>(null);
  const [userCats, setUserCats] = useState<UserCat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fixedOpen, setFixedOpen] = useState(false);
  const [showMonthFlow, setShowMonthFlow] = useState(false);

  const [addDraft, setAddDraft] = useState<AddDraft | null>(null);
  const [commitmentOffer, setCommitmentOffer] =
    useState<CommitmentOffer | null>(null);
  const [dirFilter, setDirFilter] = useState<
    "ALL" | "INCOME" | "EXPENSE" | "TRANSFER"
  >(
    dirFromUrl === "INCOME" ||
      dirFromUrl === "EXPENSE" ||
      dirFromUrl === "TRANSFER"
      ? dirFromUrl
      : "ALL",
  );

  const [draft, setDraft] = useState<UploadResult | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [keepFile, setKeepFile] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [editable, setEditable] = useState<DraftRow[]>([]);
  const [importDirFilter, setImportDirFilter] =
    useState<ImportDirFilter>("ALL");
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupByDay, setGroupByDay] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );

  useEffect(() => {
    try {
      setGroupByDay(localStorage.getItem(TX_GROUP_BY_DAY_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleGroupByDay() {
    setGroupByDay((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TX_GROUP_BY_DAY_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const catLabels = useMemo(
    () => Object.fromEntries(userCats.map((c) => [c.key, c.labelHe])),
    [userCats],
  );

  const labelCat = (key: string) => categoryLabelHe(key, catLabels);

  const resolveNature = (key: string) => {
    const u = userCats.find((c) => c.key === key);
    if (u?.nature === "fixed" || u?.nature === "periodic") return u.nature;
    if (u) return "variable" as const;
    return categoryNature(key);
  };

  const addDirection =
    addDraft?.mode === "income" ? ("INCOME" as const) : ("EXPENSE" as const);
  const addCategories = useMemo(
    () => categoriesForDirection(addDirection, userCats),
    [addDirection, userCats],
  );

  const pendingCommitments = useMemo(() => {
    if (!budget?.fixed?.items) return [];
    return budget.fixed.items.filter(
      (i) =>
        i.commitmentId &&
        (i.status === "pending" || i.status === "partial") &&
        i.expected > 0,
    );
  }, [budget]);

  const expenseCommitments = useMemo(() => {
    if (!budget?.fixed?.items) return [];
    return budget.fixed.items.filter((i) => i.commitmentId && i.expected > 0);
  }, [budget]);

  const accountCommitments = useMemo(
    () =>
      expenseCommitments.filter((i) => i.payVia !== "CREDIT_CARD"),
    [expenseCommitments],
  );

  const cardCommitments = useMemo(
    () =>
      expenseCommitments.filter((i) => i.payVia === "CREDIT_CARD"),
    [expenseCommitments],
  );

  const checkingAccount = useMemo(() => {
    const banks = accounts.filter((a) => a.kind === "BANK");
    return banks[0] || accounts[0] || null;
  }, [accounts]);

  const checkingBalance =
    monthFacts?.checkingBalanceNow ??
    (checkingAccount ? Number(checkingAccount.currentBalance) : 0);

  const monthTxs = useMemo(
    () => txs.filter((t) => t.bookedAt.slice(0, 7) === month),
    [txs, month],
  );

  const dirCounts = useMemo(() => {
    const c = { ALL: txs.length, INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
    for (const t of txs) c[t.direction] += 1;
    return c;
  }, [txs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return txs.filter((t) => {
      if (dirFilter !== "ALL" && t.direction !== dirFilter) return false;
      if (categoryFilter && t.categoryKey !== categoryFilter) return false;
      if (loanFilter && t.loanId !== loanFilter) return false;
      if (cardFilter && t.creditCardId !== cardFilter) return false;
      if (needle) {
        const hay =
          `${t.description || ""} ${labelCat(t.categoryKey)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [
    txs,
    dirFilter,
    categoryFilter,
    loanFilter,
    cardFilter,
    q,
    catLabels,
  ]);

  const dayGroups = useMemo(() => {
    const map = new Map<string, Tx[]>();
    for (const t of filtered) {
      const k = dayKey(t.bookedAt);
      const list = map.get(k) || [];
      list.push(t);
      map.set(k, list);
    }
    return [...map.entries()].map(([key, items]) => {
      const income = items
        .filter((t) => t.direction === "INCOME")
        .reduce((s, t) => s + Number(t.amount), 0);
      const expense = items
        .filter(
          (t) =>
            t.direction === "EXPENSE" && t.categoryKey !== "goal_funding",
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      const toGoals = items
        .filter(
          (t) =>
            t.direction === "EXPENSE" && t.categoryKey === "goal_funding",
        )
        .reduce((s, t) => s + Number(t.amount), 0);
      return {
        key,
        label: dayLabelHe(items[0].bookedAt),
        items,
        net: income - expense - toGoals,
        toGoals,
      };
    });
  }, [filtered]);

  useEffect(() => {
    if (
      dirFromUrl === "INCOME" ||
      dirFromUrl === "EXPENSE" ||
      dirFromUrl === "TRANSFER"
    ) {
      setDirFilter(dirFromUrl);
    }
  }, [dirFromUrl]);

  const monthIncome =
    monthFacts?.flows.income ??
    monthTxs
      .filter((t) => t.direction === "INCOME")
      .reduce((s, t) => s + Number(t.amount), 0);
  const monthExpense =
    monthFacts?.flows.expense ??
    monthTxs
      .filter(
        (t) =>
          t.direction === "EXPENSE" && t.categoryKey !== "goal_funding",
      )
      .reduce((s, t) => s + Number(t.amount), 0);
  const monthToGoals =
    monthFacts?.flows.allocatedToGoals ??
    monthTxs
      .filter(
        (t) =>
          t.direction === "EXPENSE" && t.categoryKey === "goal_funding",
      )
      .reduce((s, t) => s + Number(t.amount), 0);

  async function refresh(opts?: { docs?: boolean }) {
    const needDocs = opts?.docs ?? tab === "import";
    const txQs = new URLSearchParams({
      month,
      limit: String(TX_PAGE_SIZE),
    });
    if (loanFilter) txQs.set("loanId", loanFilter);
    if (cardFilter) txQs.set("creditCardId", cardFilter);
    const [a, txPage, facts, cats, d, loansRes, cardsRes] = await Promise.all([
      api<Account[]>("/accounts"),
      api<TxListPage>(`/transactions?${txQs.toString()}`),
      api<MonthFacts>(`/month-facts?month=${month}`).catch(() => null),
      api<UserCat[]>("/categories").catch(() => [] as UserCat[]),
      needDocs
        ? api<DocListItem[]>("/documents")
        : Promise.resolve(null),
      api<{ loans: LoanOpt[] }>(`/loans?month=${month}`).catch(() => ({
        loans: [] as LoanOpt[],
      })),
      api<{ items: CardOpt[] }>(`/credit-cards?month=${month}`).catch(
        () => ({ items: [] as CardOpt[] }),
      ),
    ]);
    setAccounts(a);
    setTxs(txPage.items || []);
    const cursor =
      txPage.nextBefore && txPage.nextBeforeId
        ? { before: txPage.nextBefore, beforeId: txPage.nextBeforeId }
        : null;
    if (txPage.hasMore) {
      setListScope("month");
      setListHasMore(true);
      setListCursor(cursor);
    } else {
      // Month fully loaded (or empty) — next scroll loads prior months
      setListScope("older");
      setListHasMore(true);
      setListCursor(cursor);
    }
    setUserCats(cats);
    setLoanOpts(loansRes.loans || []);
    setCardOpts(cardsRes.items || []);
    setMonthFacts(facts);
    if (facts) {
      setBudget({
        month: facts.month,
        leftover: facts.budget.leftover,
        fixed: facts.budget.fixed,
        flexible: facts.budget.flexible,
        allocatedToGoals: facts.flows.allocatedToGoals,
      });
    } else {
      setBudget(null);
    }
    if (d) setDocs(d);
  }

  const loadMoreTxs = useCallback(async () => {
    if (loadMoreLock.current || listLoadingMore || !listHasMore) return;
    loadMoreLock.current = true;
    setListLoadingMore(true);
    try {
      const txQs = new URLSearchParams({
        month,
        limit: String(TX_PAGE_SIZE),
      });
      if (loanFilter) txQs.set("loanId", loanFilter);
      if (cardFilter) txQs.set("creditCardId", cardFilter);

      if (listScope === "older") {
        txQs.set("older", "1");
      }

      if (listCursor) {
        txQs.set("before", listCursor.before);
        txQs.set("beforeId", listCursor.beforeId);
      } else if (listScope === "month") {
        // Month exhausted without cursor — switch to older months
        txQs.set("older", "1");
      }

      const page = await api<TxListPage>(`/transactions?${txQs.toString()}`);
      const incoming = page.items || [];

      if (incoming.length === 0) {
        if (listScope === "month") {
          // Try older history once
          setListScope("older");
          setListHasMore(true);
          setListCursor(null);
        } else {
          setListHasMore(false);
        }
        return;
      }

      setTxs((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        const merged = [...prev];
        for (const t of incoming) {
          if (!seen.has(t.id)) merged.push(t);
        }
        return merged;
      });

      if (page.hasMore) {
        setListHasMore(true);
        setListCursor(
          page.nextBefore && page.nextBeforeId
            ? { before: page.nextBefore, beforeId: page.nextBeforeId }
            : null,
        );
      } else if (listScope === "month") {
        // Finished selected month — continue into past months on next scroll
        setListScope("older");
        setListHasMore(true);
        setListCursor(
          page.nextBefore && page.nextBeforeId
            ? { before: page.nextBefore, beforeId: page.nextBeforeId }
            : null,
        );
      } else {
        setListHasMore(false);
        setListCursor(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בטעינת תנועות");
      setListHasMore(false);
    } finally {
      setListLoadingMore(false);
      loadMoreLock.current = false;
    }
  }, [
    listLoadingMore,
    listHasMore,
    listScope,
    listCursor,
    month,
    loanFilter,
    cardFilter,
  ]);

  useEffect(() => {
    refresh({ docs: tab === "import" }).catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, tab, loanFilter, cardFilter]);

  useEffect(() => {
    const node = listSentinelRef.current;
    if (!node || tab !== "txs") return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMoreTxs();
        }
      },
      { root: null, rootMargin: "240px 0px", threshold: 0 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [loadMoreTxs, tab, filtered.length, listHasMore]);
  function setDirFilterAndUrl(
    next: "ALL" | "INCOME" | "EXPENSE" | "TRANSFER",
  ) {
    setDirFilter(next);
    const params = new URLSearchParams(search.toString());
    if (next === "ALL") params.delete("dir");
    else params.set("dir", next);
    router.replace(`/app/money?${params.toString()}`, { scroll: false });
  }

  function setTab(next: "txs" | "import" | "fixed") {
    const params = new URLSearchParams(search.toString());
    if (next === "import") params.set("tab", "import");
    else if (next === "fixed") params.set("tab", "fixed");
    else params.delete("tab");
    router.replace(`/app/money?${params.toString()}`, { scroll: false });
    if (next === "fixed") setFixedOpen(true);
    else if (next === "txs") setFixedOpen(false);
  }

  function openAddDraft(mode: "expense" | "income") {
    setCommitmentOffer(null);
    setError(null);
    setAddDraft(emptyAddDraft(mode, month));
  }

  function cancelAddDraft() {
    setAddDraft(null);
  }

  function fillFromCommitment(item: FixedBudgetItem) {
    const open =
      item.status === "pending" || item.status === "partial";
    if (!open) {
      setError(
        `«${item.titleHe}» כבר נרשמה בחודש ${month} — אפשר למחוק את התנועה ואז לרשום מחדש`,
      );
      return;
    }
    setFixedOpen(true);
    const remaining = Math.max(0, item.expected - item.actual);
    const viaCard =
      item.payVia === "CREDIT_CARD" && Boolean(item.creditCardId);
    const draft =
      addDraft?.mode === "expense"
        ? addDraft
        : emptyAddDraft("expense", month);
    setError(null);
    setAddDraft({
      ...draft,
      amount: String(remaining || item.expected),
      description: item.titleHe,
      categoryKey: ensureCategoryForDirection(
        "EXPENSE",
        item.categoryKey,
        userCats,
      ),
      economicRole: viaCard ? "CARD_PURCHASE" : "STANDARD",
      creditCardId: viaCard ? item.creditCardId || "" : "",
      installmentCount: "1",
      loanId: "",
    });
  }

  function cardLabel(cardId: string | null | undefined) {
    if (!cardId) return "כרטיס";
    const c = cardOpts.find((x) => x.id === cardId);
    if (!c) return "כרטיס";
    return c.lastFour ? `${c.name} ·••• ${c.lastFour}` : c.name;
  }

  function formatStartMonthHe(start: string | null | undefined) {
    if (!start || !/^\d{4}-\d{2}$/.test(start)) return null;
    const [y, m] = start.split("-");
    return `${m}/${y}`;
  }

  async function createUserCategory(labelHe: string, asFixed: boolean) {
    const created = await api<UserCat>("/categories", {
      method: "POST",
      body: JSON.stringify({
        labelHe,
        direction: addDraft?.mode === "income" ? "INCOME" : "EXPENSE",
        nature: asFixed ? "fixed" : "variable",
      }),
    });
    setUserCats((prev) => [...prev, created]);
    setAddDraft((d) => (d ? { ...d, categoryKey: created.key } : d));
  }

  async function saveAddDraft() {
    if (!addDraft) return;
    const amt = Number(addDraft.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("נא להזין סכום תקין");
      return;
    }
    if (!addDraft.categoryKey) {
      setError("נא לבחור קטגוריה");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const direction = addDraft.mode === "income" ? "INCOME" : "EXPENSE";
      const role =
        direction === "EXPENSE" ? addDraft.economicRole : "STANDARD";

      if (role === "CARD_PURCHASE") {
        if (!addDraft.creditCardId) {
          setError("נא לבחור כרטיס אשראי");
          setBusy(false);
          return;
        }
        const installmentCount = Math.max(
          1,
          Math.floor(Number(addDraft.installmentCount) || 1),
        );
        const chargeRes = await api<{
          mode: "ONE_TIME" | "INSTALLMENTS";
          thisMonthCharge: number;
          futureCommitment: number;
          installmentCount: number;
        }>(`/credit-cards/${addDraft.creditCardId}/charges`, {
          method: "POST",
          body: JSON.stringify({
            description:
              addDraft.description.trim() || labelCat(addDraft.categoryKey),
            amount: amt,
            categoryKey: addDraft.categoryKey,
            bookedAt: `${addDraft.bookedAt}T12:00:00.000Z`,
            installmentCount,
          }),
        });
        await refresh();
        setAddDraft(null);
        setCommitmentOffer(null);
        if (chargeRes.mode === "INSTALLMENTS") {
          setMsg(
            `נרשם ${formatIls(chargeRes.thisMonthCharge)} בהוצאות החודש` +
              (chargeRes.futureCommitment > 0
                ? ` · ${formatIls(chargeRes.futureCommitment)} נשמרו כתשלומים בכרטיס`
                : ""),
          );
        } else {
          setMsg(
            `נרשמה קנייה בכרטיס · ${formatIls(chargeRes.thisMonthCharge)}`,
          );
        }
        return;
      } else {
        if (role === "CARD_SETTLEMENT" && !addDraft.creditCardId) {
          setError("נא לבחור כרטיס לסילוק");
          setBusy(false);
          return;
        }
        if (role === "LOAN_PAYMENT" && !addDraft.loanId) {
          setError("נא לבחור הלוואה");
          setBusy(false);
          return;
        }
        await api("/transactions", {
          method: "POST",
          body: JSON.stringify({
            direction,
            amount: amt,
            categoryKey: addDraft.categoryKey,
            description: addDraft.description || undefined,
            bookedAt: `${addDraft.bookedAt}T12:00:00.000Z`,
            economicRole: role,
            loanId:
              role === "LOAN_PAYMENT" && addDraft.loanId
                ? addDraft.loanId
                : undefined,
            creditCardId:
              role === "CARD_SETTLEMENT" && addDraft.creditCardId
                ? addDraft.creditCardId
                : undefined,
          }),
        });
      }

      const nature = resolveNature(addDraft.categoryKey);
      const hasCommitment = (budget?.fixed?.items || []).some(
        (i) =>
          i.commitmentId &&
          i.categoryKey === addDraft.categoryKey,
      );
      const offer =
        direction === "EXPENSE" &&
        role === "STANDARD" &&
        (nature === "fixed" || nature === "periodic") &&
        !hasCommitment
          ? {
              titleHe: addDraft.description || labelCat(addDraft.categoryKey),
              categoryKey: addDraft.categoryKey,
              amount: amt,
            }
          : null;

      const stillPendingAfter =
        direction === "EXPENSE" &&
        pendingCommitments.filter((i) => {
          const same =
            i.categoryKey === addDraft.categoryKey &&
            (!addDraft.description || i.titleHe === addDraft.description);
          return !same;
        }).length > 0;

      await refresh();
      if (direction === "EXPENSE" && stillPendingAfter) {
        setAddDraft({
          ...emptyAddDraft("expense", month),
          bookedAt: addDraft.bookedAt,
        });
        setMsg("נשמר · לחצו על הצ׳יפ הבא או «רשום את כל הפתוחות»");
        setCommitmentOffer(null);
      } else {
        setAddDraft(null);
        setMsg(
          direction === "INCOME" ? "ההכנסה נשמרה" : "ההוצאה נשמרה",
        );
        setCommitmentOffer(offer);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function recordAllPendingCommitments() {
    const list = pendingCommitments;
    if (!list.length) {
      setError("אין הוצאות קבועות פתוחות לחודש זה");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const day =
        addDraft?.mode === "expense"
          ? addDraft.bookedAt
          : defaultBookedDate(month);
      const bookedAt = `${day}T12:00:00.000Z`;
      let cardCount = 0;
      let accountCount = 0;
      for (const item of list) {
        const amt =
          Math.max(0, item.expected - item.actual) || item.expected;
        if (amt <= 0) continue;
        if (item.payVia === "CREDIT_CARD" && item.creditCardId) {
          await api(`/credit-cards/${item.creditCardId}/charges`, {
            method: "POST",
            body: JSON.stringify({
              description: item.titleHe,
              amount: amt,
              categoryKey: item.categoryKey,
              bookedAt,
              installmentCount: 1,
            }),
          });
          cardCount += 1;
        } else {
          await api("/transactions", {
            method: "POST",
            body: JSON.stringify({
              direction: "EXPENSE",
              amount: amt,
              categoryKey: item.categoryKey,
              description: item.titleHe,
              bookedAt,
            }),
          });
          accountCount += 1;
        }
      }
      const parts: string[] = [];
      if (accountCount) parts.push(`${accountCount} מהחשבון`);
      if (cardCount) parts.push(`${cardCount} באשראי`);
      setMsg(
        parts.length
          ? `נרשמו הוצאות קבועות: ${parts.join(" · ")}`
          : `נרשמו ${list.length} הוצאות קבועות יחד`,
      );
      await refresh();
      if (addDraft?.mode === "expense") {
        setAddDraft({
          ...emptyAddDraft("expense", month),
          bookedAt: addDraft.bookedAt,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function chargeDueCardInstallments() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        chargedCount: number;
        chargedTotal: number;
      }>(
        `/credit-cards/installments/charge-due?month=${encodeURIComponent(month)}`,
        { method: "POST" },
      );
      await refresh();
      if (res.chargedCount === 0) {
        setMsg("אין תשלומי אשראי לרישום לחודש זה");
      } else {
        setMsg(
          `נרשמו ${res.chargedCount} תשלומי אשראי · ${formatIls(res.chargedTotal)}`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function acceptCommitmentOffer() {
    if (!commitmentOffer) return;
    setBusy(true);
    try {
      await api("/budget/commitments", {
        method: "POST",
        body: JSON.stringify({
          titleHe: commitmentOffer.titleHe,
          categoryKey: commitmentOffer.categoryKey,
          expectedAmount: commitmentOffer.amount,
          nature: "FIXED",
          cadence: "MONTHLY",
          startMonth: month,
        }),
      });
      setCommitmentOffer(null);
      setMsg(`נשמרה התחייבות קבועה מ־${month}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function saveDraftAsCommitment() {
    if (!addDraft || addDraft.mode !== "expense") return;
    const amt = Number(addDraft.amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("מלאו סכום בטיוטה כדי לשמור כהוצאה קבועה");
      return;
    }
    if (!addDraft.categoryKey) {
      setError("בחרו קטגוריה");
      return;
    }
    const viaCard = addDraft.economicRole === "CARD_PURCHASE";
    if (viaCard && !addDraft.creditCardId) {
      setError("נא לבחור כרטיס להוראת קבע באשראי");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/budget/commitments", {
        method: "POST",
        body: JSON.stringify({
          titleHe: addDraft.description || labelCat(addDraft.categoryKey),
          categoryKey: addDraft.categoryKey,
          expectedAmount: amt,
          nature: "FIXED",
          cadence: "MONTHLY",
          payVia: viaCard ? "CREDIT_CARD" : "ACCOUNT",
          creditCardId: viaCard ? addDraft.creditCardId : undefined,
          startMonth: month,
        }),
      });
      setMsg(
        viaCard
          ? `נוספה הוראת קבע באשראי מ־${month} — תופיע בצ׳יפים כמו שכירות, ותירשם כקנייה בכרטיס בכל חודש`
          : `נוספה הוצאה קבועה מ־${month} — תופיע בצ׳יפים לחודשים הרלוונטיים`,
      );
      setAddDraft((d) =>
        d
          ? {
              ...d,
              amount: "",
              description: "",
              categoryKey: emptyAddDraft("expense", month).categoryKey,
            }
          : d,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function removeCommitment(id: string, titleHe: string) {
    setPendingConfirm({ kind: "remove-commitment", id, titleHe });
  }

  async function executeRemoveCommitment(id: string) {
    setBusy(true);
    setError(null);
    setPendingConfirm(null);
    try {
      await api(`/budget/commitments/${id}/deactivate`, { method: "POST" });
      setMsg("ההוצאה הקבועה הוסרה");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }
  async function onUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("file") as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file) {
      setError("בחרו קובץ CSV / PDF / תמונה");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("storageMode", keepFile ? "PERMANENT" : "TEMPORARY");
      const result = await apiUpload<UploadResult>("/documents/upload", fd);
      setDraft(result);
      setEditable(result.draft.map((r) => ({ ...r })));
      setImportDirFilter("ALL");
      setSelected(
        new Set(
          result.draft
            .map((r, i) => (r.duplicate ? -1 : i))
            .filter((i) => i >= 0),
        ),
      );
      if (result.period?.defaultMonth) {
        const params = new URLSearchParams(search.toString());
        params.set("month", result.period.defaultMonth);
        params.set("tab", "import");
        router.replace(`/app/money?${params.toString()}`, { scroll: false });
      }
      setMsg(`זוהו ${result.draft.length} תנועות — בדקו ואשרו.`);
      form.reset();
      setUploadFileName(null);
      setUploadDragOver(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function patchRow(i: number, patch: Partial<DraftRow>) {
    setEditable((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        if (patch.direction) {
          next.categoryKey = ensureCategoryForDirection(
            patch.direction,
            patch.categoryKey || next.categoryKey,
            userCats,
          );
          next.needsReview = false;
          next.confidence = Math.max(next.confidence ?? 0.7, 0.7);
          next.evidence = [
            ...(next.evidence || []).filter(
              (e) => !e.startsWith("fallback:") && !e.startsWith("conflict:"),
            ),
            "user:direction",
          ];
        }
        return next;
      }),
    );
  }

  async function confirmImport() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const overrides = editable.map((row, index) => ({
        index,
        direction: row.direction,
        categoryKey: row.categoryKey,
        description: row.description,
      }));
      const res = await api<{
        imported: number;
        fileKept?: boolean;
        defaultMonth?: string;
      }>(`/documents/${draft.id}/confirm`, {
        method: "POST",
        body: JSON.stringify({
          selectedIndexes: [...selected].sort(),
          overrides,
        }),
      });
      setMsg(`יובאו ${res.imported} תנועות.`);
      setDraft(null);
      setEditable([]);
      await refresh();
      const params = new URLSearchParams();
      params.set("month", res.defaultMonth || month);
      router.replace(`/app/money?${params.toString()}`, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function rejectImport() {
    if (!draft) return;
    setBusy(true);
    try {
      await api(`/documents/${draft.id}/reject`, {
        method: "POST",
        body: "{}",
      });
      setDraft(null);
      setEditable([]);
      setMsg("הייבוא בוטל.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    setBusy(true);
    try {
      const res = await api<{ removed: number }>(`/documents/${id}/undo`, {
        method: "POST",
        body: "{}",
      });
      setMsg(`בוטל ייבוא — הוסרו ${res.removed} תנועות.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function saveTxEdit(
    t: Tx,
    patch: {
      direction?: Tx["direction"];
      categoryKey?: string;
      description?: string;
    },
    opts?: { applySimilar?: boolean },
  ) {
    setBusy(true);
    setError(null);
    try {
      await api(`/transactions/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      let similar = 0;
      if (
        opts?.applySimilar &&
        t.merchantNorm &&
        (patch.categoryKey || patch.direction)
      ) {
        const res = await api<{ updated: number }>(
          "/transactions/bulk-by-merchant",
          {
            method: "POST",
            body: JSON.stringify({
              merchantNorm: t.merchantNorm,
              categoryKey: patch.categoryKey || t.categoryKey,
              direction: patch.direction,
              month,
              excludeId: t.id,
            }),
          },
        );
        similar = res.updated;
      }
      setEditingId(null);
      await refresh();
      setMsg(
        similar > 0
          ? `עודכן · הוחל על ${similar} דומים נוספים`
          : "התנועה עודכנה",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function quickCategory(t: Tx, categoryKey: string) {
    if (categoryKey === t.categoryKey) return;
    const similarCount = t.merchantNorm
      ? monthTxs.filter(
          (x) =>
            x.id !== t.id &&
            x.merchantNorm === t.merchantNorm &&
            x.categoryKey !== categoryKey,
        ).length
      : 0;
    const applySimilar =
      similarCount > 0 &&
      window.confirm(
        `להחיל את הקטגוריה גם על ${similarCount} תנועות דומות בחודש?`,
      );
    await saveTxEdit(t, { categoryKey }, { applySimilar });
  }

  async function saveNote(t: Tx, raw: string) {
    const note = raw.trim();
    const prev = (t.note || "").trim();
    if (note === prev) {
      setNoteDrafts((d) => {
        const next = { ...d };
        delete next[t.id];
        return next;
      });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/transactions/${t.id}`, {
        method: "PATCH",
        body: JSON.stringify({ note: note || null }),
      });
      setTxs((list) =>
        list.map((x) =>
          x.id === t.id ? { ...x, note: note || null } : x,
        ),
      );
      setNoteDrafts((d) => {
        const next = { ...d };
        delete next[t.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTx(t: Tx) {
    setPendingConfirm({ kind: "delete-tx", tx: t });
  }

  async function executeDeleteTx(t: Tx) {
    setBusy(true);
    setError(null);
    setPendingConfirm(null);
    try {
      await api(`/transactions/${t.id}`, { method: "DELETE" });
      await refresh();
      setMsg("התנועה נמחקה");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  function renderDenseRow(t: Tx, showDate: boolean) {
    const nature =
      t.direction === "EXPENSE" ? resolveNature(t.categoryKey) : null;
    const editing = editingId === t.id;
    const dirClass =
      t.direction === "INCOME"
        ? "in"
        : t.direction === "EXPENSE"
          ? "out"
          : "transfer";
    const rowCats = categoriesForDirection(t.direction, userCats);
    return (
      <div
        key={t.id}
        className={`tx-dense-row ${dirClass}${
          t.direction === "TRANSFER" ? " transfer" : ""
        }${editing ? " editing" : ""}${showDate ? " with-date" : ""}`}
      >
        {showDate && (
          <span className="tx-dense-date muted">{shortDateHe(t.bookedAt)}</span>
        )}
        {editing ? (
          <>
            <input
              className="cell-input"
              defaultValue={t.description || ""}
              id={`desc-${t.id}`}
            />
            <label className={`tx-dense-note${t.note ? " has-note" : ""}`}>
              <span className="sr-only">הערה</span>
              <input
                className="tx-note-input"
                value={
                  noteDrafts[t.id] !== undefined
                    ? noteDrafts[t.id]
                    : t.note || ""
                }
                placeholder="הוספת הערה"
                disabled={busy}
                onChange={(e) =>
                  setNoteDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                }
                onBlur={(e) => void saveNote(t, e.target.value)}
              />
            </label>
            <select defaultValue={t.direction} id={`dir-${t.id}`}>
              <option value="EXPENSE">הוצאה</option>
              <option value="INCOME">הכנסה</option>
              <option value="TRANSFER">העברה</option>
            </select>
            <select
              defaultValue={ensureCategoryForDirection(
                t.direction,
                t.categoryKey,
                userCats,
              )}
              id={`cat-${t.id}`}
            >
              {rowCats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.labelHe}
                </option>
              ))}
            </select>
            <span className="tx-dense-amt muted">—</span>
            <div className="tx-dense-actions open">
              <button
                type="button"
                className="linkish"
                disabled={busy}
                onClick={() => {
                  const dirEl = document.getElementById(
                    `dir-${t.id}`,
                  ) as HTMLSelectElement;
                  const catEl = document.getElementById(
                    `cat-${t.id}`,
                  ) as HTMLSelectElement;
                  const descEl = document.getElementById(
                    `desc-${t.id}`,
                  ) as HTMLInputElement;
                  const similar =
                    Boolean(t.merchantNorm) &&
                    window.confirm("להחיל גם על תנועות דומות בחודש?");
                  void saveTxEdit(
                    t,
                    {
                      direction: dirEl.value as Tx["direction"],
                      categoryKey: catEl.value,
                      description: descEl.value,
                    },
                    { applySimilar: similar },
                  );
                }}
              >
                שמירה
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => setEditingId(null)}
              >
                ביטול
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="tx-dense-desc" title={t.description || ""}>
              {t.description || "—"}
              {t.loan && (
                <>
                  <br />
                  <Link
                    className="muted"
                    href={appHref(`/app/debts/loans/${t.loan.id}`, month)}
                    style={{ fontSize: "0.78rem" }}
                  >
                    הלוואה: {t.loan.name}
                  </Link>
                </>
              )}
              {t.creditCard && (
                <>
                  <br />
                  <Link
                    className="muted"
                    href={appHref(`/app/debts/cards/${t.creditCard.id}`, month)}
                    style={{ fontSize: "0.78rem" }}
                  >
                    כרטיס
                    {t.creditCard.lastFour
                      ? ` ·••• ${t.creditCard.lastFour}`
                      : ` · ${t.creditCard.name}`}
                    {t.economicRole === "CARD_SETTLEMENT" ? " · סילוק" : ""}
                  </Link>
                </>
              )}
            </span>
            <label className={`tx-dense-note${t.note ? " has-note" : ""}`}>
              <span className="sr-only">הערה</span>
              <input
                className="tx-note-input"
                value={
                  noteDrafts[t.id] !== undefined
                    ? noteDrafts[t.id]
                    : t.note || ""
                }
                placeholder="הוספת הערה"
                disabled={busy}
                onChange={(e) =>
                  setNoteDrafts((d) => ({ ...d, [t.id]: e.target.value }))
                }
                onFocus={() => {
                  if (noteDrafts[t.id] === undefined) {
                    setNoteDrafts((d) => ({ ...d, [t.id]: t.note || "" }));
                  }
                }}
                onBlur={(e) => void saveNote(t, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
            </label>
            <span
              className={`tx-dense-dir ${dirClass}${
                t.direction === "EXPENSE" && nature
                  ? nature === "fixed" || nature === "periodic"
                    ? " nature-fixed"
                    : " nature-variable"
                  : ""
              }`}
            >
              {t.direction === "EXPENSE" && nature
                ? nature === "fixed" || nature === "periodic"
                  ? "הוצאה קבועה"
                  : "הוצאה משתנה"
                : dirHe(t.direction)}
            </span>
            <select
              className="tx-cat-quick"
              value={ensureCategoryForDirection(
                t.direction,
                t.categoryKey,
                userCats,
              )}
              disabled={busy}
              aria-label="קטגוריה"
              onChange={(e) => void quickCategory(t, e.target.value)}
            >
              {rowCats.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.labelHe}
                </option>
              ))}
            </select>
            <span
              className={
                t.direction === "INCOME"
                  ? "tx-in tx-dense-amt"
                  : t.direction === "EXPENSE"
                    ? "tx-out tx-dense-amt"
                    : "muted tx-dense-amt"
              }
            >
              {t.direction === "INCOME"
                ? "+"
                : t.direction === "EXPENSE"
                  ? "-"
                  : ""}
              {formatIls(Number(t.amount))}
            </span>
            <div className="tx-dense-actions">
              <button
                type="button"
                className="linkish"
                onClick={() => setEditingId(t.id)}
              >
                עריכה
              </button>
              <button
                type="button"
                className="linkish"
                disabled={busy}
                onClick={() => deleteTx(t)}
              >
                מחיקה
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  const flowMax = Math.max(monthIncome, monthExpense, monthToGoals, 1);

  return (
    <div className="grid money-hub" style={{ gap: "0.85rem" }}>
      <PageHeader
        kicker="תנועות"
        title="הכסף בתנועה"
        subtitle="מה נכנס ומה יצא החודש"
        aside={
          <div className="money-balance-hero">
            <p className="money-balance-label">יתרה בעו״ש</p>
            <p
              className={
                checkingBalance >= 0
                  ? "money-balance-amount pos"
                  : "money-balance-amount neg"
              }
            >
              {formatIls(checkingBalance)}
            </p>
            <div className="money-balance-meta">
              <span className="muted">
                {checkingAccount ? checkingAccount.name : "אין חשבון עדיין"}
              </span>
            </div>
          </div>
        }
      />

      <PeriodBar
        extra={
          budget ? (
            <span>
              נותר החודש{" "}
              <strong
                className={budget.leftover >= 0 ? "tx-in" : "tx-out"}
              >
                {formatIls(budget.leftover)}
              </strong>
              {budget.leftover > 0 && (
                <>
                  {" · "}
                  <Link href={appHref("/app/goals", month)}>ליעדים ←</Link>
                </>
              )}
            </span>
          ) : null
        }
      />

      <div className="mt-grid-3 rise-2">
        <article className="mt-surface stat">
          <h3>הכנסות החודש</h3>
          <div className="val" style={{ color: "var(--mt-good)" }}>
            {formatIls(monthIncome)}
          </div>
          <p className="note">מה שנכנס · הבסיס שנותן מרחב</p>
        </article>
        <article className="mt-surface stat">
          <h3>הוצאות החודש</h3>
          <div className="val">{formatIls(monthExpense)}</div>
          <p className="note">כולל מחיה ותשלומים שאתם מנהלים</p>
        </article>
        <article className="mt-surface stat">
          <h3>מה נשאר בתזרים</h3>
          <div
            className="val"
            style={{
              color:
                monthIncome - monthExpense >= 0
                  ? "var(--mt-mint-deep)"
                  : "var(--mt-danger)",
            }}
          >
            {monthIncome - monthExpense >= 0 ? "+" : ""}
            {formatIls(monthIncome - monthExpense)}
          </div>
          <p className="note">הניצחון השקט — או האות לכוון מחדש</p>
        </article>
      </div>

      <Pulse
        tone="boost"
        label="ליווי רגשי"
        title="כל רישום הוא שליטה — לא ביקורת"
        text="לראות הוצאה זה לא כישלון. זה אומץ להסתכל. אתם בונים תמונה אמיתית."
      />

      <WinStrip
        items={[
          { label: "יתרה בעו״ש", value: formatIls(checkingBalance) },
          ...(budget
            ? [
                {
                  label: "נותר החודש",
                  value: formatIls(budget.leftover),
                },
              ]
            : []),
        ]}
      />

      {(loanFilter || cardFilter) && tab === "txs" && (
        <p className="muted" style={{ margin: 0 }}>
          מסונן לפי{" "}
          {loanFilter
            ? `הלוואה · ${loanOpts.find((l) => l.id === loanFilter)?.name || loanFilter}`
            : `כרטיס · ${cardOpts.find((c) => c.id === cardFilter)?.name || cardFilter}`}
          {" · "}
          <Link href={appHref("/app/money", month)}>הסר סינון</Link>
        </p>
      )}

      {budget && tab === "txs" && (
        <div className="month-flow-optional">
          <button
            type="button"
            className="btn quiet"
            aria-expanded={showMonthFlow}
            onClick={() => setShowMonthFlow((v) => !v)}
          >
            {showMonthFlow ? "הסתר סיכום חודש" : "הצג סיכום חודש (אופציונלי)"}
          </button>
          {showMonthFlow && (
            <section className="card month-flow-strip month-flow-sticky">
              <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
                {labelMonthHe(month)} · קבוע{" "}
                {formatIls(
                  budget.fixed.basisForLeftover === "expected"
                    ? budget.fixed.expectedTotal
                    : budget.fixed.actualTotal,
                )}
                {budget.fixed.basisForLeftover === "expected" ? " (צפוי)" : ""} ·
                משתנה {formatIls(budget.flexible.actualTotal)}
                {(budget.allocatedToGoals > 0 || monthToGoals > 0)
                  ? ` · ליעדים ${formatIls(budget.allocatedToGoals || monthToGoals)}`
                  : ""}
              </p>
              <div className="month-flow-bars" aria-hidden>
                <div className="month-flow-row">
                  <span className="tx-in">הכנסות</span>
                  <div className="month-flow-track">
                    <div
                      className="month-flow-fill in"
                      style={{ width: `${(monthIncome / flowMax) * 100}%` }}
                    />
                  </div>
                  <strong className="tx-in">{formatIls(monthIncome)}</strong>
                </div>
                <div className="month-flow-row">
                  <span className="tx-out">הוצאות</span>
                  <div className="month-flow-track">
                    <div
                      className="month-flow-fill out"
                      style={{ width: `${(monthExpense / flowMax) * 100}%` }}
                    />
                  </div>
                  <strong className="tx-out">{formatIls(monthExpense)}</strong>
                </div>
                {monthToGoals > 0 && (
                  <div className="month-flow-row">
                    <span>ליעדים</span>
                    <div className="month-flow-track">
                      <div
                        className="month-flow-fill out"
                        style={{
                          width: `${(monthToGoals / flowMax) * 100}%`,
                          opacity: 0.65,
                        }}
                      />
                    </div>
                    <strong>{formatIls(monthToGoals)}</strong>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="hub-tabs">
        <button
          type="button"
          className={tab === "txs" ? "active" : undefined}
          onClick={() => setTab("txs")}
        >
          תנועות
        </button>
        <button
          type="button"
          className={tab === "fixed" ? "active" : undefined}
          onClick={() => setTab("fixed")}
        >
          קבועים
        </button>
        <button
          type="button"
          className={tab === "import" ? "active" : undefined}
          onClick={() => setTab("import")}
        >
          ייבוא
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {msg && <p className="badge good">{msg}</p>}

      {pendingConfirm?.kind === "delete-tx" && (
        <ConfirmPanel
          title="מחיקת תנועה"
          danger
          busy={busy}
          confirmLabel="מחיקה"
          message={
            pendingConfirm.tx.installmentPlanId
              ? "למחוק את התנועה הזו? זו עסקת תשלומים — הפריסה תתעדכן בהתאם."
              : "למחוק את התנועה הזו?"
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeDeleteTx(pendingConfirm.tx)}
        />
      )}
      {pendingConfirm?.kind === "remove-commitment" && (
        <ConfirmPanel
          title="הסרת הוצאה קבועה"
          danger
          busy={busy}
          confirmLabel="הסרה"
          message={`להסיר את ההוצאה הקבועה «${pendingConfirm.titleHe}»?`}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void executeRemoveCommitment(pendingConfirm.id)}
        />
      )}
      {pendingConfirm?.kind === "undo-import" && (
        <ConfirmPanel
          title="ביטול ייבוא"
          danger
          busy={busy}
          confirmLabel="בטל ייבוא"
          message={
            pendingConfirm.latestConfirmed
              ? "לבטל את הייבוא האחרון ולהסיר את התנועות שלו?"
              : "לבטל את הייבוא ולהסיר את התנועות שלו?"
          }
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => {
            const docId = pendingConfirm.docId;
            setPendingConfirm(null);
            void undo(docId);
          }}
        />
      )}

      {(tab === "txs" || tab === "fixed") && (
        <>
          {tab === "txs" && (
          <div className="mt-surface money-actions-panel rise-2">
          <div className="money-actions">
            <div className="dir-chips" role="group" aria-label="סינון כיוון">
              {(
                [
                  ["ALL", "הכל"],
                  ["EXPENSE", "הוצאות"],
                  ["INCOME", "הכנסות"],
                  ["TRANSFER", "העברות"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`dir-chip${dirFilter === key ? " active" : ""}${
                    key === "INCOME"
                      ? " income"
                      : key === "EXPENSE"
                        ? " expense"
                        : ""
                  }`}
                  onClick={() => setDirFilterAndUrl(key)}
                >
                  {label}
                  <span className="dir-chip-count">{dirCounts[key]}</span>
                </button>
              ))}
            </div>
            <label className="tx-search field" style={{ marginBottom: 0 }}>
              <span className="sr-only">חיפוש תנועות</span>
              <span className="tx-search-icon" aria-hidden>
                ⌕
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חיפוש לפי תיאור או קטגוריה"
                autoComplete="off"
              />
              {q && (
                <button
                  type="button"
                  className="tx-search-clear"
                  aria-label="נקה חיפוש"
                  onClick={() => setQ("")}
                >
                  ×
                </button>
              )}
            </label>
            <button
              type="button"
              className={`dir-chip${groupByDay ? " active" : ""}`}
              aria-pressed={groupByDay}
              title={groupByDay ? "הצג תאריך בכל שורה" : "קבץ לפי יום"}
              onClick={toggleGroupByDay}
            >
              לפי יום
            </button>
            {categoryFilter && (
              <span className="badge">
                קטגוריה: {labelCat(categoryFilter)}{" "}
                <button
                  type="button"
                  className="linkish"
                  style={{
                    marginInlineStart: "0.35rem",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "inherit",
                    textDecoration: "underline",
                  }}
                  onClick={() => {
                    const params = new URLSearchParams(search.toString());
                    params.delete("category");
                    router.replace(`/app/money?${params.toString()}`, {
                      scroll: false,
                    });
                  }}
                >
                  נקה
                </button>
              </span>
            )}
            <div className="tx-add-actions">
              {addDraft ? (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={cancelAddDraft}
                >
                  ביטול הוספה
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => openAddDraft("expense")}
                  >
                    + הוצאה
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => openAddDraft("income")}
                  >
                    + הכנסה
                  </button>
                </>
              )}
            </div>
          </div>
          </div>
          )}

          {commitmentOffer && (
            <div className="commitment-offer">
              <span>
                לשמור «{commitmentOffer.titleHe}» כהתחייבות קבועה לחודשים
                הבאים?
              </span>
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void acceptCommitmentOffer()}
              >
                כן
              </button>
              <button
                type="button"
                className="linkish"
                onClick={() => setCommitmentOffer(null)}
              >
                לא עכשיו
              </button>
            </div>
          )}

          <section className="card tx-panel">
            <div className="tx-draft-fixed">
              <div className="tx-draft-fixed-head">
                <button
                  type="button"
                  className="linkish tx-fixed-toggle"
                  aria-expanded={fixedOpen || tab === "fixed"}
                  onClick={() => {
                    if (tab === "fixed") setTab("txs");
                    else setFixedOpen((v) => !v);
                  }}
                >
                  {fixedOpen || tab === "fixed" ? "▼" : "▶"} הוצאות קבועות ·{" "}
                  {labelMonthHe(month)}
                  {!fixedOpen &&
                  tab !== "fixed" &&
                  pendingCommitments.length > 0
                    ? ` · ${pendingCommitments.length} פתוחות`
                    : ""}
                  {!fixedOpen &&
                  tab !== "fixed" &&
                  pendingCommitments.length === 0 &&
                  expenseCommitments.length > 0
                    ? ` · ${expenseCommitments.length}`
                    : ""}
                </button>
                {(fixedOpen || tab === "fixed") && (
                  <div className="tx-draft-fixed-actions">
                    {pendingCommitments.length > 0 && (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => void recordAllPendingCommitments()}
                        title="רושם פעם אחת לחודש — מהחשבון או באשראי לפי כל התחייבות"
                      >
                        רשום פתוחות ({pendingCommitments.length})
                      </button>
                    )}
                    {cardOpts.length > 0 && (
                      <button
                        type="button"
                        className="linkish muted"
                        disabled={busy}
                        onClick={() => void chargeDueCardInstallments()}
                        title="פריסות תשלומים (לא הוראת קבע) — תשלום N לחודש הנבחר"
                      >
                        רשום פריסות לחודש
                      </button>
                    )}
                  </div>
                )}
              </div>
              {(fixedOpen || tab === "fixed") && (
                <>
              {expenseCommitments.length === 0 ? (
                <p className="muted tx-draft-fixed-empty">
                  אין התחייבויות לחודש זה. הוסיפו הוצאה → מלאו סכום → «שמור
                  כקבועה» (מהחשבון) או בחרו כרטיס → «שמור כהוראת קבע באשראי».
                </p>
              ) : (
                <div className="tx-fixed-groups">
                  {accountCommitments.length > 0 && (
                    <div className="tx-fixed-group">
                      <p className="tx-fixed-group-label muted">מהחשבון</p>
                      <div className="tx-draft-chips">
                        {accountCommitments.map((item) => {
                          const open =
                            item.status === "pending" ||
                            item.status === "partial";
                          const fillAmt =
                            Math.max(0, item.expected - item.actual) ||
                            item.expected;
                          const from = formatStartMonthHe(item.startMonth);
                          return (
                            <span
                              key={item.commitmentId || item.titleHe}
                              className={`tx-draft-chip-wrap${open ? "" : " done"}`}
                            >
                              <button
                                type="button"
                                className="tx-draft-chip"
                                onClick={() => fillFromCommitment(item)}
                                title={
                                  open
                                    ? from
                                      ? `מילוי טיוטה · מתחיל מ־${from}`
                                      : "מילוי הטיוטה לרישום החודש"
                                    : `שולם ב־${month} — לחיצה לא תרשום שוב`
                                }
                              >
                                {item.titleHe} · {formatIls(fillAmt)}
                                {from && (
                                  <span className="tx-draft-chip-status">
                                    מ־{from}
                                  </span>
                                )}
                                {!open && (
                                  <span className="tx-draft-chip-status">✓</span>
                                )}
                              </button>
                              {item.commitmentId && (
                                <button
                                  type="button"
                                  className="tx-draft-chip-x"
                                  aria-label={`הסר ${item.titleHe}`}
                                  disabled={busy}
                                  onClick={() =>
                                    void removeCommitment(
                                      item.commitmentId!,
                                      item.titleHe,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {cardCommitments.length > 0 && (
                    <div className="tx-fixed-group">
                      <p className="tx-fixed-group-label muted">הוראת קבע באשראי</p>
                      <div className="tx-draft-chips">
                        {cardCommitments.map((item) => {
                          const open =
                            item.status === "pending" ||
                            item.status === "partial";
                          const fillAmt =
                            Math.max(0, item.expected - item.actual) ||
                            item.expected;
                          const from = formatStartMonthHe(item.startMonth);
                          return (
                            <span
                              key={item.commitmentId || item.titleHe}
                              className={`tx-draft-chip-wrap${open ? "" : " done"}`}
                            >
                              <button
                                type="button"
                                className="tx-draft-chip"
                                onClick={() => fillFromCommitment(item)}
                                title={
                                  open
                                    ? `${cardLabel(item.creditCardId)}${from ? ` · מ־${from}` : ""}`
                                    : `שולם ב־${month} באשראי — לחיצה לא תרשום שוב`
                                }
                              >
                                {item.titleHe} · {formatIls(fillAmt)}
                                <span className="tx-draft-chip-status">
                                  {cardLabel(item.creditCardId)}
                                </span>
                                {from && (
                                  <span className="tx-draft-chip-status">
                                    מ־{from}
                                  </span>
                                )}
                                {!open && (
                                  <span className="tx-draft-chip-status">✓</span>
                                )}
                              </button>
                              {item.commitmentId && (
                                <button
                                  type="button"
                                  className="tx-draft-chip-x"
                                  aria-label={`הסר ${item.titleHe}`}
                                  disabled={busy}
                                  onClick={() =>
                                    void removeCommitment(
                                      item.commitmentId!,
                                      item.titleHe,
                                    )
                                  }
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {pendingCommitments.length > 0 && (
                <p className="muted tx-draft-fixed-hint">
                  לחודש זה בלבד: צ׳יפ פתוח → שמירה (פעם אחת). ✓ = כבר נרשם.
                  חודשים לפני «מ־…» לא מציגים את ההתחייבות.
                </p>
              )}
                </>
              )}
              {addDraft?.mode === "expense" && (
                <div className="tx-draft-fixed-actions" style={{ marginTop: "0.35rem" }}>
                  <button
                    type="button"
                    className="linkish"
                    disabled={busy}
                    onClick={() => {
                      setFixedOpen(true);
                      void saveDraftAsCommitment();
                    }}
                    title={
                      addDraft.economicRole === "CARD_PURCHASE"
                        ? "שומר כהוראת קבע באשראי מהחודש הנבחר"
                        : "שומר כהוצאה קבועה מהחשבון מהחודש הנבחר"
                    }
                  >
                    {addDraft.economicRole === "CARD_PURCHASE"
                      ? "+ שמור טיוטה כהוראת קבע באשראי"
                      : "+ שמור טיוטה כקבועה מהחשבון"}
                  </button>
                </div>
              )}
            </div>

            {tab === "txs" && (
            <>
            {addDraft && (
              <div className="tx-draft-block">
              <div
                className={`tx-dense-row draft with-date ${
                  addDraft.mode === "income" ? "in" : "out"
                }`}
              >
                <input
                  type="date"
                  className="cell-input"
                  value={addDraft.bookedAt}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, bookedAt: e.target.value })
                  }
                  aria-label="תאריך"
                />
                <input
                  className="cell-input"
                  value={addDraft.description}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, description: e.target.value })
                  }
                  placeholder="עבור מה"
                  aria-label="עבור מה"
                />
                <span
                  className={`tx-dense-dir ${
                    addDraft.mode === "income" ? "in" : "out"
                  }${
                    addDraft.mode === "expense"
                      ? resolveNature(addDraft.categoryKey) === "fixed" ||
                        resolveNature(addDraft.categoryKey) === "periodic"
                        ? " nature-fixed"
                        : " nature-variable"
                      : ""
                  }`}
                >
                  {addDraft.mode === "income"
                    ? "הכנסה"
                    : resolveNature(addDraft.categoryKey) === "fixed" ||
                        resolveNature(addDraft.categoryKey) === "periodic"
                      ? "הוצאה קבועה"
                      : "הוצאה משתנה"}
                </span>
                <CategoryCombobox
                  options={addCategories}
                  value={addDraft.categoryKey}
                  onChange={(key) =>
                    setAddDraft({ ...addDraft, categoryKey: key })
                  }
                  onCreate={createUserCategory}
                  disabled={busy}
                />
                <input
                  className="cell-input tx-draft-amt"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={addDraft.amount}
                  onChange={(e) =>
                    setAddDraft({ ...addDraft, amount: e.target.value })
                  }
                  placeholder="סכום"
                  aria-label="סכום"
                />
                <div className="tx-dense-actions open">
                  <button
                    type="button"
                    className="linkish"
                    disabled={busy}
                    onClick={() => void saveAddDraft()}
                  >
                    שמירה
                  </button>
                  <button
                    type="button"
                    className="linkish muted"
                    disabled={busy}
                    onClick={cancelAddDraft}
                  >
                    ביטול
                  </button>
                </div>
              </div>
              {addDraft.mode === "expense" && (
                <div className="tx-pay-panel">
                  <div className="tx-pay-label">איך שולם</div>
                  <div className="dir-chips tx-pay-chips" role="group" aria-label="אופן תשלום">
                    {(
                      [
                        ["STANDARD", "מהחשבון"],
                        ["CARD_PURCHASE", "כרטיס אשראי"],
                        ["CARD_SETTLEMENT", "סילוק כרטיס"],
                        ["LOAN_PAYMENT", "תשלום הלוואה"],
                      ] as const
                    ).map(([role, label]) => (
                      <button
                        key={role}
                        type="button"
                        className={`dir-chip${
                          addDraft.economicRole === role ? " active" : ""
                        }`}
                        onClick={() =>
                          setAddDraft({
                            ...addDraft,
                            economicRole: role,
                            loanId: "",
                            creditCardId: "",
                            installmentCount: "1",
                          })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {addDraft.economicRole === "LOAN_PAYMENT" && (
                    <div className="tx-pay-detail">
                      <div className="tx-pay-label">הלוואה</div>
                      <div className="dir-chips" role="group" aria-label="בחירת הלוואה">
                        {loanOpts.length === 0 ? (
                          <span className="muted">אין הלוואות פעילות</span>
                        ) : (
                          loanOpts.map((l) => (
                            <button
                              key={l.id}
                              type="button"
                              className={`dir-chip${
                                addDraft.loanId === l.id ? " active" : ""
                              }`}
                              onClick={() =>
                                setAddDraft({ ...addDraft, loanId: l.id })
                              }
                            >
                              {l.name}
                            </button>
                          ))
                        )}
                      </div>
                      <p className="muted tx-pay-hint">
                        יירשם כהוצאה ויוריד את יתרת ההלוואה. העו״ש יתעדכן.
                      </p>
                    </div>
                  )}

                  {(addDraft.economicRole === "CARD_PURCHASE" ||
                    addDraft.economicRole === "CARD_SETTLEMENT") && (
                    <div className="tx-pay-detail">
                      <div className="tx-pay-label">כרטיס</div>
                      <div className="dir-chips" role="group" aria-label="בחירת כרטיס">
                        {cardOpts.length === 0 ? (
                          <span className="muted">אין כרטיסים פעילים</span>
                        ) : (
                          cardOpts.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className={`dir-chip${
                                addDraft.creditCardId === c.id ? " active" : ""
                              }`}
                              onClick={() =>
                                setAddDraft({
                                  ...addDraft,
                                  creditCardId: c.id,
                                })
                              }
                            >
                              {c.name}
                              {c.lastFour ? ` ·••• ${c.lastFour}` : ""}
                            </button>
                          ))
                        )}
                      </div>

                      {addDraft.economicRole === "CARD_PURCHASE" && (
                        <>
                          <div className="tx-pay-label">פריסה</div>
                          <div
                            className="dir-chips"
                            role="group"
                            aria-label="חד־פעמי או תשלומים"
                          >
                            <button
                              type="button"
                              className={`dir-chip${
                                Number(addDraft.installmentCount) <= 1
                                  ? " active"
                                  : ""
                              }`}
                              onClick={() =>
                                setAddDraft({
                                  ...addDraft,
                                  installmentCount: "1",
                                })
                              }
                            >
                              חד־פעמי
                            </button>
                            <button
                              type="button"
                              className={`dir-chip${
                                Number(addDraft.installmentCount) >= 2
                                  ? " active"
                                  : ""
                              }`}
                              onClick={() =>
                                setAddDraft({
                                  ...addDraft,
                                  installmentCount:
                                    Number(addDraft.installmentCount) >= 2
                                      ? addDraft.installmentCount
                                      : "3",
                                })
                              }
                            >
                              בתשלומים
                            </button>
                          </div>
                          {Number(addDraft.installmentCount) >= 2 && (
                            <label className="tx-pay-install-count">
                              מספר תשלומים
                              <input
                                type="number"
                                min={2}
                                max={48}
                                value={addDraft.installmentCount}
                                onChange={(e) =>
                                  setAddDraft({
                                    ...addDraft,
                                    installmentCount: e.target.value,
                                  })
                                }
                              />
                            </label>
                          )}
                          {(() => {
                            const n = Math.max(
                              1,
                              Math.floor(
                                Number(addDraft.installmentCount) || 1,
                              ),
                            );
                            const total = Number(addDraft.amount);
                            const monthly =
                              Number.isFinite(total) && total > 0 && n >= 2
                                ? Math.round((total / n) * 100) / 100
                                : null;
                            if (n <= 1) {
                              return (
                                <p className="muted tx-pay-hint">
                                  הסכום המלא נכנס להוצאות החודש וליתרת הכרטיס.
                                  העו״ש לא משתנה עד סילוק.
                                </p>
                              );
                            }
                            return (
                              <p className="muted tx-pay-hint">
                                {monthly != null
                                  ? `רק ${formatIls(monthly)} ייספר בהוצאות החודש וביתרת המחזור. שאר ${(formatIls(Math.round((total - monthly) * 100) / 100))} יישמר כהתחייבות תשלומים.`
                                  : "רק תשלום החודש נספר בהוצאות; היתר התחייבות עתידית — בלי כפל ספירה."}
                              </p>
                            );
                          })()}
                          {Number(addDraft.installmentCount) <= 1 &&
                            addDraft.creditCardId && (
                              <div className="tx-card-standing-cta">
                                <button
                                  type="button"
                                  className="btn secondary"
                                  disabled={busy}
                                  onClick={() => void saveDraftAsCommitment()}
                                >
                                  שמור כהוראת קבע באשראי
                                </button>
                                <p className="muted tx-pay-hint">
                                  כמו שכירות — תופיע בצ׳יפים מ־{month}. בכל חודש
                                  רושמים פעם אחת כקנייה בכרטיס (לא פריסת
                                  תשלומים). «שמירה» למעלה = רק החודש הזה.
                                </p>
                              </div>
                            )}
                          {Number(addDraft.installmentCount) <= 1 &&
                            !addDraft.creditCardId && (
                              <p className="muted tx-pay-hint">
                                בחרו כרטיס ואז אפשר לשמור כהוראת קבע באשראי.
                              </p>
                            )}
                        </>
                      )}

                      {addDraft.economicRole === "CARD_SETTLEMENT" && (
                        <p className="muted tx-pay-hint">
                          יורד מהעו״ש ומוריד את יתרת הכרטיס — לא נספר כהוצאה
                          חדשה (הקנייה כבר נספרה).
                        </p>
                      )}
                    </div>
                  )}

                  {addDraft.economicRole === "STANDARD" && (
                    <p className="muted tx-pay-hint">
                      חיוב ישיר מהעו״ש — נספר בהוצאות החודש.
                    </p>
                  )}
                </div>
              )}
              </div>
            )}
            {filtered.length === 0 && !addDraft ? (
              <div style={{ margin: 0 }}>
                <p className="muted" style={{ marginTop: 0 }}>
                  {categoryFilter || q
                    ? "אין תנועות שמתאימות לסינון"
                    : "אין תנועות בחודש זה"}
                </p>
                {!categoryFilter && !q && (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setTab("import")}
                    >
                      ייבוא
                    </button>
                    <button
                      className="dir-chip add-expense"
                      type="button"
                      onClick={() => openAddDraft("expense")}
                    >
                      + הוצאה
                    </button>
                    {listHasMore && (
                      <button
                        type="button"
                        className="btn quiet"
                        disabled={listLoadingMore}
                        onClick={() => void loadMoreTxs()}
                      >
                        {listLoadingMore
                          ? "טוען…"
                          : "טען חודשים קודמים"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : filtered.length === 0 && addDraft ? (
              <p className="muted" style={{ fontSize: "0.85rem" }}>
                מלאו את השורה למעלה ושמרו.
              </p>
            ) : (
              <div className="tx-dense-list">
                <div
                  className={`tx-dense-head${groupByDay ? "" : " with-date"}`}
                  aria-hidden
                >
                  {!groupByDay && <span>תאריך</span>}
                  <span>עבור מה</span>
                  <span>הערה</span>
                  <span>כיוון</span>
                  <span>קטגוריה</span>
                  <span>סכום</span>
                  <span className="tx-dense-head-actions" />
                </div>
                {groupByDay
                  ? dayGroups.map((group) => (
                      <div key={group.key} className="tx-dense-day">
                        <div className="tx-dense-day-head">
                          <span>{group.label}</span>
                          <span
                            className={
                              group.net > 0
                                ? "tx-in"
                                : group.net < 0
                                  ? "tx-out"
                                  : "muted"
                            }
                          >
                            {group.net > 0 ? "+" : ""}
                            {formatIls(group.net)}
                          </span>
                        </div>
                        {group.items.map((t) => renderDenseRow(t, false))}
                      </div>
                    ))
                  : (
                      <div className="tx-dense-day">
                        {filtered.map((t) => renderDenseRow(t, true))}
                      </div>
                    )}
                <div
                  ref={listSentinelRef}
                  className="tx-list-sentinel"
                  aria-hidden
                />
                {listLoadingMore && (
                  <p className="muted tx-list-more-status">טוען עוד תנועות…</p>
                )}
                {!listLoadingMore && listHasMore && filtered.length > 0 && (
                  <button
                    type="button"
                    className="btn quiet tx-list-more-btn"
                    onClick={() => void loadMoreTxs()}
                  >
                    {listScope === "older"
                      ? "טען חודשים קודמים"
                      : "הצג עוד תנועות"}
                  </button>
                )}
                {!listHasMore && filtered.length > 0 && listScope === "older" && (
                  <p className="muted tx-list-more-status">
                    אין עוד תנועות ישנות יותר
                  </p>
                )}
              </div>
            )}
            </>
            )}
          </section>
        </>
      )}

      {tab === "import" && (
        <>
          <form className="card import-upload-panel" onSubmit={onUpload}>
            <div className="import-upload-head">
              <strong>העלאת דף חשבון</strong>
              <p className="muted">
                CSV, PDF או תמונה — נחלץ לטיוטה, אתם מאשרים לפני שמירה
              </p>
            </div>

            <label
              className={[
                "import-file-drop",
                uploadFileName ? "has-file" : "",
                uploadDragOver ? "drag-over" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onDragEnter={(e) => {
                e.preventDefault();
                setUploadDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setUploadDragOver(true);
              }}
              onDragLeave={() => setUploadDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setUploadDragOver(false);
                const input = e.currentTarget.querySelector(
                  'input[type="file"]',
                ) as HTMLInputElement | null;
                const file = e.dataTransfer.files?.[0];
                if (!input || !file) return;
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                setUploadFileName(file.name);
              }}
            >
              <input
                className="import-file-input"
                name="file"
                type="file"
                accept=".csv,.pdf,image/png,image/jpeg,image/webp,image/gif,text/csv,application/pdf"
                required
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setUploadFileName(file ? file.name : null);
                }}
              />
              <span className="import-file-drop-mark" aria-hidden>
                {uploadFileName ? "✓" : "↑"}
              </span>
              <span className="import-file-drop-title">
                {uploadFileName || "בחרו קובץ או גררו לכאן"}
              </span>
              <span className="import-file-drop-hint muted">
                PDF · CSV · PNG / JPG עד 8MB
              </span>
            </label>

            <div className="import-upload-actions">
              <label className="import-keep-file">
                <input
                  type="checkbox"
                  checked={keepFile}
                  onChange={(e) => setKeepFile(e.target.checked)}
                />
                <span>שמור קובץ מקור</span>
              </label>
              <button className="btn" type="submit" disabled={busy}>
                {busy ? "מחלץ…" : "העלאה וחילוץ"}
              </button>
            </div>
          </form>

          {draft && (
            <section className="card import-draft-panel">
              <h2 style={{ marginTop: 0 }}>
                טיוטה · {draft.originalName}
              </h2>
              {(() => {
                const incomeRows = editable.filter((r) => r.direction === "INCOME");
                const expenseRows = editable.filter((r) => r.direction === "EXPENSE");
                const reviewRows = editable.filter((r) => rowNeedsReview(r));
                const incomeSum = incomeRows.reduce((s, r) => s + r.amount, 0);
                const expenseSum = expenseRows.reduce((s, r) => s + r.amount, 0);
                const filteredIndexes = editable
                  .map((row, i) => ({ row, i }))
                  .filter(({ row }) => {
                    if (importDirFilter === "INCOME") return row.direction === "INCOME";
                    if (importDirFilter === "EXPENSE") return row.direction === "EXPENSE";
                    if (importDirFilter === "REVIEW") return rowNeedsReview(row);
                    return true;
                  });
                return (
                  <>
                    <div className="import-dir-summary">
                      <span className="mt-chip good">
                        הכנסות <b>{incomeRows.length}</b>
                        <strong className="tx-in">
                          {" "}
                          +{formatIls(incomeSum)}
                        </strong>
                      </span>
                      <span className="mt-chip warn">
                        הוצאות <b>{expenseRows.length}</b>
                        <strong className="tx-out">
                          {" "}
                          −{formatIls(expenseSum)}
                        </strong>
                      </span>
                      {reviewRows.length > 0 && (
                        <span className="mt-chip">
                          לתיקון <b>{reviewRows.length}</b>
                        </span>
                      )}
                      {draft.quality?.duplicates ? (
                        <span className="mt-chip">
                          כפולות <b>{draft.quality.duplicates}</b>
                        </span>
                      ) : null}
                    </div>
                    {draft.quality?.reconcileWarn &&
                      draft.quality.statementDelta != null &&
                      draft.quality.signedSum != null && (
                        <p className="form-error import-reconcile-warn" role="status">
                          סכום הייבוא ({formatIls(draft.quality.signedSum)}) לא
                          תואם את שינוי היתרה בדף (
                          {formatIls(draft.quality.statementDelta)}) — בדקו
                          כיוונים.
                        </p>
                      )}
                    <div className="dir-chips import-dir-filters" role="tablist" aria-label="סינון כיוון">
                      {(
                        [
                          ["ALL", "הכל", editable.length],
                          ["INCOME", "הכנסות", incomeRows.length],
                          ["EXPENSE", "הוצאות", expenseRows.length],
                          ["REVIEW", "לתיקון", reviewRows.length],
                        ] as const
                      ).map(([key, label, count]) => (
                        <button
                          key={key}
                          type="button"
                          className={`dir-chip${
                            importDirFilter === key ? " active" : ""
                          }${key === "INCOME" ? " income" : ""}${
                            key === "EXPENSE" ? " expense" : ""
                          }`}
                          aria-pressed={importDirFilter === key}
                          onClick={() => setImportDirFilter(key)}
                        >
                          {label}
                          <span className="dir-chip-count">{count}</span>
                        </button>
                      ))}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="tx-table import-draft-table">
                        <thead>
                          <tr>
                            <th />
                            <th>תאריך</th>
                            <th>עבור מה</th>
                            <th>כיוון</th>
                            <th>קטגוריה</th>
                            <th>סכום</th>
                            <th>ביטחון</th>
                            <th>רמזים</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredIndexes.map(({ row, i }) => (
                            <tr
                              key={`${row.bookedAt}-${i}`}
                              className={
                                rowNeedsReview(row)
                                  ? "row-warn"
                                  : row.direction === "INCOME"
                                    ? "import-row-income"
                                    : row.direction === "EXPENSE"
                                      ? "import-row-expense"
                                      : undefined
                              }
                            >
                              <td>
                                <input
                                  type="checkbox"
                                  checked={selected.has(i)}
                                  disabled={row.duplicate}
                                  onChange={() => {
                                    setSelected((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(i)) next.delete(i);
                                      else next.add(i);
                                      return next;
                                    });
                                  }}
                                />
                              </td>
                              <td>
                                {new Date(row.bookedAt).toLocaleDateString(
                                  "he-IL",
                                )}
                              </td>
                              <td>
                                <input
                                  className="cell-input"
                                  value={row.description}
                                  onChange={(e) =>
                                    patchRow(i, {
                                      description: e.target.value,
                                    })
                                  }
                                />
                              </td>
                              <td>
                                <select
                                  value={row.direction}
                                  onChange={(e) =>
                                    patchRow(i, {
                                      direction: e.target
                                        .value as DraftRow["direction"],
                                    })
                                  }
                                >
                                  <option value="EXPENSE">הוצאה</option>
                                  <option value="INCOME">הכנסה</option>
                                  <option value="TRANSFER">העברה</option>
                                </select>
                              </td>
                              <td>
                                <select
                                  value={ensureCategoryForDirection(
                                    row.direction,
                                    row.categoryKey,
                                    userCats,
                                  )}
                                  onChange={(e) =>
                                    patchRow(i, {
                                      categoryKey: e.target.value,
                                    })
                                  }
                                >
                                  {categoriesForDirection(
                                    row.direction,
                                    userCats,
                                  ).map((c) => (
                                    <option key={c.key} value={c.key}>
                                      {c.labelHe}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td
                                className={
                                  row.direction === "INCOME"
                                    ? "tx-in"
                                    : row.direction === "EXPENSE"
                                      ? "tx-out"
                                      : undefined
                                }
                              >
                                {row.direction === "INCOME"
                                  ? "+"
                                  : row.direction === "EXPENSE"
                                    ? "−"
                                    : ""}
                                {formatIls(row.amount)}
                              </td>
                              <td
                                className="muted"
                                style={{ fontSize: "0.75rem" }}
                              >
                                {row.duplicate
                                  ? "כפול"
                                  : rowNeedsReview(row)
                                    ? "לבדיקה"
                                    : row.confidence != null
                                      ? `${Math.round(row.confidence * 100)}%`
                                      : ""}
                              </td>
                              <td
                                className="muted"
                                style={{
                                  fontSize: "0.72rem",
                                  maxWidth: "9rem",
                                }}
                              >
                                {(row.evidence || [])
                                  .slice(0, 3)
                                  .map(evidenceLabelHe)
                                  .filter((v, idx, a) => a.indexOf(v) === idx)
                                  .join(" · ") || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
              <div className="doc-actions sticky-actions">
                <button
                  className="btn"
                  type="button"
                  disabled={busy || selected.size === 0}
                  onClick={() => confirmImport()}
                >
                  אישור ייבוא ({selected.size})
                </button>
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => rejectImport()}
                >
                  דחייה
                </button>
              </div>
            </section>
          )}

          <section className="card">
            <h2 style={{ marginTop: 0 }}>היסטוריית סריקות</h2>
            {docs.length === 0 && <p className="muted">עדיין אין סריקות</p>}
            {docs.map((d, idx) => {
              const latestConfirmed =
                d.status === "CONFIRMED" &&
                docs.findIndex((x) => x.status === "CONFIRMED") === idx;
              return (
              <div className="list-row" key={d.id}>
                <div>
                  <strong>{d.originalName}</strong>
                  <div className="muted">
                    {new Date(d.createdAt).toLocaleString("he-IL")}
                    {d.importedCount != null
                      ? ` · ${d.importedCount} תנועות`
                      : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {d.status === "CONFIRMED" && (
                    <button
                      className="btn secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setPendingConfirm({
                          kind: "undo-import",
                          docId: d.id,
                          latestConfirmed,
                        });
                      }}
                    >
                      {latestConfirmed ? "בטל ייבוא אחרון" : "בטל ייבוא"}
                    </button>
                  )}
                  <span className="badge">{statusHe(d.status)}</span>
                </div>
              </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

export default function MoneyPage() {
  return (
    <Suspense fallback={<p className="mt-state mt-state-loading">טוען…</p>}>
      <MoneyInner />
    </Suspense>
  );
}
