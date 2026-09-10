import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MoneyTail5 Android
 *
 * By default the WebView loads the Next.js app on the host machine
 * (Android emulator → 10.0.2.2:3005).
 *
 * Physical device on same Wi‑Fi: set url to http://<PC-LAN-IP>:3005
 * Production: set url to your HTTPS web origin and cleartext: false.
 */
const config: CapacitorConfig = {
  appId: "com.mtails.moneytail",
  appName: "MoneyTail5",
  webDir: "www",
  server: {
    // Production domain (SSO-free). Rebuild after main→prod deploy is READY.
    url: "https://moneytail-web.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#15202b",
  },
};

export default config;
