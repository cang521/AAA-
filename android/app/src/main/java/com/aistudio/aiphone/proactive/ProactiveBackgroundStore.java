package com.aistudio.aiphone.proactive;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Thread-safe Android native persistent store for the Proactive Message System.
 * Accessible by WorkManager Workers even when the WebView / Activity is completely closed.
 *
 * Security & Privacy:
 * - Stored in MODE_PRIVATE SharedPreferences.
 * - Never logs API keys, private chat content, or Base64 image data.
 */
public final class ProactiveBackgroundStore {
    private static final String TAG = "ProactiveBgStore";
    private static final String PREFS_NAME = "aiphone_proactive_native_v1";

    private static final String KEY_STATE_SNAPSHOT = "state_snapshot_json";
    private static final String KEY_PENDING_INBOX = "pending_inbox_json";
    private static final String KEY_EXECUTED_MSG_IDS = "executed_message_ids_json";
    private static final String KEY_EXECUTED_STEP_IDS = "executed_step_ids_json";
    private static final String KEY_HANDLED_EVENT_IDS = "handled_event_ids_json";
    private static final String KEY_QUOTA_EXHAUSTED_UNTIL = "quota_exhausted_until";
    private static final String KEY_BACKOFF_UNTIL = "backoff_until";
    private static final String KEY_CONSECUTIVE_FAILURES = "consecutive_failures";
    private static final String KEY_LAST_INSPECTION_AT = "last_inspection_at";
    private static final String KEY_LAST_INSPECTION_SUMMARY = "last_inspection_summary";
    private static final String KEY_EXECUTION_LOCK_AT = "execution_lock_at";
    private static final String KEY_NATIVE_PAUSED_UNTIL = "native_paused_until";
    private static final String KEY_NATIVE_PAUSE_REASON = "native_pause_reason";
    private static final String KEY_NATIVE_EPISODES = "native_episodes_json";
    private static final String KEY_NATIVE_RUNTIME = "native_runtime_json";

    private static final long LOCK_TTL_MS = 90_000L; // 90s stale-lock protection
    private static final int MAX_ID_HISTORY = 300;
    private static final Object LOCK = new Object();

    private ProactiveBackgroundStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static boolean tryAcquireExecutionLock(Context context) {
        synchronized (LOCK) {
            SharedPreferences sp = prefs(context);
            long now = System.currentTimeMillis();
            long lockAt = sp.getLong(KEY_EXECUTION_LOCK_AT, 0L);
            if (lockAt > 0L && (now - lockAt) < LOCK_TTL_MS) {
                return false;
            }
            return sp.edit().putLong(KEY_EXECUTION_LOCK_AT, now).commit();
        }
    }

    public static void releaseExecutionLock(Context context) {
        synchronized (LOCK) {
            prefs(context).edit().putLong(KEY_EXECUTION_LOCK_AT, 0L).commit();
        }
    }

    /**
     * Save state snapshot synced from WebView. Non-destructive: merges any native-side
     * pausedUntil/handledEventIds/executedIds so background progress is never lost.
     */
    public static void saveStateSnapshot(Context context, String snapshotJson) {
        if (context == null || snapshotJson == null || snapshotJson.trim().isEmpty()) {
            return;
        }
        synchronized (LOCK) {
            try {
                JSONObject incoming = new JSONObject(snapshotJson);
                SharedPreferences sp = prefs(context);

                // Merge pausedUntil: if user explicitly cleared pause from UI (clearedPause=true), honor clear;
                // otherwise keep max(incoming, nativePausedUntil)
                boolean explicitlyCleared = incoming.optBoolean("pauseExplicitlyCleared", false);
                long incomingPausedUntil = incoming.optLong("pausedUntil", 0L);
                long nativePausedUntil = sp.getLong(KEY_NATIVE_PAUSED_UNTIL, 0L);
                String incomingReason = incoming.optString("pauseReason", "");

                long effectivePausedUntil;
                String effectiveReason;
                if (explicitlyCleared) {
                    effectivePausedUntil = incomingPausedUntil;
                    effectiveReason = incomingReason;
                } else if (nativePausedUntil > incomingPausedUntil && nativePausedUntil > System.currentTimeMillis()) {
                    effectivePausedUntil = nativePausedUntil;
                    effectiveReason = sp.getString(KEY_NATIVE_PAUSE_REASON, incomingReason);
                    incoming.put("pausedUntil", effectivePausedUntil);
                    incoming.put("pauseReason", effectiveReason);
                } else {
                    effectivePausedUntil = incomingPausedUntil;
                    effectiveReason = incomingReason;
                }

                // Merge quotaExhaustedUntil
                long incomingQuota = incoming.optLong("quotaExhaustedUntil", 0L);
                long nativeQuota = sp.getLong(KEY_QUOTA_EXHAUSTED_UNTIL, 0L);
                long effectiveQuota = Math.max(incomingQuota, nativeQuota);

                SharedPreferences.Editor editor = sp.edit();
                editor.putString(KEY_STATE_SNAPSHOT, incoming.toString());
                editor.putLong(KEY_NATIVE_PAUSED_UNTIL, effectivePausedUntil);
                editor.putString(KEY_NATIVE_PAUSE_REASON, effectiveReason != null ? effectiveReason : "");
                editor.putLong(KEY_QUOTA_EXHAUSTED_UNTIL, effectiveQuota);

                if (incoming.has("episodes") && incoming.optJSONArray("episodes") != null) {
                    editor.putString(KEY_NATIVE_EPISODES, incoming.optJSONArray("episodes").toString());
                }
                if (incoming.has("runtimeState") && incoming.optJSONObject("runtimeState") != null) {
                    editor.putString(KEY_NATIVE_RUNTIME, incoming.optJSONObject("runtimeState").toString());
                }
                editor.commit();
            } catch (Exception e) {
                Log.w(TAG, "saveStateSnapshot parse error: " + e.getClass().getSimpleName());
            }
        }
    }

    public static JSONObject loadStateSnapshot(Context context) {
        synchronized (LOCK) {
            try {
                String raw = prefs(context).getString(KEY_STATE_SNAPSHOT, null);
                if (raw == null || raw.trim().isEmpty()) {
                    return null;
                }
                JSONObject obj = new JSONObject(raw);
                long nativePaused = prefs(context).getLong(KEY_NATIVE_PAUSED_UNTIL, 0L);
                long snapPaused = obj.optLong("pausedUntil", 0L);
                if (nativePaused > snapPaused) {
                    obj.put("pausedUntil", nativePaused);
                    obj.put("pauseReason", prefs(context).getString(KEY_NATIVE_PAUSE_REASON, ""));
                }
                String nativeEpisodes = prefs(context).getString(KEY_NATIVE_EPISODES, null);
                if (nativeEpisodes != null) {
                    obj.put("episodes", new JSONArray(nativeEpisodes));
                }
                String nativeRuntime = prefs(context).getString(KEY_NATIVE_RUNTIME, null);
                if (nativeRuntime != null) {
                    obj.put("runtimeState", new JSONObject(nativeRuntime));
                }
                return obj;
            } catch (Exception e) {
                Log.w(TAG, "loadStateSnapshot error: " + e.getClass().getSimpleName());
                return null;
            }
        }
    }

    public static void updateNativePausedUntil(Context context, long candidateUntilMs, String reason) {
        if (candidateUntilMs <= System.currentTimeMillis()) return;
        synchronized (LOCK) {
            SharedPreferences sp = prefs(context);
            long existing = sp.getLong(KEY_NATIVE_PAUSED_UNTIL, 0L);
            if (candidateUntilMs > existing) {
                sp.edit()
                    .putLong(KEY_NATIVE_PAUSED_UNTIL, candidateUntilMs)
                    .putString(KEY_NATIVE_PAUSE_REASON, reason != null ? reason : "AI开启临时免打扰")
                    .commit();
            }
        }
    }

    public static long getNativePausedUntil(Context context) {
        synchronized (LOCK) {
            return prefs(context).getLong(KEY_NATIVE_PAUSED_UNTIL, 0L);
        }
    }

    public static String getNativePauseReason(Context context) {
        synchronized (LOCK) {
            return prefs(context).getString(KEY_NATIVE_PAUSE_REASON, "");
        }
    }

    public static JSONArray loadNativeEpisodes(Context context) {
        synchronized (LOCK) {
            try {
                String raw = prefs(context).getString(KEY_NATIVE_EPISODES, "[]");
                return new JSONArray(raw != null ? raw : "[]");
            } catch (Exception e) {
                return new JSONArray();
            }
        }
    }

    public static void saveNativeEpisodes(Context context, JSONArray episodes) {
        if (episodes == null) return;
        synchronized (LOCK) {
            prefs(context).edit().putString(KEY_NATIVE_EPISODES, episodes.toString()).commit();
        }
    }

    public static JSONObject loadNativeRuntime(Context context) {
        synchronized (LOCK) {
            try {
                String raw = prefs(context).getString(KEY_NATIVE_RUNTIME, "{}");
                return new JSONObject(raw != null ? raw : "{}");
            } catch (Exception e) {
                return new JSONObject();
            }
        }
    }

    public static void saveNativeRuntime(Context context, JSONObject runtime) {
        if (runtime == null) return;
        synchronized (LOCK) {
            prefs(context).edit().putString(KEY_NATIVE_RUNTIME, runtime.toString()).commit();
        }
    }

    private static Set<String> loadIdSet(Context context, String key) {
        Set<String> set = new HashSet<>();
        try {
            String raw = prefs(context).getString(key, "[]");
            JSONArray arr = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < arr.length(); i++) {
                String val = arr.optString(i, "");
                if (!val.isEmpty()) set.add(val);
            }
        } catch (Exception ignored) {
        }
        return set;
    }

    private static void addIdToSet(Context context, String key, String id) {
        if (id == null || id.trim().isEmpty()) return;
        try {
            String raw = prefs(context).getString(key, "[]");
            JSONArray arr = new JSONArray(raw != null ? raw : "[]");
            for (int i = 0; i < arr.length(); i++) {
                if (id.equals(arr.optString(i, ""))) {
                    return;
                }
            }
            arr.put(id);
            JSONArray trimmed = arr;
            if (arr.length() > MAX_ID_HISTORY) {
                trimmed = new JSONArray();
                for (int i = arr.length() - MAX_ID_HISTORY; i < arr.length(); i++) {
                    trimmed.put(arr.optString(i, ""));
                }
            }
            prefs(context).edit().putString(key, trimmed.toString()).commit();
        } catch (Exception ignored) {
        }
    }

    public static boolean isMessageIdExecuted(Context context, String messageId) {
        synchronized (LOCK) {
            return loadIdSet(context, KEY_EXECUTED_MSG_IDS).contains(messageId);
        }
    }

    public static void markMessageIdExecuted(Context context, String messageId) {
        synchronized (LOCK) {
            addIdToSet(context, KEY_EXECUTED_MSG_IDS, messageId);
        }
    }

    public static boolean isStepIdExecuted(Context context, String compositeStepKey) {
        synchronized (LOCK) {
            return loadIdSet(context, KEY_EXECUTED_STEP_IDS).contains(compositeStepKey);
        }
    }

    public static void markStepIdExecuted(Context context, String compositeStepKey) {
        synchronized (LOCK) {
            addIdToSet(context, KEY_EXECUTED_STEP_IDS, compositeStepKey);
        }
    }

    public static boolean isEventIdHandled(Context context, String eventId) {
        synchronized (LOCK) {
            return loadIdSet(context, KEY_HANDLED_EVENT_IDS).contains(eventId);
        }
    }

    public static void markEventIdHandled(Context context, String eventId) {
        synchronized (LOCK) {
            addIdToSet(context, KEY_HANDLED_EVENT_IDS, eventId);
        }
    }

    /**
     * Atomically append a confirmed background message to the pending inbox queue.
     * Returns true ONLY if messageId was not previously executed/enqueued.
     */
    public static boolean enqueuePendingInboxMessage(Context context, JSONObject messageObj) {
        if (context == null || messageObj == null) return false;
        String msgId = messageObj.optString("id", "");
        if (msgId.isEmpty()) return false;

        synchronized (LOCK) {
            if (loadIdSet(context, KEY_EXECUTED_MSG_IDS).contains(msgId)) {
                return false;
            }
            try {
                SharedPreferences sp = prefs(context);
                JSONArray queue = new JSONArray(sp.getString(KEY_PENDING_INBOX, "[]"));
                for (int i = 0; i < queue.length(); i++) {
                    JSONObject existing = queue.optJSONObject(i);
                    if (existing != null && msgId.equals(existing.optString("id", ""))) {
                        return false;
                    }
                }
                queue.put(messageObj);
                boolean committed = sp.edit().putString(KEY_PENDING_INBOX, queue.toString()).commit();
                if (committed) {
                    addIdToSet(context, KEY_EXECUTED_MSG_IDS, msgId);
                }
                return committed;
            } catch (Exception e) {
                Log.w(TAG, "enqueuePendingInboxMessage failed: " + e.getClass().getSimpleName());
                return false;
            }
        }
    }

    /**
     * Drain all pending inbox messages and return full delta payload for WebView merge.
     */
    public static JSONObject drainPendingInbox(Context context) {
        synchronized (LOCK) {
            JSONObject result = new JSONObject();
            try {
                SharedPreferences sp = prefs(context);
                JSONArray queue = new JSONArray(sp.getString(KEY_PENDING_INBOX, "[]"));
                result.put("messages", queue);
                result.put("pausedUntil", sp.getLong(KEY_NATIVE_PAUSED_UNTIL, 0L));
                result.put("pauseReason", sp.getString(KEY_NATIVE_PAUSE_REASON, ""));
                result.put("episodes", new JSONArray(sp.getString(KEY_NATIVE_EPISODES, "[]")));
                result.put("runtimeState", new JSONObject(sp.getString(KEY_NATIVE_RUNTIME, "{}")));
                result.put("quotaExhaustedUntil", sp.getLong(KEY_QUOTA_EXHAUSTED_UNTIL, 0L));
                result.put("lastInspectionAt", sp.getLong(KEY_LAST_INSPECTION_AT, 0L));
                result.put("lastInspectionSummary", sp.getString(KEY_LAST_INSPECTION_SUMMARY, ""));
                result.put("executedStepIds", new JSONArray(sp.getString(KEY_EXECUTED_STEP_IDS, "[]")));
                result.put("executedMessageIds", new JSONArray(sp.getString(KEY_EXECUTED_MSG_IDS, "[]")));
                result.put("handledEventIds", new JSONArray(sp.getString(KEY_HANDLED_EVENT_IDS, "[]")));

                // Clear drained inbox queue only after reading
                sp.edit().putString(KEY_PENDING_INBOX, "[]").commit();
            } catch (Exception e) {
                Log.w(TAG, "drainPendingInbox error: " + e.getClass().getSimpleName());
            }
            return result;
        }
    }

    public static void markQuotaExhausted(Context context, long cooldownMs) {
        synchronized (LOCK) {
            long until = System.currentTimeMillis() + Math.max(60_000L, cooldownMs);
            prefs(context).edit().putLong(KEY_QUOTA_EXHAUSTED_UNTIL, until).commit();
        }
    }

    public static long getQuotaExhaustedUntil(Context context) {
        synchronized (LOCK) {
            return prefs(context).getLong(KEY_QUOTA_EXHAUSTED_UNTIL, 0L);
        }
    }

    public static void recordApiFailureBackoff(Context context) {
        synchronized (LOCK) {
            SharedPreferences sp = prefs(context);
            int failures = Math.min(5, sp.getInt(KEY_CONSECUTIVE_FAILURES, 0) + 1);
            // Exponential backoff: 10m, 20m, 40m, 60m, 60m
            long delayMs = Math.min(60L, 10L * (1L << (failures - 1))) * 60_000L;
            sp.edit()
                .putInt(KEY_CONSECUTIVE_FAILURES, failures)
                .putLong(KEY_BACKOFF_UNTIL, System.currentTimeMillis() + delayMs)
                .commit();
        }
    }

    public static void resetApiFailureBackoff(Context context) {
        synchronized (LOCK) {
            prefs(context).edit()
                .putInt(KEY_CONSECUTIVE_FAILURES, 0)
                .putLong(KEY_BACKOFF_UNTIL, 0L)
                .commit();
        }
    }

    public static long getBackoffUntil(Context context) {
        synchronized (LOCK) {
            return prefs(context).getLong(KEY_BACKOFF_UNTIL, 0L);
        }
    }

    public static void recordInspectionMeta(Context context, String summary) {
        synchronized (LOCK) {
            prefs(context).edit()
                .putLong(KEY_LAST_INSPECTION_AT, System.currentTimeMillis())
                .putString(KEY_LAST_INSPECTION_SUMMARY, summary != null ? summary : "")
                .commit();
        }
    }

    public static long getLastInspectionAt(Context context) {
        synchronized (LOCK) {
            return prefs(context).getLong(KEY_LAST_INSPECTION_AT, 0L);
        }
    }

    public static String getLastInspectionSummary(Context context) {
        synchronized (LOCK) {
            return prefs(context).getString(KEY_LAST_INSPECTION_SUMMARY, "等待首次后台巡检");
        }
    }
}
