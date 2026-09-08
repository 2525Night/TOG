# ביקורת ידידותיות משתמש ונגישות — MoneyTail

**תאריך:** 8 בספטמבר 2026  
**סביבה:** localhost Web `:3005` · API `:3001` · חשבון `test4@gmail.com`  
**היקף:** כל מסכי הסיידבר + auth + תהליכי הוספה / עריכה / מחיקה בכל דף  
**שיטה:** בדיקה חיה (דפדפן) + סריקת קוד (`apps/web`) · בלי שינוי לוגיקה פיננסית

---

## 1. פסק דין

### מצב נוכחי (אחרי שלבי ידידותיות 1+2 · 8 בספט׳ 2026)

| מדד | לפני תיקון | אחרי ליבה | **עכשיו (שלבים 1+2)** |
|-----|------------|-----------|------------------------|
| **ידידותיות כוללת** | 6.8 / 10 | 7.6 / 10 | **8.0 / 10** |
| **נגישות (a11y) כוללת** | 5.9 / 10 | 7.1 / 10 | **7.6 / 10** |
| **ממוצע משולב** | 6.4 / 10 | 7.4 / 10 | **7.8 / 10** |

המערכת חזקה ב־**RTL / עברית / תוויות שדות**, זרימות הוספה מובנות, **שגיאות חיות (`role="alert"`)**, **`ConfirmPanel` למחיקות הרסניות**, **פעולות תנועה לחיצות תמיד**, ועתה גם ב־**skip-link**, **H1 יחיד ב־auth**, **`prefers-reduced-motion`**, **אונבורדינג רגוע** (כרית אופציונלית), ו־**תנועות עם סריקה נקייה** (סיכום חודש מאחורי toggle).  
פערים שנותרו: ניגודיות muted/סיידבר עדיין לשיפור עדין, ו־disclosure לא תמיד עקבי בתמונת מצב.

---

## 2. קריטריונים

### ידידותיות
1. תשובה כלכלית ברורה תוך שניות  
2. פעולה ראשית גלויה  
3. שפה פשוטה (שפת מוצר)  
4. עומס קוגניטיבי / progressive disclosure  
5. משוב (טעינה, הצלחה, שגיאה)  
6. גילוי תהליכי CRUD בלי הדרכה  

### נגישות
1. מבנה סמנטי + שמות נגישים  
2. מקלדת / focus  
3. ניגודיות  
4. טפסים (label, required, disabled)  
5. הודעות שגיאה / סטטוס חיות  
6. RTL + מובייל / מגע  

**PASS** = זרימה ברורה + נגישה סביר  
**PARTIAL** = עובדת אבל עם פער ידידותיות או a11y  
**FAIL** = חסום, מטעה, או בלתי נגיש משמעותית  

---

## 3. ציונים לפי דף

| דף | ידידותיות | נגישות | הערה קצרה |
|----|-----------|--------|-----------|
| `/` נחיתה | 8.5 | 8.0 | מותג כ־brand-mark; H1 יחיד ב־hero |
| `/login` | 8.5 | 8.5 | H1 יחיד על טופס; brand-mark; alert |
| `/register` | 8.5 | 8.5 | כמו login |
| `/app/onboarding` | 8.5 | 7.5 | `.onboard-*`; כרית אופציונלית + דילוג |
| `/app` תמונת מצב | 7.8 | 6.5 | כותרת רגועה; פרטים/disclosure לשיפור |
| `/app/money` | 8.2 | 7.2 | כותרת רכה; סיכום חודש מאחורי toggle (ברירת מחדל סגור) |
| `/app/reports` | 7.5 | 7.0 | נרטיב+CSV; קריאה בעיקר |
| `/app/debts` | 8.0 | 7.5 | ניווט ברור לסקירה/הלוואות/כרטיסים |
| `/app/debts/loans` | 8.0 | 7.5 | אשף + disabled כשסגור |
| `/app/debts/loans/[id]` | 7.5 | 7.5 | תשלום/עריכה ב־disclosure; ConfirmPanel להסרה |
| `/app/debts/cards` | 8.0 | 7.5 | אשף + «הוסף חיוב» |
| `/app/debts/cards/[id]` | 8.0 | 8.0 | טופס תנועה + ConfirmPanel למחיקות |
| `/app/goals` | 8.0 | 7.5 | יצירה+הקצאה גלויים; מחיקה ב־ConfirmPanel |
| מעטפת Sidebar | 7.5 | 6.5 | ניווט ברור; יציאה quiet; ניגודיות inactive בינונית |

---

## 4. תהליכי הוספה / עריכה / מחיקה (חובה)

נבדק בחי + מול קוד. מחיקות הרסניות **לא בוצעו** על נתוני demo — נבדקו גילוי, תוויות, ואישור.

| # | דף | תהליך | סטטוס | ממצא |
|---|-----|--------|--------|------|
| 1 | `/` | CTA התחילו / התחברות | **PASS** | קישורים ברורים, RTL תקין |
| 2a | `/login` | שליחה + loading | **PASS** | כפתור disabled + «מתחבר…» |
| 2b | `/login` | ולידציה / שגיאה | **PASS** | `required` בדפדפן; שגיאת API ב־`form-error` + `role="alert"` |
| 2c | `/register` | שליחה + שדות | **PASS** | labels + minLength לסיסמה + alert לשגיאה |
| 3 | `/app/onboarding` | שלבים + סיום | **PASS** | שלב=שאלה; סיכום בשלב אחרון; כפתור סיום |
| 4a | `/app` | פעולה ראשית / תשומת לב | **PASS** | CTA + «לא עכשיו» |
| 4b | `/app` | פרטים נוספים | **PARTIAL** | כפתור disclosure קיים; תוכן פרטים נשאר לעיתים גלוי/ב־a11y tree |
| 5a | `/app/money` | הוספת הוצאה/הכנסה → שמירה | **PASS** | `+ הוצאה` פותח טיוטה עם aria-label לתאריך/תיאור/סכום; אופן תשלום; ביטול |
| 5b | `/app/money` | עריכת שורה | **PASS** | «עריכה» תמיד לחיצה (`pointer-events: auto`); ב־hover עדין opacity בלבד |
| 5c | `/app/money` | מחיקת תנועה | **PASS** | «מחיקה» → `ConfirmPanel` (Escape, עברית, focus לביטול) |
| 5d | `/app/money` | טאב קבועים | **PASS** | טאב «קבועים» / הרחבת צ׳יפים; הסרת commitment עם ConfirmPanel |
| 5e | `/app/money` | טאב ייבוא | **PASS** | העלאה + טבלת draft; מחיקות ב־ConfirmPanel |
| 6a | `/app/reports` | ניווט חודש | **PASS** | PeriodBar |
| 6b | `/app/reports` | ייצוא CSV | **PASS** | כפתור secondary |
| 6c | `/app/reports` | קישורים לפירוט | **PASS** | קישורים לקטגוריות/תנועות |
| 7 | `/app/debts` | מעבר להלוואות/כרטיסים | **PASS** | SubNav + כפתורי כניסה |
| 8a | `/app/debts/loans` | אשף הוספת הלוואה | **PASS** | שדות עם שם; «המשך» disabled עד שם |
| 8b | `/app/debts/loans` | תשלום / עוד | **PARTIAL** | הלוואה סגורה → כפתור disabled ברור; «עוד» מסתיר פעולות |
| 9a | `/app/debts/loans/[id]` | תשלום | **PASS** | `LoanPaymentPanel` עם הסבר + שמירה (כשפעיל) |
| 9b | `/app/debts/loans/[id]` | עריכה / הסרה | **PASS** | disclosure + ConfirmPanel להסרת הלוואה |
| 10 | `/app/debts/cards` | אשף הוספת כרטיס | **PASS** | שם/4 ספרות/חברה; המשך disabled |
| 11a | `/app/debts/cards/[id]` | הוספת תנועה | **PASS** | `+ תנועה בכרטיס` — תאריך/תיאור/סכום + חד־פעמי/תשלומים |
| 11b | `/app/debts/cards/[id]` | עריכת כרטיס / מחיקת תנועות | **PASS** | עריכה ב־disclosure; מחיקות ב־ConfirmPanel |
| 12a | `/app/goals` | יצירת יעד | **PASS** | «יעד חדש» → טופס עם labels + שמירה |
| 12b | `/app/goals` | הקצאה | **PASS** | «הקצה לרזרבה/מהפנוי» → צ׳יפים + סכום + הקצה |
| 12c | `/app/goals` | עוד / standing / מחיקה | **PASS** | «עוד» לפרטים; מחיקת יעד ב־ConfirmPanel |

**סיכום CRUD:** כל הדפים העיקריים נבדקו לזרימות create/edit/delete או מקבילותיהן. אין דף ליבה בלי כיסוי תהליך.

---

## 5. ממצאים חוצי־מערכת (חומרה) — מצב נוכחי

### תוקן (ליבה + שלבים 1+2)
1. ~~עריכה/מחיקה בתנועות מוסתרות ל־hover~~ → `.tx-dense-actions` עם `pointer-events: auto`; opacity עדין בלבד ב־fine pointer.  
2. ~~אין `role="alert"` לשגיאות~~ → דפוס `form-error` + `role="alert"` במסכי auth וליבה.  
3. ~~`window.confirm` הרסני~~ → `ConfirmPanel` (alertdialog, Escape, עברית) למחיקות תנועה/קבועים/ייבוא/יעד/כרטיס/הלוואה.  
4. ~~אין skip link~~ → skip-link + `#main-content` במעטפת האפליקציה.  
5. ~~אין `prefers-reduced-motion`~~ → מופחת ב־`globals.css` (כולל skeleton).  
6. ~~שני H1 ב־auth~~ → מותג כ־`brand-mark`; H1 יחיד על פאנל הטופס.  
7. ~~אונבורדינג/תנועות מאיימים~~ → עותק רגוע; כרית אופציונלית ב־API; סיכום חודש בתנועות מאחורי toggle.

### בינוני (נותר)
8. **ניגודיות muted / קישורי סיידבר inactive** — שופרו חלקית (`--muted`); עדיין לניטור WCAG AA בטקסט קטן.  
9. **Disclosure בתמונת מצב** — לא תמיד מסתיר מ־a11y tree.  
10. **`window.confirm` ל«החל על דומים»** — נשאר במכוון (לא הרסני).

### חיובי
10. `lang="he" dir="rtl"` ברמת המסמך.  
11. Labels / `aria-label` חזקים בטפסי תנועות, כרטיס, אשפים.  
12. תרשימים עם `role="img"` + `aria-label` בעברית.  
13. מצבי disabled מובנים (המשך אשף, הלוואה סגורה, מתחבר…).  
14. `.sr-only` קיים לחיפוש/הערות.  
15. `ConfirmPanel` + שגיאות חיות — אימות בקוד אחרי התיקון.

---

## 6. המלצות עדיפות שנותרו (ללא הרחבת מוצר)

1. ~~פעולות שורת תנועה~~ · ~~`role="alert"`~~ · ~~ConfirmPanel למחיקות~~ — **בוצע**.  
2. ~~Skip link + `prefers-reduced-motion`~~ · ~~H1 יחיד ל־auth~~ — **בוצע (שלבים 1+2)**.  
3. לוודא ש־`.clarity-details.is-collapsed` באמת מסתיר מ־a11y (`hidden` / `inert`).  
4. (אופציונלי) focus trap מלא ב־`ConfirmPanel`; החלפת confirm של «החל על דומים».  
5. (אופציונלי) המשך ריכוך שפה במסכי פרט כרטיס/הלוואה.

---

## 7. אימות סביבה

| בדיקה | תוצאה |
|--------|--------|
| API health | הופעל מחדש בזמן הביקורת → תקין |
| Web `:3005` | 200 |
| Login demo | הצליח |
| Snapshot מספרים (לא יעד הביקורת) | לא שונו כחלק מהביקורת |

---

## 8. נספח — מיפוי קבצים רלוונטיים

- [apps/web/app/globals.css](../apps/web/app/globals.css) — `.tx-dense-actions`, טוקנים, focus  
- [apps/web/app/app/money/page.tsx](../apps/web/app/app/money/page.tsx) — CRUD תנועות  
- [apps/web/app/app/goals/page.tsx](../apps/web/app/app/goals/page.tsx) — יצירה/הקצאה/מחיקה  
- [apps/web/app/app/debts/loans/page.tsx](../apps/web/app/app/debts/loans/page.tsx) · [cards/page.tsx](../apps/web/app/app/debts/cards/page.tsx) — אשפים  
- [apps/web/app/app/debts/cards/[id]/page.tsx](../apps/web/app/app/debts/cards/[id]/page.tsx) — תנועה בכרטיס  
- [apps/web/components/LoanPaymentPanel.tsx](../apps/web/components/LoanPaymentPanel.tsx) — תשלום הלוואה  

---

---

## תיקונים שבוצעו (8 בספטמבר 2026)

תיקון ליבה ל־3 פערים חמורים/בינוניים מהביקורת (בלי שינוי MonthFacts / לוגיקה כלכלית) — **אומת בקוד**:

1. **עריכה/מחיקה בתנועות** — `.tx-dense-actions` עם `opacity: 1; pointer-events: auto`; ב־fine pointer רק הורדת opacity ל־0.72 עד hover/focus (לא חוסם לחיצה).
2. **שגיאות חיות** — `className="form-error"` + `role="alert"` ב־login/register/onboarding/money/goals/debts/dashboard/reports וכו'.
3. **`window.confirm` הרסני** — `ConfirmPanel` (`role="alertdialog"`, Escape, עברית) במחיקות תנועה/קבועים/ייבוא, יעד, כרטיס/פריסה/תנועה, הלוואה. נשארו `confirm` רק ל«החל על דומים».

**ציוני פסק הדין למעלה עודכנו** לשקף את המצב אחרי התיקונים (לא ביקורת חיה מלאה מחדש).

### שלבים 1+2 — ידידותיות + a11y בסיסי (אותו יום)

- Skip-link + `#main-content`, ניגודיות `--muted`, `prefers-reduced-motion`, brand-mark / H1 יחיד ב־auth.
- אונבורדינג רגוע (`.onboard-*`); יעד/כרית אופציונליים ב־`CompleteOnboardingDto`.
- תנועות: כותרת רכה; `month-flow-strip` מאחורי toggle שקט (ברירת מחדל סגור).
- ריכוך כותרות משנה ב־dashboard / debts / goals.

*אבחון מקורי + רענון סטטוס אחרי תיקוני ליבה ושלבים 1+2 — לא רידיזיין.*
