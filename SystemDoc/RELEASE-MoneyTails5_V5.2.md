# MoneyTails5_V5.2

**תאריך:** 10 בספטמבר 2026  
**גרסה:** `5.2.0` · תווית Git: `MoneyTails5_V5.2`  
**קומיט בסיס:** `8ecdd1c` (מוזג ל־`main` ב־PR #4 → `8360520`)

## מה נכלל

- יישור קו בין הסביבה המקומית ל־Vercel (web + API)
- שיפורי UX אחרי שאלון חיצוני באמולטור (בהירות תקציב, רמזי חובה/אופציונלי בהוספת הוצאה)
- עדכוני מוצר נלווים ב־web/API (הגדרות, איפוס סיסמה, שיתוף ביתי, bank-link stub, ועוד)
- **מעקב מזומן (יומן כיס):** דף `/app/cash`, ארנק `CASH`, משיכת כספומט מקושרת (עו״ש + כיס), שילוב בתמונת מצב ובתנועות

## פריסת פרודקשן

| שירות | URL | Deployment |
|--------|-----|------------|
| Web | https://moneytail-web.vercel.app | (מתעדכן בפריסת יומן כיס) |
| API | https://moneytail-api.vercel.app | (מתעדכן בפריסת יומן כיס) |

PR בסיס: https://github.com/2525Night/TOG/pull/4

## Android

ה־WebView בפרודקשן מצביע ל־`https://moneytail-web.vercel.app`.  
לבדיקות אמולטור מקומיות: לעבור זמנית ל־`http://10.0.2.2:3005` ואז `npm run mobile:sync`.

## הערת DB

נוספה מיגרציית Prisma `20260910120000_household_v52` לשיתוף ביתי. אם פיצ'ר השיתוף נכשל בפרודקשן — להריץ `prisma migrate deploy` מול Neon עם `DATABASE_URL` של Production.  
מעקב מזומן אינו דורש מיגרציה חדשה (משתמש ב־`AccountKind.CASH` הקיים).
