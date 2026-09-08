# Layered Clarity → apps/web · Implementation Map (Phase 0 gate)

**תאריך:** 2026-09-09  
**סטטוס:** Audit הושלם · Phase 0 ליישום  
**מקור מוצר:** `apps/web`  
**מקור ויזואלי:** `Designs_Ideas/MoneTail/layered-clarity`  
**HLD:** `Designs_Ideas/MoneTail/HLD-layered-clarity-to-app.md`

---

## 1. Existing application shell

| Piece | Path | Behavior (preserve) |
|-------|------|---------------------|
| Root layout | `apps/web/app/layout.tsx` | `lang=he` `dir=rtl` · Heebo + Rubik · `globals.css` |
| App layout | `apps/web/app/app/layout.tsx` | Auth gate `/auth/me` · onboarding redirect · `.app-shell` · mobile menu state |
| Debts layout | `apps/web/app/app/debts/layout.tsx` | `.debts-area` wrapper only |
| Sidebar | `apps/web/components/AppSidebar.tsx` | Routes + `appHref(month)` · active · logout · `hideNav` |

Shell today: solid charcoal sidebar + light stone page. Flex `row-reverse`. Not glass/mood yet.

---

## 2. Sidebar / navigation

Routes (unchanged):

1. `/app` — תמונת מצב  
2. `/app/money` — תנועות  
3. `/app/reports` — מאזן  
4. `/app/debts` — אשראי והלוואות  
5. `/app/goals` — יעדים  

Brand today: `Money<span>Tail</span>` (also mobile topbar).  
Target Phase 0: ○ M Tail's lockup only (no app icon in chrome).

---

## 3. Page routes

`/`, `/login`, `/register`, `/app`, `/app/money`, `/app/reports`, `/app/goals`, `/app/onboarding`, `/app/debts`, `/app/debts/loans`, `/app/debts/loans/[id]`, `/app/debts/cards`, `/app/debts/cards/[id]`, redirects: `/app/documents` → money import, `/app/insights` → `/app`.

---

## 4. Reusable UI primitives

`AppSidebar`, `PageHeader`, `PeriodBar` (+ `useSelectedMonth`, `appHref`), `DebtsSubNav`, `ConfirmPanel`, `CategoryCombobox`, `Charts`, `DebtSplitMeter`, `LoanPaymentPanel`.

No React Clarity primitives yet — CSS `.clarity-*` only.

---

## 5. Existing `.clarity-*`

| Class | Used on |
|-------|---------|
| `.clarity-answer` (+ label/value) | home, reports, goals, debts |
| `.clarity-meaning` | home, reports, debts |
| `.clarity-actions` | home, reports |
| `.clarity-details` | home |

Phase 0: polish against new tokens only. Phase 1: formal primitives.

---

## 6. Global CSS / tokens

**File:** `apps/web/app/globals.css` (~3.5k lines) — single token + feature CSS.

**Current `:root`:** `--bg`, `--bg-elevated`, `--bg-soft`, `--bg-sidebar`, `--bg-sidebar-hover`, `--text`, `--text-on-dark`, `--muted`, `--accent`, `--accent-strong`, `--accent-2`, `--accent-warm`, `--accent-orange`, `--danger`, `--warn`, `--border`, `--shadow`, `--radius`, `--sidebar-width`, `--font`, `--font-display`.

**Demo source:** `--mt-*` in `Designs_Ideas/MoneTail/layered-clarity/css/system.css`.

**Phase 0 rule:** one authoritative system — introduce `--mt-*`, remap semantic `--*` to them so existing classes keep working.

---

## 7. API / data-fetching boundaries

`lib/api.ts` — pages fetch themselves. Layout only `/auth/me`.  
**Do not touch in Phase 0.**

---

## 8. Large pages (do not rewrite in Phase 0)

| ~Lines | File |
|-------:|------|
| 2557 | `money/page.tsx` |
| 1717 | `goals/page.tsx` |
| 857 | `debts/cards/[id]/page.tsx` |
| 815 | `app/page.tsx` |
| 717 | `debts/loans/page.tsx` |
| 648 | `reports/page.tsx` |

---

## 9. Responsive / RTL

- RTL on `<html>` once.  
- ≤860px: off-canvas sidebar + backdrop + `.mobile-topbar`.  
Preserve behavior; restyle only.

---

## 10. Auth / onboarding

Public: `/`, `/login`, `/register`.  
Gated: `/app/*`. Onboarding hides nav.  
**Phase 0:** do not redesign auth/onboarding pages (Phase 4).

---

## 11. Visual conflicts vs Layered Clarity

| Demo | App today | Phase 0 approach |
|------|-----------|------------------|
| Glass sidebar on mood scene | Solid `#1a2220` sidebar | Slate glass-tint sidebar; restrained main atmosphere (keep content readable) |
| ○ M Tail's lockup | `MoneyTail` text | Replace brand markup |
| Mint / amber | Forest green accents | Remap tokens to mint-deep / amber |
| Glass cards | Solid white `.card` | Keep elevated cards; glass tokens available for later |
| White active nav pill | Green tint + inset | Align active nav to demo pill |
| App icon in UI | N/A | Favicon only — not chrome |

---

## 12. Recommended Phase 0 change set

### Touch
1. `apps/web/app/globals.css` — tokens + shell/sidebar/brand-lockup + light clarity polish + soft shell bg  
2. `apps/web/components/BrandLockup.tsx` — new presentational lockup  
3. `apps/web/components/AppSidebar.tsx` — brand markup only  
4. `apps/web/app/app/layout.tsx` — mobile brand markup only (no auth logic)  
5. `apps/web/app/layout.tsx` — favicon metadata (app icon asset)  
6. `apps/web/public/app-icon.png` — copy from locked render  

### Do NOT touch
- Page bodies / feature CSS blocks  
- `lib/api.ts`, PeriodBar month logic  
- Nest / Prisma / DTOs  
- Auth/login/register/onboarding page redesign  
- Tailwind / new frameworks  
- Parallel routes or second design system  

### Exit criteria
- `/app` and `/app/money` load with real data  
- Nav routes + active + logout + onboarding `hideNav` unchanged  
- ○ M Tail's in sidebar + mobile topbar  
- No app icon in chrome  
- One token source (`--mt-*` + semantic aliases)  
- RTL + mobile drawer still work  

---

## 13. After Phase 0

Stop. Verify. Do not start Phase 1 (page schema primitives) until Phase 0 is accepted.

---

## 14. Phase 0 applied (2026-09-09)

| Change | Status |
|--------|--------|
| Token map `--mt-*` + semantic aliases in `globals.css` | Done |
| Soft shell atmosphere (radial, no mood image dependency) | Done |
| Sidebar glass-tint + white active pill | Done |
| ○ M Tail's via `BrandLockup` in sidebar + mobile topbar | Done |
| Favicon = `public/app-icon.png` (not in chrome) | Done |
| `.clarity-*` light token polish | Done |
| Page bodies / API / PeriodBar / auth flows | Untouched |
