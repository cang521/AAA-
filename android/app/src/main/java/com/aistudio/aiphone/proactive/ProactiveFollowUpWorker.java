package com.aistudio.aiphone.proactive;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Android WorkManager OneTime Worker for:
 * 1. Pre-generated unreplied follow-up steps (+15m -> +60m after previous): ZERO AI API calls!
 * 2. Explicit followUpAt timestamps requested by AI or life events.
 */
public class ProactiveFollowUpWorker extends Worker {
    public static final String KEY_MODE = "mode";
    public static final String MODE_FOLLOWUP_STEP = "follow_up_step";
    public static final String MODE_FOLLOWUP_AT = "follow_up_at";

    public static final String KEY_EPISODE_ID = "episodeId";
    public static final String KEY_AI_ID = "aiId";
    public static final String KEY_STEP_ID = "stepId";
    public static final String KEY_EVENT_ID = "eventId";

    private static final String TAG = "ProactiveFollowUpWorker";

    public ProactiveFollowUpWorker(@NonNull Context context, @NonNull WorkerParameters workerParams) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        try {
            String mode = getInputData().getString(KEY_MODE);
            String episodeId = getInputData().getString(KEY_EPISODE_ID);
            String aiId = getInputData().getString(KEY_AI_ID);
            String stepId = getInputData().getString(KEY_STEP_ID);
            String eventId = getInputData().getString(KEY_EVENT_ID);

            if (MODE_FOLLOWUP_STEP.equals(mode)) {
                ProactiveNativeExecutor.executePreGeneratedFollowUpStep(
                    getApplicationContext(),
                    episodeId,
                    aiId,
                    stepId
                );
            } else if (MODE_FOLLOWUP_AT.equals(mode)) {
                ProactiveNativeExecutor.runBackgroundInspection(
                    getApplicationContext(),
                    "follow_up_at",
                    aiId,
                    eventId
                );
            }
        } catch (Throwable t) {
            Log.w(TAG, "FollowUpWorker error: " + t.getClass().getSimpleName());
        }
        return Result.success();
    }
}
