package com.aistudio.aiphone.plugins;

import android.Manifest;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.AppOpsManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;
import android.view.accessibility.AccessibilityManager;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;
import java.util.Set;

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

        // 1. Notification (NotificationManagerCompat.areNotificationsEnabled)
        boolean notifGranted = NotificationManagerCompat.from(context).areNotificationsEnabled();
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
                        // Request runtime POST_NOTIFICATIONS
                        if (getPermissionState("notification") != com.getcapacitor.PermissionState.GRANTED) {
                            requestPermissionForAlias("notification", call, "permissionCallback");
                            return;
                        }
                    }
                    // If below 33 or runtime denied, open notification settings
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

    private JSObject createResult(boolean success, String message) {
        JSObject res = new JSObject();
        res.put("success", success);
        res.put("message", message);
        return res;
    }
}
