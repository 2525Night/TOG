# Layered Clarity · Full-product redesign status

**עודכן:** 2026-09-09  
**מטרה:** MoneyTail כולו מעוצב בשפת Layered Clarity — לא רק Foundation.

## Definition of Done (מוצר)

העבודה נחשבת שלמה כשכל המסכים וה־UI המשותף מרגישים כמו **מוצר אחד מכוון**, לא «דשבורד חדש ליד מסכים ישנים».

## מה בוצע עד כה

### Foundation + shared language
- טוקני `--mt-*` + aliases ב־`globals.css`
- מעטפת / סיידבר / ○ M Tail's / favicon
- כפתורים, כרטיסים, טפסים, PeriodBar, badges, alerts, confirm, states
- `PageHeader` + kicker
- `Pulse` · `BrandLockup`
- DebtsSubNav בסגנון גלולות

### מסכים
| Area | Status |
|------|--------|
| Shell / nav / mobile | Done |
| `/` landing | Brand + atmosphere |
| `/login` `/register` | Brand + panels |
| `/app` | Header + Pulse + clarity surfaces |
| `/app/money` | Header + shared surfaces / tables CSS |
| `/app/reports` | Header + shared surfaces |
| `/app/debts*` | Kickers מבדילים הלוואות≠אשראי + list surfaces |
| `/app/goals` | Header + progress language |
| `/app/onboarding` | Shared panel / kicker tokens |

### שמור (לא נשבר)
- Routes · API · DTOs · PeriodBar `?month=` · auth gates · domain distinctions

## מעבר עקביות (להמשך אימות ויזואלי)

לבדוק ידנית בכל מסך:
1. הבנה תוך שניות
2. היררכיה
3. פעולות גלויות
4. מצבי loading/empty/error
5. מובייל + RTL
6. אין «איים» של עיצוב ישן

## קבצים מרכזיים
- `apps/web/app/globals.css`
- `apps/web/components/{BrandLockup,PageHeader,Pulse,AppSidebar}.tsx`
- מסכי `apps/web/app/**`
