# HLD · Layered Clarity → Android Phone Adaptation

**מוצר:** MoneyTail  
**תאריך:** 2026-09-09  
**סטטוס:** Design Idea (לא יישום מחייב)  
**קונספט מקור:** Layered Clarity (בהירות + רגש)  
**דמו:** `Designs_Ideas/MoneTail/android-phone/`

---

## 1. מטרה

להתאים את **אותו** שפת עיצוב (mood + glass + mint/sky/amber + RTL עברי) לתצוגה ולנגישות של טלפון אנדרואיד — בלי להמציא מערכת ויזואלית חדשה ובלי להפוך את האפליקציה ל-Material Design גנרי.

**מה נשמר**
- רקע mood כהה (`#15202b`) + פאנלי זכוכית
- טוקנים `--mt-*` (mint / sky / amber / ink)
- מבנה Clarity: תשובה אחת → משמעות → פעולות → פירוט
- תפריט צד RTL + PeriodBar חודשי
- מיתוג MoneyTail כגיבור כרום

**מה משתנה (אדפטציה בלבד)**
- צפיפות, מרווחים, יעדי מגע
- Safe areas (סטטוס־בר / gesture bar)
- התנהגות ניווט (Back, drawer, scroll)
- היררכיית מסך לרוחב ~360–412dp

---

## 2. עקרונות אדפטציה

| עיקרון | משמעות בטלפון |
|--------|----------------|
| One job per viewport | במסך הבית: תשובת Clarity אחת + CTA — לא דשבורד צפוף |
| Thumb zone | פעולות ראשוניות בטווח אגודל; תפריט ב־topbar |
| Glass stays glass | פאנלים נשארים שקופים; לא כרטיסי Material מלאים |
| Touch ≥ 44dp | כפתורים, chips, שורות תנועה |
| Scroll without jump | שינוי חודש/סינון לא מאפס גלילה |
| Back = hierarchy | סוגר overlay → היסטוריה → minimize |
| Density over decoration | פחות אורבים/אנימציה; יותר תוכן קריא |

---

## 3. Shell אנדרואיד

```
┌ status bar (dark, inset) ─────────────┐
│ Brand · תפריט                         │  ← mobile-topbar
│ [‹ חודש ›]  יתרה…                     │  ← PeriodBar sticky
│                                       │
│  content (glass stack, RTL)           │
│                                       │
└ safe-area bottom ─────────────────────┘
```

- **Drawer** מימין (RTL) עם backdrop — אותו sidebar, לא bottom-nav חדש.
- **אין** bottom tab bar בשלב הרעיון — שומרים על מודל הניווט הקיים.
- Status bar: רקע כהה תואם mood (`#15202b`).

---

## 4. מסכים (mock)

| מסך | קובץ | תפקיד |
|-----|------|--------|
| תמונת מצב | `img/home.png` | Clarity answer + pulse קצר |
| תנועות | `img/money.png` | chips + רשימה צפופה |
| Shell / תפריט | `img/shell.png` | drawer RTL + safe areas |

דמו חי: `android-phone/index.html`

---

## 5. נגישות טלפונית

- גופן שדות ≥ 16px (מניעת זום WebView)
- ניגודיות ink-on-glass נשמרת (`--mt-on-glass-text`)
- אזור לחיצה מינימלי 44×44
- `touch-action: manipulation` / ללא tap-highlight
- כיוון RTL מלא; אין שיקוף מאולץ של אייקונים מספריים
- טקסט עברי קצר בכותרות Clarity (שורה אחת + משפט תמיכה)

---

## 6. מה לא לעשות

- לא להחליף glass בכרטיסי elevation של Material 3
- לא להוסיף bottom navigation מקביל לסיידבר
- לא purple / glow / pills עגולים כברירת מחדל
- לא לשנות את סדר Clarity (answer → meaning → actions → details)
- לא “דשבורד סטטיסטיקות” ב-viewport הראשון

---

## 7. מיפוי ליישום (כשאושר)

| אזור | נתיב מוצר |
|------|-----------|
| Safe area / native class | `apps/web/app/globals.css` + `MobileNativeShell` |
| Topbar + drawer | `apps/web/app/app/layout.tsx`, `AppSidebar` |
| PeriodBar sticky | `PeriodBar` + CSS native |
| רשימות / chips | `money/page.tsx` |
| Capacitor chrome | `apps/mobile` status bar / back |

יישום רק אחרי אישור הרעיון — המסמך הזה הוא Design Idea בלבד.
