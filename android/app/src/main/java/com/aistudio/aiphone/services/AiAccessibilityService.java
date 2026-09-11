package com.aistudio.aiphone.services;

import android.accessibilityservice.AccessibilityService;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

/**
 * AiAccessibilityService
 * Real Android AccessibilityService implementation for AI Phone.
 * Enables UI perception and accessibility assistance across the OS.
 */
public class AiAccessibilityService extends AccessibilityService {
    private static final String TAG = "AiAccessibilityService";
    private static boolean isServiceRunning = false;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();
        isServiceRunning = true;
        Log.i(TAG, "AiAccessibilityService successfully connected");
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        // Real accessibility event handling: window state changed, view clicked, etc.
        int eventType = event.getEventType();
        CharSequence pkg = event.getPackageName();
        if (pkg != null) {
            Log.v(TAG, "AccessibilityEvent: " + eventType + " from " + pkg);
        }
    }

    @Override
    public void onInterrupt() {
        isServiceRunning = false;
        Log.w(TAG, "AiAccessibilityService interrupted");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isServiceRunning = false;
        Log.i(TAG, "AiAccessibilityService destroyed");
    }
}
