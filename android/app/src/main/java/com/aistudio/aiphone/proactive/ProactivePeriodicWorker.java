package com.aistudio.aiphone.proactive;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Android WorkManager Periodic Worker:
 * Runs once every 1 hour (with NetworkType.CONNECTED constraint) in the background
 * even when the App is closed.
 *
 * Performs strict 12-step local gate checks first — makes ZERO network/API calls
 * if disabled, paused, in quiet hours, or if no real trigger event exists.
 */
public class ProactivePeriodicWorker extends Worker {
    public static final String UNIQUE_WORK_NAME = "xiaoshouji_proactive_hourly_v1";
    public static final String WORK_TAG = "xiaoshouji_proactive_periodic";
    private static final String TAG = "ProactivePeriodicWorker";

    public ProactivePeriodicWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            ProactiveNativeExecutor.runBackgroundInspection(
                getApplicationContext(),
                "hourly_periodic",
                null,
                null
            );
        } catch (Throwable t) {
            Log.w(TAG, "Periodic inspection error: " + t.getClass().getSimpleName());
        }
        // Always return success so WorkManager never enters uncontrolled infinite retry loops.
        // Error backoff and 429 cooldown are persisted and controlled explicitly in ProactiveBackgroundStore.
        return Result.success();
    }
}
