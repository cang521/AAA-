package com.aistudio.aiphone.testing;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.aistudio.aiphone.proactive.ProactiveNativeExecutor;

/** One-shot worker used only by the removable in-app Testing application. */
public class ProactiveDiagnosticWorker extends Worker {
    public ProactiveDiagnosticWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        ProactiveNativeExecutor.runBackgroundInspection(
            getApplicationContext(),
            "manual_diagnostic",
            null,
            null
        );
        return Result.success();
    }
}
