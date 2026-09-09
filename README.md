# MoneyTail

**גרסה: MTail3** (`v3.0.0` / תג `MTail3`)

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
apps/web      — אפליקציית משתמש (Next.js, פורט 3005)
apps/admin    — לוח מנהל (Next.js, פורט 3002)
apps/mobile   — מעטפת Android / Capacitor (MTail3)
services/api  — NestJS + Prisma + PostgreSQL/SQLite (פורט 3001)
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

## Android (MTail3)

מעטפת Capacitor ב־`apps/mobile`. פירוט מלא: [`apps/mobile/README.md`](apps/mobile/README.md)

```bash
npm install
npm run mobile:add    # פעם אחת — יוצר apps/mobile/android
npm run mobile:sync
npm run mobile:open   # Android Studio
# או אחרי התקנת JDK+SDK:
npm run mobile:apk
```

## מה כבר עובד (Phase 1)

- הרשמה / התחברות (JWT)
- חשבונות, תנועות, יעדים
- דשבורד: יתרה, תזרים, שלמות תמונה, ציון בריאות, סיכון משיכת יתר, המלצות
- אדמין: רשימת משתמשים
- ייבוא מסמכים עם כיוון לפי יתרה מצטברת
- מעטפת Android (Capacitor) — דורשת Android Studio לבניית APK

## מה עדיין לא

- Roey (צ׳אט)
- Open Banking (הפועלים / ONE ZERO) — דורש רישיון
- אחסון ענן ב־IL בייצור
- APK חתום לחנות / מצב offline מלא במובייל
- מודיעין שוק מתקדם

ייבוא מסמכים זמין תחת **תנועות → ייבוא**. כניסה ראשונית מחדש — בוטלה מהתור.