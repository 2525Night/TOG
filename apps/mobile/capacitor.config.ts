import type { CapacitorConfig } from "@capacitor/cli";

/**
 * MoneyTail5 Android — MoneyTails5_V5.2
 *
 * Production WebView → https://moneytail-web.vercel.app
 * Local emulator: set url to http://10.0.2.2:3005 and cleartext: true, then sync.
 */
const config: CapacitorConfig = {
  appId: "com.mtails.moneytail",
  appName: "MoneyTail5",
  webDir: "www",
  server: {
    url: "https://moneytail-web.vercel.app",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#15202b",
  },
};

export default config;
