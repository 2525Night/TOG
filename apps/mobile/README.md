# MoneyTail Android · MTail3

מעטפת **Capacitor** סביב אפליקציית ה־web הקיימת (`apps/web`).  
אין צורך לשכתב את המוצר — ה־APK מציג את אותו UI ומדבר עם אותו API.

## דרישות במחשב

1. **JDK 17+**
2. **Android Studio** (עם Android SDK + Platform Tools)
3. משתני סביבה: `ANDROID_HOME` / `ANDROID_SDK_ROOT`
4. בפרויקט הראשי: API + Web רצים (`3001` / `3005`)

## התקנה חד־פעמית

משורש הריפו:

```bash
npm install
npm run mobile:add
npm run mobile:sync
npm run mobile:open
```

`mobile:open` פותח את הפרויקט ב־Android Studio.

## כתובת השרת (חשוב)

בקובץ `capacitor.config.ts`:

| סביבה | `server.url` |
|--------|----------------|
| אמולטור Android | `http://10.0.2.2:3005` (ברירת מחדל) |
| מכשיר פיזי (אותה רשת) | `http://<IP-של-המחשב>:3005` |
| פרודקשן | `https://your-domain` + `cleartext: false` |

אחרי שינוי כתובת:

```bash
npm run mobile:sync
```

וודאו ש־API זמין מהמכשיר (`NEXT_PUBLIC_API_URL` ב־web מצביע לכתובת נגישה — באמולטור לרוב `http://10.0.2.2:3001`).

## בניית APK להתקנה

### מ־Android Studio
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. הקובץ יופיע תחת `apps/mobile/android/app/build/outputs/apk/`

### מטרמינל (אחרי ש־SDK מותקן)

```bash
npm run mobile:sync
npm run mobile:apk
```

APK דיבוג:  
`apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`

להתקנה על מכשיר מחובר:

```bash
adb install -r apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

## הערות

- האפליקציה דורשת רשת לשרת (web + API) — זה לא מצב offline מלא.
- חתימת release לחנות Google Play דורשת keystore נפרד (לא נכלל בריפו).
- מזהה חבילה: `com.mtails.moneytail`
