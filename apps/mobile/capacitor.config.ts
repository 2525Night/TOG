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
    // Remote HTTPS via Cloudflare tunnel (session). Replace with Vercel/Fly prod URLs when stable.
    url: "https://indexes-chocolate-generators-coupon.trycloudflare.com",
    cleartext: false,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: "#15202b",
  },
};

export default config;
