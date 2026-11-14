package app.joker.alpha;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

/**
 * Alpha comparison shell. Both variants run the SAME online TanStack Start page.
 * The local flavor intercepts selected same-origin STATIC resources from packaged
 * Android assets; it does NOT yet contain an offline/frontend TanStack build.
 */
public final class JokerActivity extends Activity {
    private static final String HOST = "joker-card-room.lovable.app";
    private static final String URL = "https://" + HOST + "/";
    private WebView webView;

    private void immersive() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        );
    }

    private void configureDisplayCutoutAndRefreshRate() {
        // Point A: Full landscape edge-to-edge ignoring camera cutout/notch
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }

        // Point B: Unlock 90Hz / 120Hz high refresh rate if supported by display
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Display display = getDisplay();
            if (display != null) {
                Display.Mode[] modes = display.getSupportedModes();
                Display.Mode bestMode = null;
                float maxRate = 60.0f;
                for (Display.Mode mode : modes) {
                    if (mode.getRefreshRate() > maxRate) {
                        maxRate = mode.getRefreshRate();
                        bestMode = mode;
                    }
                }
                if (bestMode != null) {
                    WindowManager.LayoutParams params = getWindow().getAttributes();
                    params.preferredDisplayModeId = bestMode.getModeId();
                    getWindow().setAttributes(params);
                }
            }
        }
    }

    @SuppressWarnings("deprecation")
    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
        configureDisplayCutoutAndRefreshRate();
        immersive();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(29, 25, 22));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        // Point C: Hardware Acceleration & GPU Layer
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " JokerAndroidApp/1.0");
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        try {
            settings.setRenderPriority(WebSettings.RenderPriority.HIGH);
        } catch (Exception ignored) {}
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri target = request.getUrl();
                if ("https".equalsIgnoreCase(target.getScheme()) && HOST.equalsIgnoreCase(target.getHost())) {
                    return false;
                }
                if ("http".equalsIgnoreCase(target.getScheme()) || "https".equalsIgnoreCase(target.getScheme())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, target));
                    return true;
                }
                return true;
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!BuildConfig.USE_LOCAL_ASSETS) return null;
                Uri uri = request.getUrl();
                if (!"https".equalsIgnoreCase(uri.getScheme()) || !HOST.equalsIgnoreCase(uri.getHost())) return null;
                String path = uri.getPath();
                if (path == null || path.contains("..") || path.contains("\\")) return null;
                if (!(path.startsWith("/cards/") || path.startsWith("/avatars/") || path.startsWith("/table/")
                      || path.startsWith("/emojis/") || path.startsWith("/audio/") || path.startsWith("/sounds/")
                      || path.startsWith("/covers/") || path.startsWith("/home/"))) return null;
                try {
                    InputStream stream = getAssets().open("public" + path);
                    String ext = MimeTypeMap.getFileExtensionFromUrl(path).toLowerCase(Locale.ROOT);
                    String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
                    if (mime == null) {
                        if ("webp".equals(ext)) mime = "image/webp";
                        else if ("svg".equals(ext)) mime = "image/svg+xml";
                        else if ("mp3".equals(ext)) mime = "audio/mpeg";
                        else if ("ogg".equals(ext)) mime = "audio/ogg";
                        else if ("png".equals(ext)) mime = "image/png";
                        else if ("jpg".equals(ext) || "jpeg".equals(ext)) mime = "image/jpeg";
                        else mime = "application/octet-stream";
                    }
                    return new WebResourceResponse(mime, null, stream);
                } catch (IOException missingAsset) {
                    return null; // Keep online fallback for any resource not packaged.
                }
            }
        });
        setContentView(webView);
        webView.loadUrl(URL);
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override protected void onResume() {
        super.onResume();
        immersive();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
