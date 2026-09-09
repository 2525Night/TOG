import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MoneyTail Android (MTail3)
 *
 * By default the WebView loads the Next.js app on the host machine
 * (Android emulator → 10.0.2.2:3005).
 *
 * Physical device on same Wi‑Fi: set url to http://<PC-LAN-IP>:3005
 * Production: set url to your HTTPS web origin and cleartext: false.
 */
const config: CapacitorConfig = {
  appId: "com.mtails.moneytail",
  appName: "MoneyTail",
  webDir: "www",
  server: {
    url: "http://10.0.2.2:3005",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#15202b",
  },
};

export default config;
