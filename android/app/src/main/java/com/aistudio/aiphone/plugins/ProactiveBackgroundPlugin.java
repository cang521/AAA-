package com.aistudio.aiphone.plugins;

import android.content.Context;
import android.util.Log;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;

import com.aistudio.aiphone.proactive.ProactiveBackgroundStore;
import com.aistudio.aiphone.proactive.ProactiveNativeExecutor;
import com.aistudio.aiphone.proactive.ProactivePeriodicWorker;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.List;
import java.util.concurrent.TimeUnit;

/**
 * Capacitor Plugin bridge for Android WorkManager-driven AI Proactive Message System.
 *
 * Responsibilities:
 * - Idempotently register/cancel the unique 1-hour PeriodicWorkRequest (NEVER triggers an immediate API call on App open!)
 * - Sync non-destructive proactive state snapshot into MODE_PRIVATE Android SharedPreferences
 * - Schedule & cancel unique OneTimeWorkRequests for unreplied follow-up steps (+15m -> +60m) and followUpAt
 * - Drain native background inbox messages & state deltas into WebView IndexedDB/localStorage
 * - Report real WorkManager registration state to Settings UI
 */
@CapacitorPlugin(name = "ProactiveBackground")
public class ProactiveBackgroundPlugin extends Plugin {
    private static final String TAG = "ProactiveBgPlugin";

    /**
     * Idempotently ensure the unique 1-hour PeriodicWorkRequest is registered (or cancelled if disabled).
     * Sets initialDelay=1 hour on KEEP so opening the App NEVER immediately fires a proactive check!
     */
    @PluginMethod
    public void ensureHourlyWorkerRegistered(PluginCall call) {
        try {
            Context context = getContext().getApplicationContext();
            boolean enabled = call.getBoolean("enabled", true);
            WorkManager wm = WorkManager.getInstance(context);

            if (!enabled) {
                wm.cancelUniqueWork(ProactivePeriodicWorker.UNIQUE_WORK_NAME);
                JSObject ret = new JSObject();
                ret.put("registered", false);
                ret.put("workName", ProactivePeriodicWorker.UNIQUE_WORK_NAME);
                call.resolve(ret);
                return;
            }

            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

            PeriodicWorkRequest periodicRequest =
                new PeriodicWorkRequest.Builder(ProactivePeriodicWorker.class, 1, TimeUnit.HOURS)
                    .setInitialDelay(1, TimeUnit.HOURS)
                    .setConstraints(constraints)
                    .addTag(ProactivePeriodicWorker.WORK_TAG)
                    .build();

            // ExistingPeriodicWorkPolicy.KEEP guarantees idempotent registration with zero duplicates
            // and preserves existing schedule across App restarts/upgrades.
            wm.enqueueUniquePeriodicWork(
                ProactivePeriodicWorker.UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest
            );

            JSObject ret = new JSObject();
            ret.put("registered", true);
            ret.put("workName", ProactivePeriodicWorker.UNIQUE_WORK_NAME);
            ret.put("intervalHours", 1);
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "ensureHourlyWorkerRegistered error: " + t.getClass().getSimpleName());
            call.reject("Failed to register hourly WorkManager job");
        }
    }

    @PluginMethod
    public void syncState(PluginCall call) {
        try {
            String snapshotJson = call.getString("snapshotJson", "");
            if (snapshotJson != null && !snapshotJson.trim().isEmpty()) {
                ProactiveBackgroundStore.saveStateSnapshot(getContext().getApplicationContext(), snapshotJson);
            }
            JSObject ret = new JSObject();
            ret.put("synced", true);
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "syncState error: " + t.getClass().getSimpleName());
            call.reject("Failed to sync proactive state");
        }
    }

    @PluginMethod
    public void scheduleFollowUpStep(PluginCall call) {
        try {
            String episodeId = call.getString("episodeId", "");
            String aiId = call.getString("aiId", "");
            String stepId = call.getString("stepId", "");
            int delayMinutes = call.getInt("delayMinutes", 15);

            if (episodeId.isEmpty() || aiId.isEmpty() || stepId.isEmpty()) {
                call.reject("Missing episodeId, aiId, or stepId");
                return;
            }

            ProactiveNativeExecutor.scheduleFollowUpStepWork(
                getContext().getApplicationContext(),
                episodeId,
                aiId,
                stepId,
                delayMinutes
            );

            JSObject ret = new JSObject();
            ret.put("scheduled", true);
            ret.put("workTag", ProactiveNativeExecutor.episodeWorkTag(episodeId));
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "scheduleFollowUpStep error: " + t.getClass().getSimpleName());
            call.reject("Failed to schedule follow-up step");
        }
    }

    @PluginMethod
    public void scheduleFollowUpAt(PluginCall call) {
        try {
            String episodeId = call.getString("episodeId", "");
            String aiId = call.getString("aiId", "");
            String eventId = call.getString("eventId", "");
            Double targetTs = call.getDouble("targetTimestampMs");

            if (aiId.isEmpty() || targetTs == null || targetTs <= 0) {
                call.reject("Missing aiId or targetTimestampMs");
                return;
            }

            ProactiveNativeExecutor.scheduleFollowUpAtWork(
                getContext().getApplicationContext(),
                episodeId,
                aiId,
                eventId,
                targetTs.longValue()
            );

            JSObject ret = new JSObject();
            ret.put("scheduled", true);
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "scheduleFollowUpAt error: " + t.getClass().getSimpleName());
            call.reject("Failed to schedule followUpAt");
        }
    }

    @PluginMethod
    public void cancelEpisodeWork(PluginCall call) {
        try {
            String episodeId = call.getString("episodeId", "");
            if (!episodeId.isEmpty()) {
                ProactiveNativeExecutor.cancelEpisodeWork(getContext().getApplicationContext(), episodeId);
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "cancelEpisodeWork error: " + t.getClass().getSimpleName());
            call.reject("Failed to cancel episode work");
        }
    }

    @PluginMethod
    public void drainPendingInbox(PluginCall call) {
        try {
            JSONObject payload = ProactiveBackgroundStore.drainPendingInbox(getContext().getApplicationContext());
            JSObject ret = new JSObject();
            ret.put("payloadJson", payload.toString());
            call.resolve(ret);
        } catch (Throwable t) {
            Log.w(TAG, "drainPendingInbox error: " + t.getClass().getSimpleName());
            call.reject("Failed to drain native proactive inbox");
        }
    }

    @PluginMethod
    public void getWorkerStatus(PluginCall call) {
        Context context = getContext().getApplicationContext();
        new Thread(() -> {
            JSObject ret = new JSObject();
            try {
                WorkManager wm = WorkManager.getInstance(context);
                List<WorkInfo> infos = wm.getWorkInfosForUniqueWork(ProactivePeriodicWorker.UNIQUE_WORK_NAME)
                    .get(2, TimeUnit.SECONDS);

                boolean registered = false;
                String state = "NOT_REGISTERED";
                if (infos != null && !infos.isEmpty()) {
                    for (WorkInfo info : infos) {
                        WorkInfo.State s = info.getState();
                        state = s.name();
                        if (s == WorkInfo.State.ENQUEUED || s == WorkInfo.State.RUNNING) {
                            registered = true;
                            break;
                        }
                    }
                }
                ret.put("registered", registered);
                ret.put("state", state);
                ret.put("workName", ProactivePeriodicWorker.UNIQUE_WORK_NAME);
                ret.put("intervalHours", 1);
                ret.put("lastInspectionAt", ProactiveBackgroundStore.getLastInspectionAt(context));
                ret.put("lastInspectionSummary", ProactiveBackgroundStore.getLastInspectionSummary(context));
                ret.put("pausedUntil", ProactiveBackgroundStore.getNativePausedUntil(context));
                ret.put("pauseReason", ProactiveBackgroundStore.getNativePauseReason(context));
                call.resolve(ret);
            } catch (Throwable t) {
                ret.put("registered", false);
                ret.put("state", "UNKNOWN");
                ret.put("lastInspectionAt", ProactiveBackgroundStore.getLastInspectionAt(context));
                ret.put("lastInspectionSummary", ProactiveBackgroundStore.getLastInspectionSummary(context));
                call.resolve(ret);
            }
        }).start();
    }
}
