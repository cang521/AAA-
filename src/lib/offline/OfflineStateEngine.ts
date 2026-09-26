/**
 * OfflineStateEngine.ts
 * Roleplay simulation state engine & action text normalizer for Offline Scene Mode.
 */

export interface CharacterState {
  heartRate: number; // 50 - 180 bpm
  breathing: string; // e.g. "平静", "稍快", "急促", "深呼吸", "微微屏息"
  blush: number; // 0 - 100 (%)
  emotion: string[]; // e.g. ["害羞", "开心", "期待"]
  arousal: number; // 0 - 100 (%)
  tension: number; // 0 - 100 (%)
  physicalState: string; // e.g. "身体放松", "手指发紧", "依偎在身边"
  behavior: string; // e.g. "眼神闪烁", "低下头轻笑", "转过脸去"
  energy: number; // 0 - 100 (%)
}

export class OfflineStateEngine {
  public static createInitialState(): CharacterState {
    return {
      heartRate: 75,
      breathing: '平静',
      blush: 10,
      emotion: ['期待', '平静'],
      arousal: 15,
      tension: 10,
      physicalState: '状态自然放松',
      behavior: '平静注视',
      energy: 85,
    };
  }

  /**
   * Smooth state transitions & bounds validation
   */
  public static normalizeAndSmoothState(
    newState: Partial<CharacterState> | null | undefined,
    prevState: CharacterState
  ): CharacterState {
    if (!newState) return { ...prevState };

    // Heart rate smoothing (limit change to max 25 bpm per turn unless extreme)
    let targetHr = typeof newState.heartRate === 'number' ? newState.heartRate : prevState.heartRate;
    targetHr = Math.max(55, Math.min(175, Math.round(targetHr)));
    const maxDelta = 25;
    if (Math.abs(targetHr - prevState.heartRate) > maxDelta) {
      targetHr = prevState.heartRate + (targetHr > prevState.heartRate ? maxDelta : -maxDelta);
    }

    // Blush clamp
    let blush = typeof newState.blush === 'number' ? newState.blush : prevState.blush;
    blush = Math.max(0, Math.min(100, Math.round(blush)));

    // Arousal & Tension clamp
    let arousal = typeof newState.arousal === 'number' ? newState.arousal : prevState.arousal;
    arousal = Math.max(0, Math.min(100, Math.round(arousal)));

    let tension = typeof newState.tension === 'number' ? newState.tension : prevState.tension;
    tension = Math.max(0, Math.min(100, Math.round(tension)));

    let energy = typeof newState.energy === 'number' ? newState.energy : prevState.energy;
    energy = Math.max(0, Math.min(100, Math.round(energy)));

    const emotion = Array.isArray(newState.emotion) && newState.emotion.length > 0
      ? newState.emotion.slice(0, 3)
      : prevState.emotion;

    return {
      heartRate: targetHr,
      breathing: newState.breathing || prevState.breathing || '平静',
      blush,
      emotion,
      arousal,
      tension,
      physicalState: newState.physicalState || prevState.physicalState || '身体状态自然',
      behavior: newState.behavior || prevState.behavior || '眼神自然',
      energy,
    };
  }

  /**
   * Universal action format normalizer
   * Enforces Chinese full-width parentheses （动作内容）
   * Converts *action*, [action], Action: into （action）
   */
  public static normalizeActionText(text: string): { reply: string; action: string } {
    if (!text) return { reply: '', action: '' };

    let reply = text;
    let extractedActions: string[] = [];

    // 1. Extract half-width or full-width parentheses actions: （...） or (...)
    const parenRegex = /[（\(]([^（\)]+)[）\)]/g;
    let match;
    while ((match = parenRegex.exec(text)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(parenRegex, '').trim();

    // 2. Extract asterisk actions: *...*
    const asteriskRegex = /\*([^*]+)\*/g;
    while ((match = asteriskRegex.exec(reply)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(asteriskRegex, '').trim();

    // 3. Extract bracket actions: [...]
    const bracketRegex = /\[([^\]]+)\]/g;
    while ((match = bracketRegex.exec(reply)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(bracketRegex, '').trim();

    // 4. Remove prefixes like "Action:", "动作:", "旁白:"
    reply = reply.replace(/^(Action|动作|旁白|描述)[:：]\s*/i, '').trim();

    // Clean double spaces
    reply = reply.replace(/\s+/g, ' ').trim();

    // Format extracted actions with full-width Chinese parentheses （...）
    const formattedAction = extractedActions.length > 0
      ? `（${extractedActions.join('；')}）`
      : '';

    return { reply, action: formattedAction };
  }
}
