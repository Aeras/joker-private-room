# Android Alpha build status

* The two flavors are independent debug APK applications.
* GitHub workflow must successfully finish before distribution or merging.
* Local flavor bundles static assets only; the full TanStack Start frontend remains hosted.
* If SDK setup fails because the legacy Android `tools` package is retired, use `android-actions/setup-android@v4`, not v3.
