"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useMemo,
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
import { CategoryCombobox } from "@/components/CategoryCombobox";
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
};

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

type AddDraft = {
  mode: "expense" | "income";
  amount: string;
  description: string;
  categoryKey: string;
  bookedAt: string;
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
};

function evidenceLabelHe(code: string): string {
  if (code.startsWith("lex:")) return "מילון";
  if (code.startsWith("col:")) return "עמודת דוח";
  if (code.startsWith("bal:")) return "יתרה";
  if (code.startsWith("mem:")) return "זיכרון";
  if (code.startsWith("rule:")) return "כלל";
  if (code.startsWith("type:")) return "סוג שורה";
  if (code === "transfer" || code === "recurring") return code === "transfer" ? "העברה" : "חוזר";
  if (code === "fallback" || code.startsWith("fallback:")) return "ברירת מחדל";
  if (code.startsWith("user:")) return "עריכה";
  if (code.startsWith("conflict:")) return "קונפליקט";
  return code;
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
  };
  period?: { defaultMonth?: string; statementFrom?: string; statementTo?: string };
};

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
  const tab = search.get("tab") === "import" ? "import" : "txs";
  const categoryFilter = search.get("category") || "";
  const dirFromUrl = search.get("dir");

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [docs, setDocs] = useState<DocListItem[]>([]);
  const [budget, setBudget] = useState<BudgetSnap | null>(null);
  const [monthFacts, setMonthFacts] = useState<MonthFacts | null>(null);
  const [userCats, setUserCats] = useState<UserCat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const [editable, setEditable] = useState<DraftRow[]>([]);
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupByDay, setGroupByDay] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

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
    if (!budget?.fixed?.items || addDraft?.mode !== "expense") return [];
    return budget.fixed.items.filter(
      (i) =>
        i.commitmentId &&
        (i.status === "pending" || i.status === "partial") &&
        i.expected > 0,
    );
  }, [budget, addDraft?.mode]);

  const expenseCommitments = useMemo(() => {
    if (!budget?.fixed?.items || addDraft?.mode !== "expense") return [];
    return budget.fixed.items.filter((i) => i.commitmentId && i.expected > 0);
  }, [budget, addDraft?.mode]);

  const checkingAccount = useMemo(() => {
    const banks = accounts.filter((a) => a.kind === "BANK");
    return banks[0] || accounts[0] || null;
  }, [accounts]);

  const checkingBalance =
    monthFacts?.checkingBalanceNow ??
    (checkingAccount ? Number(checkingAccount.currentBalance) : 0);

  const monthTxs = useMemo(() => txs, [txs]);

  const dirCounts = useMemo(() => {
    const c = { ALL: monthTxs.length, INCOME: 0, EXPENSE: 0, TRANSFER: 0 };
    for (const t of monthTxs) c[t.direction] += 1;
    return c;
  }, [monthTxs]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return monthTxs.filter((t) => {
      if (dirFilter !== "ALL" && t.direction !== dirFilter) return false;
      if (categoryFilter && t.categoryKey !== categoryFilter) return false;
      if (needle) {
        const hay =
          `${t.description || ""} ${labelCat(t.categoryKey)}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [monthTxs, dirFilter, categoryFilter, q, catLabels]);

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
    const [a, t, facts, cats, d] = await Promise.all([
      api<Account[]>("/accounts"),
      api<Tx[]>(`/transactions?month=${month}`),
      api<MonthFacts>(`/month-facts?month=${month}`).catch(() => null),
      api<UserCat[]>("/categories").catch(() => [] as UserCat[]),
      needDocs
        ? api<DocListItem[]>("/documents")
        : Promise.resolve(null),
    ]);
    setAccounts(a);
    setTxs(t);
    setUserCats(cats);
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

  useEffect(() => {
    refresh({ docs: tab === "import" }).catch((e) =>
      setError(e instanceof Error ? e.message : "שגיאה"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, tab]);

  function setDirFilterAndUrl(
    next: "ALL" | "INCOME" | "EXPENSE" | "TRANSFER",
  ) {
    setDirFilter(next);
    const params = new URLSearchParams(search.toString());
    if (next === "ALL") params.delete("dir");
    else params.set("dir", next);
    router.replace(`/app/money?${params.toString()}`);
  }

  function setTab(next: "txs" | "import") {
    const params = new URLSearchParams(search.toString());
    if (next === "import") params.set("tab", "import");
    else params.delete("tab");
    router.replace(`/app/money?${params.toString()}`);
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
    if (!addDraft) return;
    const remaining = Math.max(0, item.expected - item.actual);
    setAddDraft({
      ...addDraft,
      amount: String(remaining || item.expected),
      description: item.titleHe,
      categoryKey: ensureCategoryForDirection(
        "EXPENSE",
        item.categoryKey,
        userCats,
      ),
    });
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
      await api("/transactions", {
        method: "POST",
        body: JSON.stringify({
          direction,
          amount: amt,
          categoryKey: addDraft.categoryKey,
          description: addDraft.description || undefined,
          bookedAt: `${addDraft.bookedAt}T12:00:00.000Z`,
        }),
      });

      const nature = resolveNature(addDraft.categoryKey);
      const hasCommitment = (budget?.fixed?.items || []).some(
        (i) =>
          i.commitmentId &&
          i.categoryKey === addDraft.categoryKey,
      );
      const offer =
        direction === "EXPENSE" &&
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
    if (!addDraft || addDraft.mode !== "expense") return;
    const list = pendingCommitments;
    if (!list.length) {
      setError("אין הוצאות קבועות פתוחות לחודש זה");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const bookedAt = `${addDraft.bookedAt}T12:00:00.000Z`;
      for (const item of list) {
        const amt =
          Math.max(0, item.expected - item.actual) || item.expected;
        if (amt <= 0) continue;
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
      }
      setMsg(`נרשמו ${list.length} הוצאות קבועות יחד`);
      await refresh();
      setAddDraft({
        ...emptyAddDraft("expense", month),
        bookedAt: addDraft.bookedAt,
      });
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
        }),
      });
      setCommitmentOffer(null);
      setMsg("נשמרה התחייבות קבועה לחודשים הבאים");
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
        }),
      });
      setMsg("נוספה הוצאה קבועה — אפשר להוסיף עוד בטיוטה");
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
    if (!window.confirm(`להסיר את ההוצאה הקבועה «${titleHe}»?`)) return;
    setBusy(true);
    setError(null);
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
        router.replace(`/app/money?${params.toString()}`);
      }
      setMsg(`זוהו ${result.draft.length} תנועות — בדקו ואשרו.`);
      form.reset();
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
      router.replace(`/app/money?${params.toString()}`);
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
    if (!window.confirm("למחוק את התנועה הזו?")) return;
    setBusy(true);
    setError(null);
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
        title="תנועות"
        subtitle="תזרים חודשי · ייבוא אופציונלי"
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

      {budget && tab === "txs" && (
        <section className="card month-flow-strip month-flow-sticky">
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {labelMonthHe(month)} · קבוע{" "}
            {formatIls(
              budget.fixed.basisForLeftover === "expected"
                ? budget.fixed.expectedTotal
                : budget.fixed.actualTotal,
            )}
            {budget.fixed.basisForLeftover === "expected" ? " (צפוי)" : ""} ·
            גמיש {formatIls(budget.flexible.actualTotal)}
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
          className={tab === "import" ? "active" : undefined}
          onClick={() => setTab("import")}
        >
          ייבוא
        </button>
      </div>

      {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
      {msg && <p className="badge good">{msg}</p>}

      {tab === "txs" && (
        <>
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
            <label className="tx-search">
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
                    router.replace(`/app/money?${params.toString()}`);
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
                  className="dir-chip"
                  onClick={cancelAddDraft}
                >
                  ביטול הוספה
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="dir-chip add-expense"
                    onClick={() => openAddDraft("expense")}
                  >
                    + הוצאה
                  </button>
                  <button
                    type="button"
                    className="dir-chip add-income"
                    onClick={() => openAddDraft("income")}
                  >
                    + הכנסה
                  </button>
                </>
              )}
            </div>
          </div>

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
            {addDraft?.mode === "expense" && (
              <div className="tx-draft-fixed">
                <div className="tx-draft-fixed-head">
                  <span className="muted">הוצאות קבועות</span>
                  <div className="tx-draft-fixed-actions">
                    {pendingCommitments.length > 1 && (
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => void recordAllPendingCommitments()}
                        title="יוצר תנועה לכל הוצאה קבועה שטרם שולמה החודש"
                      >
                        רשום את כל הפתוחות ({pendingCommitments.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className="linkish"
                      disabled={busy}
                      onClick={() => void saveDraftAsCommitment()}
                      title="שומר את שדות הטיוטה כהתחייבות חודשית (בלי תנועה)"
                    >
                      + שמור טיוטה כקבועה
                    </button>
                  </div>
                </div>
                {expenseCommitments.length === 0 ? (
                  <p className="muted tx-draft-fixed-empty">
                    אין עדיין. מלאו סכום + קטגוריה בטיוטה ולחצו «שמור טיוטה
                    כקבועה».
                  </p>
                ) : (
                  <div className="tx-draft-chips">
                    {expenseCommitments.map((item) => {
                      const open =
                        item.status === "pending" || item.status === "partial";
                      const fillAmt =
                        Math.max(0, item.expected - item.actual) ||
                        item.expected;
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
                                ? "מילוי הטיוטה"
                                : "שולם החודש — לחיצה ממלאת בכל זאת"
                            }
                          >
                            {item.titleHe} · {formatIls(fillAmt)}
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
                )}
                {pendingCommitments.length > 0 && (
                  <p className="muted tx-draft-fixed-hint">
                    אחת־אחת: לחצו צ׳יפ → שמירה → הצ׳יפ הבא. ביחד: «רשום את כל
                    הפתוחות».
                  </p>
                )}
              </div>
            )}
            {addDraft && (
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
                    className="linkish"
                    onClick={cancelAddDraft}
                  >
                    ביטול
                  </button>
                </div>
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
                {filtered.length >= 500 && (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    מוצגות עד 500 תנועות בחודש.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "import" && (
        <>
          <form className="card compact-form" onSubmit={onUpload}>
            <div className="grid grid-2">
              <label className="field">
                <span>קובץ (CSV / PDF / תמונה)</span>
                <input
                  name="file"
                  type="file"
                  accept=".csv,.pdf,image/png,image/jpeg,image/webp,image/gif,text/csv,application/pdf"
                  required
                />
              </label>
              <label
                className="field"
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: "0.6rem",
                  marginTop: "1.6rem",
                }}
              >
                <input
                  type="checkbox"
                  checked={keepFile}
                  onChange={(e) => setKeepFile(e.target.checked)}
                />
                <span>שמור קובץ מקור</span>
              </label>
            </div>
            <button className="btn" type="submit" disabled={busy}>
              העלאה וחילוץ
            </button>
          </form>

          {draft && (
            <section className="card">
              <h2 style={{ marginTop: 0 }}>
                טיוטה · {draft.originalName}
              </h2>
              {draft.quality && (
                <p className="muted" style={{ marginTop: 0 }}>
                  {draft.quality.income} הכנסות · {draft.quality.expense}{" "}
                  הוצאות
                  {draft.quality.transfer
                    ? ` · ${draft.quality.transfer} העברות`
                    : ""}
                  {draft.quality.needsReview
                    ? ` · ${draft.quality.needsReview} לתיקון`
                    : ""}
                  {draft.quality.duplicates
                    ? ` · ${draft.quality.duplicates} כפולות`
                    : ""}
                </p>
              )}
              <div style={{ overflowX: "auto" }}>
                <table className="tx-table">
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
                    {editable.map((row, i) => (
                      <tr
                        key={`${row.bookedAt}-${i}`}
                        className={
                          row.duplicate || (row.confidence ?? 1) < 0.45
                            ? "row-warn"
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
                          {new Date(row.bookedAt).toLocaleDateString("he-IL")}
                        </td>
                        <td>
                          <input
                            className="cell-input"
                            value={row.description}
                            onChange={(e) =>
                              patchRow(i, { description: e.target.value })
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
                              patchRow(i, { categoryKey: e.target.value })
                            }
                          >
                            {categoriesForDirection(row.direction, userCats).map(
                              (c) => (
                              <option key={c.key} value={c.key}>
                                {c.labelHe}
                              </option>
                            ),
                            )}
                          </select>
                        </td>
                        <td>{formatIls(row.amount)}</td>
                        <td className="muted" style={{ fontSize: "0.75rem" }}>
                          {row.duplicate
                            ? "כפול"
                            : row.confidence != null
                              ? `${Math.round(row.confidence * 100)}%`
                              : ""}
                        </td>
                        <td className="muted" style={{ fontSize: "0.72rem", maxWidth: "9rem" }}>
                          {(row.evidence || [])
                            .slice(0, 3)
                            .map(evidenceLabelHe)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                        if (
                          !window.confirm(
                            latestConfirmed
                              ? "לבטל את הייבוא האחרון ולהסיר את התנועות שלו?"
                              : "לבטל את הייבוא ולהסיר את התנועות שלו?",
                          )
                        ) {
                          return;
                        }
                        void undo(d.id);
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
    <Suspense fallback={<p className="muted">טוען…</p>}>
      <MoneyInner />
    </Suspense>
  );
}
