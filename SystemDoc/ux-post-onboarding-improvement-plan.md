# UX Improvement Plan — post onboarding → תמונת מצב (MoneyTail5)

**מקור:** בדיקת משתמש חדש באימולטור (`testC1@gmail.com`)  
**מטרה:** ציון 9+ באמון מספרים, בהירות ראשונה, והרגשת ליווי בלי לחץ מזויף

## בעיות שנמצאו

1. **כפל ספירה בנזילות** — Pulse מזהיר על ~₪−10,800 כי `projectLiquidity` מפחית קבועים פעמיים
2. **הוצאות ₪0 מול שמור ₪7,500** — PeriodBar מציג ledger בלבד בלי להסביר התחייבויות
3. **נתר חיובי + זמין שלילי + «הקלה»** — שלוש שפות מספר באותו viewport
4. **יעד 0% / חיץ חסר** — רזרבה נוצרת כ־GENERAL ולא EMERGENCY
5. **כרום מעצבים** — «Layered Clarity» בסיידבר
6. **בורר חודשים ארוך** — 12 עתיד מסיחים במסך בית

## תיקונים (גל 1)

| # | שינוי | קבצים |
|---|--------|--------|
| A | תיקון כפל ב־`projectLiquidity` (בסיס = checking, לא available−fixed שוב) | `project-liquidity.ts` |
| B | PeriodBar: כשאין הוצאות ledger אבל יש קבועים מתוכננים — הצג אותם עם תווית ברורה | `PeriodBar.tsx`, `page.tsx` |
| C | First-paint רזה: אחרי onboarding דליל — Pulse/Feel לפי זמין בפועל; הסתר FeelRow מלא; WinStrip בלי net מטעה | `page.tsx` |
| D | Onboarding goal `kind: EMERGENCY` | `auth.service.ts` |
| E | סיידבר: טקסט מוצרי במקום Layered Clarity | `AppSidebar.tsx` |
| F | חודשים: past 6 / future 2 במקום 12/12 | `PeriodBar.tsx` |

## קריטריוני 9+

- אמון: אין מספר שסותר מספר אחר באותו מסך בלי הסבר
- בהירות: תשובה ראשית אחת = זמין בפועל
- רגש: ליווי תואם את המספר הראשי
- כרום: בלי שפת עיצוב פנימית
