import { useEffect, useState } from "react";

/**
 * Detects whether the current execution context is the native Android APK wrapper (WebView)
 * or an Android standalone app, distinguishing it from standard web browsers.
 */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // 1. Explicit Joker Android APK identifier set in JokerActivity.java
  if (ua.includes("JokerAndroidApp")) return true;

  // 2. Android WebView signatures (; wv or Android + Version/X.X Chrome)
  const isAndroid = /Android/i.test(ua);
  const isWebView =
    isAndroid &&
    (/; wv\b/.test(ua) || (/Version\/[0-9.]+/i.test(ua) && /Chrome\/[0-9.]+/i.test(ua)));
  if (isWebView) return true;

  // 3. Android Standalone PWA / TWA installed mode
  if (
    isAndroid &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      Boolean((navigator as unknown as { standalone?: boolean }).standalone))
  ) {
    return true;
  }

  return false;
}

/**
 * React hook that returns true when running inside the Android APK.
 * Also attaches the `.is-android-app` CSS class to <html> for styling overrides.
 */
export function useIsAndroidApp(): boolean {
  const [isApp, setIsApp] = useState(false);

  useEffect(() => {
    const app = isAndroidApp();
    setIsApp(app);
    if (app) {
      document.documentElement.classList.add("is-android-app");
    }
  }, []);

  return isApp;
}
