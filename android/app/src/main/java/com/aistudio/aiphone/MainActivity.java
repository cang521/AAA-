package com.aistudio.aiphone;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.aistudio.aiphone.plugins.AndroidPermissionBridge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidPermissionBridge.class);
        super.onCreate(savedInstanceState);

        Window window = getWindow();

        // 1. Ensure modern edge-to-edge layout so WindowInsets are fully dispatched
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // 2. Set window background & system bar colors to dark/transparent to eliminate any white seams
        window.setBackgroundDrawable(new ColorDrawable(Color.parseColor("#09090b")));
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // 3. Android 10+ (API 29+) & Android 14/15 edge-to-edge:
        // Disable contrast enforcement to prevent the OS from injecting an artificial white/light scrim or divider line under the status bar
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // 4. Force status bar icons to light (white) for our dark top bar
        WindowInsetsControllerCompat insetsController = WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(false);
            insetsController.setAppearanceLightNavigationBars(false);
        }

        // 5. Configure WebView background to dark to prevent white flash or subpixel white lines
        configureWebViewBackground();

        // 6. Listen for system Window Insets (status bar, display cutout, navigation bar)
        ViewCompat.setOnApplyWindowInsetsListener(getWindow().getDecorView(), (v, windowInsets) -> {
            Insets insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );

            float density = getResources().getDisplayMetrics().density;
            if (density <= 0) density = 1.0f;
            float topDp = insets.top / density;
            float bottomDp = insets.bottom / density;
            float leftDp = insets.left / density;
            float rightDp = insets.right / density;

            configureWebViewBackground();

            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                final String js = String.format(
                    "document.documentElement.style.setProperty('--android-safe-area-inset-top', '%.2fpx');" +
                    "document.documentElement.style.setProperty('--android-safe-area-inset-bottom', '%.2fpx');" +
                    "document.documentElement.style.setProperty('--android-safe-area-inset-left', '%.2fpx');" +
                    "document.documentElement.style.setProperty('--android-safe-area-inset-right', '%.2fpx');",
                    topDp, bottomDp, leftDp, rightDp
                );
                webView.post(() -> webView.evaluateJavascript(js, null));
            }

            return windowInsets;
        });

        handleNotificationIntent(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent, true);
    }

    private void handleNotificationIntent(Intent intent, boolean dispatchToWebView) {
        if (intent == null) {
            return;
        }
        String action = intent.getAction();
        String extraAction = intent.getStringExtra("action");
        if (!AndroidPermissionBridge.ACTION_OPEN_AI_CHAT.equals(action)
            && !AndroidPermissionBridge.ACTION_OPEN_AI_CHAT.equals(extraAction)) {
            return;
        }

        String aiId = intent.getStringExtra("aiId");
        if (aiId == null || aiId.trim().isEmpty()) {
            return;
        }

        AndroidPermissionBridge.savePendingNotificationAiId(this, aiId.trim());
        intent.removeExtra("action");
        intent.removeExtra("aiId");

        if (dispatchToWebView && getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('android_notification_tapped'));",
                null
            ));
        }
    }

    private void configureWebViewBackground() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView wv = getBridge().getWebView();
            wv.setBackgroundColor(Color.parseColor("#09090b"));
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        configureWebViewBackground();
    }
}

