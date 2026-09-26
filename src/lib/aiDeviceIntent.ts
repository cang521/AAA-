import { SmartDevice } from '../types';

export type DeviceIntentAction =
  | 'none'
  | 'increase'
  | 'decrease'
  | 'set_output'
  | 'change_pattern'
  | 'start'
  | 'hold'
  | 'stop';

export interface DeviceIntent {
  action: DeviceIntentAction;
  amount?: number;        // Level change or percentage amount
  targetOutput?: number;  // Target level (1-5) or percentage (0-100)
  pattern?: string;       // 'continuous' | 'steady' | 'wave' | 'pulse' | 'breath'
  confidence: number;
  reason?: string;
}

/**
 * Translates an AI DeviceIntent into a concrete actionId and params compatible with deviceService.executeAction()
 */
export function convertIntentToDeviceAction(
  intent: DeviceIntent,
  device: SmartDevice
): { actionId: string; params: Record<string, any> } | null {
  if (!intent || intent.action === 'none') {
    return null;
  }

  const currentLevel = device.state?.intensityLevel ?? 0;

  switch (intent.action) {
    case 'start': {
      const targetLevel = intent.targetOutput !== undefined ? Math.max(1, Math.min(5, intent.targetOutput)) : (currentLevel || 1);
      return {
        actionId: 'setIntensity',
        params: { level: targetLevel, mode: intent.pattern || device.state?.mode || 'continuous' },
      };
    }

    case 'stop': {
      return {
        actionId: 'emergencyStop',
        params: {},
      };
    }

    case 'increase': {
      const step = intent.amount !== undefined ? Math.ceil(intent.amount / 20) : 1;
      const nextLevel = Math.min(5, (currentLevel || 0) + Math.max(1, step));
      return {
        actionId: 'setIntensity',
        params: { level: nextLevel, mode: intent.pattern || device.state?.mode || 'continuous' },
      };
    }

    case 'decrease': {
      const step = intent.amount !== undefined ? Math.ceil(intent.amount / 20) : 1;
      const nextLevel = Math.max(0, (currentLevel || 1) - Math.max(1, step));
      if (nextLevel === 0) {
        return {
          actionId: 'setIntensity',
          params: { level: 0 },
        };
      }
      return {
        actionId: 'setIntensity',
        params: { level: nextLevel, mode: intent.pattern || device.state?.mode || 'continuous' },
      };
    }

    case 'set_output': {
      let targetLevel = intent.targetOutput ?? 1;
      if (targetLevel > 5) {
        targetLevel = Math.round((targetLevel / 100) * 5);
      }
      targetLevel = Math.max(0, Math.min(5, targetLevel));
      return {
        actionId: 'setIntensity',
        params: { level: targetLevel, mode: intent.pattern || device.state?.mode || 'continuous' },
      };
    }

    case 'change_pattern': {
      const mode = intent.pattern || 'wave';
      return {
        actionId: 'setMode',
        params: { mode },
      };
    }

    case 'hold': {
      return {
        actionId: 'setIntensity',
        params: { level: currentLevel || 1, mode: device.state?.mode || 'continuous' },
      };
    }

    default:
      return null;
  }
}

/**
 * Clean system prompt instructions to inject into AI conversation when interactive devices are connected
 */
export function buildDeviceIntentSystemPrompt(connectedInteractiveDevices: SmartDevice[]): string {
  if (!connectedInteractiveDevices || connectedInteractiveDevices.length === 0) {
    return '';
  }

  const deviceSummaryList = connectedInteractiveDevices
    .map((d) => `- [互动设备] ID: "${d.id}", 名称: "${d.name}", 当前状态: ${d.state?.isRunning ? '运行中' : '待机'}, 当前强度: ${d.state?.intensityLevel || 0}档, 运行模式: ${d.state?.mode || 'continuous'}`)
    .join('\n');

  return `\n【触觉/互动硬件感知与 AI 上下文决策引擎 (Interactive Device Control Framework)】:
目前已连接并获得授权的触觉/互动设备：
${deviceSummaryList}

【上下文意图决策法则 (Contextual Judgment Rules)】:
基于当前对话氛围、用户心情、最近几轮聊天与人物关系，判断是否需要调整互动设备。
- 绝不硬编码关键词（同句话在普通语境下可为 "none"，在特定亲密或互动环境下可触发调节）。
- AI 仅负责高层意图决策 (Device Intent)，禁止直接生成底层十六进制指令。

你可以输出以下格式的触觉控制意图标签（该标签将被系统拦截处理，不会显示在用户聊天对话框中）：
<device_intent>{"action":"increase|decrease|set_output|change_pattern|start|hold|stop|none","amount":15,"targetOutput":3,"pattern":"continuous|wave|pulse|breath","confidence":0.95,"reason":"理由说明"}</device_intent>

可用 Action 意图释义：
- "increase": 增强输出强度 (amount: 10~30)
- "decrease": 降低输出强度 (amount: 10~30)
- "set_output": 设置具体强度 (targetOutput: 1~5 档)
- "change_pattern": 切换律动模式 (pattern: continuous / wave / pulse / breath)
- "start": 开启启动设备
- "hold": 保持当前稳定输出
- "stop": 停止并关闭输出
- "none": 无需进行设备调整 (默认状态)
`;
}
