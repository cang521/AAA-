package com.aistudio.aiphone.plugins;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Safe two-phase APK launcher icon & app name switcher using Android activity-alias.
 *
 * Phase 1: Synchronously commit pending state, enable target alias (keep old alias enabled),
 *          and perform a controlled task rebuild to the target alias.
 * Phase 2: Once MainActivity launches via the new alias (or recovers from an interrupted switch),
 *          commit activePresetId, clear switchInProgress/pending state, and safely disable old aliases.
 */
public final class LauncherAppearanceManager {
    public static final String TAG = "LauncherAppearance";
    public static final String LAUNCHER_PREFS_NAME = "aiphone_launcher_prefs";

    public static final String KEY_ACTIVE_PRESET_ID = "activePresetId";
    public static final String KEY_PENDING_PRESET_ID = "pendingPresetId";
    public static final String KEY_SWITCH_IN_PROGRESS = "switchInProgress";
    public static final String KEY_PREVIOUS_ALIAS = "previousAlias";
    public static final String KEY_TARGET_ALIAS = "targetAlias";

    // Legacy key cleanup compatibility
    private static final String LEGACY_KEY_ACTIVE_PRESET_ID = "active_launcher_preset_id";

    public static final String EXTRA_SWITCH_TARGET_PRESET = "launcher_switch_target_preset";
    public static final String EXTRA_RECOVERY_RELAUNCHED = "launcher_recovery_relaunched";

    private static final long CONTROLLED_RESTART_DELAY_MS = 180L;

    public static final Map<String, String> LAUNCHER_PRESET_ALIASES;
    static {
        Map<String, String> map = new LinkedHashMap<>();
        map.put("default", ".LauncherDefault");
        map.put("xiaoshouji", ".LauncherXiaoshouji");
        map.put("cloud_milk", ".LauncherCloudMilk");
        map.put("starlight", ".LauncherStarlight");
        map.put("minimal", ".LauncherMinimal");
        LAUNCHER_PRESET_ALIASES = Collections.unmodifiableMap(map);
    }

    private LauncherAppearanceManager() {}

    public static SharedPreferences getPrefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(LAUNCHER_PREFS_NAME, Context.MODE_PRIVATE);
    }

    public static String getAliasForPreset(String presetId) {
        return LAUNCHER_PRESET_ALIASES.get(presetId);
    }

    public static String getPresetForComponent(String pkg, ComponentName component) {
        if (component == null || component.getClassName() == null) {
            return null;
        }
        String className = component.getClassName();
        for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
            String fullAlias = pkg + entry.getValue();
            if (fullAlias.equals(className) || entry.getValue().equals(className)) {
                return entry.getKey();
            }
        }
        return null;
    }

    public static boolean isAliasEffectivelyEnabled(PackageManager pm, String pkg, String presetId, String aliasClass) {
        ComponentName cn = new ComponentName(pkg, pkg + aliasClass);
        int state = pm.getComponentEnabledSetting(cn);
        if (state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
            return true;
        }
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER
            || state == PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED) {
            return false;
        }
        // COMPONENT_ENABLED_STATE_DEFAULT follows AndroidManifest.xml android:enabled attribute
        return "default".equals(presetId);
    }

    public static String formatStateName(int state) {
        switch (state) {
            case PackageManager.COMPONENT_ENABLED_STATE_DEFAULT:
                return "DEFAULT";
            case PackageManager.COMPONENT_ENABLED_STATE_ENABLED:
                return "ENABLED";
            case PackageManager.COMPONENT_ENABLED_STATE_DISABLED:
                return "DISABLED";
            case PackageManager.COMPONENT_ENABLED_STATE_DISABLED_USER:
                return "DISABLED_USER";
            case PackageManager.COMPONENT_ENABLED_STATE_DISABLED_UNTIL_USED:
                return "DISABLED_UNTIL_USED";
            default:
                return "UNKNOWN(" + state + ")";
        }
    }

    public static void logAllAliasStates(Context context, String phaseLabel) {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        SharedPreferences prefs = getPrefs(context);
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
            String presetId = entry.getKey();
            String alias = entry.getValue();
            int rawState = pm.getComponentEnabledSetting(new ComponentName(pkg, pkg + alias));
            boolean effective = isAliasEffectivelyEnabled(pm, pkg, presetId, alias);
            if (sb.length() > 0) sb.append(", ");
            sb.append(presetId).append("(").append(alias).append(")=")
              .append(formatStateName(rawState)).append("/eff=").append(effective);
        }
        Log.i(
            TAG,
            "[" + phaseLabel + "] aliases={" + sb + "}"
                + " | prefs={activePresetId=" + readSavedActivePreset(prefs)
                + ", pendingPresetId=" + prefs.getString(KEY_PENDING_PRESET_ID, "")
                + ", switchInProgress=" + prefs.getBoolean(KEY_SWITCH_IN_PROGRESS, false)
                + ", previousAlias=" + prefs.getString(KEY_PREVIOUS_ALIAS, "")
                + ", targetAlias=" + prefs.getString(KEY_TARGET_ALIAS, "") + "}"
        );
    }

    private static String readSavedActivePreset(SharedPreferences prefs) {
        String active = prefs.getString(KEY_ACTIVE_PRESET_ID, "");
        if (active == null || active.isEmpty()) {
            active = prefs.getString(LEGACY_KEY_ACTIVE_PRESET_ID, "default");
        }
        return LAUNCHER_PRESET_ALIASES.containsKey(active) ? active : "default";
    }

    /**
     * Read ONLY the completed active launcher preset ID (never pendingPresetId),
     * falling back safely to "default". Used by notification small-icon resolution.
     */
    public static String getConfirmedActivePresetId(Context context) {
        if (context == null) {
            return "default";
        }
        return readSavedActivePreset(getPrefs(context));
    }

    public static List<String> getEnabledPresetIds(Context context) {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        List<String> enabled = new ArrayList<>();
        for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
            if (isAliasEffectivelyEnabled(pm, pkg, entry.getKey(), entry.getValue())) {
                enabled.add(entry.getKey());
            }
        }
        return enabled;
    }

    /**
     * Resolve the genuinely active preset ID using real PackageManager states + Manifest defaults first,
     * falling back to pendingPresetId / saved activePresetId when multiple aliases are temporarily enabled.
     * Guarantees at least LauncherDefault is enabled if 0 aliases were enabled.
     */
    public static String resolveActiveLauncherPresetId(Context context) {
        SharedPreferences prefs = getPrefs(context);
        List<String> enabled = getEnabledPresetIds(context);

        if (enabled.isEmpty()) {
            Log.w(TAG, "No launcher alias enabled! Emergency restoring .LauncherDefault.");
            ensureSinglePresetEnabledFallback(context);
            return "default";
        }

        if (enabled.size() == 1) {
            String realPreset = enabled.get(0);
            String saved = readSavedActivePreset(prefs);
            if (!realPreset.equals(saved) && !prefs.getBoolean(KEY_SWITCH_IN_PROGRESS, false)) {
                prefs.edit().putString(KEY_ACTIVE_PRESET_ID, realPreset).commit();
                Log.i(TAG, "Synchronized activePresetId in SharedPreferences to real PackageManager state: " + realPreset);
            }
            return realPreset;
        }

        // Multiple aliases enabled (e.g. interrupted switch)
        String pending = prefs.getString(KEY_PENDING_PRESET_ID, "");
        if (pending != null && !pending.isEmpty() && enabled.contains(pending)) {
            return pending;
        }
        String saved = readSavedActivePreset(prefs);
        if (enabled.contains(saved)) {
            return saved;
        }
        for (String id : enabled) {
            if (!"default".equals(id)) {
                return id;
            }
        }
        return enabled.get(0);
    }

    private static void setSingleComponentEnabled(PackageManager pm, ComponentName cn, boolean enable) {
        int newState = enable
            ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED
            : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setComponentsBatchApi33(
                pm,
                Collections.singletonList(
                    new ComponentSettingSpec(cn, newState, PackageManager.DONT_KILL_APP)
                )
            );
        } else {
            pm.setComponentEnabledSetting(cn, newState, PackageManager.DONT_KILL_APP);
        }
    }

    private static final class ComponentSettingSpec {
        final ComponentName componentName;
        final int newState;
        final int flags;

        ComponentSettingSpec(ComponentName componentName, int newState, int flags) {
            this.componentName = componentName;
            this.newState = newState;
            this.flags = flags;
        }
    }

    @SuppressLint("NewApi")
    private static void setComponentsBatchApi33(PackageManager pm, List<ComponentSettingSpec> specs) {
        List<PackageManager.ComponentEnabledSetting> list = new ArrayList<>(specs.size());
        for (ComponentSettingSpec spec : specs) {
            list.add(new PackageManager.ComponentEnabledSetting(spec.componentName, spec.newState, spec.flags));
        }
        pm.setComponentEnabledSettings(list);
    }

    private static void disableOtherAliasesSafely(Context context, String keepPresetId) {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        String keepAlias = getAliasForPreset(keepPresetId);

        if (keepAlias == null || !isAliasEffectivelyEnabled(pm, pkg, keepPresetId, keepAlias)) {
            Log.e(TAG, "Refusing to disable other aliases because target preset is not enabled: " + keepPresetId);
            return;
        }

        List<ComponentSettingSpec> disableSpecs = new ArrayList<>();
        for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
            String presetId = entry.getKey();
            String aliasClass = entry.getValue();
            if (presetId.equals(keepPresetId)) {
                continue;
            }
            ComponentName cn = new ComponentName(pkg, pkg + aliasClass);
            int beforeState = pm.getComponentEnabledSetting(cn);
            boolean wasEffective = isAliasEffectivelyEnabled(pm, pkg, presetId, aliasClass);
            if (wasEffective || beforeState != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
                disableSpecs.add(
                    new ComponentSettingSpec(cn, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
                );
            }
        }

        if (disableSpecs.isEmpty()) {
            Log.i(TAG, "No stale aliases needed disabling; keepPresetId=" + keepPresetId);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            setComponentsBatchApi33(pm, disableSpecs);
            Log.i(TAG, "Disabled " + disableSpecs.size() + " old alias(es) atomically via API 33 setComponentEnabledSettings; kept=" + keepAlias);
        } else {
            for (ComponentSettingSpec spec : disableSpecs) {
                pm.setComponentEnabledSetting(spec.componentName, spec.newState, spec.flags);
            }
            Log.i(TAG, "Disabled " + disableSpecs.size() + " old alias(es) sequentially (< API 33); kept=" + keepAlias);
        }
    }

    private static void ensureSinglePresetEnabledFallback(Context context) {
        PackageManager pm = context.getPackageManager();
        String pkg = context.getPackageName();
        try {
            ComponentName defaultCn = new ComponentName(pkg, pkg + ".LauncherDefault");
            setSingleComponentEnabled(pm, defaultCn, true);
            disableOtherAliasesSafely(context, "default");
            getPrefs(context).edit()
                .putString(KEY_ACTIVE_PRESET_ID, "default")
                .putBoolean(KEY_SWITCH_IN_PROGRESS, false)
                .remove(KEY_PENDING_PRESET_ID)
                .remove(KEY_PREVIOUS_ALIAS)
                .remove(KEY_TARGET_ALIAS)
                .commit();
            Log.i(TAG, "Fallback recovery completed: restored .LauncherDefault as sole active entrypoint");
        } catch (Exception e) {
            Log.e(TAG, "Emergency .LauncherDefault recovery failed", e);
        }
    }

    public static JSObject buildStatusResult(Context context, boolean supportsPinShortcut) {
        String activeId = resolveActiveLauncherPresetId(context);
        SharedPreferences prefs = getPrefs(context);
        JSArray available = new JSArray();
        for (String id : LAUNCHER_PRESET_ALIASES.keySet()) {
            available.put(id);
        }

        JSObject ret = new JSObject();
        ret.put("isNativeAndroid", true);
        ret.put("activePresetId", activeId);
        ret.put("pendingPresetId", prefs.getString(KEY_PENDING_PRESET_ID, ""));
        ret.put("switchInProgress", prefs.getBoolean(KEY_SWITCH_IN_PROGRESS, false));
        ret.put("supportsPinShortcut", supportsPinShortcut);
        ret.put("availablePresets", available);
        return ret;
    }

    /**
     * Phase 1: Enable target alias without disabling the currently active alias, synchronously persist
     * pending state with SharedPreferences.commit(), and schedule a controlled task relaunch to target alias.
     */
    public static JSObject startPresetSwitch(Activity activity, Context appContext, String targetPresetId) {
        if (!LAUNCHER_PRESET_ALIASES.containsKey(targetPresetId)) {
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("restarting", false);
            err.put("activePresetId", resolveActiveLauncherPresetId(appContext));
            err.put("message", "无效的桌面预设方案: " + targetPresetId);
            return err;
        }

        PackageManager pm = appContext.getPackageManager();
        String pkg = appContext.getPackageName();
        SharedPreferences prefs = getPrefs(appContext);

        logAllAliasStates(appContext, "Phase1:BeforeSwitch target=" + targetPresetId);

        List<String> currentlyEnabled = getEnabledPresetIds(appContext);
        boolean wasSwitchInProgress = prefs.getBoolean(KEY_SWITCH_IN_PROGRESS, false);

        // Already the sole enabled entrypoint and not mid-switch -> no-op
        if (!wasSwitchInProgress && currentlyEnabled.size() == 1 && currentlyEnabled.get(0).equals(targetPresetId)) {
            prefs.edit().putString(KEY_ACTIVE_PRESET_ID, targetPresetId).commit();
            Log.i(TAG, "Target preset '" + targetPresetId + "' is already the sole active launcher alias; skipping switch.");
            JSObject noop = new JSObject();
            noop.put("success", true);
            noop.put("alreadyActive", true);
            noop.put("restarting", false);
            noop.put("activePresetId", targetPresetId);
            noop.put("message", "当前已是该桌面图标与名称预设，无需重复切换。");
            return noop;
        }

        String currentPresetId = resolveActiveLauncherPresetId(appContext);
        String previousAlias = getAliasForPreset(currentPresetId);
        if (previousAlias == null) {
            previousAlias = ".LauncherDefault";
        }
        String targetAlias = getAliasForPreset(targetPresetId);

        // Step 1: Synchronously persist pending switch metadata BEFORE touching any component state
        boolean committed = prefs.edit()
            .putString(KEY_ACTIVE_PRESET_ID, currentPresetId)
            .putString(KEY_PENDING_PRESET_ID, targetPresetId)
            .putBoolean(KEY_SWITCH_IN_PROGRESS, true)
            .putString(KEY_PREVIOUS_ALIAS, previousAlias)
            .putString(KEY_TARGET_ALIAS, targetAlias)
            .commit();

        if (!committed) {
            Log.e(TAG, "SharedPreferences.commit() failed before enabling target alias=" + targetAlias);
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("restarting", false);
            err.put("activePresetId", currentPresetId);
            err.put("message", "同步保存切换状态失败，已中止切换以确保安全。");
            return err;
        }

        try {
            // Step 2: Enable ONLY target alias; NEVER disable previousAlias while it owns the foreground task
            ComponentName targetComponent = new ComponentName(pkg, pkg + targetAlias);
            int beforeTargetState = pm.getComponentEnabledSetting(targetComponent);
            setSingleComponentEnabled(pm, targetComponent, true);
            int afterTargetState = pm.getComponentEnabledSetting(targetComponent);

            Log.i(
                TAG,
                "[Phase1:TargetEnabled] currentAlias=" + previousAlias
                    + ", targetAlias=" + targetAlias
                    + ", targetStateBefore=" + formatStateName(beforeTargetState)
                    + ", targetStateAfter=" + formatStateName(afterTargetState)
                    + ", pendingPresetId=" + targetPresetId
                    + ", switchInProgress=true"
            );

            if (afterTargetState != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                prefs.edit()
                    .putBoolean(KEY_SWITCH_IN_PROGRESS, false)
                    .remove(KEY_PENDING_PRESET_ID)
                    .remove(KEY_PREVIOUS_ALIAS)
                    .remove(KEY_TARGET_ALIAS)
                    .commit();
                Log.e(TAG, "Verification failed: targetAlias is not ENABLED after setSingleComponentEnabled: " + formatStateName(afterTargetState));
                JSObject err = new JSObject();
                err.put("success", false);
                err.put("restarting", false);
                err.put("activePresetId", currentPresetId);
                err.put("message", "启用新桌面入口验证失败（状态: " + formatStateName(afterTargetState) + "）");
                return err;
            }

            // Step 3: Schedule controlled task rebuild shortly after resolving JS call so UI updates cleanly first
            final String finalTargetAlias = targetAlias;
            final String finalTargetPresetId = targetPresetId;
            boolean scheduledRestart = false;

            if (activity != null && !activity.isFinishing() && !activity.isDestroyed()) {
                scheduledRestart = true;
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    executeControlledRelaunch(activity, pkg, finalTargetAlias, finalTargetPresetId, false);
                }, CONTROLLED_RESTART_DELAY_MS);
            } else {
                Log.w(TAG, "Activity unavailable for controlled relaunch; pendingPresetId will complete on next launch.");
            }

            Log.i(
                TAG,
                "[Phase1:Complete] controlledRestartScheduled=" + scheduledRestart
                    + ", delayMs=" + CONTROLLED_RESTART_DELAY_MS
            );

            JSObject ok = new JSObject();
            ok.put("success", true);
            ok.put("alreadyActive", false);
            ok.put("restarting", scheduledRestart);
            ok.put("activePresetId", targetPresetId);
            ok.put("pendingPresetId", targetPresetId);
            ok.put("message", scheduledRestart
                ? "正在应用桌面图标，应用将自动重新打开"
                : "新桌面入口已就绪，请重新打开应用以完成图标切换");
            return ok;
        } catch (Exception e) {
            Log.e(TAG, "Exception during Phase 1 enable targetAlias=" + targetAlias, e);
            prefs.edit()
                .putBoolean(KEY_SWITCH_IN_PROGRESS, false)
                .remove(KEY_PENDING_PRESET_ID)
                .remove(KEY_PREVIOUS_ALIAS)
                .remove(KEY_TARGET_ALIAS)
                .commit();
            JSObject err = new JSObject();
            err.put("success", false);
            err.put("restarting", false);
            err.put("activePresetId", resolveActiveLauncherPresetId(appContext));
            err.put("message", "启用新桌面入口失败: " + e.getMessage());
            return err;
        }
    }

    private static boolean executeControlledRelaunch(
        Activity activity,
        String pkg,
        String targetAlias,
        String targetPresetId,
        boolean isRecoveryRelaunch
    ) {
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            Log.w(TAG, "executeControlledRelaunch skipped: activity invalid");
            return false;
        }
        try {
            Intent relaunchIntent = new Intent(Intent.ACTION_MAIN);
            relaunchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            relaunchIntent.setComponent(new ComponentName(pkg, pkg + targetAlias));
            relaunchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            relaunchIntent.putExtra(EXTRA_SWITCH_TARGET_PRESET, targetPresetId);
            if (isRecoveryRelaunch) {
                relaunchIntent.putExtra(EXTRA_RECOVERY_RELAUNCHED, true);
            }

            Log.i(
                TAG,
                "[ControlledRestart] Starting targetAlias=" + targetAlias
                    + ", targetPresetId=" + targetPresetId
                    + ", isRecoveryRelaunch=" + isRecoveryRelaunch
            );
            activity.startActivity(relaunchIntent);
            activity.overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "executeControlledRelaunch failed for targetAlias=" + targetAlias, e);
            return false;
        }
    }

    /**
     * Phase 2 & Crash/Kill Recovery:
     * Invoked from MainActivity.onCreate and MainActivity.onNewIntent.
     *
     * @return true if a recovery relaunch was triggered and the caller should finish the current Activity.
     */
    public static boolean reconcileOnLaunch(Activity activity, Intent launchIntent) {
        if (activity == null) {
            return false;
        }

        Context appContext = activity.getApplicationContext();
        PackageManager pm = appContext.getPackageManager();
        String pkg = appContext.getPackageName();
        SharedPreferences prefs = getPrefs(appContext);

        ComponentName receivedComponent = launchIntent != null ? launchIntent.getComponent() : null;
        String receivedPreset = getPresetForComponent(pkg, receivedComponent);
        boolean switchInProgress = prefs.getBoolean(KEY_SWITCH_IN_PROGRESS, false);
        String pendingPresetId = prefs.getString(KEY_PENDING_PRESET_ID, "");
        boolean recoveryRelaunched = launchIntent != null && launchIntent.getBooleanExtra(EXTRA_RECOVERY_RELAUNCHED, false);

        Log.i(
            TAG,
            "[Phase2:LaunchCheck] receivedComponent=" + (receivedComponent != null ? receivedComponent.flattenToShortString() : "null")
                + ", receivedPreset=" + (receivedPreset != null ? receivedPreset : "non_alias")
                + ", switchInProgress=" + switchInProgress
                + ", pendingPresetId=" + pendingPresetId
                + ", recoveryRelaunched=" + recoveryRelaunched
        );
        logAllAliasStates(appContext, "Phase2:BeforeReconcile");

        if (switchInProgress) {
            String targetPresetId = LAUNCHER_PRESET_ALIASES.containsKey(pendingPresetId)
                ? pendingPresetId
                : null;
            if (targetPresetId == null) {
                String savedTargetAlias = prefs.getString(KEY_TARGET_ALIAS, "");
                for (Map.Entry<String, String> entry : LAUNCHER_PRESET_ALIASES.entrySet()) {
                    if (entry.getValue().equals(savedTargetAlias)) {
                        targetPresetId = entry.getKey();
                        break;
                    }
                }
            }
            if (targetPresetId == null) {
                Log.w(TAG, "switchInProgress=true but pendingPresetId/targetAlias invalid; falling back to LauncherDefault");
                ensureSinglePresetEnabledFallback(appContext);
                logAllAliasStates(appContext, "Phase2:FallbackDefault");
                return false;
            }

            String targetAlias = getAliasForPreset(targetPresetId);
            ComponentName targetComponent = new ComponentName(pkg, pkg + targetAlias);

            try {
                // Ensure target alias is enabled even if process died mid-Phase-1
                if (!isAliasEffectivelyEnabled(pm, pkg, targetPresetId, targetAlias)
                    || pm.getComponentEnabledSetting(targetComponent) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                    Log.w(TAG, "[Recovery] Target alias " + targetAlias + " was not ENABLED at launch; re-enabling now.");
                    setSingleComponentEnabled(pm, targetComponent, true);
                }

                if (pm.getComponentEnabledSetting(targetComponent) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
                    throw new IllegalStateException("Target alias remained disabled after re-enable: " + targetAlias);
                }

                // If launched from an OLD launcher alias (and we haven't bounced yet), bounce to targetAlias FIRST
                // before disabling the old alias so the active task is anchored cleanly to targetAlias.
                if (receivedPreset != null && !receivedPreset.equals(targetPresetId) && !recoveryRelaunched) {
                    Log.i(
                        TAG,
                        "[Recovery] Launched from old alias (" + receivedPreset + ") while pending=" + targetPresetId
                            + "; bouncing task to targetAlias=" + targetAlias + " before disabling old alias."
                    );
                    if (executeControlledRelaunch(activity, pkg, targetAlias, targetPresetId, true)) {
                        return true;
                    }
                }

                // Target entrypoint is confirmed active (or non-alias / post-recovery relaunch).
                // Commit final state FIRST, then safely disable all old aliases.
                boolean saved = prefs.edit()
                    .putString(KEY_ACTIVE_PRESET_ID, targetPresetId)
                    .putBoolean(KEY_SWITCH_IN_PROGRESS, false)
                    .remove(KEY_PENDING_PRESET_ID)
                    .remove(KEY_PREVIOUS_ALIAS)
                    .remove(KEY_TARGET_ALIAS)
                    .commit();

                disableOtherAliasesSafely(appContext, targetPresetId);
                logAllAliasStates(appContext, "Phase2:AfterCleanup committed=" + saved);
                return false;
            } catch (Exception e) {
                Log.e(TAG, "[Recovery] Failed completing switch to " + targetPresetId + "; restoring LauncherDefault.", e);
                ensureSinglePresetEnabledFallback(appContext);
                logAllAliasStates(appContext, "Phase2:AfterEmergencyFallback");
                return false;
            }
        }

        // Normal launch (switchInProgress == false): verify invariant that exactly 1 launcher alias is active
        List<String> enabled = getEnabledPresetIds(appContext);
        if (enabled.isEmpty()) {
            Log.w(TAG, "[Invariant] Zero launcher aliases active on normal launch! Restoring LauncherDefault.");
            ensureSinglePresetEnabledFallback(appContext);
            logAllAliasStates(appContext, "Invariant:RestoredDefault");
            return false;
        }

        if (enabled.size() > 1) {
            // Clean up duplicate enabled aliases safely, preferring the component that actually launched us
            String keepPreset = (receivedPreset != null && enabled.contains(receivedPreset))
                ? receivedPreset
                : resolveActiveLauncherPresetId(appContext);
            Log.w(TAG, "[Invariant] Multiple aliases enabled (" + enabled + "), cleaning duplicates; keeping=" + keepPreset);
            prefs.edit().putString(KEY_ACTIVE_PRESET_ID, keepPreset).commit();
            disableOtherAliasesSafely(appContext, keepPreset);
            logAllAliasStates(appContext, "Invariant:CleanedDuplicates");
            return false;
        }

        // Single enabled alias -> ensure prefs stays synced
        String realActive = enabled.get(0);
        if (!realActive.equals(readSavedActivePreset(prefs))) {
            prefs.edit().putString(KEY_ACTIVE_PRESET_ID, realActive).commit();
            Log.i(TAG, "[Invariant] Synced saved activePresetId to OS state=" + realActive);
        }
        return false;
    }
}
