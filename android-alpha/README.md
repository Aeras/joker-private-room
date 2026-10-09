# JOKER Android Alpha — two comparable APKs

**Experimental testing builds — not a native production release.**

* **Joker Web Alpha** (`app.joker.alpha.web`): Android WebView loads the published TanStack Start site at `https://joker-card-room.lovable.app/`.
* **Joker Local Alpha** (`app.joker.alpha.local`): the **same online HTML/JavaScript and backend**, but Android WebView intercepts selected same-origin static files (`cards/`, `avatars/`, `table/`, `emojis/`, `audio/`) and serves bundled assets from the APK. Missing files fall back to the web server.

These are intentionally separate installable apps. **The Local flavor is a local-assets experiment, NOT a fully local TanStack frontend.** Moving the frontend fully into the APK requires a reviewed remote-server-function/authentication transport, because current `createServerFn` and secure `__Host-joker_session` cookies depend on the hosted origin. Do not bundle server code, secret keys or privileged Supabase credentials.

## Build

From the GitHub repository, open **Actions → Android Alpha APK → Run workflow**. After a successful run, download the two artifact ZIPs and extract their `.apk` files. Both APKs can be installed side-by-side. The workflow builds **debug-signed, private test APKs** with Android SDK / Gradle on the GitHub runner; no local Android Studio is required.

Build locally with JDK 17, Android SDK 35 and Gradle 8.10.2:

```sh
cd android-alpha
gradle :app:assembleWebDebug :app:assembleLocalDebug
```

For local builds, copy the desired static resource folders from repository `public/` to `android-alpha/app/src/local/assets/public/` (same paths). The CI workflow does this automatically. Never commit these generated copies.

## Testing guidance

Use the same mobile handset/network and game release for browser/PWA/Web/Local comparisons. WebView and Chrome share technology but not necessarily cache/lifecycle or performance. Expect persistent online connection for both APKs. Android WebView cookies are separate from Chrome; log in separately and respect the game's one-active-session restriction. Test each environment in separate games or after clean logout to avoid session takeover.

The two APKs do not independently solve the server-side bot-turn delays. Do not infer proof of frame-rate improvements from bundled assets alone. Log package variant, commit, OS/WebView version, and observed issue.

## Security / limitations

* Only `https://joker-card-room.lovable.app` is loaded inside WebView. Other HTTP(S) destinations are opened outside the app.
* JavaScript is required for the game; file/content access and mixed content are disabled.
* Android debug signing is for private Alpha installation only.
* No Google Play publication, background push service, or offline multiplayer.
* No server/database, game engine, PWA, or Lovable code changes.
