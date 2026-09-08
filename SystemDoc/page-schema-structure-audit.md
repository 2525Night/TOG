# ביקורת מבנה סכמת דפים (MMC) — MoneyTail

**תאריך:** 8 בספטמבר 2026  
**סביבה:** `apps/web` · localhost Web `:3005` · API `:3001`  
**שיטה:** קריאת JSX עליון (layouts + דפים) · אימות חי קצר (login → `/app`, `/app/money`)  
**היקף:** מבנה / סכמה בלבד — **ללא** רה־דיזיין

---

## 1. פסק דין

| מדד | ציון |
|-----|------|
| **שימור מבנה בין דפי האפליקציה** (`/app/*`) | **7.0 / 10** |
| Chrome משותף (Shell + PageHeader + PeriodBar) | **8.5 / 10** |
| סכמת אזורים (Answer → Meaning → Actions → Details) | **5.5 / 10** |
| Marketing / Auth מול App | **מכוון שונה** — לא נספר בשימור הפנימי |

**סיכום:** יש **MMC חלקי וחזק בכרום** — `app-shell` + `AppSidebar` + `PageHeader` + `PeriodBar` יוצרים תחושת «אותו מוצר» במעבר בין רוב המסכים.  
**שבירת הסכמה** מתחילה באזור התוכן: חוזה ה־`clarity-*` מתועד ב־CSS אך מיושם במלואו בעיקר ב־`/app`; שאר הדפים מפעילים **שלושה דפוסי גיבור מקבילים** (`clarity-answer`, `debts-totals`, `money-balance-hero` / `hub-tabs`).

---

## 2. סכמת דף מעשית ל־MoneyTail (הגדרת עבודה)

| # | אזור | תפקיד | מימוש נוכחי טיפוסי |
|---|------|--------|---------------------|
| 1 | **Shell** | ניווט גלובלי + מובייל | `app/app/layout.tsx` → `app-shell` / `AppSidebar` / `mobile-topbar` |
| 2 | **PageHeader** | כותרת, כותרת־משנה, פעולות / aside | `components/PageHeader.tsx` → `.app-page-header` |
| 3 | **Period** | הקשר חודש | `PeriodBar` (כמעט בכל דף חודשי) |
| 4 | **Answer / Hero** | תשובה מספרית אחת | `.clarity-answer` *או* `.debts-totals*` *או* aside ב־header |
| 5 | **Meaning** | מטריקות משנה / הקשר | `.clarity-meaning` (חלקי) |
| 6 | **Actions** | CTA ראשיים | `.clarity-actions` *או* `PageHeader.actions` *או* כפתורים בטופס |
| 7 | **Details** | רשימות / גרפים / טפסים | cards, lists, wizards |
| 8 | **Sub-nav** | ניווט מודול | `DebtsSubNav` (אשראי בלבד); `hub-tabs` (תנועות — דפוס אחר) |

חוזה CSS מפורש (שורות ~425–479 ב־`globals.css`):  
`.clarity-answer` → `.clarity-meaning` → `.clarity-actions` → `.clarity-details` — זהו **ה־MMC הרצוי לתוכן**, אך אינו חוזה אכיף בכל דף.

---

## 3. מטריצה: דף × אזורי סכמה

מקרא: **P** = Present · **~** = Partial · **—** = Absent · **≠** = תפקיד קיים בדפוס אחר

### 3.1 Marketing / Auth (סכמה נפרדת)

| דף | Shell אפליקציה | PageHeader | Period | Answer | Meaning | Actions | Details | Sub-nav |
|----|----------------|------------|--------|--------|---------|---------|---------|---------|
| `/` landing | — (`auth-shell`) | — | — | ≠ מותג + copy | ≠ aside רשימה | P CTAs | — | — |
| `/login` | — | — | — | ≠ brand plane | — | P טופס | טופס | — |
| `/register` | — | — | — | ≠ brand plane | — | P טופס | טופס | — |

**הערה:** `auth-brand-plane` עקבי בין שלושת המסכים — MMC משלו, לא של האפליקציה. זה **נכון מוצרית** לפרק התחברות; אין לצפות לשימור עם `/app`.

### 3.2 אפליקציה

| דף | Shell | PageHeader | Period | Answer | Meaning | Actions | Details | Sub-nav |
|----|-------|------------|--------|--------|---------|---------|---------|---------|
| `/app` תמונת מצב | P | P | P (אחרי header) | **P** clarity | **P** | **P** clarity-actions | P (+ disclosure) | — |
| `/app/money` | P | P (+ aside יתרה) | P | ≠ balance aside / flow strip | ~ flow strip | ≠ hub + כפתורי הוספה | P רשימות/טאבים | ≠ **hub-tabs** |
| `/app/reports` | P | P | P | **P** clarity (+ report-hero) | **P** (מקונן ב־answer) | ~ ייצוא ב־header | P גרפים/פירוט | — |
| `/app/debts` | P | P | P (**לפני** header) | **P** hybrid ב־debts-totals | **P** | ~ קישורים / empty CTA | P כרטיסי סיכום | **P** DebtsSubNav |
| `/app/debts/loans` | P | P | P (לפני header) | ≠ debts-totals-hero | ~ side metrics | P ב־header | P רשימה + טופס | **P** |
| `/app/debts/cards` | P | P | P (לפני header) | ≠ debts-totals--credit | ~ side metrics | P ב־header | P רשימה + טופס | **P** |
| `/app/goals` | P | P | P | **P** ב־goals-totals | ~ pie/meta | P ב־header + CTAs | P רשימת יעדים | — |
| `/app/onboarding` | ~ (shell, **hideNav**) | — | — | — | ~ צעד אחרון בלבד | P בטופס | P שלבים | — (step-pills) |

---

## 4. חוזקות MMC־יות

1. **Shell יציב** — כל `/app/*` עובר באותו `layout`: סיידבר, topbar מובייל, `container`. זה השכבה שמחזיקה זהות מוצר במעבר.
2. **PageHeader + PeriodBar** — כמעט כל מסך חודשי פותח באותו «כותרת + חודש». זה הלב של השימור.
3. **DebtsSubNav** — מודול אשראי שומר כרום פנימי עקבי (סקירה / הלוואות / כרטיסים) כולל שמירת `month` בקישורים.
4. **Clarity כחוזה מתועד** — קיים ב־CSS ובדף הבית של האפליקציה; `reports` ו־`debts` overview / `goals` מאמצים חלקים ממנו.
5. **Auth plane** — landing/login/register חולקים מבנה מותג אחיד (גם אם נפרד מהאפליקציה).

---

## 5. שבירות סכמה (מה שובר את תחושת ה־MMC)

### 5.1 סדר אזורים לא אחיד
- רוב הדפים: `PageHeader` → `PeriodBar`
- כל משפחת החובות: `PeriodBar` → `PageHeader` → `DebtsSubNav`  
  → במעבר מ־תנועות/יעדים ל־אשראי **הכותרת «קופצת»** ביחס לבורר החודש.

### 5.2 שלושה דפוסי Hero במקביל
| דפוס | איפה | תחושה |
|------|------|--------|
| `clarity-answer` | `/app`, `/app/reports`, חלקי debts/goals | «תשובה לפני פרטים» |
| `debts-totals` / `-hero` | loans/cards (+ detail) | דשבורד KPI מודולרי |
| `money-balance-hero` + `hub-tabs` | `/app/money` | כלי עבודה / hub |

המשתמש לומד דקדוק אחד ב־תמונת מצב, ואז נאלץ ללמוד דקדוק שני בתנועות ושלישי באשראי.

### 5.3 Clarity לא חוזה מוצר גלובלי
- מלא: `/app`
- חלקי: reports, debts overview, goals  
- כמעט נעדר כמבנה: money, loans/cards lists, onboarding  
→ הערות ב־CSS («Clarity page contract») מבטיחות יותר ממה שהקוד אוכף.

### 5.4 פעולות ראשיות — מיקום מתפזר
- Clarity zone (`/app`)
- Header actions (goals, debts lists, reports CSV)
- Inline / tabs (money)
- Form footers (onboarding, wizards)

### 5.5 Onboarding כחריג בתוך ה־shell
נשאר ב־`app-shell` אבל בלי סיידבר ניווט, בלי PageHeader/PeriodBar, עם `auth-panel` ו־step-pills — הכלאה בין auth ל־app.

### 5.6 Sub-nav vs hub-tabs
שני מנגנוני «ניווט משני» שונים ויזואלית ומבנית (`DebtsSubNav` קישורי route מול `hub-tabs` state מקומי) — לגיטימי פונקציונלית, אבל לא אותו slot בסכמה.

---

## 6. אימות חי (נקודתי)

- Login `test4@gmail.com` (סיסמה ריקה) → `/app?month=2026-09`: סיידבר + H1 «תמונת מצב» + PeriodBar + region «זמין בפועל» + clarity actions.
- `/app/money`: אותו shell + H1 «תנועות» + יתרה ב־aside + PeriodBar + `hub-tabs` (תנועות/קבועים/ייבוא) — **בלי** clarity-answer.
- Auth (`/login`, `/register`): `auth-brand-plane` עקבי; אין סיידבר.

---

## 7. חוות דעת מקצועית (Design Systems / Product)

MoneyTail כבר עבר מ־«אוסף מסכים» ל־**מערכת עם כרום משותף** — זה הישג אמיתי.  
הפער הוא לא בכרום אלא ב־**אי־פורמליזציה של אזורי התוכן**: יש חוזה clarity ב־CSS, אבל הדפים ממשיכים להמציא וריאנטים מקומיים במקום וריאציות של אותו slot.

ציון **7.0** משקף: מעבר בין דפים **מרגיש אותו מוצר** (סיידבר + כותרת + חודש), אבל **לא אותה דקדוק עמוד**. משתמש מתקדם ילמד; משתמש חדש ישלם מחיר קוגניטיבי בכל מודול.

**אין צורך ברה־דיזיין ויזואלי גדול.** צריך **ייצוב סכמה** — סדר slots, משפחת Answer אחת, והחרגות מתועדות (money כ־hub, onboarding כ־wizard).

---

## 8ב. תיקונים שבוצעו (8 בספט׳ 2026)

1. **סדר MMC באשראי** — בכל דפי `debts/**`: PageHeader → PeriodBar → DebtsSubNav.
2. **Hero מאוחד** — `debts-totals` / `goals-totals` / `money-balance-hero` מיושרים לסגנון `clarity-answer` (בלי כרטיס־גרדיאנט נפרד).
3. **Disclosure** — «פרטים נוספים» בתמונת מצב מציג/מסתיר ב־React (`showDetails &&`), לא רק CSS — לא נשאר ב־a11y tree.
4. **תמונה חלקית** — באנר `trust-partial` כשאין עו״ש / יתרה 0 עם שמור / חודש בלי הכנסות מול הוצאות.

## 8. המלצות (ממוקדות, בלי מימוש כאן)

1. **נעלו סדר MMC קנוני:** Shell → PageHeader → PeriodBar → (SubNav אופציונלי) → Answer → Meaning → Actions → Details. יישרו את debts ל־Header לפני PeriodBar (או העבירו SubNav ל־`debts/layout`).
2. **משפחת Answer אחת:** `clarity-answer` כ־API; `debts-totals` / יתרת money כ־*variants* של אותו slot — לא מערכות מקבילות.
3. **הכריזו על חריגים:** `/app/money` = «Tool Hub schema» (tabs + lists); onboarding = «Wizard schema». חריג מתועד עדיף על חריג סמוי.
4. **אכפו clarity בדפי «תשובה»:** reports / debts overview / goals כבר קרובים — השלימו Meaning + Actions slot במקום CTA רק ב־header.
5. **תעדו ב־SystemDoc סכמת דף** (8 האזורים למעלה) כ־definition of done לכל מסך חדש — לפני עיצוב פיקסלים.

---

## 9. קבצים מרכזיים שנבדקו

- `apps/web/app/app/layout.tsx`, `app/app/debts/layout.tsx`
- `apps/web/components/{AppSidebar,PageHeader,PeriodBar,DebtsSubNav}.tsx`
- דפים: `app/page.tsx`, `login`, `register`, `app/page`, `money`, `reports`, `debts` (+ loans/cards), `goals`, `onboarding`
- `apps/web/app/globals.css` — `.clarity-*`, `.auth-brand-plane`, `.debts-totals*`, `.goals-totals`, `.hub-tabs`
