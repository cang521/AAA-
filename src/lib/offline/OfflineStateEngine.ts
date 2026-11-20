/**
 * OfflineStateEngine.ts
 * Roleplay simulation state engine & action text normalizer for Offline Scene Mode.
 * Supports:
 * - Regular physiological/emotional states (heartRate, breathing, bodyTemp, blush, tension, emotion, energy, physicalState, behavior)
 * - Optional gated intimateState (active ONLY when plot genuinely enters an intimate situation)
 * - Smooth per-turn deltas so values evolve continuously without erratic jumps
 */

export interface IntimateCharacterState {
  active: boolean;
  arousal?: number; // 0 - 100
  sensitivity?: number; // 0 - 100
  physiologicalState?: string; // e.g. "呼吸温热，肌肤微微发烫"
  notes?: string;
}

export interface CharacterState {
  heartRate: number; // 55 - 175 bpm
  breathing: string; // e.g. "平静", "稍快", "急促", "深呼吸", "微微屏息"
  bodyTemp: number; // 36.0 - 38.5 °C
  blush: number; // 0 - 100 (%)
  emotion: string[]; // e.g. ["害羞", "开心", "期待"]
  arousal: number; // 0 - 100 (%) (legacy field retained for backward compatibility)
  tension: number; // 0 - 100 (%)
  physicalState: string; // e.g. "身体放松", "手指发紧", "依偎在身边"
  behavior: string; // e.g. "眼神闪烁", "低下头轻笑", "转过脸去"
  energy: number; // 0 - 100 (%)
  intimateState?: IntimateCharacterState;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function smoothStep(target: number, prev: number, maxDelta: number): number {
  if (Math.abs(target - prev) <= maxDelta) return target;
  return prev + (target > prev ? maxDelta : -maxDelta);
}

export class OfflineStateEngine {
  public static createInitialState(): CharacterState {
    return {
      heartRate: 74,
      breathing: '平静',
      bodyTemp: 36.5,
      blush: 8,
      emotion: ['期待', '平静'],
      arousal: 10,
      tension: 10,
      physicalState: '状态自然放松',
      behavior: '平静注视',
      energy: 86,
      intimateState: { active: false },
    };
  }

  /**
   * Normalize legacy stored CharacterState objects safely (adds default bodyTemp & inactive intimateState if absent)
   */
  public static hydrateState(raw: Partial<CharacterState> | null | undefined): CharacterState {
    const base = OfflineStateEngine.createInitialState();
    if (!raw || typeof raw !== 'object') return base;

    const bodyTempRaw = typeof raw.bodyTemp === 'number' && !Number.isNaN(raw.bodyTemp) ? raw.bodyTemp : base.bodyTemp;
    const intimateRaw = raw.intimateState && typeof raw.intimateState === 'object' ? raw.intimateState : undefined;

    return {
      heartRate: typeof raw.heartRate === 'number' ? clamp(Math.round(raw.heartRate), 55, 175) : base.heartRate,
      breathing: typeof raw.breathing === 'string' && raw.breathing.trim() ? raw.breathing.trim() : base.breathing,
      bodyTemp: Number(clamp(bodyTempRaw, 36.0, 38.5).toFixed(1)),
      blush: typeof raw.blush === 'number' ? clamp(Math.round(raw.blush), 0, 100) : base.blush,
      emotion: Array.isArray(raw.emotion) && raw.emotion.length > 0 ? raw.emotion.slice(0, 3) : base.emotion,
      arousal: typeof raw.arousal === 'number' ? clamp(Math.round(raw.arousal), 0, 100) : base.arousal,
      tension: typeof raw.tension === 'number' ? clamp(Math.round(raw.tension), 0, 100) : base.tension,
      physicalState:
        typeof raw.physicalState === 'string' && raw.physicalState.trim()
          ? raw.physicalState.trim()
          : base.physicalState,
      behavior: typeof raw.behavior === 'string' && raw.behavior.trim() ? raw.behavior.trim() : base.behavior,
      energy: typeof raw.energy === 'number' ? clamp(Math.round(raw.energy), 0, 100) : base.energy,
      intimateState: intimateRaw?.active
        ? {
            active: true,
            arousal: typeof intimateRaw.arousal === 'number' ? clamp(Math.round(intimateRaw.arousal), 0, 100) : 35,
            sensitivity:
              typeof intimateRaw.sensitivity === 'number' ? clamp(Math.round(intimateRaw.sensitivity), 0, 100) : 30,
            physiologicalState:
              typeof intimateRaw.physiologicalState === 'string' ? intimateRaw.physiologicalState.trim() : '',
            notes: typeof intimateRaw.notes === 'string' ? intimateRaw.notes.trim() : '',
          }
        : { active: false },
    };
  }

  /**
   * Smooth state transitions & bounds validation.
   * Ensures regular & intimate states evolve continuously without sudden erratic spikes.
   */
  public static normalizeAndSmoothState(
    newState: Partial<CharacterState> | null | undefined,
    prevStateRaw: Partial<CharacterState> | null | undefined
  ): CharacterState {
    const prevState = OfflineStateEngine.hydrateState(prevStateRaw);
    if (!newState || typeof newState !== 'object') return { ...prevState };

    // Heart rate: clamp 55..175, max delta 22 bpm per turn
    let targetHr = typeof newState.heartRate === 'number' ? newState.heartRate : prevState.heartRate;
    targetHr = clamp(Math.round(targetHr), 55, 175);
    targetHr = Math.round(smoothStep(targetHr, prevState.heartRate, 22));

    // Body temperature: clamp 36.0..38.5 °C, max delta 0.4 °C per turn
    let targetTemp = typeof newState.bodyTemp === 'number' ? newState.bodyTemp : prevState.bodyTemp;
    targetTemp = clamp(targetTemp, 36.0, 38.5);
    targetTemp = Number(smoothStep(targetTemp, prevState.bodyTemp, 0.4).toFixed(1));

    // Blush: clamp 0..100, max delta 30 per turn
    let blush = typeof newState.blush === 'number' ? newState.blush : prevState.blush;
    blush = clamp(Math.round(blush), 0, 100);
    blush = Math.round(smoothStep(blush, prevState.blush, 30));

    // Tension: clamp 0..100, max delta 30 per turn
    let tension = typeof newState.tension === 'number' ? newState.tension : prevState.tension;
    tension = clamp(Math.round(tension), 0, 100);
    tension = Math.round(smoothStep(tension, prevState.tension, 30));

    // Energy: clamp 0..100, max delta 20 per turn
    let energy = typeof newState.energy === 'number' ? newState.energy : prevState.energy;
    energy = clamp(Math.round(energy), 0, 100);
    energy = Math.round(smoothStep(energy, prevState.energy, 20));

    // Legacy arousal kept smoothly synced
    let arousal = typeof newState.arousal === 'number' ? newState.arousal : prevState.arousal;
    arousal = clamp(Math.round(arousal), 0, 100);
    arousal = Math.round(smoothStep(arousal, prevState.arousal, 25));

    const emotion =
      Array.isArray(newState.emotion) && newState.emotion.length > 0
        ? newState.emotion
            .map((e) => String(e || '').trim())
            .filter(Boolean)
            .slice(0, 3)
        : prevState.emotion;

    // Intimate State: strictly gated — ONLY active when newState.intimateState.active === true
    let intimateState: IntimateCharacterState = { active: false };
    if (newState.intimateState && typeof newState.intimateState === 'object' && newState.intimateState.active === true) {
      const prevInt = prevState.intimateState?.active ? prevState.intimateState : undefined;
      const prevIntArousal = typeof prevInt?.arousal === 'number' ? prevInt.arousal : 25;
      const prevIntSens = typeof prevInt?.sensitivity === 'number' ? prevInt.sensitivity : 25;

      let intArousal =
        typeof newState.intimateState.arousal === 'number'
          ? clamp(Math.round(newState.intimateState.arousal), 0, 100)
          : prevIntArousal;
      intArousal = Math.round(smoothStep(intArousal, prevIntArousal, 25));

      let intSensitivity =
        typeof newState.intimateState.sensitivity === 'number'
          ? clamp(Math.round(newState.intimateState.sensitivity), 0, 100)
          : prevIntSens;
      intSensitivity = Math.round(smoothStep(intSensitivity, prevIntSens, 25));

      const physText =
        typeof newState.intimateState.physiologicalState === 'string'
          ? newState.intimateState.physiologicalState.trim()
          : prevInt?.physiologicalState || '';
      const notesText =
        typeof newState.intimateState.notes === 'string' ? newState.intimateState.notes.trim() : '';

      // Only keep active if there is genuinely intimate signal or description
      if (physText || notesText || intArousal >= 20 || intSensitivity >= 20) {
        intimateState = {
          active: true,
          arousal: intArousal,
          sensitivity: intSensitivity,
          physiologicalState: physText || '贴近时呼吸微微发烫',
          notes: notesText || undefined,
        };
        arousal = Math.max(arousal, intArousal);
      }
    }

    return {
      heartRate: targetHr,
      breathing:
        typeof newState.breathing === 'string' && newState.breathing.trim()
          ? newState.breathing.trim()
          : prevState.breathing || '平静',
      bodyTemp: targetTemp,
      blush,
      emotion: emotion.length > 0 ? emotion : prevState.emotion,
      arousal,
      tension,
      physicalState:
        typeof newState.physicalState === 'string' && newState.physicalState.trim()
          ? newState.physicalState.trim()
          : prevState.physicalState || '身体状态自然',
      behavior:
        typeof newState.behavior === 'string' && newState.behavior.trim()
          ? newState.behavior.trim()
          : prevState.behavior || '眼神自然',
      energy,
      intimateState,
    };
  }

  /**
   * Universal action format normalizer (retained for backward compatibility)
   */
  public static normalizeActionText(text: string): { reply: string; action: string } {
    if (!text) return { reply: '', action: '' };

    const trimmed = text.trim();
    if (
      /[（\(].+?[）\)]/.test(trimmed) &&
      (trimmed.length > 30 || /[“"」\u4e00-\u9fa5]/.test(trimmed.replace(/[（\(].+?[）\)]/g, '')))
    ) {
      return { reply: trimmed, action: '' };
    }

    let reply = trimmed;
    const extractedActions: string[] = [];

    const parenRegex = /[（\(]([^（\)]+)[）\)]/g;
    let match;
    while ((match = parenRegex.exec(text)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(parenRegex, '').trim();

    const asteriskRegex = /\*([^*]+)\*/g;
    while ((match = asteriskRegex.exec(reply)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(asteriskRegex, '').trim();

    const bracketRegex = /\[([^\]]+)\]/g;
    while ((match = bracketRegex.exec(reply)) !== null) {
      const act = match[1].trim();
      if (act && !extractedActions.includes(act)) {
        extractedActions.push(act);
      }
    }
    reply = reply.replace(bracketRegex, '').trim();

    reply = reply.replace(/^(Action|动作|旁白|描述)[:：]\s*/i, '').trim();
    reply = reply.replace(/\s+/g, ' ').trim();

    const formattedAction = extractedActions.length > 0 ? `（${extractedActions.join('；')}）` : '';

    return { reply, action: formattedAction };
  }
}
