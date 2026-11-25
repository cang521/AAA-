package com.aistudio.aiphone.proactive;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.util.Log;

import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import com.aistudio.aiphone.plugins.AndroidPermissionBridge;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

/**
 * Native Android execution engine for background proactive inspections and unreplied follow-up steps.
 *
 * Guarantees:
 * - Runs completely independently of WebView/UI lifecycle when App is closed.
 * - Enforces strict 12-step local inspection BEFORE any network or AI API call.
 * - Executes pre-generated follow-up steps (+15m -> +60m) locally with ZERO AI API calls.
 * - Never logs API keys, private chat content, or Base64 image payloads.
 */
public final class ProactiveNativeExecutor {
    private static final String TAG = "ProactiveNativeExec";
    private static final int AI_PAUSE_MIN_MINUTES = 15;
    private static final int AI_PAUSE_MAX_MINUTES = 24 * 60;
    private static final int MAX_FOLLOWUP_STEPS = 2;

    private ProactiveNativeExecutor() {}

    public static String episodeWorkTag(String episodeId) {
        return "proactive_ep_" + (episodeId != null ? episodeId : "none");
    }

    public static String followUpStepUniqueName(String episodeId, String stepId) {
        return "xiaoshouji_proactive_step_" + episodeId + "_" + stepId;
    }

    public static String followUpAtUniqueName(String episodeId, String eventId) {
        return "xiaoshouji_proactive_at_" + (episodeId != null ? episodeId : eventId);
    }

    public static void scheduleFollowUpStepWork(
        Context context,
        String episodeId,
        String aiId,
        String stepId,
        long delayMinutes
    ) {
        if (context == null || episodeId == null || aiId == null || stepId == null) return;
        long safeDelay = Math.max(1L, delayMinutes);
        Data input = new Data.Builder()
            .putString(ProactiveFollowUpWorker.KEY_MODE, ProactiveFollowUpWorker.MODE_FOLLOWUP_STEP)
            .putString(ProactiveFollowUpWorker.KEY_EPISODE_ID, episodeId)
            .putString(ProactiveFollowUpWorker.KEY_AI_ID, aiId)
            .putString(ProactiveFollowUpWorker.KEY_STEP_ID, stepId)
            .build();

        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(ProactiveFollowUpWorker.class)
            .setInitialDelay(safeDelay, TimeUnit.MINUTES)
            .setInputData(input)
            .addTag(episodeWorkTag(episodeId))
            .addTag("xiaoshouji_proactive_followup")
            .build();

        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniqueWork(
                followUpStepUniqueName(episodeId, stepId),
                ExistingWorkPolicy.KEEP,
                req
            );
    }

    public static void scheduleFollowUpAtWork(
        Context context,
        String episodeId,
        String aiId,
        String eventId,
        long targetTimestampMs
    ) {
        if (context == null || aiId == null) return;
        long delayMs = Math.max(60_000L, targetTimestampMs - System.currentTimeMillis());
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        Data input = new Data.Builder()
            .putString(ProactiveFollowUpWorker.KEY_MODE, ProactiveFollowUpWorker.MODE_FOLLOWUP_AT)
            .putString(ProactiveFollowUpWorker.KEY_EPISODE_ID, episodeId != null ? episodeId : "")
            .putString(ProactiveFollowUpWorker.KEY_AI_ID, aiId)
            .putString(ProactiveFollowUpWorker.KEY_EVENT_ID, eventId != null ? eventId : "")
            .build();

        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(ProactiveFollowUpWorker.class)
            .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
            .setConstraints(constraints)
            .setInputData(input)
            .addTag(episodeWorkTag(episodeId != null ? episodeId : aiId))
            .addTag("xiaoshouji_proactive_followup_at")
            .build();

        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniqueWork(
                followUpAtUniqueName(episodeId, eventId != null ? eventId : aiId),
                ExistingWorkPolicy.REPLACE,
                req
            );
    }

    public static void cancelEpisodeWork(Context context, String episodeId) {
        if (context == null || episodeId == null || episodeId.trim().isEmpty()) return;
        WorkManager.getInstance(context.getApplicationContext())
            .cancelAllWorkByTag(episodeWorkTag(episodeId.trim()));
    }

    /**
     * Execute a pre-generated unreplied follow-up step (+15m -> +60m after previous).
     * Performs ALL 9 local pre-send checks natively and makes ZERO AI API calls!
     */
    public static void executePreGeneratedFollowUpStep(
        Context context,
        String episodeId,
        String aiId,
        String stepId
    ) {
        if (context == null || episodeId == null || aiId == null || stepId == null) return;
        if (!ProactiveBackgroundStore.tryAcquireExecutionLock(context)) {
            return;
        }
        try {
            long now = System.currentTimeMillis();
            String compositeStepKey = episodeId + ":" + stepId;

            // Check 7: stepId already executed
            if (ProactiveBackgroundStore.isStepIdExecuted(context, compositeStepKey)) {
                return;
            }

            JSONObject snapshot = ProactiveBackgroundStore.loadStateSnapshot(context);
            if (snapshot == null) return;

            JSONObject settings = snapshot.optJSONObject("settings");
            if (settings == null || !settings.optBoolean("enabled", true)) return;
            if (!settings.optBoolean("followUpEnabled", true)) return;

            // Per-AI Offline Mode Mutual Exclusion: pause/block follow-up steps for AI currently in Offline Mode (0 API)
            if (containsString(snapshot.optJSONArray("offlineAiIds"), aiId)) {
                ProactiveBackgroundStore.recordInspectionMeta(
                    context,
                    "本地拦截: 角色 [" + aiId + "] 正在线下模式中，跳过追问 (0 API)"
                );
                return;
            }

            // Check 4: "今天别管我"
            if (isDndTodayActive(snapshot, now)) {
                return;
            }

            // Check 3: pausedUntil temporary DND
            long pausedUntil = Math.max(
                snapshot.optLong("pausedUntil", 0L),
                ProactiveBackgroundStore.getNativePausedUntil(context)
            );
            if (pausedUntil > now) {
                return;
            }

            // Check 5: Fixed quiet hours
            JSONObject quietHours = settings.optJSONObject("quietHours");
            if (isInQuietHours(quietHours, now)) {
                return;
            }

            // Load episode and verify checks 1, 2, 6, 8
            JSONArray episodes = ProactiveBackgroundStore.loadNativeEpisodes(context);
            int epIndex = -1;
            JSONObject ep = null;
            for (int i = 0; i < episodes.length(); i++) {
                JSONObject item = episodes.optJSONObject(i);
                if (item != null && episodeId.equals(item.optString("episodeId", ""))) {
                    epIndex = i;
                    ep = item;
                    break;
                }
            }
            if (ep == null) return;

            // Check 1 & 2 & 8: Has user replied? Is episode still waiting_for_user/active? Not cancelled?
            String epStatus = ep.optString("status", "");
            if (!"waiting_for_user".equals(epStatus) && !"active".equals(epStatus)) {
                return;
            }
            if (ep.optLong("answeredAt", 0L) > 0L) {
                return;
            }

            // Verify lastUserMsgAt did not advance past episode start
            JSONObject runtime = ProactiveBackgroundStore.loadNativeRuntime(context);
            JSONObject charStates = runtime.optJSONObject("characterStates");
            JSONObject charRuntime = charStates != null ? charStates.optJSONObject(aiId) : null;
            long lastUserMsgAt = charRuntime != null ? charRuntime.optLong("lastUserMsgAt", 0L) : 0L;
            if (lastUserMsgAt > ep.optLong("startedAt", 0L)) {
                ep.put("status", "answered");
                ep.put("answeredAt", lastUserMsgAt);
                cancelRemainingSteps(ep);
                episodes.put(epIndex, ep);
                ProactiveBackgroundStore.saveNativeEpisodes(context, episodes);
                return;
            }

            // Check 6: Inferred user busy/sleeping state
            String inferredState = ep.optString("inferredUserState", "");
            if (inferredState.contains("上班") || inferredState.contains("开会") || inferredState.contains("睡觉")) {
                return;
            }

            JSONArray plan = ep.optJSONArray("followUpPlan");
            if (plan == null || plan.length() == 0) return;

            int stepIdx = -1;
            JSONObject targetStep = null;
            for (int i = 0; i < plan.length(); i++) {
                JSONObject s = plan.optJSONObject(i);
                if (s != null && stepId.equals(s.optString("stepId", ""))) {
                    stepIdx = i;
                    targetStep = s;
                    break;
                }
            }
            if (targetStep == null) return;
            if (!"pending".equals(targetStep.optString("status", ""))) {
                return;
            }

            JSONArray stepMessages = targetStep.optJSONArray("messages");
            if (stepMessages == null || stepMessages.length() == 0) return;

            String charName = findCharacterName(snapshot, aiId);
            boolean notifyEnabled = settings.optBoolean("systemNotificationsEnabled", true);
            JSONArray sentMsgIds = new JSONArray();
            JSONArray epMsgIds = ep.optJSONArray("proactiveMessageIds");
            if (epMsgIds == null) epMsgIds = new JSONArray();

            int deliveredCount = 0;
            for (int i = 0; i < stepMessages.length(); i++) {
                String text = stepMessages.optString(i, "").trim();
                if (text.isEmpty() || looksLikeRawJsonLeak(text)) continue;

                // Check 9: Deterministic messageId deduplication
                String messageId = "msg_proactive_" + episodeId + "_" + stepId + "_" + i;
                if (ProactiveBackgroundStore.isMessageIdExecuted(context, messageId)) {
                    continue;
                }

                long msgTs = now + i * 250L;
                JSONObject msgObj = buildInboxMessage(
                    messageId,
                    aiId,
                    text,
                    msgTs,
                    episodeId,
                    stepId,
                    ep.optString("triggerSource", "followup"),
                    ep.optString("eventId", ""),
                    ep.optString("currentIntent", "未回复追问"),
                    i,
                    stepMessages.length()
                );

                // Persist FIRST before notifying!
                if (ProactiveBackgroundStore.enqueuePendingInboxMessage(context, msgObj)) {
                    deliveredCount++;
                    sentMsgIds.put(messageId);
                    epMsgIds.put(messageId);
                    if (notifyEnabled) {
                        AndroidPermissionBridge.postBackgroundAiNotification(
                            context,
                            aiId,
                            charName,
                            text,
                            msgTs,
                            messageId
                        );
                    }
                }
            }

            if (deliveredCount > 0) {
                ProactiveBackgroundStore.markStepIdExecuted(context, compositeStepKey);
                targetStep.put("status", "sent");
                targetStep.put("executedAt", now);
                targetStep.put("messageIds", sentMsgIds);
                plan.put(stepIdx, targetStep);

                ep.put("proactiveMessageIds", epMsgIds);
                ep.put("sentCount", ep.optInt("sentCount", 0) + 1);
                ep.put("updatedAt", now);

                // Schedule next follow-up step if one exists (e.g. follow_2 at +60m after follow_1)
                boolean hasNextPending = false;
                for (int j = stepIdx + 1; j < plan.length() && j < MAX_FOLLOWUP_STEPS; j++) {
                    JSONObject nextStep = plan.optJSONObject(j);
                    if (nextStep != null && "pending".equals(nextStep.optString("status", ""))) {
                        long nextDelay = nextStep.optLong("delayAfterPreviousMinutes", 60L);
                        if (nextDelay < 15L) nextDelay = 60L;
                        nextStep.put("scheduledAt", now + nextDelay * 60_000L);
                        plan.put(j, nextStep);
                        scheduleFollowUpStepWork(
                            context,
                            episodeId,
                            aiId,
                            nextStep.optString("stepId", "follow_2"),
                            nextDelay
                        );
                        hasNextPending = true;
                        break;
                    }
                }

                if (!hasNextPending) {
                    // Max 2 follow-up steps reached -> stop pursuing automatically
                    ep.put("status", "completed");
                    ep.put("closedAt", now);
                }

                ep.put("followUpPlan", plan);
                episodes.put(epIndex, ep);
                ProactiveBackgroundStore.saveNativeEpisodes(context, episodes);

                // Update lastProactiveMsgAt (do NOT increment daily episode count for follow-up steps!)
                if (charRuntime != null) {
                    charRuntime.put("lastProactiveMsgAt", now);
                    charRuntime.put("lastUnrepliedProactiveAt", now);
                    charStates.put(aiId, charRuntime);
                    runtime.put("characterStates", charStates);
                    ProactiveBackgroundStore.saveNativeRuntime(context, runtime);
                }

                ProactiveBackgroundStore.recordInspectionMeta(
                    context,
                    "本地追问步骤 " + stepId + " 已送达 (0次API调用)"
                );
            }
        } catch (Throwable t) {
            Log.w(TAG, "executePreGeneratedFollowUpStep failed: " + t.getClass().getSimpleName());
        } finally {
            ProactiveBackgroundStore.releaseExecutionLock(context);
        }
    }

    /**
     * Hourly Periodic / followUpAt Background Inspection.
     * Follows the exact 12-step local gate order BEFORE any API call.
     */
    public static void runBackgroundInspection(
        Context context,
        String sourceReason,
        String targetAiId,
        String explicitEventId
    ) {
        if (context == null) return;
        if (!ProactiveBackgroundStore.tryAcquireExecutionLock(context)) {
            return;
        }
        try {
            long now = System.currentTimeMillis();

            // Check 429 quota cooldown & 503 backoff
            if (ProactiveBackgroundStore.getQuotaExhaustedUntil(context) > now) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: 429配额冷却中 (0 API)");
                return;
            }
            if (ProactiveBackgroundStore.getBackoffUntil(context) > now) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: 503退避冷却中 (0 API)");
                return;
            }

            JSONObject snapshot = ProactiveBackgroundStore.loadStateSnapshot(context);
            if (snapshot == null) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地跳过: 尚未同步主动消息状态");
                return;
            }

            JSONObject settings = snapshot.optJSONObject("settings");
            // Step 1: Master toggle + Android hourly background switch
            if (settings == null || !settings.optBoolean("enabled", false)) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: 主动消息总开关已关闭 (0 API)");
                return;
            }
            if (!settings.optBoolean("androidBackgroundEnabled", true)) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: Android后台巡检已关闭 (0 API)");
                return;
            }

            // Step 2: Global "今天别管我"
            if (isDndTodayActive(snapshot, now)) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: 今天别管我已开启 (0 API)");
                return;
            }

            // Step 3: Temporary DND pausedUntil
            long pausedUntil = Math.max(
                snapshot.optLong("pausedUntil", 0L),
                ProactiveBackgroundStore.getNativePausedUntil(context)
            );
            if (pausedUntil > now) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地拦截: 临时免打扰生效中 (0 API)");
                return;
            }

            // Step 4: Fixed quiet hours
            JSONObject quietHours = settings.optJSONObject("quietHours");
            boolean inQuietHours = isInQuietHours(quietHours, now);
            boolean allowHighBypass = settings.optBoolean("allowHighPriorityBypassQuiet", true);

            JSONArray characters = snapshot.optJSONArray("characters");
            if (characters == null || characters.length() == 0) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地跳过: 无可用AI角色 (0 API)");
                return;
            }

            JSONObject runtime = ProactiveBackgroundStore.loadNativeRuntime(context);
            JSONObject charStates = runtime.optJSONObject("characterStates");
            if (charStates == null) {
                charStates = new JSONObject();
                runtime.put("characterStates", charStates);
            }

            JSONObject perAiConfigs = settings.optJSONObject("perAiConfigs");
            JSONObject aiPermissions = snapshot.optJSONObject("aiPermissions");
            JSONArray thinkingAiIds = snapshot.optJSONArray("thinkingAiIds");
            JSONArray offlineAiIds = snapshot.optJSONArray("offlineAiIds");
            JSONArray episodes = ProactiveBackgroundStore.loadNativeEpisodes(context);
            JSONArray lifeEvents = snapshot.optJSONArray("lifeEvents");
            JSONObject weatherSnapshot = snapshot.optJSONObject("weatherSnapshot");

            String todayStr = formatTodayDate(now);
            int dailyCap = Math.max(1, settings.optInt("dailyCap", 3));
            int minCooldownMinutes = Math.max(15, settings.optInt("minCooldownMinutes", 120));

            // Select at most 1 highest-priority real trigger event across authorized characters per hourly run
            JSONObject selectedChar = null;
            JSONObject selectedEvent = null;
            int selectedWeight = 0;

            for (int i = 0; i < characters.length(); i++) {
                JSONObject ch = characters.optJSONObject(i);
                if (ch == null) continue;
                String aiId = ch.optString("id", "");
                if (aiId.isEmpty()) continue;
                if (targetAiId != null && !targetAiId.isEmpty() && !targetAiId.equals(aiId)) {
                    continue;
                }

                // Step 5: Per-AI proactive permission & proactive_chat !== DENY
                if (!isCharacterAuthorized(settings, perAiConfigs, aiPermissions, aiId)) {
                    continue;
                }

                // Step 5.5: Per-AI Offline Mode Mutual Exclusion (0 API calls; other AIs continue normally)
                if (containsString(offlineAiIds, aiId)) {
                    continue;
                }

                // Step 6: AI not currently executing a reply task
                if (containsString(thinkingAiIds, aiId)) {
                    continue;
                }

                // Skip if character already has an active waiting_for_user episode with pending follow-ups
                if (hasWaitingEpisodeWithPendingFollowUp(episodes, aiId)) {
                    continue;
                }

                JSONObject charRuntime = getOrInitCharRuntime(charStates, aiId, todayStr);

                // Step 8: Daily episode cap (counts episodes, not bubbles)
                int dailyCount = charRuntime.optInt("dailyProactiveCount", 0);
                if (dailyCount >= dailyCap) {
                    continue;
                }

                // Step 9: Minimum cooldown for new episodes
                long lastProactiveAt = charRuntime.optLong("lastProactiveMsgAt", 0L);
                long minutesSinceProactive = (now - lastProactiveAt) / 60_000L;

                // Step 10: Evaluate REAL trigger events locally
                JSONObject candidate = evaluateRealLocalTrigger(
                    context,
                    settings,
                    perAiConfigs != null ? perAiConfigs.optJSONObject(aiId) : null,
                    aiId,
                    charRuntime,
                    lifeEvents,
                    weatherSnapshot,
                    explicitEventId,
                    todayStr,
                    now
                );

                if (candidate == null) {
                    continue;
                }

                String priority = candidate.optString("priority", "low");
                int weight = "high".equals(priority) ? 3 : ("medium".equals(priority) ? 2 : 1);

                // Quiet hours check with high-priority override rule
                if (inQuietHours && (!"high".equals(priority) || !allowHighBypass)) {
                    continue;
                }

                // Cooldown check (high priority weather alert can bypass)
                if (!"high".equals(priority) && lastProactiveAt > 0L && minutesSinceProactive < minCooldownMinutes) {
                    continue;
                }

                // Step 7: EventId deduplication
                String eventId = candidate.optString("eventId", "");
                if (eventId.isEmpty()
                    || ProactiveBackgroundStore.isEventIdHandled(context, eventId)
                    || containsString(charRuntime.optJSONArray("handledEventIds"), eventId)) {
                    continue;
                }

                if (weight > selectedWeight) {
                    selectedWeight = weight;
                    selectedChar = ch;
                    selectedEvent = candidate;
                }
            }

            // Step 11: No real trigger passed all local checks -> exit immediately with 0 API calls!
            if (selectedChar == null || selectedEvent == null) {
                ProactiveBackgroundStore.recordInspectionMeta(
                    context,
                    "每小时本地巡检完成: 无满足条件的真实事件 (0 API)"
                );
                return;
            }

            // Step 12: All 12 local checks passed -> call AI API using stored private apiConfig
            JSONObject apiConfig = snapshot.optJSONObject("apiConfig");
            if (apiConfig == null) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "本地跳过: 未配置后台API参数");
                return;
            }

            String aiId = selectedChar.optString("id", "");
            String charName = selectedChar.optString("name", "AI好友");
            String eventId = selectedEvent.optString("eventId", "");
            String triggerType = selectedEvent.optString("triggerType", "inactivity_timeout");

            String prompt = buildStructuredPrompt(snapshot, selectedChar, selectedEvent, now);
            ApiCallResult apiResult = callAiProviderDirectly(apiConfig, selectedChar, prompt);
            enqueueBackgroundApiMonitorLog(
                context,
                apiResult,
                charName,
                triggerType,
                eventId
            );

            if (apiResult.httpStatus == 429) {
                ProactiveBackgroundStore.markQuotaExhausted(context, 30 * 60_000L);
                ProactiveBackgroundStore.recordInspectionMeta(context, "API配额超限(429)，已开启30分钟冷却");
                return;
            }
            if (apiResult.httpStatus == 503 || apiResult.httpStatus >= 500) {
                ProactiveBackgroundStore.recordApiFailureBackoff(context);
                ProactiveBackgroundStore.recordInspectionMeta(context, "当前模型繁忙，请稍后重试 (已进入退避)");
                return;
            }
            if (!apiResult.success || apiResult.rawText == null || apiResult.rawText.trim().isEmpty()) {
                // Network offline or transient error: preserve event for next cycle
                ProactiveBackgroundStore.recordInspectionMeta(context, "网络暂不可用，事件已保留待下次巡检");
                return;
            }

            ProactiveBackgroundStore.resetApiFailureBackoff(context);

            // Strict JSON Schema validation
            JSONObject parsed = parseAndValidateStructuredJson(apiResult.rawText);
            if (parsed == null) {
                // Malformed JSON -> safe exit, NEVER write raw JSON to chat!
                ProactiveBackgroundStore.recordInspectionMeta(context, "模型返回非合法JSON，已安全丢弃");
                return;
            }

            String action = parsed.optString("action", "defer");
            String intent = parsed.optString("intent", triggerType);
            String eventStatus = parsed.optString("eventStatus", "waiting_for_user");
            int pauseMins = clampAiPauseMinutes(parsed.optInt("pauseProactiveMinutes", 0));
            long followUpAtMs = parseFollowUpAtMs(parsed.opt("followUpAt"), now);

            // Apply AI-returned temporary pause (15m..24h, never shortens existing pause)
            if (pauseMins > 0) {
                ProactiveBackgroundStore.updateNativePausedUntil(
                    context,
                    now + pauseMins * 60_000L,
                    "AI主动设置临时免打扰 (" + pauseMins + "分钟)"
                );
            }

            if ("cancel".equals(action) || "close".equals(action)) {
                ProactiveBackgroundStore.markEventIdHandled(context, eventId);
                ProactiveBackgroundStore.recordInspectionMeta(context, "AI决定结束/取消本次主动触发 (" + action + ")");
                return;
            }

            if ("defer".equals(action)) {
                if (followUpAtMs > now) {
                    scheduleFollowUpAtWork(context, "ep_defer_" + aiId + "_" + now, aiId, eventId, followUpAtMs);
                }
                ProactiveBackgroundStore.recordInspectionMeta(context, "AI决定延后发送 (defer)");
                return;
            }

            // action == "send"
            JSONArray messages = parsed.optJSONArray("messages");
            if (messages == null || messages.length() == 0) {
                ProactiveBackgroundStore.recordInspectionMeta(context, "AI返回空消息数组，已跳过发送");
                return;
            }

            String episodeId = "ep_bg_" + aiId + "_" + now;
            JSONArray sentMsgIds = new JSONArray();
            boolean notifyEnabled = settings.optBoolean("systemNotificationsEnabled", true);
            int deliveredCount = 0;

            for (int i = 0; i < messages.length() && i < 3; i++) {
                String text = messages.optString(i, "").trim();
                if (text.isEmpty() || looksLikeRawJsonLeak(text)) continue;

                String messageId = "msg_proactive_" + episodeId + "_init_" + i;
                long msgTs = now + i * 250L;
                JSONObject msgObj = buildInboxMessage(
                    messageId,
                    aiId,
                    text,
                    msgTs,
                    episodeId,
                    "initial",
                    triggerType,
                    eventId,
                    intent,
                    i,
                    messages.length()
                );

                // Persist to native inbox FIRST -> then post Android notification!
                if (ProactiveBackgroundStore.enqueuePendingInboxMessage(context, msgObj)) {
                    deliveredCount++;
                    sentMsgIds.put(messageId);
                    if (notifyEnabled) {
                        AndroidPermissionBridge.postBackgroundAiNotification(
                            context,
                            aiId,
                            charName,
                            text,
                            msgTs,
                            messageId
                        );
                    }
                }
            }

            if (deliveredCount == 0) {
                return;
            }

            // Mark eventId handled and increment daily EPISODE count by 1 (not by bubble count!)
            ProactiveBackgroundStore.markEventIdHandled(context, eventId);
            JSONObject charRuntime = getOrInitCharRuntime(charStates, aiId, todayStr);
            charRuntime.put("lastProactiveMsgAt", now);
            charRuntime.put("lastUnrepliedProactiveAt", now);
            charRuntime.put("lastConversationAt", now);
            charRuntime.put("dailyProactiveCount", charRuntime.optInt("dailyProactiveCount", 0) + 1);
            JSONArray handledArr = charRuntime.optJSONArray("handledEventIds");
            if (handledArr == null) handledArr = new JSONArray();
            handledArr.put(eventId);
            charRuntime.put("handledEventIds", handledArr);
            charStates.put(aiId, charRuntime);
            runtime.put("characterStates", charStates);
            runtime.put("lastGlobalCheckAt", now);
            ProactiveBackgroundStore.saveNativeRuntime(context, runtime);

            // Persist Episode & schedule pre-generated followUpPlan (15m -> 60m) if enabled & waiting_for_user
            JSONArray normalizedPlan = normalizeFollowUpPlan(parsed.optJSONArray("followUpPlan"));
            boolean followUpEnabled = settings.optBoolean("followUpEnabled", true);
            JSONObject newEp = new JSONObject();
            newEp.put("episodeId", episodeId);
            newEp.put("characterId", aiId);
            newEp.put("status", (followUpEnabled && normalizedPlan.length() > 0 && "waiting_for_user".equals(eventStatus))
                ? "waiting_for_user"
                : "completed");
            newEp.put("startedAt", now);
            newEp.put("updatedAt", now);
            newEp.put("triggerSource", triggerType);
            newEp.put("eventId", eventId);
            newEp.put("currentIntent", intent);
            newEp.put("currentTopic", parsed.optString("topic", triggerType));
            newEp.put("inferredUserState", parsed.optString("inferredUserState", ""));
            newEp.put("baseMessageIds", new JSONArray());
            newEp.put("proactiveMessageIds", sentMsgIds);
            newEp.put("rejectedAttempts", new JSONArray());
            newEp.put("attemptCount", 1);
            newEp.put("sentCount", 1);
            newEp.put("pauseProactiveMinutes", pauseMins);
            newEp.put("followUpPlan", normalizedPlan);

            if (followUpEnabled && normalizedPlan.length() > 0 && "waiting_for_user".equals(eventStatus)) {
                JSONObject firstStep = normalizedPlan.optJSONObject(0);
                if (firstStep != null) {
                    long delayMin = firstStep.optLong("delayMinutes", 15L);
                    if (delayMin < 5L) delayMin = 15L;
                    firstStep.put("scheduledAt", now + delayMin * 60_000L);
                    normalizedPlan.put(0, firstStep);
                    newEp.put("followUpPlan", normalizedPlan);
                    scheduleFollowUpStepWork(
                        context,
                        episodeId,
                        aiId,
                        firstStep.optString("stepId", "follow_1"),
                        delayMin
                    );
                }
            } else if (followUpAtMs > now) {
                newEp.put("followUpAt", followUpAtMs);
                scheduleFollowUpAtWork(context, episodeId, aiId, eventId, followUpAtMs);
            }

            episodes.put(newEp);
            ProactiveBackgroundStore.saveNativeEpisodes(context, episodes);

            ProactiveBackgroundStore.recordInspectionMeta(
                context,
                "后台巡检触发(" + sourceReason + "): 已送达 " + deliveredCount + " 条消息"
            );
        } catch (Throwable t) {
            Log.w(TAG, "runBackgroundInspection error: " + t.getClass().getSimpleName());
        } finally {
            ProactiveBackgroundStore.releaseExecutionLock(context);
        }
    }

    private static JSONObject evaluateRealLocalTrigger(
        Context context,
        JSONObject settings,
        JSONObject perAiConfig,
        String aiId,
        JSONObject charRuntime,
        JSONArray lifeEvents,
        JSONObject weatherSnapshot,
        String explicitEventId,
        String todayStr,
        long now
    ) {
        try {
            // 1. Weather alert snapshot
            JSONObject weatherCfg = settings.optJSONObject("weather");
            if (weatherCfg != null && weatherCfg.optBoolean("enabled", false) && weatherSnapshot != null) {
                JSONArray alerts = weatherSnapshot.optJSONArray("alerts");
                if (alerts != null && alerts.length() > 0 && weatherCfg.optBoolean("severeWeather", true)) {
                    JSONObject alert = alerts.optJSONObject(0);
                    String title = alert != null ? alert.optString("title", "极端天气预警") : "极端天气预警";
                    String eventId = "weather_alert_" + todayStr + "_" + title;
                    JSONObject evt = new JSONObject();
                    evt.put("triggerType", "weather_alert");
                    evt.put("priority", "high");
                    evt.put("eventId", eventId);
                    evt.put("summary", title + "：" + (alert != null ? alert.optString("description", "") : ""));
                    return evt;
                }
            }

            // 2. Pending life events due
            JSONObject lifeCfg = settings.optJSONObject("lifeState");
            if ((lifeCfg == null || (lifeCfg.optBoolean("enabled", true) && lifeCfg.optBoolean("allowProactiveFollowup", true)))
                && lifeEvents != null) {
                for (int i = 0; i < lifeEvents.length(); i++) {
                    JSONObject le = lifeEvents.optJSONObject(i);
                    if (le == null) continue;
                    String st = le.optString("status", "");
                    if (!"pending".equals(st) && !"ongoing".equals(st) && !"waiting".equals(st)) continue;
                    if (le.optInt("followUpCount", 0) >= 5) continue;
                    JSONArray allowedChars = le.optJSONArray("allowedCharacterIds");
                    if (allowedChars != null && allowedChars.length() > 0 && !containsString(allowedChars, aiId)) {
                        continue;
                    }
                    long due = le.optLong("nextFollowUpAt", le.optLong("createdAt", now) + 4 * 3600_000L);
                    if (now >= due) {
                        String leId = le.optString("id", "le_" + i);
                        String eventId = "life_evt_follow_" + leId + "_" + todayStr + "_" + aiId;
                        if (explicitEventId != null && !explicitEventId.isEmpty() && !explicitEventId.equals(eventId)) {
                            continue;
                        }
                        JSONObject evt = new JSONObject();
                        evt.put("triggerType", "life_event_followup");
                        evt.put("priority", le.optInt("importance", 3) >= 4 ? "high" : "medium");
                        evt.put("eventId", eventId);
                        evt.put("summary", le.optString("title", "近期关注事项") + " " + le.optString("summary", ""));
                        return evt;
                    }
                }
            }

            // 3. Important custom events due
            JSONObject impCfg = settings.optJSONObject("importantEvents");
            if (impCfg != null && impCfg.optBoolean("enabled", true)) {
                JSONArray customEvents = impCfg.optJSONArray("customEvents");
                if (customEvents != null) {
                    for (int i = 0; i < customEvents.length(); i++) {
                        JSONObject ce = customEvents.optJSONObject(i);
                        if (ce == null) continue;
                        String dateStr = ce.optString("date", "");
                        int remindBefore = ce.optInt("remindBeforeDays", 1);
                        int daysRem = calcDaysDiff(todayStr, dateStr);
                        if (daysRem >= 0 && daysRem <= remindBefore) {
                            String eventId = "important_evt_" + ce.optString("id", String.valueOf(i)) + "_" + todayStr;
                            JSONObject evt = new JSONObject();
                            evt.put("triggerType", "important_event");
                            evt.put("priority", "medium");
                            evt.put("eventId", eventId);
                            evt.put("summary", "重要日程：" + ce.optString("title", "重要事项") + " (" + dateStr + ")");
                            return evt;
                        }
                    }
                }
            }

            // 4. Inactivity timeout (ONLY if genuine prior user chat exists!)
            JSONObject inactCfg = settings.optJSONObject("inactivity");
            long lastUserMsgAt = charRuntime.optLong("lastUserMsgAt", 0L);
            if (inactCfg != null && inactCfg.optBoolean("enabled", true) && lastUserMsgAt > 0L) {
                int thresholdHours = (perAiConfig != null && perAiConfig.optInt("inactivityHours", 0) > 0)
                    ? perAiConfig.optInt("inactivityHours", 12)
                    : inactCfg.optInt("hours", 12);
                double hoursInactive = (now - lastUserMsgAt) / 3600_000.0;
                if (hoursInactive >= thresholdHours) {
                    long lastProactiveAt = charRuntime.optLong("lastProactiveMsgAt", 0L);
                    long lastUnrepliedAt = charRuntime.optLong("lastUnrepliedProactiveAt", 0L);
                    boolean hasUnreplied = lastUnrepliedAt > lastUserMsgAt;
                    double requiredCooldownHours = hasUnreplied ? thresholdHours * 2.0 : thresholdHours;
                    double hoursSinceProactive = (now - lastProactiveAt) / 3600_000.0;
                    if (hoursSinceProactive >= requiredCooldownHours) {
                        String eventId = "inactivity_" + aiId + "_" + (now / (6 * 3600_000L));
                        JSONObject evt = new JSONObject();
                        evt.put("triggerType", "inactivity_timeout");
                        evt.put("priority", "low");
                        evt.put("eventId", eventId);
                        evt.put("summary", "距离上次真实聊天已过去约 " + Math.max(1, (int) Math.floor(hoursInactive)) + " 小时");
                        return evt;
                    }
                }
            }

            // 5. Real device low battery via Android BatteryManager
            JSONObject devCfg = settings.optJSONObject("deviceEvents");
            if (devCfg != null && devCfg.optBoolean("enabled", true) && devCfg.optBoolean("lowBattery", true)) {
                Intent batteryStatus = context.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                if (batteryStatus != null) {
                    int level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                    int scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                    int status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                    boolean charging = status == BatteryManager.BATTERY_STATUS_CHARGING
                        || status == BatteryManager.BATTERY_STATUS_FULL;
                    int pct = (level >= 0 && scale > 0) ? (level * 100 / scale) : 100;
                    if (pct <= 15 && !charging) {
                        String eventId = "device_battery_" + todayStr + "_" + aiId;
                        JSONObject evt = new JSONObject();
                        evt.put("triggerType", "device_life_event");
                        evt.put("priority", "low");
                        evt.put("eventId", eventId);
                        evt.put("summary", "手机真实电量低至 " + pct + "% 且未在充电");
                        return evt;
                    }
                }
            }

            // 6. Time greetings (only if user has prior conversation context & didn't chat in last 30m)
            JSONObject greetCfg = settings.optJSONObject("greetings");
            if (greetCfg != null && greetCfg.optBoolean("enabled", true) && lastUserMsgAt > 0L) {
                Calendar cal = Calendar.getInstance();
                cal.setTimeInMillis(now);
                int hour = cal.get(Calendar.HOUR_OF_DAY);
                int min = cal.get(Calendar.MINUTE);
                String greetType = null;
                if (greetCfg.optBoolean("morning", true) && hour >= 6 && hour < 9) {
                    greetType = "morning";
                } else if (greetCfg.optBoolean("noon", true) && ((hour == 11 && min >= 30) || hour == 12 || (hour == 13 && min <= 30))) {
                    greetType = "noon";
                } else if (greetCfg.optBoolean("night", true) && (hour == 21 || hour == 22 || (hour == 23 && min <= 30))) {
                    greetType = "night";
                }
                long lastConv = charRuntime.optLong("lastConversationAt", 0L);
                if (greetType != null && (now - lastConv) >= 30 * 60_000L) {
                    String eventId = "greeting_" + greetType + "_" + todayStr + "_" + aiId;
                    JSONObject evt = new JSONObject();
                    evt.put("triggerType", "greeting");
                    evt.put("priority", "low");
                    evt.put("eventId", eventId);
                    evt.put("summary", "当前处于 " + greetType + " 问候时段");
                    return evt;
                }
            }
        } catch (Throwable t) {
            Log.w(TAG, "evaluateRealLocalTrigger error: " + t.getClass().getSimpleName());
        }
        return null;
    }

    private static String buildStructuredPrompt(
        JSONObject snapshot,
        JSONObject character,
        JSONObject triggerEvent,
        long now
    ) {
        StringBuilder sb = new StringBuilder();
        String charName = character.optString("name", "AI好友");
        String userName = snapshot.optString("userName", "用户");
        String timeStr = new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA).format(new Date(now));

        sb.append("你正在扮演微信好友【").append(charName).append("】。\n");
        sb.append("人设：").append(character.optString("persona", "")).append("\n");
        sb.append("性格口吻：").append(character.optString("personality", "自然亲切")).append("\n");
        String rel = character.optString("relationship", "");
        if (!rel.isEmpty()) sb.append("与用户关系：").append(rel).append("\n");
        sb.append("用户昵称：").append(userName).append("\n");
        sb.append("当前真实时间：").append(timeStr).append("\n");
        sb.append("本次真实触发事件：[").append(triggerEvent.optString("triggerType", "")).append("] ")
            .append(triggerEvent.optString("summary", "")).append("\n\n");

        sb.append("近期聊天上下文：\n");
        JSONArray recentMsgs = character.optJSONArray("recentMessages");
        if (recentMsgs != null && recentMsgs.length() > 0) {
            for (int i = 0; i < recentMsgs.length(); i++) {
                JSONObject m = recentMsgs.optJSONObject(i);
                if (m == null) continue;
                String sender = "user".equals(m.optString("sender", "")) ? userName : charName;
                sb.append("- ").append(sender).append(": ").append(m.optString("text", "")).append("\n");
            }
        } else {
            sb.append("(近期暂无更多记录)\n");
        }

        sb.append("\n请严格只输出一个合法 JSON 对象（不要输出多余解释或 Markdown 代码块）：\n");
        sb.append("{\n");
        sb.append("  \"action\": \"send\" | \"defer\" | \"cancel\" | \"close\",\n");
        sb.append("  \"messages\": [\"首条自然短消息\"],\n");
        sb.append("  \"pauseProactiveMinutes\": 0,\n");
        sb.append("  \"followUpPlan\": [\n");
        sb.append("    { \"stepId\": \"follow_1\", \"delayMinutes\": 15, \"messages\": [\"15分钟未回复时的轻柔补问\"] },\n");
        sb.append("    { \"stepId\": \"follow_2\", \"delayAfterPreviousMinutes\": 60, \"messages\": [\"再过1小时仍未回复时的最后一句温柔收尾\"] }\n");
        sb.append("  ],\n");
        sb.append("  \"followUpAt\": null,\n");
        sb.append("  \"eventStatus\": \"waiting_for_user\" | \"scheduled\" | \"answered\" | \"completed\" | \"cancelled\",\n");
        sb.append("  \"intent\": \"本次主动联系意图简述\",\n");
        sb.append("  \"topic\": \"当前话题\"\n");
        sb.append("}\n");
        sb.append("规则：\n");
        sb.append("1. 若适合发送，action 为 send，messages 填 1~2 条自然微信口语短句；\n");
        sb.append("2. 若用户未回复时希望按 15分钟+1小时 轻量追问，请一次性在 followUpPlan 中生成最多 2 步，不催促不指责；\n");
        sb.append("3. 若判断此时不宜打扰，action 填 defer 或 close，messages 为空数组 []，可设置 pauseProactiveMinutes (15~1440)。\n");
        return sb.toString();
    }

    private static final class ApiCallResult {
        boolean success;
        int httpStatus;
        String rawText;
        String provider;
        String model;
        String errorType;
        long durationMs;
    }

    private static void enqueueBackgroundApiMonitorLog(
        Context context,
        ApiCallResult result,
        String charName,
        String triggerType,
        String eventId
    ) {
        try {
            long now = System.currentTimeMillis();
            String requestId = "bg_" + (eventId != null && !eventId.isEmpty() ? eventId : "event") + "_" + now;
            JSONObject log = new JSONObject();
            log.put("id", "log_native_" + now + "_" + Math.abs(requestId.hashCode()));
            log.put("appName", "后台主动消息");
            log.put("timestamp", now);
            log.put("provider", result.provider != null ? result.provider : "unknown");
            log.put("modelName", result.model != null ? result.model : "unknown-model");
            log.put("interfaceType", "NativeProactiveGenerate");
            log.put("category", "text_generation");
            log.put("status", result.success ? "success" : "failed");
            log.put("httpStatus", result.httpStatus);
            log.put("requestId", requestId);
            log.put("durationMs", result.durationMs);
            log.put("isRealTokens", false);
            log.put("costDisplay", "未提供");
            log.put("purpose", "后台主动消息：" + charName + "（" + triggerType + "）");
            if (!result.success) {
                log.put("errorType", result.errorType != null ? result.errorType : "NativeBackgroundApiError");
                log.put("errorMessage", result.httpStatus > 0
                    ? "后台模型请求失败，HTTP " + result.httpStatus
                    : "后台模型请求未成功建立连接");
            }
            ProactiveBackgroundStore.enqueuePendingApiLog(context, log);
        } catch (Throwable ignored) {
            // Monitoring must never interrupt proactive delivery.
        }
    }

    private static ApiCallResult callAiProviderDirectly(
        JSONObject apiConfig,
        JSONObject character,
        String prompt
    ) {
        ApiCallResult result = new ApiCallResult();
        HttpURLConnection conn = null;
        long startedAt = System.currentTimeMillis();
        try {
            String apiKey = apiConfig.optString("textApiKey", "").trim();
            String baseUrl = apiConfig.optString("textBaseUrl", "").trim();
            String provider = apiConfig.optString("textProvider", "gemini").trim().toLowerCase(Locale.US);
            String model = character.optString("modelName", "").trim();
            if (model.isEmpty()) {
                model = apiConfig.optString("textModel", "gemini-2.5-flash").trim();
            }
            result.provider = provider;
            result.model = model;
            if (apiKey.isEmpty()) {
                result.success = false;
                result.errorType = "MISSING_API_KEY";
                return result;
            }

            boolean isGeminiNative = provider.contains("gemini")
                && !provider.contains("openai")
                && (baseUrl.isEmpty() || baseUrl.contains("generativelanguage.googleapis.com"));

            URL url;
            String requestBody;

            if (isGeminiNative) {
                String root = baseUrl.isEmpty() ? "https://generativelanguage.googleapis.com" : baseUrl.replaceAll("/+$", "");
                String endpoint = root + "/v1beta/models/" + model + ":generateContent";
                url = new URL(endpoint);

                JSONObject part = new JSONObject().put("text", prompt);
                JSONObject content = new JSONObject().put("role", "user").put("parts", new JSONArray().put(part));
                JSONObject genCfg = new JSONObject().put("temperature", 0.7).put("responseMimeType", "application/json");
                JSONObject body = new JSONObject()
                    .put("contents", new JSONArray().put(content))
                    .put("generationConfig", genCfg);
                requestBody = body.toString();
            } else {
                String root = baseUrl.isEmpty() ? "https://api.openai.com/v1" : baseUrl.replaceAll("/+$", "");
                String endpoint = root.endsWith("/chat/completions") ? root : (root + "/chat/completions");
                url = new URL(endpoint);

                JSONObject msg = new JSONObject().put("role", "user").put("content", prompt);
                JSONObject body = new JSONObject()
                    .put("model", model)
                    .put("messages", new JSONArray().put(msg))
                    .put("temperature", 0.7);
                requestBody = body.toString();
            }

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(15_000);
            conn.setReadTimeout(35_000);
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");

            if (isGeminiNative) {
                conn.setRequestProperty("x-goog-api-key", apiKey);
            } else {
                conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            }

            JSONObject customHeaders = apiConfig.optJSONObject("customHeaders");
            if (customHeaders != null) {
                Iterator<String> keys = customHeaders.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    String v = customHeaders.optString(k, "");
                    if (!k.isEmpty() && !v.isEmpty()) {
                        conn.setRequestProperty(k, v);
                    }
                }
            }

            try (OutputStream os = conn.getOutputStream()) {
                os.write(requestBody.getBytes(StandardCharsets.UTF_8));
            }

            result.httpStatus = conn.getResponseCode();
            InputStream stream = (result.httpStatus >= 200 && result.httpStatus < 300)
                ? conn.getInputStream()
                : conn.getErrorStream();

            String respBody = readStream(stream);
            if (result.httpStatus >= 200 && result.httpStatus < 300 && respBody != null) {
                result.rawText = extractTextFromProviderResponse(respBody, isGeminiNative);
                result.success = result.rawText != null && !result.rawText.trim().isEmpty();
            } else {
                result.success = false;
                result.errorType = "HTTP_" + result.httpStatus;
            }
        } catch (Throwable t) {
            Log.w(TAG, "Direct AI call failed: " + t.getClass().getSimpleName());
            result.success = false;
            result.errorType = t.getClass().getSimpleName();
        } finally {
            result.durationMs = System.currentTimeMillis() - startedAt;
            if (conn != null) {
                conn.disconnect();
            }
        }
        return result;
    }

    private static String extractTextFromProviderResponse(String body, boolean isGeminiNative) {
        try {
            JSONObject root = new JSONObject(body);
            if (isGeminiNative) {
                JSONArray candidates = root.optJSONArray("candidates");
                if (candidates != null && candidates.length() > 0) {
                    JSONObject c0 = candidates.optJSONObject(0);
                    JSONObject content = c0 != null ? c0.optJSONObject("content") : null;
                    JSONArray parts = content != null ? content.optJSONArray("parts") : null;
                    if (parts != null && parts.length() > 0) {
                        StringBuilder sb = new StringBuilder();
                        for (int i = 0; i < parts.length(); i++) {
                            JSONObject p = parts.optJSONObject(i);
                            if (p != null && p.has("text")) {
                                sb.append(p.optString("text", ""));
                            }
                        }
                        return sb.toString();
                    }
                }
            } else {
                JSONArray choices = root.optJSONArray("choices");
                if (choices != null && choices.length() > 0) {
                    JSONObject ch0 = choices.optJSONObject(0);
                    JSONObject msg = ch0 != null ? ch0.optJSONObject("message") : null;
                    if (msg != null) {
                        return msg.optString("content", "");
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return null;
    }

    private static JSONObject parseAndValidateStructuredJson(String rawText) {
        if (rawText == null) return null;
        try {
            String cleaned = rawText
                .replaceAll("(?s)<think>.*?</think>", "")
                .replaceAll("(?i)```json", "")
                .replace("```", "")
                .trim();

            JSONObject obj;
            if (cleaned.startsWith("{")) {
                obj = new JSONObject(cleaned);
            } else {
                int start = cleaned.indexOf('{');
                int end = cleaned.lastIndexOf('}');
                if (start < 0 || end <= start) return null;
                obj = new JSONObject(cleaned.substring(start, end + 1));
            }

            String rawAction = obj.optString("action", "").trim().toLowerCase(Locale.US);
            if ("send_new".equals(rawAction) || "continue".equals(rawAction) || "change_direction".equals(rawAction)) {
                rawAction = "send";
            } else if ("wait".equals(rawAction)) {
                rawAction = "defer";
            } else if ("end_episode".equals(rawAction)) {
                rawAction = "close";
            }
            if (!"send".equals(rawAction) && !"defer".equals(rawAction)
                && !"cancel".equals(rawAction) && !"close".equals(rawAction)) {
                return null;
            }
            obj.put("action", rawAction);

            JSONArray cleanMsgs = new JSONArray();
            if ("send".equals(rawAction)) {
                JSONArray rawMsgs = obj.optJSONArray("messages");
                if (rawMsgs != null) {
                    for (int i = 0; i < rawMsgs.length() && cleanMsgs.length() < 3; i++) {
                        String m = rawMsgs.optString(i, "").trim();
                        if (!m.isEmpty() && !looksLikeRawJsonLeak(m)) {
                            cleanMsgs.put(m);
                        }
                    }
                } else {
                    String single = obj.optString("candidateText", obj.optString("text", "")).trim();
                    if (!single.isEmpty() && !looksLikeRawJsonLeak(single)) {
                        cleanMsgs.put(single);
                    }
                }
                if (cleanMsgs.length() == 0) {
                    return null;
                }
            }
            obj.put("messages", cleanMsgs);
            return obj;
        } catch (Exception e) {
            return null;
        }
    }

    private static JSONArray normalizeFollowUpPlan(JSONArray rawPlan) {
        JSONArray result = new JSONArray();
        if (rawPlan == null) return result;
        try {
            for (int i = 0; i < rawPlan.length() && result.length() < MAX_FOLLOWUP_STEPS; i++) {
                JSONObject item = rawPlan.optJSONObject(i);
                if (item == null) continue;
                JSONArray rawMsgs = item.optJSONArray("messages");
                JSONArray cleanMsgs = new JSONArray();
                if (rawMsgs != null) {
                    for (int m = 0; m < rawMsgs.length() && cleanMsgs.length() < 2; m++) {
                        String txt = rawMsgs.optString(m, "").trim();
                        if (!txt.isEmpty() && !looksLikeRawJsonLeak(txt)) {
                            cleanMsgs.put(txt);
                        }
                    }
                }
                if (cleanMsgs.length() == 0) continue;

                int idx = result.length();
                JSONObject step = new JSONObject();
                String stepId = item.optString("stepId", "follow_" + (idx + 1)).trim();
                if (stepId.isEmpty()) stepId = "follow_" + (idx + 1);
                step.put("stepId", stepId);
                step.put("messages", cleanMsgs);
                step.put("status", "pending");
                if (idx == 0) {
                    long delay = item.optLong("delayMinutes", 15L);
                    if (delay < 5L || delay > 120L) delay = 15L;
                    step.put("delayMinutes", delay);
                } else {
                    long delayAfter = item.optLong("delayAfterPreviousMinutes", item.optLong("delayMinutes", 60L));
                    if (delayAfter < 15L || delayAfter > 240L) delayAfter = 60L;
                    step.put("delayAfterPreviousMinutes", delayAfter);
                }
                result.put(step);
            }
        } catch (Exception ignored) {
        }
        return result;
    }

    private static int clampAiPauseMinutes(int raw) {
        if (raw <= 0) return 0;
        return Math.min(AI_PAUSE_MAX_MINUTES, Math.max(AI_PAUSE_MIN_MINUTES, raw));
    }

    private static long parseFollowUpAtMs(Object raw, long now) {
        if (raw == null || raw == JSONObject.NULL) return 0L;
        if (raw instanceof Number) {
            long val = ((Number) raw).longValue();
            if (val > 0 && val < 1_000_000_000_000L) val *= 1000L;
            if (val >= now + 5 * 60_000L && val <= now + 7L * 24 * 3600_000L) {
                return val;
            }
        }
        return 0L;
    }

    private static boolean looksLikeRawJsonLeak(String text) {
        if (text == null) return false;
        String t = text.trim();
        if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
            return true;
        }
        return t.contains("\"followUpPlan\"") || t.contains("\"pauseProactiveMinutes\"") || t.contains("```json");
    }

    private static JSONObject buildInboxMessage(
        String messageId,
        String aiId,
        String text,
        long timestamp,
        String episodeId,
        String stepId,
        String triggerType,
        String eventId,
        String intent,
        int bubbleIndex,
        int totalBubbles
    ) throws Exception {
        JSONObject meta = new JSONObject();
        meta.put("episodeId", episodeId);
        meta.put("stepId", stepId);
        meta.put("triggerType", triggerType);
        meta.put("eventId", eventId);
        meta.put("sourceSystem", "androidBackgroundWorker");
        meta.put("intent", intent);
        meta.put("generatedAt", timestamp);
        meta.put("bubbleIndex", bubbleIndex);
        meta.put("totalBubbles", totalBubbles);
        meta.put("repliedByUser", false);
        meta.put("fromBackgroundWorker", true);

        JSONObject msg = new JSONObject();
        msg.put("id", messageId);
        msg.put("characterId", aiId);
        msg.put("sender", "ai");
        msg.put("text", text);
        msg.put("timestamp", timestamp);
        msg.put("turnId", "turn_bg_" + episodeId + "_" + stepId);
        msg.put("turnBubbleIndex", bubbleIndex);
        msg.put("turnTotalBubbles", totalBubbles);
        msg.put("isProactive", true);
        msg.put("proactiveMeta", meta);
        return msg;
    }

    private static boolean isDndTodayActive(JSONObject snapshot, long now) {
        if (!snapshot.optBoolean("doNotDisturbToday", false)) return false;
        String dndDate = snapshot.optString("doNotDisturbDate", "");
        if (dndDate.isEmpty()) return true;
        return formatTodayDate(now).equals(dndDate);
    }

    private static boolean isInQuietHours(JSONObject quietHours, long now) {
        if (quietHours == null || !quietHours.optBoolean("enabled", false)) return false;
        String start = quietHours.optString("startStr", "23:30");
        String end = quietHours.optString("endStr", "08:00");
        Calendar cal = Calendar.getInstance();
        cal.setTimeInMillis(now);
        String cur = String.format(Locale.US, "%02d:%02d", cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE));
        if (start.compareTo(end) > 0) {
            return cur.compareTo(start) >= 0 || cur.compareTo(end) < 0;
        }
        return cur.compareTo(start) >= 0 && cur.compareTo(end) < 0;
    }

    private static boolean isCharacterAuthorized(
        JSONObject settings,
        JSONObject perAiConfigs,
        JSONObject aiPermissions,
        String aiId
    ) {
        boolean allowedInSettings;
        JSONObject perAi = perAiConfigs != null ? perAiConfigs.optJSONObject(aiId) : null;
        if (perAi != null && perAi.has("enabled")) {
            allowedInSettings = perAi.optBoolean("enabled", false);
        } else {
            allowedInSettings = settings.optBoolean("allowAllCharacters", true)
                || containsString(settings.optJSONArray("allowedCharacterIds"), aiId);
        }
        if (!allowedInSettings) return false;
        if (aiPermissions != null && "DENY".equalsIgnoreCase(aiPermissions.optString(aiId, ""))) {
            return false;
        }
        return true;
    }

    private static boolean hasWaitingEpisodeWithPendingFollowUp(JSONArray episodes, String aiId) {
        if (episodes == null) return false;
        for (int i = 0; i < episodes.length(); i++) {
            JSONObject ep = episodes.optJSONObject(i);
            if (ep == null) continue;
            if (!aiId.equals(ep.optString("characterId", ""))) continue;
            String st = ep.optString("status", "");
            if ("waiting_for_user".equals(st) || "active".equals(st)) {
                JSONArray plan = ep.optJSONArray("followUpPlan");
                if (plan != null) {
                    for (int j = 0; j < plan.length(); j++) {
                        JSONObject step = plan.optJSONObject(j);
                        if (step != null && "pending".equals(step.optString("status", ""))) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private static void cancelRemainingSteps(JSONObject ep) {
        try {
            JSONArray plan = ep.optJSONArray("followUpPlan");
            if (plan == null) return;
            for (int i = 0; i < plan.length(); i++) {
                JSONObject s = plan.optJSONObject(i);
                if (s != null && "pending".equals(s.optString("status", ""))) {
                    s.put("status", "cancelled");
                    plan.put(i, s);
                }
            }
            ep.put("followUpPlan", plan);
        } catch (Exception ignored) {
        }
    }

    private static JSONObject getOrInitCharRuntime(JSONObject charStates, String aiId, String todayStr) {
        try {
            JSONObject cr = charStates.optJSONObject(aiId);
            if (cr == null) {
                cr = new JSONObject();
                cr.put("lastUserMsgAt", 0L);
                cr.put("lastConversationAt", 0L);
                cr.put("lastProactiveMsgAt", 0L);
                cr.put("dailyProactiveCount", 0);
                cr.put("lastCountResetDateStr", todayStr);
                cr.put("handledEventIds", new JSONArray());
                charStates.put(aiId, cr);
            } else if (!todayStr.equals(cr.optString("lastCountResetDateStr", ""))) {
                cr.put("dailyProactiveCount", 0);
                cr.put("lastCountResetDateStr", todayStr);
            }
            return cr;
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    private static String findCharacterName(JSONObject snapshot, String aiId) {
        JSONArray chars = snapshot.optJSONArray("characters");
        if (chars != null) {
            for (int i = 0; i < chars.length(); i++) {
                JSONObject c = chars.optJSONObject(i);
                if (c != null && aiId.equals(c.optString("id", ""))) {
                    return c.optString("name", "AI好友");
                }
            }
        }
        return "AI好友";
    }

    private static boolean containsString(JSONArray arr, String target) {
        if (arr == null || target == null) return false;
        for (int i = 0; i < arr.length(); i++) {
            if (target.equals(arr.optString(i, ""))) return true;
        }
        return false;
    }

    private static String formatTodayDate(long now) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
    }

    private static int calcDaysDiff(String fromDateStr, String toDateStr) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            Date d1 = sdf.parse(fromDateStr);
            Date d2 = sdf.parse(toDateStr);
            if (d1 == null || d2 == null) return -1;
            long diff = d2.getTime() - d1.getTime();
            return (int) Math.round(diff / 86_400_000.0);
        } catch (Exception e) {
            return -1;
        }
    }

    private static String readStream(InputStream is) {
        if (is == null) return null;
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
