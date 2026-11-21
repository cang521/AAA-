package com.aistudio.aiphone;

import android.content.Intent;
import android.content.res.Configuration;
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
import com.aistudio.aiphone.plugins.LauncherAppearanceManager;
import com.aistudio.aiphone.plugins.NativeFileExportPlugin;
import com.aistudio.aiphone.plugins.ProactiveBackgroundPlugin;

public class MainActivity extends BridgeActivity {
    private int currentSystemBgColor = Color.parseColor("#FFFFFF");
    private boolean currentLightStatusBars = true;
    private boolean currentLightNavigationBars = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AndroidPermissionBridge.class);
        registerPlugin(ProactiveBackgroundPlugin.class);
        registerPlugin(NativeFileExportPlugin.class);
        super.onCreate(savedInstanceState);

        if (LauncherAppearanceManager.reconcileOnLaunch(this, getIntent())) {
            finish();
            return;
        }

        boolean isSystemNight =
            (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        currentSystemBgColor = Color.parseColor(isSystemNight ? "#090D12" : "#FFFFFF");
        currentLightStatusBars = !isSystemNight;
        currentLightNavigationBars = !isSystemNight;

        Window window = getWindow();

        // 1. Ensure modern edge-to-edge layout so WindowInsets are fully dispatched
        WindowCompat.setDecorFitsSystemWindows(window, false);

        // 2. Keep system bars transparent under edge-to-edge while matching window background to current theme
        window.setBackgroundDrawable(new ColorDrawable(currentSystemBgColor));
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);

        // 3. Android 10+ (API 29+) & Android 14/15 edge-to-edge:
        // Disable contrast enforcement to prevent the OS from injecting an artificial scrim or divider line
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // 4. Sync initial status & navigation bar icon styles
        applyInsetsIconStyles();

        // 5. Configure WebView background to match current theme/app bar color
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
        if (LauncherAppearanceManager.reconcileOnLaunch(this, intent)) {
            finish();
            return;
        }
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

    private void applyInsetsIconStyles() {
        Window window = getWindow();
        if (window == null) {
            return;
        }
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(window, window.getDecorView());
        if (insetsController != null) {
            insetsController.setAppearanceLightStatusBars(currentLightStatusBars);
            insetsController.setAppearanceLightNavigationBars(currentLightNavigationBars);
        }
    }

    public void applySystemBarAppearance(
        final String statusBarBgHex,
        final boolean lightStatusBars,
        final boolean lightNavigationBars
    ) {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed()) {
                return;
            }
            if (statusBarBgHex != null && !statusBarBgHex.trim().isEmpty()) {
                try {
                    currentSystemBgColor = Color.parseColor(statusBarBgHex.trim());
                } catch (IllegalArgumentException ignored) {
                    // Keep previous color on malformed hex
                }
            }
            currentLightStatusBars = lightStatusBars;
            currentLightNavigationBars = lightNavigationBars;

            Window window = getWindow();
            if (window != null) {
                window.setBackgroundDrawable(new ColorDrawable(currentSystemBgColor));
            }
            applyInsetsIconStyles();
            configureWebViewBackground();
        });
    }

    private void configureWebViewBackground() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView wv = getBridge().getWebView();
            wv.setBackgroundColor(currentSystemBgColor);
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        applyInsetsIconStyles();
        configureWebViewBackground();
    }
}

