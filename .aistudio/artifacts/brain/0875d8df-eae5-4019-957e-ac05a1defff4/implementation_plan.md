# Finalized Implementation Plan - 5 Core Features & Bug Fixes

This finalized implementation plan incorporates all required safety, data integrity, compatibility, and strict staged execution protocols.

---

## Task 1: Unified All AI Proactive Message Response Mechanisms

### 1. Architectural Separation & Safety
- **Separation**: AI Generation (fetch persona, memory, context, prompt Gemini) vs. AI Segmentation & Dispatch (`splitMessageIntoSentenceBubbles`, typing delays, database persistence, status bar notifications).
- **Scope**: All proactive triggers (`weather_alert`, `menstrual_care`, `greeting`, `important_event`, `followup_topic`, `device_life_event`, `life_event_followup`, `app_usage`) use full natural AI generation.
- **Error Handling**: On API failure, log and abort cleanly without faked conversations or template text.

---

## Task 2: Fix Cursor Jumping Issue in Chat and Offline Inputs

### 1. Root Cause & Verification
- **Root Cause**: Uncontrolled textarea state overwrites and parent re-renders resetting cursor position (`value.length`). Missing isolation during Chinese Pinyin IME composition (`compositionstart` / `compositionend`).
- **Verification**: Verify normal typing, IME composition, middle-cursor insertion, selection replacement, and auto-resize in WeChat chat, Offline mode, and Android WebView simulation.

---

## Task 3: Re-Roll Regenerates Complete AI Reply Round (Transactional Safety)

### 1. Transactional Safety & Cross-Store Rollback Design
- **Cross-Store Coordination**: Since messages persist across IndexedDB (`chatDb`) and localStorage (`phone_messages`), true atomicity across engines is handled via a **two-phase safety protocol**:
  1. **Phase 1 (Generation & Staging)**: Generate the fresh multi-bubble response and assign a new `responseTurnId`. Keep old response intact.
  2. **Phase 2 (Atomic Swap & Persistence)**: Write the new messages to IndexedDB and localStorage with a transactional batch. Only upon successful write, remove the old messages matching `responseTurnId`.
  3. **Rollback / Recovery**: If write fails midway, clean up staging keys and preserve the original messages. Upon app restart, if duplicate or orphaned turn markers are detected, reconcile safely.
- **Legacy Fallback**: If `responseTurnId` is missing on older messages, **do not guess**. Prompt the user for confirmation before grouping or skip automated deletion to prevent accidental data destruction.

---

## Task 4: Fix API Monitor Data Accuracy

### 1. Centralized Interceptor & Token Accuracy
- **Interceptor**: Centralized in `localBackend.ts` and backend route handlers.
- **Accurate Metadata**: Record unique `requestId`, `startTime`, `endTime`, `durationMs`, `appSource`, `purpose`, `modelName`, `success`, `errorType`.
- **Token Distinction**: Explicitly distinguish real API-returned token usage (`response.usage`) from estimated counts. Never mislabel estimations as actual API responses. Record failed requests with accurate error status.

---

## Task 5: Permission Change Perception & System Messaging Compatibility

### 1. System Event Compatibility & Safety Rules
- **Schema & Storage**: Update `ChatMessage` type definition and `ChatDB` schema to fully support `sender: 'system'` (or `type: 'system_event'`), ensuring compatibility with message rendering, context building, import/export, and legacy storage. System events are never treated as user input.
- **Permission Guards**: 
  - Respect `perception` toggle (if disabled, no details sent to AI).
  - Respect `proactive_chat` DENY rules (revoking permissions never bypasses security blocks).
  - Respect DND and daily caps.
  - Distinguish AI independent permissions from Android OS permissions.
  - Implement debounce/mutex protection for rapid multi-toggles.

---

## Enforced Staged Execution & Verification Protocol

### Stage 1: API Monitor & Input Cursor Fix
- **Scope**: Centralized API logging interceptor in `localBackend.ts`, update `ApiMonitorApp`, fix IME composition and middle-cursor preservation in `WeChatApp.tsx` and `OfflineSessionView.tsx`.
- **Stop Condition**: Stop immediately after Stage 1. Report modified files, TypeScript check (`tsc --noEmit`), build output, and test results. **Wait for explicit user approval before Stage 2.**

### Stage 2: Unified Proactive Message Generation & Segmentation
- **Scope**: Refactor proactive engine and backend generation to use full natural AI generation with multi-bubble splitting and background notifications.
- **Stop Condition**: Stop immediately after Stage 2. Report verification results and **wait for user approval before Stage 3.**

### Stage 3: Safe Two-Phase Re-Roll Round Replacement
- **Scope**: Implement `responseTurnId`, safe two-phase Re-Roll generation, atomic cross-store swap/rollback, and legacy fallback in WeChat and Offline views.
- **Stop Condition**: Stop immediately after Stage 3. Report verification results and **wait for user approval before Stage 4.**

### Stage 4: Permission Change Perception & Natural AI Reply
- **Scope**: Implement permission change audit events, `system_event` message compatibility across storage/rendering, and natural AI reply generation.
- **Stop Condition**: Stop immediately after Stage 4. Report final verification and **wait for final user acceptance.**

---

## Testing & Verification Tiers
Testing results must explicitly distinguish between:
1. **Automated Unit / Build Checks** (`compile_applet`, `lint_applet`)
2. **Web Preview Verification** (Browser runtime inspection)
3. **Android APK Real-Device Verification** (Capacitor / native Android runtime testing)
