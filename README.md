# MoneyTail

**MoneyTail** — מערכת בינה פיננסית אישית לישראל (עברית RTL, ש״ח).

העוזר האופציונלי: **Roey** (לא מסך הבית).

ריפו GitHub: [2525Night/TOG](https://github.com/2525Night/TOG)

## עקרונות MVP

- שימושי **בלי** חיבור בנק (אין רישיון Open Banking כרגע)
- מסך ראשי = **תמונת מצב**, לא צ׳אט
- אחסון ייצור מיועד ל־**IL**
- הזנה ידנית קודם; מסמכים וחיבורי בנק בהמשך

## מבנה

```
apps/web      — אפליקציית משתמש (Next.js, פורט 3000)
apps/admin    — לוח מנהל (Next.js, פורט 3002)
services/api  — NestJS + Prisma + PostgreSQL (פורט 3001)
packages/shared — טיפוסים וקטגוריות משותפים
```

## הרצה מקומית

### 1. תלויות

```bash
npm install
```

### 2. מסד נתונים (מקומי: SQLite)

```bash
cp .env.example .env
npm run db:push
```

בייצור: PostgreSQL באזור **IL** (ראה `docker-compose.yml` כאופציה כשפורטים פנויים).

### 3. שרתים

בשלושה טרמינלים:

```bash
npm run dev:api
npm run dev:web
npm run dev:admin
```

- משתמש: http://localhost:3005  
- אדמין: http://localhost:3002  
  - אימייל: `admin@moneytail.local` (שם תצוגה: **Admin**)  
  - סיסמה: `Pa$$word`  
- API health: http://localhost:3001/api/health  

## מה כבר עובד (Phase 1)

- הרשמה / התחברות (JWT)
- חשבונות, תנועות, יעדים
- דשבורד: יתרה, תזרים, שלמות תמונה, ציון בריאות, סיכון משיכת יתר, המלצות
- אדמין: רשימת משתמשים

## מה עדיין לא

- Roey (צ׳אט)
- Open Banking (הפועלים / ONE ZERO) — דורש רישיון
- אחסון ענן ב־IL בייצור
- אפליקציית Android
- מודיעין שוק מתקדם

ייבוא מסמכים זמין תחת **תנועות → ייבוא**. כניסה ראשונית מחדש — בוטלה מהתור.