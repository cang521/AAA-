package com.aistudio.aiphone.plugins;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.AppOpsManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.view.accessibility.AccessibilityManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;
import android.content.pm.ApplicationInfo;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;

import com.aistudio.aiphone.MainActivity;
import com.aistudio.aiphone.R;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "AndroidPermissionBridge",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        ),
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        ),
        @Permission(
            alias = "geolocation",
            strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }
        ),
        @Permission(
            alias = "notification",
            strings = { "android.permission.POST_NOTIFICATIONS" }
        )
    }
)
public class AndroidPermissionBridge extends Plugin {
    private static final String TAG = "AndroidPermissionBridge";
    private static final String NOTIF_TAG = "AiMessageNotification";
    private static final String LAUNCHER_TAG = "LauncherAppearance";
    public static final String CHANNEL_ID = "ai_messages_v1";
    public static final String CHANNEL_NAME = "AI消息提醒";
    public static final String CHANNEL_DESCRIPTION = "显示AI角色的新消息和主动关怀";
    public static final String PREFS_NAME = "aiphone_notification_prefs";
    public static final String LAUNCHER_PREFS_NAME = "aiphone_launcher_prefs";
    public static final String KEY_ACTIVE_PRESET_ID = "active_launcher_preset_id";
    public static final String KEY_PENDING_AI_ID = "pending_notification_ai_id";
    public static final String ACTION_OPEN_AI_CHAT = "OPEN_AI_CHAT";
    private static final int MAX_AVATAR_BYTES = 2 * 1024 * 1024;
    private static final int MAX_AVATAR_DIM = 192;
    private static final int NOTIF_AVATAR_SIZE = 128;
    private static final float NOTIF_AVATAR_CORNER_RADIUS = 12f;

    private static final Map<String, String> LAUNCHER_PRESET_ALIASES = new LinkedHashMap<>();
    static {
        LAUNCHER_PRESET_ALIASES.put("default", ".LauncherDefault");
        LAUNCHER_PRESET_ALIASES.put("xiaoshouji", ".LauncherXiaoshouji");
        LAUNCHER_PRESET_ALIASES.put("cloud_milk", ".LauncherCloudMilk");
        LAUNCHER_PRESET_ALIASES.put("starlight", ".LauncherStarlight");
        LAUNCHER_PRESET_ALIASES.put("minimal", ".LauncherMinimal");
    }

    private static final ExecutorService AVATAR_EXECUTOR = Executors.newFixedThreadPool(2);

    @Override
    public void load() {
        super.load();
        ensureAiMessageNotificationChannel(getContext());
    }

    public static void savePendingNotificationAiId(Context context, String aiId) {
        if (context == null || aiId == null || aiId.trim().isEmpty()) {
            return;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_PENDING_AI_ID, aiId.trim()).apply();
            Log.i(NOTIF_TAG, "Saved pending notification tap aiId=" + aiId.trim());
        } catch (Exception e) {
            Log.w(NOTIF_TAG, "Failed to save pending notification aiId", e);
        }
    }

    public static String consumePendingNotificationAiId(Context context) {
        if (context == null) {
            return null;
        }
        try {
            SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String aiId = prefs.getString(KEY_PENDING_AI_ID, null);
            if (aiId != null) {
                prefs.edit().remove(KEY_PENDING_AI_ID).apply();
                Log.i(NOTIF_TAG, "Consumed pending notification tap aiId=" + aiId);
            }
            return aiId;
        } catch (Exception e) {
            Log.w(NOTIF_TAG, "Failed to consume pending notification aiId", e);
            return null;
        }
    }

    @PluginMethod
    public void getEnvironmentInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("isNativeAndroid", true);
        ret.put("sdkVersion", Build.VERSION.SDK_INT);
        ret.put("model", Build.MODEL);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("packageName", getContext().getPackageName());
        call.resolve(ret);
    }

    /**
     * Check real permission statuses directly against Android OS APIs.
     * Guaranteed no fake data or simulated values.
     */
    @PluginMethod
    public void checkAllPermissions(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        // 1. Notification (NotificationManagerCompat.areNotificationsEnabled + Android 13+ POST_NOTIFICATIONS)
        boolean notifEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        boolean postNotifGranted = isPostNotificationsGranted(context);
        boolean notifGranted = notifEnabled && postNotifGranted;
        ret.put("notification", notifGranted ? "GRANTED" : "DENIED");

        // 2. NotificationListenerService (enabled_notification_listeners)
        boolean notifListenerGranted = checkNotificationListenerGranted(context);
        ret.put("notification_listener", notifListenerGranted ? "GRANTED" : "DENIED");

        // 3. UsageStatsManager / Usage Access (AppOpsManager.OPSTR_GET_USAGE_STATS)
        boolean usageGranted = checkUsageStatsGranted(context);
        ret.put("usage_stats", usageGranted ? "GRANTED" : "DENIED");

        // 4. Floating Window (Settings.canDrawOverlays)
        boolean overlayGranted = checkOverlayGranted(context);
        ret.put("floating_window", overlayGranted ? "GRANTED" : "DENIED");

        // 5. AccessibilityService (AccessibilityManager.getEnabledAccessibilityServiceList)
        boolean accessibilityGranted = checkAccessibilityGranted(context);
        ret.put("accessibility", accessibilityGranted ? "GRANTED" : "DENIED");

        // 6. Battery Optimization (PowerManager.isIgnoringBatteryOptimizations)
        boolean batteryIgnored = checkBatteryOptimizationIgnored(context);
        ret.put("battery_optimization", batteryIgnored ? "GRANTED" : "DENIED");

        // 7. Background Execution (WakeLock + Battery)
        ret.put("background_execution", (batteryIgnored && notifGranted) ? "GRANTED" : "DENIED");

        // 8. Runtime: Camera
        boolean cameraGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
        ret.put("camera", cameraGranted ? "GRANTED" : "DENIED");

        // 9. Runtime: Microphone
        boolean micGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
        ret.put("microphone", micGranted ? "GRANTED" : "DENIED");

        // 10. Runtime: Geolocation (Fine or Coarse)
        boolean fineLoc = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarseLoc = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        ret.put("geolocation", (fineLoc || coarseLoc) ? "GRANTED" : "DENIED");

        // 11. Runtime: Media / Storage
        boolean mediaGranted = checkMediaStorageGranted(context);
        ret.put("media_storage", mediaGranted ? "GRANTED" : "DENIED");

        // 12. Bluetooth
        boolean btGranted = checkBluetoothGranted(context);
        ret.put("bluetooth", btGranted ? "GRANTED" : "DENIED");

        // 13. Screen capture (MediaProjection is per-request in Android, cannot be permanently granted by OS)
        ret.put("screen_capture", "TEMPORARY");

        // 14. Vendor autostart (OEM specific settings page required)
        ret.put("vendor_autostart", "SETTINGS_REQUIRED");

        call.resolve(ret);
    }

    /**
     * Request a specific permission or navigate directly to its designated Android system settings page.
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String id = call.getString("id", "");
        Context context = getContext();

        try {
            switch (id) {
                case "usage_stats":
                    openUsageStatsSettings(context);
                    call.resolve(createResult(true, "已打开 Android 使用情况访问权限设置页，请开启授权后返回"));
                    break;

                case "notification_listener":
                    openNotificationListenerSettings(context);
                    call.resolve(createResult(true, "已打开 Android 通知使用权设置页，请允许小手机通知监听助手后返回"));
                    break;

                case "floating_window":
                    openOverlaySettings(context);
                    call.resolve(createResult(true, "已打开 Android 悬浮窗 (显示在其他应用上层) 设置页，请开启授权后返回"));
                    break;

                case "accessibility":
                    openAccessibilitySettings(context);
                    call.resolve(createResult(true, "已打开 Android 无障碍设置页，请找到并开启【AI手机界面辅助无障碍服务】后返回"));
                    break;

                case "battery_optimization":
                    openBatteryOptimizationSettings(context);
                    call.resolve(createResult(true, "已请求忽略电池优化白名单 / 打开电池管理页面"));
                    break;

                case "vendor_autostart":
                    openVendorAutostartSettings(context);
                    call.resolve(createResult(true, "已尝试调起设备厂商自启动/后台保护设置"));
                    break;

                case "notification":
                    if (Build.VERSION.SDK_INT >= 33) {
                        // Request runtime POST_NOTIFICATIONS first if not granted
                        if (!isPostNotificationsGranted(context)) {
                            requestPermissionForAlias("notification", call, "permissionCallback");
                            return;
                        }
                    }
                    // If below 33 or runtime already granted (e.g., OS toggle off), open notification settings
                    openAppNotificationSettings(context);
                    call.resolve(createResult(true, "已打开通知设置页"));
                    break;

                case "camera":
                    if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
                        requestPermissionForAlias("camera", call, "permissionCallback");
                        return;
                    }
                    call.resolve(createResult(true, "相机权限已处于授权状态"));
                    break;

                case "microphone":
                    if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
                        requestPermissionForAlias("microphone", call, "permissionCallback");
                        return;
                    }
                    call.resolve(createResult(true, "麦克风权限已处于授权状态"));
                    break;

                case "geolocation":
                    if (getPermissionState("geolocation") != com.getcapacitor.PermissionState.GRANTED) {
                        requestPermissionForAlias("geolocation", call, "permissionCallback");
                        return;
                    }
                    call.resolve(createResult(true, "位置权限已处于授权状态"));
                    break;

                case "media_storage":
                case "background_execution":
                default:
                    openAppDetailsSettings(context);
                    call.resolve(createResult(true, "已打开应用详情页面"));
                    break;
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to request permission / open settings for: " + id, e);
            // Fallback: open application details settings
            try {
                openAppDetailsSettings(context);
                call.resolve(createResult(true, "已降级打开小手机应用详情设置页"));
            } catch (Exception ex) {
                call.reject("无法打开系统设置: " + ex.getMessage());
            }
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        // Re-check and resolve to caller
        checkAllPermissions(call);
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        String target = call.getString("target", "app_details");
        Context context = getContext();

        try {
            if ("usage_stats".equals(target)) {
                openUsageStatsSettings(context);
            } else if ("notification_listener".equals(target)) {
                openNotificationListenerSettings(context);
            } else if ("floating_window".equals(target)) {
                openOverlaySettings(context);
            } else if ("accessibility".equals(target)) {
                openAccessibilitySettings(context);
            } else if ("battery_optimization".equals(target)) {
                openBatteryOptimizationSettings(context);
            } else if ("notification".equals(target)) {
                openAppNotificationSettings(context);
            } else if ("vendor_autostart".equals(target)) {
                openVendorAutostartSettings(context);
            } else {
                openAppDetailsSettings(context);
            }
            call.resolve(createResult(true, "已跳转系统设置"));
        } catch (Exception e) {
            openAppDetailsSettings(context);
            call.resolve(createResult(true, "已降级打开应用详情设置页"));
        }
    }

    /**
     * Inspect real Android notification system diagnostics (permissions, channel, importance).
     */
    @PluginMethod
    public void getNotificationDiagnostics(PluginCall call) {
        Context context = getContext();
        ensureAiMessageNotificationChannel(context);

        boolean postGranted = isPostNotificationsGranted(context);
        boolean notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled();
        boolean channelExists = true;
        int channelImportance = NotificationManagerCompat.IMPORTANCE_HIGH;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = nm != null ? nm.getNotificationChannel(CHANNEL_ID) : null;
            channelExists = channel != null;
            channelImportance = channel != null ? channel.getImportance() : NotificationManager.IMPORTANCE_NONE;
        }

        JSObject ret = new JSObject();
        ret.put("isNativeAndroid", true);
        ret.put("sdkVersion", Build.VERSION.SDK_INT);
        ret.put("postNotificationsGranted", postGranted);
        ret.put("notificationsEnabled", notificationsEnabled);
        ret.put("channelId", CHANNEL_ID);
        ret.put("channelExists", channelExists);
        ret.put("channelImportance", channelImportance);
        call.resolve(ret);
    }

    /**
     * Read and clear any pending AI chat target stored by a notification tap.
     */
    @PluginMethod
    public void consumePendingNotificationAction(PluginCall call) {
        String aiId = consumePendingNotificationAiId(getContext());
        JSObject ret = new JSObject();
        boolean hasPending = aiId != null && !aiId.isEmpty();
        ret.put("hasPendingAction", hasPending);
        ret.put("aiId", hasPending ? aiId : "");
        call.resolve(ret);
    }

    /**
     * Post a genuine Android status bar / notification drawer message using NotificationCompat.
     */
    @PluginMethod
    public void showAiMessageNotification(PluginCall call) {
        final Context context = getContext().getApplicationContext();
        final String aiId = call.getString("aiId", "default_ai");
        final String title = call.getString("title", "").trim();
        final String body = call.getString("body", "").trim();
        final String avatar = call.getString("avatar", "");
        final Integer notifIdObj = call.getInt("notificationId");
        final int notificationId = notifIdObj != null ? notifIdObj : 0;
        final Long tsObj = call.getLong("timestamp");
        final long timestamp = (tsObj != null && tsObj > 0) ? tsObj : System.currentTimeMillis();
        final String groupKey = call.getString("groupKey", "ai_chat_" + aiId);

        if (notificationId <= 0 || title.isEmpty() || body.isEmpty()) {
            Log.w(NOTIF_TAG, "Invalid notification arguments: id=" + notificationId);
            call.resolve(createNotifResult(false, "INVALID_ARGUMENT", "通知参数不完整 (title/body/notificationId 无效)", notificationId));
            return;
        }

        if (!isPostNotificationsGranted(context)) {
            Log.w(NOTIF_TAG, "POST_NOTIFICATIONS permission denied on Android 13+");
            call.resolve(createNotifResult(false, "NOTIFICATION_PERMISSION_DENIED", "缺少 Android 13+ POST_NOTIFICATIONS 通知权限", notificationId));
            return;
        }

        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) {
            Log.w(NOTIF_TAG, "App notifications disabled in Android OS settings");
            call.resolve(createNotifResult(false, "NOTIFICATIONS_DISABLED", "Android 系统已关闭本应用的通知开关", notificationId));
            return;
        }

        ensureAiMessageNotificationChannel(context);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationChannel channel = nm != null ? nm.getNotificationChannel(CHANNEL_ID) : null;
            if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) {
                Log.w(NOTIF_TAG, "Notification channel disabled or missing: " + CHANNEL_ID);
                call.resolve(createNotifResult(false, "CHANNEL_DISABLED", "AI消息提醒通知渠道已被系统或用户关闭", notificationId));
                return;
            }
        }

        try {
            final PendingIntent contentIntent = createChatPendingIntent(context, aiId, notificationId);
            final Bitmap fallbackLargeIcon = loadDefaultAppIconBitmap(context);

            Notification initialNotification = buildAiMessageNotification(
                context,
                title,
                body,
                timestamp,
                groupKey,
                contentIntent,
                fallbackLargeIcon,
                false
            );

            NotificationManagerCompat.from(context).notify(notificationId, initialNotification);
            final String avatarSourceType = classifyAvatarSource(avatar);
            Log.i(NOTIF_TAG, "Notification posted id=" + notificationId + ", aiId=" + aiId + ", avatarSourceType=" + avatarSourceType);

            // Asynchronously decode/fetch AI avatar without blocking status bar delivery
            if (avatar != null && !avatar.trim().isEmpty() && !avatar.startsWith("blob:")) {
                final String avatarSource = avatar.trim();
                AVATAR_EXECUTOR.execute(() -> {
                    try {
                        Bitmap avatarBitmap = loadAvatarBitmapSafely(context, avatarSource, aiId);
                        if (avatarBitmap != null) {
                            if (!isPostNotificationsGranted(context) || !NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                                avatarBitmap.recycle();
                                return;
                            }
                            PendingIntent refreshIntent = createChatPendingIntent(context, aiId, notificationId);
                            Notification updatedNotification = buildAiMessageNotification(
                                context,
                                title,
                                body,
                                timestamp,
                                groupKey,
                                refreshIntent,
                                avatarBitmap,
                                true
                            );
                            NotificationManagerCompat.from(context).notify(notificationId, updatedNotification);
                            Log.i(
                                NOTIF_TAG,
                                "Updated notification rounded-square avatar id=" + notificationId
                                    + ", aiId=" + aiId
                                    + ", dim=" + avatarBitmap.getWidth() + "x" + avatarBitmap.getHeight()
                                    + ", fallbackUsed=false"
                            );
                        } else {
                            Log.w(
                                NOTIF_TAG,
                                "Avatar decode returned null, keeping default app icon fallback=true, id=" + notificationId
                                    + ", aiId=" + aiId
                                    + ", sourceType=" + avatarSourceType
                            );
                        }
                    } catch (SecurityException se) {
                        Log.w(NOTIF_TAG, "Permission revoked while updating avatar for id=" + notificationId);
                    } catch (Throwable t) {
                        Log.w(
                            NOTIF_TAG,
                            "Async avatar load skipped for id=" + notificationId
                                + ", aiId=" + aiId
                                + ", sourceType=" + avatarSourceType
                                + ", ex=" + t.getClass().getSimpleName()
                                + ", fallbackUsed=true"
                        );
                    }
                });
            } else {
                Log.i(
                    NOTIF_TAG,
                    "No usable avatar string supplied, using default app icon fallback=true, id=" + notificationId
                        + ", aiId=" + aiId
                        + ", sourceType=" + avatarSourceType
                );
            }

            call.resolve(createNotifResult(true, "NOTIFICATION_POSTED", "已向Android系统提交状态栏通知", notificationId));
        } catch (SecurityException se) {
            Log.e(NOTIF_TAG, "SecurityException posting notification id=" + notificationId, se);
            call.resolve(createNotifResult(false, "NOTIFICATION_PERMISSION_DENIED", "系统拒绝发送通知: " + se.getMessage(), notificationId));
        } catch (Exception e) {
            Log.e(NOTIF_TAG, "Failed to post notification id=" + notificationId, e);
            call.resolve(createNotifResult(false, "NOTIFICATION_POST_FAILED", "发送Android通知失败: " + e.getMessage(), notificationId));
        }
    }

    private boolean isPostNotificationsGranted(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private void ensureAiMessageNotificationChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        try {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) {
                return;
            }
            if (nm.getNotificationChannel(CHANNEL_ID) != null) {
                return;
            }

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription(CHANNEL_DESCRIPTION);
            channel.enableVibration(true);
            channel.enableLights(true);
            Uri soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (soundUri != null) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
                channel.setSound(soundUri, attrs);
            }
            nm.createNotificationChannel(channel);
            Log.i(NOTIF_TAG, "Created NotificationChannel " + CHANNEL_ID);
        } catch (Exception e) {
            Log.w(NOTIF_TAG, "Failed to create notification channel", e);
        }
    }

    private PendingIntent createChatPendingIntent(Context context, String aiId, int notificationId) {
        Intent tapIntent = new Intent(context, MainActivity.class);
        tapIntent.setAction(ACTION_OPEN_AI_CHAT);
        tapIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        tapIntent.putExtra("action", ACTION_OPEN_AI_CHAT);
        tapIntent.putExtra("aiId", aiId);
        tapIntent.putExtra("notificationId", notificationId);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(context, notificationId, tapIntent, flags);
    }

    private Notification buildAiMessageNotification(
        Context context,
        String title,
        String body,
        long timestamp,
        String groupKey,
        PendingIntent contentIntent,
        Bitmap largeIcon,
        boolean onlyAlertOnce
    ) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_ai_message)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setWhen(timestamp)
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setGroup(groupKey)
            .setContentIntent(contentIntent)
            .setOnlyAlertOnce(onlyAlertOnce)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        if (largeIcon != null) {
            builder.setLargeIcon(largeIcon);
        }

        return builder.build();
    }

    private Bitmap loadDefaultAppIconBitmap(Context context) {
        try {
            Drawable drawable = context.getPackageManager().getApplicationIcon(context.getPackageName());
            if (drawable instanceof BitmapDrawable && ((BitmapDrawable) drawable).getBitmap() != null) {
                return ((BitmapDrawable) drawable).getBitmap();
            }
            int size = 128;
            Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);
            drawable.setBounds(0, 0, canvas.getWidth(), canvas.getHeight());
            drawable.draw(canvas);
            return bitmap;
        } catch (Exception e) {
            try {
                return BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher);
            } catch (Exception ignored) {
                return null;
            }
        }
    }

    private String classifyAvatarSource(String avatarSource) {
        if (avatarSource == null || avatarSource.trim().isEmpty()) {
            return "empty";
        }
        String trimmed = avatarSource.trim();
        if (trimmed.startsWith("data:image/svg+xml")) {
            return "data_svg";
        }
        if (trimmed.startsWith("data:image/")) {
            return "data_base64";
        }
        if (trimmed.startsWith("https://")) {
            return "https_url";
        }
        if (trimmed.startsWith("http://")) {
            return "http_url";
        }
        if (trimmed.startsWith("/") || trimmed.startsWith("./")) {
            return "asset_relative";
        }
        if (trimmed.startsWith("blob:")) {
            return "blob_url";
        }
        return "unknown";
    }

    private byte[] decodeDataImageBytes(String dataUrl, String aiId) {
        try {
            int commaIndex = dataUrl.indexOf(',');
            if (commaIndex <= 0 || commaIndex + 1 >= dataUrl.length()) {
                Log.w(NOTIF_TAG, "Base64 avatar malformed header aiId=" + aiId);
                return null;
            }
            String base64Payload = dataUrl.substring(commaIndex + 1);
            byte[] rawBytes = Base64.decode(base64Payload, Base64.DEFAULT);
            if (rawBytes == null || rawBytes.length == 0 || rawBytes.length > MAX_AVATAR_BYTES) {
                Log.w(
                    NOTIF_TAG,
                    "Base64 avatar invalid byte length aiId=" + aiId
                        + ", bytes=" + (rawBytes != null ? rawBytes.length : 0)
                );
                return null;
            }
            return rawBytes;
        } catch (Exception e) {
            Log.w(
                NOTIF_TAG,
                "Failed Base64 decode aiId=" + aiId + ", ex=" + e.getClass().getSimpleName()
            );
            return null;
        }
    }

    private Bitmap loadAvatarBitmapSafely(Context context, String avatarSource, String aiId) {
        if (avatarSource == null || avatarSource.isEmpty()) {
            return null;
        }

        String sourceType = classifyAvatarSource(avatarSource);
        Bitmap decoded = null;
        int payloadBytes = 0;

        if (avatarSource.startsWith("data:image/")) {
            if ("data_svg".equals(sourceType)) {
                Log.w(
                    NOTIF_TAG,
                    "Raw SVG data URI reached native decoder (expected pre-rasterized thumbnail), aiId=" + aiId
                );
                return null;
            }
            byte[] rawBytes = decodeDataImageBytes(avatarSource, aiId);
            if (rawBytes == null) {
                return null;
            }
            payloadBytes = rawBytes.length;
            decoded = decodeSampledBitmapFromBytes(rawBytes, MAX_AVATAR_DIM, MAX_AVATAR_DIM);
            if (decoded == null) {
                Log.w(
                    NOTIF_TAG,
                    "BitmapFactory returned null for Base64 payload aiId=" + aiId + ", bytes=" + payloadBytes
                );
                return null;
            }
        } else if (avatarSource.startsWith("https://") || avatarSource.startsWith("http://")) {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(avatarSource);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(5000);
                conn.setInstanceFollowRedirects(true);
                conn.setDoInput(true);
                conn.connect();

                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    Log.w(
                        NOTIF_TAG,
                        "Remote avatar HTTP error aiId=" + aiId + ", status=" + code
                    );
                    return null;
                }
                int contentLength = conn.getContentLength();
                if (contentLength > MAX_AVATAR_BYTES) {
                    Log.w(
                        NOTIF_TAG,
                        "Remote avatar exceeded limit aiId=" + aiId + ", contentLength=" + contentLength
                    );
                    return null;
                }

                try (InputStream is = conn.getInputStream();
                     ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192];
                    int read;
                    int total = 0;
                    while ((read = is.read(buf)) != -1) {
                        total += read;
                        if (total > MAX_AVATAR_BYTES) {
                            Log.w(
                                NOTIF_TAG,
                                "Remote avatar stream exceeded limit aiId=" + aiId + ", bytes=" + total
                            );
                            return null;
                        }
                        baos.write(buf, 0, read);
                    }
                    byte[] rawBytes = baos.toByteArray();
                    payloadBytes = rawBytes.length;
                    decoded = decodeSampledBitmapFromBytes(rawBytes, MAX_AVATAR_DIM, MAX_AVATAR_DIM);
                }
            } catch (Exception e) {
                Log.w(
                    NOTIF_TAG,
                    "Failed to load remote notification avatar aiId=" + aiId
                        + ", ex=" + e.getClass().getSimpleName()
                );
                return null;
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        } else if (avatarSource.startsWith("/") || avatarSource.startsWith("./")) {
            String relPath = avatarSource.startsWith("./") ? avatarSource.substring(2) : avatarSource.substring(1);
            String assetPath = "public/" + relPath;
            try (InputStream is = context.getAssets().open(assetPath);
                 ByteArrayOutputStream baos = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int read;
                int total = 0;
                while ((read = is.read(buf)) != -1) {
                    total += read;
                    if (total > MAX_AVATAR_BYTES) {
                        return null;
                    }
                    baos.write(buf, 0, read);
                }
                byte[] rawBytes = baos.toByteArray();
                payloadBytes = rawBytes.length;
                decoded = decodeSampledBitmapFromBytes(rawBytes, MAX_AVATAR_DIM, MAX_AVATAR_DIM);
            } catch (Exception e) {
                Log.w(
                    NOTIF_TAG,
                    "Failed to load asset notification avatar aiId=" + aiId
                        + ", path=" + assetPath
                        + ", ex=" + e.getClass().getSimpleName()
                );
                return null;
            }
        }

        if (decoded == null) {
            Log.w(
                NOTIF_TAG,
                "Avatar decode produced null aiId=" + aiId + ", sourceType=" + sourceType + ", bytes=" + payloadBytes
            );
            return null;
        }

        Log.d(
            NOTIF_TAG,
            "Avatar decoded aiId=" + aiId
                + ", sourceType=" + sourceType
                + ", bytes=" + payloadBytes
                + ", rawDim=" + decoded.getWidth() + "x" + decoded.getHeight()
        );

        Bitmap roundedSquare = toRoundedSquareBitmap(decoded, NOTIF_AVATAR_SIZE, NOTIF_AVATAR_CORNER_RADIUS);
        if (roundedSquare != null && roundedSquare != decoded) {
            decoded.recycle();
            return roundedSquare;
        }
        return decoded;
    }

    private Bitmap decodeSampledBitmapFromBytes(byte[] data, int reqWidth, int reqHeight) {
        BitmapFactory.Options boundsOpts = new BitmapFactory.Options();
        boundsOpts.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, boundsOpts);
        if (boundsOpts.outWidth <= 0 || boundsOpts.outHeight <= 0) {
            return null;
        }

        int inSampleSize = 1;
        int halfHeight = boundsOpts.outHeight / 2;
        int halfWidth = boundsOpts.outWidth / 2;
        while ((halfHeight / inSampleSize) >= reqHeight && (halfWidth / inSampleSize) >= reqWidth) {
            inSampleSize *= 2;
        }

        BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
        decodeOpts.inSampleSize = inSampleSize;
        decodeOpts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        return BitmapFactory.decodeByteArray(data, 0, data.length, decodeOpts);
    }

    /**
     * Center-crop source bitmap into a square rounded-corner icon (WeChat-style rounded square, NOT circle).
     */
    private Bitmap toRoundedSquareBitmap(Bitmap source, int targetSize, float cornerRadius) {
        if (source == null) return null;
        try {
            int minEdge = Math.min(source.getWidth(), source.getHeight());
            int cropX = Math.max(0, (source.getWidth() - minEdge) / 2);
            int cropY = Math.max(0, (source.getHeight() - minEdge) / 2);

            Bitmap output = Bitmap.createBitmap(targetSize, targetSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);
            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
            paint.setColor(0xFFFFFFFF);

            canvas.drawARGB(0, 0, 0, 0);
            RectF roundRect = new RectF(0f, 0f, (float) targetSize, (float) targetSize);
            canvas.drawRoundRect(roundRect, cornerRadius, cornerRadius, paint);
            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));

            Rect srcRect = new Rect(cropX, cropY, cropX + minEdge, cropY + minEdge);
            Rect dstRect = new Rect(0, 0, targetSize, targetSize);
            canvas.drawBitmap(source, srcRect, dstRect, paint);
            return output;
        } catch (Throwable t) {
            Log.w(NOTIF_TAG, "toRoundedSquareBitmap fallback: " + t.getClass().getSimpleName());
            return source;
        }
    }

    private JSObject createNotifResult(boolean success, String code, String message, int notificationId) {
        JSObject res = new JSObject();
        res.put("success", success);
        res.put("code", code);
        res.put("message", message);
        res.put("notificationId", notificationId);
        return res;
    }

    /**
     * Query real screen usage statistics from Android OS UsageStatsManager.
     * Differentiates total screen time, this app usage time, and continuous usage minutes.
     */
    @PluginMethod
    public void getScreenUsageMinutes(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        boolean usageGranted = checkUsageStatsGranted(context);
        ret.put("hasPermission", usageGranted);

        if (!usageGranted) {
            ret.put("totalScreenTimeMinutes", 0);
            ret.put("appUsageTimeMinutes", 0);
            ret.put("continuousUsageMinutes", 0);
            ret.put("minutes", 0);
            call.resolve(ret);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                UsageStatsManager usm = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
                if (usm != null) {
                    long now = System.currentTimeMillis();
                    java.util.Calendar cal = java.util.Calendar.getInstance();
                    cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
                    cal.set(java.util.Calendar.MINUTE, 0);
                    cal.set(java.util.Calendar.SECOND, 0);
                    cal.set(java.util.Calendar.MILLISECOND, 0);
                    long startTime = cal.getTimeInMillis();

                    List<UsageStats> statsList = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, startTime, now);
                    long totalForegroundMs = 0;
                    long appMs = 0;

                    if (statsList != null) {
                        String myPackage = context.getPackageName();
                        for (UsageStats stats : statsList) {
                            long fgTime = stats.getTotalTimeInForeground();
                            if (fgTime > 0) {
                                totalForegroundMs += fgTime;
                                if (myPackage.equals(stats.getPackageName())) {
                                    appMs += fgTime;
                                }
                            }
                        }
                    }

                    int totalMinutes = (int) (totalForegroundMs / (1000 * 60));
                    int appMinutes = (int) (appMs / (1000 * 60));

                    ret.put("totalScreenTimeMinutes", totalMinutes);
                    ret.put("appUsageTimeMinutes", appMinutes);
                    ret.put("continuousUsageMinutes", totalMinutes > 0 ? totalMinutes : 0);
                    ret.put("minutes", totalMinutes);
                    call.resolve(ret);
                    return;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to query UsageStatsManager:", e);
        }

        ret.put("totalScreenTimeMinutes", 0);
        ret.put("appUsageTimeMinutes", 0);
        ret.put("continuousUsageMinutes", 0);
        ret.put("minutes", 0);
        call.resolve(ret);
    }

    /**
     * Query real app-level usage statistics using Android OS UsageStatsManager & UsageEvents.
     * Computes today's total foreground time, continuous session time, and last time used for each package.
     */
    @PluginMethod
    public void getAppUsageList(PluginCall call) {
        Context context = getContext();
        JSObject ret = new JSObject();

        boolean usageGranted = checkUsageStatsGranted(context);
        ret.put("hasPermission", usageGranted);

        if (!usageGranted) {
            ret.put("apps", new com.getcapacitor.JSArray());
            call.resolve(ret);
            return;
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                UsageStatsManager usm = (UsageStatsManager) context.getSystemService(Context.USAGE_STATS_SERVICE);
                PackageManager pm = context.getPackageManager();

                if (usm != null && pm != null) {
                    long now = System.currentTimeMillis();
                    java.util.Calendar cal = java.util.Calendar.getInstance();
                    cal.set(java.util.Calendar.HOUR_OF_DAY, 0);
                    cal.set(java.util.Calendar.MINUTE, 0);
                    cal.set(java.util.Calendar.SECOND, 0);
                    cal.set(java.util.Calendar.MILLISECOND, 0);
                    long todayMidnight = cal.getTimeInMillis();

                    List<UsageStats> statsList = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, todayMidnight, now);
                    java.util.Map<String, Long> totalTimeMap = new java.util.HashMap<>();
                    java.util.Map<String, Long> lastTimeUsedMap = new java.util.HashMap<>();

                    if (statsList != null) {
                        for (UsageStats stats : statsList) {
                            if (stats.getTotalTimeInForeground() > 0) {
                                String pkg = stats.getPackageName();
                                totalTimeMap.put(pkg, stats.getTotalTimeInForeground());
                                lastTimeUsedMap.put(pkg, stats.getLastTimeUsed());
                            }
                        }
                    }

                    UsageEvents events = usm.queryEvents(todayMidnight, now);
                    java.util.Map<String, Long> resumedAtMap = new java.util.HashMap<>();
                    java.util.Map<String, Long> continuousTimeMap = new java.util.HashMap<>();

                    if (events != null) {
                        UsageEvents.Event event = new UsageEvents.Event();
                        while (events.hasNextEvent()) {
                            events.getNextEvent(event);
                            String pkg = event.getPackageName();
                            int eventType = event.getEventType();
                            long eventTime = event.getTimeStamp();

                            if (eventType == UsageEvents.Event.ACTIVITY_RESUMED) {
                                resumedAtMap.put(pkg, eventTime);
                            } else if (eventType == UsageEvents.Event.ACTIVITY_PAUSED ||
                                       eventType == 18 /* KEYGUARD_SHOWN */ ||
                                       eventType == 26 /* DEVICE_SHUTDOWN */) {
                                Long resTime = resumedAtMap.remove(pkg);
                                if (resTime != null && eventTime > resTime) {
                                    long dur = eventTime - resTime;
                                    continuousTimeMap.put(pkg, dur);
                                }
                            }
                        }

                        for (java.util.Map.Entry<String, Long> entry : resumedAtMap.entrySet()) {
                            String pkg = entry.getKey();
                            long resTime = entry.getValue();
                            if (now > resTime) {
                                continuousTimeMap.put(pkg, now - resTime);
                            }
                        }
                    }

                    com.getcapacitor.JSArray appArray = new com.getcapacitor.JSArray();
                    for (String pkg : totalTimeMap.keySet()) {
                        long totalMs = totalTimeMap.get(pkg);
                        long lastUsed = lastTimeUsedMap.containsKey(pkg) ? lastTimeUsedMap.get(pkg) : 0;
                        long contMs = continuousTimeMap.containsKey(pkg) ? continuousTimeMap.get(pkg) : 0;

                        String label = pkg;
                        try {
                            ApplicationInfo appInfo = pm.getApplicationInfo(pkg, 0);
                            CharSequence appLabel = pm.getApplicationLabel(appInfo);
                            if (appLabel != null && appLabel.length() > 0) {
                                label = appLabel.toString();
                            }
                        } catch (Exception e) {
                            // Fallback to pkg
                        }

                        JSObject appObj = new JSObject();
                        appObj.put("packageName", pkg);
                        appObj.put("appName", label);
                        appObj.put("totalUsageMinutesToday", (int) (totalMs / (1000 * 60)));
                        appObj.put("continuousUsageMinutes", (int) (contMs / (1000 * 60)));
                        appObj.put("lastTimeUsed", lastUsed);
                        appArray.put(appObj);
                    }

                    ret.put("apps", appArray);
                    call.resolve(ret);
                    return;
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to query getAppUsageList:", e);
        }

        ret.put("apps", new com.getcapacitor.JSArray());
        call.resolve(ret);
    }

    // ==========================================
    // Real Android Check Implementations
    // ==========================================

    private boolean checkUsageStatsGranted(Context context) {
        try {
            AppOpsManager appOps = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
            if (appOps == null) return false;
            int mode;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.getPackageName());
            } else {
                mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), context.getPackageName());
            }
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkNotificationListenerGranted(Context context) {
        try {
            Set<String> packageNames = NotificationManagerCompat.getEnabledListenerPackages(context);
            if (packageNames != null && packageNames.contains(context.getPackageName())) {
                return true;
            }
            String flat = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
            return flat != null && flat.contains(context.getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkOverlayGranted(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            return Settings.canDrawOverlays(context);
        }
        return true;
    }

    private boolean checkAccessibilityGranted(Context context) {
        try {
            AccessibilityManager am = (AccessibilityManager) context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (am == null) return false;
            List<AccessibilityServiceInfo> services = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
            if (services != null) {
                for (AccessibilityServiceInfo info : services) {
                    if (info.getId() != null && info.getId().contains(context.getPackageName())) {
                        return true;
                    }
                }
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private boolean checkBatteryOptimizationIgnored(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    return pm.isIgnoringBatteryOptimizations(context.getPackageName());
                }
            } catch (Exception ignored) {}
        }
        return true;
    }

    private boolean checkMediaStorageGranted(Context context) {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        }
    }

    private boolean checkBluetoothGranted(Context context) {
        if (Build.VERSION.SDK_INT >= 31) {
            return ContextCompat.checkSelfPermission(context, "android.permission.BLUETOOTH_CONNECT") == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
        }
    }

    // ==========================================
    // Real Android Navigation Intents
    // ==========================================

    private void openUsageStatsSettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            intent.setData(Uri.parse("package:" + context.getPackageName()));
        }
        context.startActivity(intent);
    }

    private void openNotificationListenerSettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void openOverlaySettings(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } else {
            openAppDetailsSettings(context);
        }
    }

    private void openAccessibilitySettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void openBatteryOptimizationSettings(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + context.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception e) {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
            }
        } else {
            openAppDetailsSettings(context);
        }
    }

    private void openAppNotificationSettings(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        } else {
            openAppDetailsSettings(context);
        }
    }

    private void openAppDetailsSettings(Context context) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void openVendorAutostartSettings(Context context) {
        Intent[] vendorIntents = new Intent[] {
            // Xiaomi / MIUI
            new Intent().setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity")),
            // Huawei / EMUI / HarmonyOS
            new Intent().setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity")),
            new Intent().setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.bootstart.BootStartActivity")),
            // vivo / OriginOS
            new Intent().setComponent(new ComponentName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager")),
            new Intent().setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity")),
            // OPPO / ColorOS
            new Intent().setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity")),
            new Intent().setComponent(new ComponentName("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity")),
            // Samsung / Smart Manager
            new Intent().setComponent(new ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"))
        };

        for (Intent intent : vendorIntents) {
            try {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY) != null) {
                    context.startActivity(intent);
                    return;
                }
            } catch (Exception ignored) {}
        }

        // Fallback to app details
        openAppDetailsSettings(context);
    }

    // ==========================================
    // Launcher Icon & App Name Beautification (Module C)
    // ==========================================

    private String resolveActiveLauncherPresetId(Context context) {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();

        for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
            String presetId = entry.getKey();
            String aliasClass = entry.getValue();
            if ("default".equals(presetId)) {
                continue;
            }
            try {
                ComponentName cn = new ComponentName(pkg, pkg + aliasClass);
                int state = pm.getComponentEnabledSetting(cn);
                if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                    return presetId;
                }
            } catch (Exception ignored) {}
        }

        SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(LAUNCHER_PREFS_NAME, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY_ACTIVE_PRESET_ID, "default");
        return LAUNCHER_PRESET_ALIASES.containsKey(saved) ? saved : "default";
    }

    private JSObject applyLauncherPresetInternal(Context context, String presetId) {
        if (!LAUNCHER_PRESET_ALIASES.containsKey(presetId)) {
            JSObject err = createResult(false, "无效的桌面预设方案: " + presetId);
            err.put("activePresetId", resolveActiveLauncherPresetId(context));
            return err;
        }

        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        String targetAlias = LAUNCHER_PRESET_ALIASES.get(presetId);

        try {
            // Step 1: Enable target launcher alias FIRST so the launcher never sees zero active entrypoints
            ComponentName targetComponent = new ComponentName(pkg, pkg + targetAlias);
            pm.setComponentEnabledSetting(
                targetComponent,
                PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
                PackageManager.DONT_KILL_APP
            );

            // Step 2: Disable all other launcher aliases with DONT_KILL_APP
            for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
                if (entry.getKey().equals(presetId)) {
                    continue;
                }
                ComponentName otherComponent = new ComponentName(pkg, pkg + entry.getValue());
                pm.setComponentEnabledSetting(
                    otherComponent,
                    PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                );
            }

            SharedPreferences prefs = context.getApplicationContext().getSharedPreferences(LAUNCHER_PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_ACTIVE_PRESET_ID, presetId).apply();
            Log.i(LAUNCHER_TAG, "Switched launcher preset to " + presetId + " (" + targetAlias + ")");

            JSObject ok = createResult(true, "已切换系统桌面图标与名称预设，系统桌面可能需要几秒或返回桌面后刷新图标缓存。");
            ok.put("activePresetId", presetId);
            return ok;
        } catch (Exception e) {
            Log.e(LAUNCHER_TAG, "Failed to switch launcher preset to " + presetId, e);
            JSObject err = createResult(false, "切换桌面预设失败: " + e.getMessage());
            err.put("activePresetId", resolveActiveLauncherPresetId(context));
            return err;
        }
    }

    @PluginMethod
    public void getLauncherAppearanceStatus(PluginCall call) {
        Context context = getContext().getApplicationContext();
        String activeId = resolveActiveLauncherPresetId(context);
        boolean supportsPinShortcut = ShortcutManagerCompat.isRequestPinShortcutSupported(context);

        JSArray available = new JSArray();
        for (String id : LAUNCHER_PRESET_ALIASES.keySet()) {
            available.put(id);
        }

        JSObject ret = new JSObject();
        ret.put("isNativeAndroid", true);
        ret.put("activePresetId", activeId);
        ret.put("supportsPinShortcut", supportsPinShortcut);
        ret.put("availablePresets", available);
        call.resolve(ret);
    }

    @PluginMethod
    public void setLauncherPreset(PluginCall call) {
        String presetId = call.getString("presetId", "default");
        Context context = getContext().getApplicationContext();
        call.resolve(applyLauncherPresetInternal(context, presetId));
    }

    @PluginMethod
    public void resetLauncherDefault(PluginCall call) {
        Context context = getContext().getApplicationContext();
        call.resolve(applyLauncherPresetInternal(context, "default"));
    }

    @PluginMethod
    public void createCustomShortcut(PluginCall call) {
        Context context = getContext().getApplicationContext();
        String rawLabel = call.getString("label", "");
        String label = rawLabel != null ? rawLabel.trim() : "";
        if (label.isEmpty()) {
            JSObject res = createResult(false, "请输入自定义快捷方式名称");
            res.put("supported", ShortcutManagerCompat.isRequestPinShortcutSupported(context));
            call.resolve(res);
            return;
        }
        if (label.length() > 24) {
            label = label.substring(0, 24);
        }

        if (!ShortcutManagerCompat.isRequestPinShortcutSupported(context)) {
            JSObject res = createResult(false, "当前手机系统或桌面暂不支持固定桌面快捷方式，请使用上方内置预设切换功能。");
            res.put("supported", false);
            call.resolve(res);
            return;
        }

        String iconDataUrl = call.getString("iconDataUrl", "");
        String shortcutId = call.getString("shortcutId", "");
        if (shortcutId == null || shortcutId.trim().isEmpty()) {
            shortcutId = "aiphone_custom_shortcut_" + System.currentTimeMillis();
        }

        Bitmap shortcutBitmap = null;
        try {
            if (iconDataUrl != null && iconDataUrl.startsWith("data:image/") && !iconDataUrl.startsWith("data:image/svg+xml")) {
                byte[] rawBytes = decodeDataImageBytes(iconDataUrl, "custom_shortcut");
                if (rawBytes != null) {
                    Bitmap decoded = decodeSampledBitmapFromBytes(rawBytes, 192, 192);
                    if (decoded != null) {
                        shortcutBitmap = toRoundedSquareBitmap(decoded, 192, 26f);
                        if (shortcutBitmap != decoded) {
                            decoded.recycle();
                        }
                    }
                }
            }
            if (shortcutBitmap == null) {
                Bitmap fallback = loadDefaultAppIconBitmap(context);
                if (fallback != null) {
                    shortcutBitmap = toRoundedSquareBitmap(fallback, 192, 26f);
                }
            }

            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.setAction(Intent.ACTION_VIEW);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);

            ShortcutInfoCompat.Builder builder = new ShortcutInfoCompat.Builder(context, shortcutId)
                .setShortLabel(label)
                .setLongLabel(label)
                .setIntent(launchIntent);

            if (shortcutBitmap != null) {
                builder.setIcon(IconCompat.createWithBitmap(shortcutBitmap));
            } else {
                builder.setIcon(IconCompat.createWithResource(context, R.mipmap.ic_launcher));
            }

            boolean requested = ShortcutManagerCompat.requestPinShortcut(context, builder.build(), null);
            JSObject res = createResult(
                requested,
                requested
                    ? "已向系统桌面发起自定义快捷方式创建请求，请在系统弹窗中确认添加（注：快捷方式不会覆盖原 APK 应用名称）。"
                    : "系统桌面拒绝了固定快捷方式请求，请检查桌面权限设置（如 MIUI/HarmonyOS 桌面快捷方式权限）。"
            );
            res.put("supported", true);
            res.put("shortcutId", shortcutId);
            call.resolve(res);
        } catch (Exception e) {
            Log.e(LAUNCHER_TAG, "Failed to create custom shortcut", e);
            JSObject res = createResult(false, "创建自定义桌面快捷方式失败: " + e.getMessage());
            res.put("supported", true);
            call.resolve(res);
        }
    }

    private JSObject createResult(boolean success, String message) {
        JSObject res = new JSObject();
        res.put("success", success);
        res.put("message", message);
        return res;
    }
}
