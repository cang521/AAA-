package com.aistudio.aiphone.plugins;

import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.aistudio.aiphone.proactive.ProactiveBackgroundStore;
import com.aistudio.aiphone.proactive.ProactivePeriodicWorker;
import com.aistudio.aiphone.testing.ProactiveDiagnosticWorker;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Removable diagnostics bridge. Production features never depend on this plugin;
 * deleting the Testing app only requires removing this class and its registration.
 */
@CapacitorPlugin(name = "Diagnostics")
public class DiagnosticsPlugin extends Plugin {
    private static final String DIAGNOSTIC_WORK_NAME = "xiaoshouji_diagnostic_proactive_now_v1";

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context context = getContext().getApplicationContext();
        new Thread(() -> {
            JSObject ret = new JSObject();
            try {
                List<WorkInfo> periodic = WorkManager.getInstance(context)
                    .getWorkInfosForUniqueWork(ProactivePeriodicWorker.UNIQUE_WORK_NAME)
                    .get(3, TimeUnit.SECONDS);
                boolean registered = false;
                String periodicState = "NOT_REGISTERED";
                if (periodic != null) {
                    for (WorkInfo info : periodic) {
                        periodicState = info.getState().name();
                        if (info.getState() == WorkInfo.State.ENQUEUED || info.getState() == WorkInfo.State.RUNNING) {
                            registered = true;
                            break;
                        }
                    }
                }

                List<WorkInfo> diagnostic = WorkManager.getInstance(context)
                    .getWorkInfosForUniqueWork(DIAGNOSTIC_WORK_NAME)
                    .get(3, TimeUnit.SECONDS);
                String diagnosticState = "NOT_RUN";
                if (diagnostic != null && !diagnostic.isEmpty()) {
                    diagnosticState = diagnostic.get(0).getState().name();
                }

                PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                boolean batteryUnrestricted = pm != null &&
                    (Build.VERSION.SDK_INT < Build.VERSION_CODES.M || pm.isIgnoringBatteryOptimizations(context.getPackageName()));

                ret.put("isNativeAndroid", true);
                ret.put("sdkVersion", Build.VERSION.SDK_INT);
                ret.put("manufacturer", Build.MANUFACTURER);
                ret.put("model", Build.MODEL);
                ret.put("workerRegistered", registered);
                ret.put("workerState", periodicState);
                ret.put("diagnosticState", diagnosticState);
                ret.put("notificationsEnabled", NotificationManagerCompat.from(context).areNotificationsEnabled());
                ret.put("batteryUnrestricted", batteryUnrestricted);
                ret.put("snapshotReady", ProactiveBackgroundStore.hasStateSnapshot(context));
                ret.put("lastInspectionAt", ProactiveBackgroundStore.getLastInspectionAt(context));
                ret.put("lastInspectionSummary", ProactiveBackgroundStore.getLastInspectionSummary(context));
                ret.put("pausedUntil", ProactiveBackgroundStore.getNativePausedUntil(context));
                ret.put("pauseReason", ProactiveBackgroundStore.getNativePauseReason(context));
                call.resolve(ret);
            } catch (Throwable t) {
                ret.put("isNativeAndroid", true);
                ret.put("workerRegistered", false);
                ret.put("workerState", "ERROR");
                ret.put("diagnosticState", "ERROR");
                ret.put("error", t.getClass().getSimpleName());
                call.resolve(ret);
            }
        }).start();
    }

    @PluginMethod
    public void runProactiveDiagnostic(PluginCall call) {
        try {
            Context context = getContext().getApplicationContext();
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ProactiveDiagnosticWorker.class)
                .setConstraints(constraints)
                .addTag(DIAGNOSTIC_WORK_NAME)
                .build();
            WorkManager.getInstance(context).enqueueUniqueWork(
                DIAGNOSTIC_WORK_NAME,
                ExistingWorkPolicy.REPLACE,
                request
            );
            JSObject ret = new JSObject();
            ret.put("enqueued", true);
            ret.put("workId", request.getId().toString());
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("无法提交后台测试任务: " + t.getClass().getSimpleName());
        }
    }
}
