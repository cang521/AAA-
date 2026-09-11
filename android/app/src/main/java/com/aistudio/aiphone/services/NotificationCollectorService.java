package com.aistudio.aiphone.services;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

/**
 * NotificationCollectorService
 * Real Android NotificationListenerService implementation for AI Phone.
 * Enables the app to listen to system notification events when authorized.
 */
public class NotificationCollectorService extends NotificationListenerService {
    private static final String TAG = "NotificationCollector";
    private static boolean isServiceConnected = false;

    public static boolean isConnected() {
        return isServiceConnected;
    }

    @Override
    public void onListenerConnected() {
        super.onListenerConnected();
        isServiceConnected = true;
        Log.i(TAG, "NotificationCollectorService connected and listening");
    }

    @Override
    public void onListenerDisconnected() {
        super.onListenerDisconnected();
        isServiceConnected = false;
        Log.i(TAG, "NotificationCollectorService disconnected");
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        // Receives real notifications from host system
        String packageName = sbn.getPackageName();
        Log.d(TAG, "Notification posted from: " + packageName);
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        if (sbn == null) return;
        Log.d(TAG, "Notification removed: " + sbn.getPackageName());
    }
}
