import { AiCharacter, TheaterPreset, TheaterRole, TheaterSession, TheaterMessage } from '../../types';
import { BUILTIN_THEATER_PRESETS } from './theaterPresets';
import { getRecentDrawIdsFromDb, addRecentDrawIdToDb } from './theaterDb';
import { getApiConfigForEngine } from '../apiConfigStore';
import { apiFetch, ensureBackendReady } from '../localBackend';
import { loadWorldBooks } from '../storage';
import { evaluateWorldBookContext } from '../aiReply/contextEvaluator';

/**
 * 官方抽签池只读取内置 70 条。
 * 用户自定义预设由“自定义剧场”独立管理，绝不静默混入随机抽签。
 */
export async function getAllAvailablePresets(): Promise<TheaterPreset[]> {
  return [...BUILTIN_THEATER_PRESETS];
}

/**
 * 严格检查 AI 角色与预设角色分配的性别兼容性
 */
export function validateGenderCompatibility(aiCharacter: AiCharacter, preset: TheaterPreset): boolean {
  const aiGender = (aiCharacter?.gender || '').toLowerCase();
  const aiIsFemale = aiGender === 'female' || aiGender === 'f' || aiGender === '女';
  const aiIsMale = aiGender === 'male' || aiGender === 'm' || aiGender === '男';

  const userRoleGender = preset.userRole?.gender?.toLowerCase() || 'any';
  const aiRoleGender = preset.aiRole?.gender?.toLowerCase() || 'any';
  const userRoleType = preset.userRole?.roleType || 'both';
  const aiRoleType = preset.aiRole?.roleType || 'both';

  // 1. 若双方角色均支持双向互换 (both)，只要有一个角色符合AI性别或为any即可
  if (userRoleType === 'both' && aiRoleType === 'both') {
    if (!aiIsFemale && !aiIsMale) return true; // 未知/其他性别皆可
    if (aiIsFemale) {
      return aiRoleGender === 'female' || userRoleGender === 'female' || aiRoleGender === 'any' || userRoleGender === 'any';
    }
    if (aiIsMale) {
      return aiRoleGender === 'male' || userRoleGender === 'male' || aiRoleGender === 'any' || userRoleGender === 'any';
    }
  }

  // 2. 若有明确固定的 aiRole (roleType === 'ai')
  if (aiRoleType === 'ai') {
    if (aiRoleGender === 'female') return aiIsFemale;
    if (aiRoleGender === 'male') return aiIsMale;
    return true;
  }

  return true;
}

/**
 * 依据用户与AI角色属性自动双向匹配双方在小剧场中的具体身份与秘密
 */
export function resolveRoleAssignment(
  aiCharacter: AiCharacter,
  userNickname: string,
  preset: TheaterPreset,
  userGenderPreference?: string
): {
  userRole: TheaterRole;
  aiRole: TheaterRole;
} {
  const aiGender = (aiCharacter?.gender || '').toLowerCase();
  const aiIsFemale = aiGender === 'female' || aiGender === 'f' || aiGender === '女';
  const aiIsMale = aiGender === 'male' || aiGender === 'm' || aiGender === '男';

  const uRoleConfig = preset.userRole;
  const aRoleConfig = preset.aiRole;

  let assignedToAi = aRoleConfig;
  let assignedToUser = uRoleConfig;

  // 如果双方支持双向互换，且预设预设的 userRole 更契合 AI 性别，进行自动智能互换
  if (uRoleConfig.roleType === 'both' && aRoleConfig.roleType === 'both') {
    if (aiIsFemale && uRoleConfig.gender === 'female' && aRoleConfig.gender === 'male') {
      assignedToAi = uRoleConfig;
      assignedToUser = aRoleConfig;
    } else if (aiIsMale && uRoleConfig.gender === 'male' && aRoleConfig.gender === 'female') {
      assignedToAi = uRoleConfig;
      assignedToUser = aRoleConfig;
    }
  } else if (aRoleConfig.roleType === 'user' || uRoleConfig.roleType === 'ai') {
    // 明确颠倒
    assignedToAi = uRoleConfig;
    assignedToUser = aRoleConfig;
  }

  const userGender: 'male' | 'female' | 'other' =
    assignedToUser.gender === 'female' ? 'female' : assignedToUser.gender === 'male' ? 'male' : (userGenderPreference as any) || 'other';

  const aiGenderFinal: 'male' | 'female' | 'other' =
    assignedToAi.gender === 'female' ? 'female' : assignedToAi.gender === 'male' ? 'male' : aiIsFemale ? 'female' : aiIsMale ? 'male' : 'other';

  const userRole: TheaterRole = {
    id: 'user_main',
    name: assignedToUser.name || userNickname || '你',
    avatar: '',
    gender: userGender,
    identity: assignedToUser.identity,
    secret: assignedToUser.secretTemplate,
    description: assignedToUser.identity,
  };

  const aiRole: TheaterRole = {
    id: aiCharacter.id,
    name: aiCharacter.name,
    avatar: aiCharacter.avatar,
    gender: aiGenderFinal,
    identity: assignedToAi.identity,
    secret: assignedToAi.secretTemplate,
    description: aiCharacter.persona,
  };

  return { userRole, aiRole };
}

/**
 * 随机抽取剧场预设（自动过滤并适配AI性别，避免近期重复）
 */
export async function getRandomTheaterPreset(
  aiCharacter?: AiCharacter,
  userGender?: string
): Promise<TheaterPreset> {
  const all = await getAllAvailablePresets();
  const recentIds = await getRecentDrawIdsFromDb();

  // 若提供了 AI 角色，优先筛选性别兼容的预设
  let candidates = aiCharacter ? all.filter(p => validateGenderCompatibility(aiCharacter, p)) : all;
  if (candidates.length === 0) {
    candidates = all; // 备用兜底
  }

  // 优先排除近期已抽取的预设
  let pool = candidates.filter(p => !recentIds.includes(p.id));
  if (pool.length === 0) {
    pool = candidates;
  }
  if (pool.length === 0) {
    pool = all;
  }

  const selected = pool[Math.floor(Math.random() * pool.length)];
  await addRecentDrawIdToDb(selected.id);
  return selected;
}

/**
 * 辅助：健壮的 JSON 提取与解析
 */
function cleanAndParseJson<T = any>(rawText: string, contextDescription: string): T {
  if (!rawText || !rawText.trim()) {
    throw new Error(`${contextDescription}：模型返回内容为空`);
  }

  // 去除 markdown 标记
  let cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // 尝试直接解析
  try {
    return JSON.parse(cleaned);
  } catch {
    // 提取第一个 { 到最后一个 }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      // 去除尾部多余逗号 (e.g., , } or , ])
      cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
      try {
        return JSON.parse(cleaned);
      } catch (err2: any) {
        throw new Error(`${contextDescription}：返回格式解析失败（${err2.message || 'JSON格式有误'}）`);
      }
    }
    throw new Error(`${contextDescription}：未在模型返回中找到合法的JSON结构`);
  }
}

/**
 * 生成开局剧本与双盲秘密（接入系统统一配置与apiFetch，杜绝假回复）
 */
export async function generateInitialTheaterScenario(
  character: AiCharacter,
  preset: TheaterPreset,
  userNickname: string,
  userGender?: string
): Promise<{
  title: string;
  worldBackground: string;
  initialScene: string;
  currentTime: string;
  currentLocation: string;
  chapter: string;
  userRole: TheaterRole;
  aiRole: TheaterRole;
  openingMessage: TheaterMessage;
}> {
  const { textApiConfig } = getApiConfigForEngine();
  if (!textApiConfig?.apiKey && !textApiConfig?.baseUrl) {
    throw new Error('未配置语言模型API，请前往「系统设置 → API设置」配置文本生成API。');
  }

  await ensureBackendReady('theater-initial-scenario');

  // 计算角色双向分配
  const { userRole, aiRole } = resolveRoleAssignment(character, userNickname, preset, userGender);

  // 尝试注入该角色相关的世界书词条或性格设定
  let worldBookPrompt = '';
  try {
    const worldBooks = loadWorldBooks();
    const evalResult = evaluateWorldBookContext(character.id, preset.worldBackground + ' ' + preset.title, worldBooks);
    if (evalResult && evalResult.promptText) {
      worldBookPrompt = `\n【关联世界书背景】\n${evalResult.promptText}\n`;
    }
  } catch {}

  const prompt = `你正在主持名为「小剧场」的沉浸式双人互动角色扮演游戏。
请根据以下预设、双方角色分配与人设，生成专属开局剧本设定与双方秘密。

【预设标题】${preset.title}
【预设分类】${preset.categoryName || preset.tags?.join('、') || '角色扮演'}
【预设世界背景】${preset.worldBackground}
【初始场景】${preset.initialScene}
【初始时间与地点】${preset.initialTime} · ${preset.initialLocation}

【用户角色分配】
- 名字：${userRole.name}
- 身份：${userRole.identity}
- 性别：${userRole.gender === 'female' ? '女' : userRole.gender === 'male' ? '男' : '自定义'}
- 秘密模板：${userRole.secret}

【AI角色分配与性格】
- 名字：${character.name}
- 剧场身份：${aiRole.identity}
- 性别：${aiRole.gender === 'female' ? '女' : aiRole.gender === 'male' ? '男' : '自定义'}
- 原生性格口吻：${character.persona || '生动沉浸、有独立主见'}
- 秘密模板：${aiRole.secret}
${worldBookPrompt}
【生成任务】
请生成具有文学质感、戏剧张力与互动的开场。要求返回严格的纯 JSON 格式：
{
  "title": "完善后的剧场标题",
  "worldBackground": "生动具体的世界观设定，展现时代氛围与双方所处的紧张局面（约100-200字）",
  "initialScene": "开场场景细腻描写（声效、光影、微表情、天气）",
  "currentTime": "${preset.initialTime || '暮色时分'}",
  "currentLocation": "${preset.initialLocation || '隐秘之地'}",
  "chapter": "第一章：命运的交汇",
  "userSecret": "用户角色在此次剧情中的核心隐藏秘密或动机（50-100字）",
  "aiSecret": "AI角色在此次剧情中的核心隐藏秘密或动机（50-100字）",
  "openingMessage": {
    "text": "AI角色的第一句开场白台词（严格契合人设、身份与语气，避免机械套话）",
    "action": "AI角色的神态、眼神、肢体动作描写",
    "thoughts": "AI角色此时内心的隐秘思绪（对自己秘密的盘算或对用户的暗中观察）"
  }
}`;

  let res: Response;
  try {
    res = await apiFetch('/api/gemini/theater-scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        textApiConfig,
        theaterType: 'scenario',
      }),
    });
  } catch (netErr: any) {
    throw new Error(`网络连接失败或小剧场服务未响应：${netErr.message || '请检查网络连接'}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务响应格式异常 (HTTP ${res.status})，请重试`);
  }

  if (!res.ok || !data.ok) {
    const rawMsg = data?.errorMessage || data?.error || `生成剧本失败 (HTTP ${res.status})`;
    const buildTheaterErr = (msg: string) => {
      const finalMsg = data?.mayHaveBeenCharged
        ? `${msg}（请求已发送至上游，可能已产生扣费，如需重发请点击手动重试）`
        : msg;
      const err: any = new Error(finalMsg);
      err.statusCode = res.status;
      err.mayHaveBeenCharged = Boolean(data?.mayHaveBeenCharged);
      err.upstreamRequestSent = data?.upstreamRequestSent;
      err.protocol = data?.protocol;
      err.causeCode = data?.causeCode;
      err.requestId = data?.requestId;
      return err;
    };
    if (res.status === 401 || res.status === 403) {
      throw buildTheaterErr(`API 鉴权失败：${rawMsg}。请检查API密钥。`);
    }
    if (res.status === 429) {
      throw buildTheaterErr(`API 额度超限或触发频率限制(429)：${rawMsg}。请稍后重试。`);
    }
    throw buildTheaterErr(rawMsg);
  }

  const parsed = cleanAndParseJson(data.text, '开局剧本解析');

  const finalUserRole: TheaterRole = {
    ...userRole,
    secret: parsed.userSecret || userRole.secret,
  };

  const finalAiRole: TheaterRole = {
    ...aiRole,
    secret: parsed.aiSecret || aiRole.secret,
  };

  const openingMsg: TheaterMessage = {
    id: 'msg_' + Date.now(),
    sender: 'ai',
    text: parsed.openingMessage?.text || '（凝视着你，语气低沉）“既然来了，便不必多言。”',
    timestamp: Date.now(),
    action: parsed.openingMessage?.action || preset.initialScene || '',
    thoughts: parsed.openingMessage?.thoughts || '',
  };

  return {
    title: parsed.title || preset.title,
    worldBackground: parsed.worldBackground || preset.worldBackground,
    initialScene: parsed.initialScene || preset.initialScene,
    currentTime: parsed.currentTime || preset.initialTime,
    currentLocation: parsed.currentLocation || preset.initialLocation,
    chapter: parsed.chapter || '第一章：命运的交汇',
    userRole: finalUserRole,
    aiRole: finalAiRole,
    openingMessage: openingMsg,
  };
}

/**
 * 互动对话生成（保留最近60条消息上下文，保护最近30条原文，无假回复，分离台词与动作）
 */
export async function sendTheaterChatMessage(
  session: TheaterSession,
  userMessageText: string,
  actionText?: string,
  character?: AiCharacter
): Promise<{
  replyMessage: TheaterMessage;
  updatedLocation?: string;
  updatedTime?: string;
  updatedChapter?: string;
  intimacyDelta?: number;
}> {
  const { textApiConfig } = getApiConfigForEngine();
  if (!textApiConfig?.apiKey && !textApiConfig?.baseUrl) {
    throw new Error('未配置语言模型API，请前往「系统设置 → API设置」配置API密钥。');
  }

  await ensureBackendReady('theater-chat');

  // 上下文扩展至当前会话最近 60 条消息，保留最近 30 条原文细节
  const allHistory = session.messages || [];
  const maxHistoryCount = 60;
  const recentMessages = allHistory.slice(-maxHistoryCount);

  const formattedHistory = recentMessages.map((m, idx) => {
    const isAi = m.sender === 'ai';
    const isUser = m.sender === 'user';
    const roleName = isUser ? session.userRole.name : isAi ? session.aiRole.name : '【系统/命运】';
    const actionPart = m.action ? ` [动作/神态: ${m.action}]` : '';
    const thoughtsPart = isAi && m.thoughts ? ` [隐秘心声: ${m.thoughts}]` : '';
    return `${idx + 1}. ${roleName}${actionPart}: ${m.text}${thoughtsPart}`;
  }).join('\n');

  // 检索世界书与记忆
  let worldBookPrompt = '';
  try {
    const worldBooks = loadWorldBooks();
    const evalResult = evaluateWorldBookContext(session.characterId, userMessageText + ' ' + (actionText || ''), worldBooks);
    if (evalResult && evalResult.promptText) {
      worldBookPrompt = `\n【当前场景关联世界书设定】\n${evalResult.promptText}\n`;
    }
  } catch {}

  const characterPersona = character?.persona || session.aiRole.description || '沉浸式角色扮演';

  const prompt = `你正在参与名为「小剧场」的沉浸式双人互动角色扮演游戏。请完全融入角色，做出深度、生动且具推进力的回应。

【当前剧场标题】《${session.title}》
【世界观设定】${session.worldBackground}
【当前章节】${session.chapter}
【当前时间与地点】${session.currentTime} · ${session.currentLocation}
【当前亲密度】${session.intimacy}/100

【AI扮演的角色】
- 名字：${session.aiRole.name}
- 身份：${session.aiRole.identity}
- 性别：${session.aiRole.gender}
- 你的专属隐秘秘密与动机：${session.aiRole.secret}
- 性格人设与说话风格：${characterPersona}

【用户扮演的角色】
- 名字：${session.userRole.name}
- 身份：${session.userRole.identity}
- 性别：${session.userRole.gender}
${worldBookPrompt}
【对话历史记录（最近${recentMessages.length}条，请保持剧情与情感递进的连续性）】
${formattedHistory}

【用户最新行动与发言】
用户(${session.userRole.name})${actionText ? ` [动作/神态: ${actionText}]` : ''}: ${userMessageText}

【回复要求】
1. 必须完全根据自身身份与秘密做出有张力的反应，不要迎合，要有角色自主性格。
2. 将台词和动作神态分开：
   - "text"：纯台词发言（不要在台词里重复包裹动作括号）。
   - "action"：细腻的肢体动作、呼吸神态、眼神交互或环境互动。
   - "thoughts"：此时此刻你心中的隐秘计算或内心真实独白。
3. "intimacyDelta"：整数，范围 -3 到 +3（好感增加 +1~+3，冒犯/冷淡 -1~-3，普通平缓 0）。
4. 若剧情发生地点移动、时间推移或进入新剧情高潮，更新相应字段，否则留空。
5. 必须返回纯 JSON 格式：
{
  "text": "AI角色的对话台词",
  "action": "AI角色的神态、动作、肢体交互描写",
  "thoughts": "AI角色内心的真实独白与盘算",
  "updatedLocation": "新地点（若无变更请留空字符串）",
  "updatedTime": "新时间（若无变更请留空字符串）",
  "updatedChapter": "新章节名（若无变更请留空字符串）",
  "intimacyDelta": 1
}`;

  let res: Response;
  try {
    res = await apiFetch('/api/gemini/theater-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        textApiConfig,
        theaterType: 'chat',
      }),
    });
  } catch (netErr: any) {
    throw new Error(`网络连接失败：${netErr.message || '请检查网络连接'}`);
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`服务响应异常 (HTTP ${res.status})，无法读取回应`);
  }

  if (!res.ok || !data.ok) {
    const rawMsg = data?.errorMessage || data?.error || `对话生成失败 (HTTP ${res.status})`;
    const buildTheaterErr = (msg: string) => {
      const finalMsg = data?.mayHaveBeenCharged
        ? `${msg}（请求已发送至上游，可能已产生扣费，如需重发请点击手动重试）`
        : msg;
      const err: any = new Error(finalMsg);
      err.statusCode = res.status;
      err.mayHaveBeenCharged = Boolean(data?.mayHaveBeenCharged);
      err.upstreamRequestSent = data?.upstreamRequestSent;
      err.protocol = data?.protocol;
      err.causeCode = data?.causeCode;
      err.requestId = data?.requestId;
      return err;
    };
    if (res.status === 401 || res.status === 403) {
      throw buildTheaterErr(`API 鉴权失败：${rawMsg}。请检查API密钥配置。`);
    }
    if (res.status === 429) {
      throw buildTheaterErr(`请求超限或触发速率限制(429)：${rawMsg}。请稍后重试。`);
    }
    throw buildTheaterErr(rawMsg);
  }

  const parsed = cleanAndParseJson(data.text, '剧场回应解析');

  let intimacyDelta = 0;
  if (typeof parsed.intimacyDelta === 'number') {
    intimacyDelta = Math.max(-3, Math.min(3, Math.round(parsed.intimacyDelta)));
  }

  const replyMsg: TheaterMessage = {
    id: 'msg_' + Date.now(),
    sender: 'ai',
    text: parsed.text || '……',
    timestamp: Date.now(),
    action: parsed.action || '',
    thoughts: parsed.thoughts || '',
  };

  return {
    replyMessage: replyMsg,
    updatedLocation: parsed.updatedLocation?.trim() || undefined,
    updatedTime: parsed.updatedTime?.trim() || undefined,
    updatedChapter: parsed.updatedChapter?.trim() || undefined,
    intimacyDelta,
  };
}

/**
 * 生成完结回忆录
 */
export async function generateTheaterMemoirSummary(session: TheaterSession): Promise<string> {
  const { textApiConfig } = getApiConfigForEngine();
  if (!textApiConfig?.apiKey && !textApiConfig?.baseUrl) {
    return `在这场名为《${session.title}》的旅程中，${session.userRole.name}与${session.aiRole.name}并肩经历了波澜壮阔的冒险，彼此的羁绊深入心底。`;
  }

  const summaryPrompt = `请为以下「小剧场」角色扮演游戏会话生成一段文笔优美、感情细腻真挚的“结局回忆录”（150-250字），回顾用户(${session.userRole.name})与AI角色(${session.aiRole.name})在这场冒险中的转折与最终羁绊：
【剧场标题】${session.title}
【世界观】${session.worldBackground}
【最终亲密度】${session.intimacy}/100
【核心剧情片段回顾】
${session.messages.slice(-25).map(m => `${m.sender === 'user' ? session.userRole.name : session.aiRole.name}: ${m.text}`).join('\n')}

请直接返回纯文本摘要，不需要JSON。`;

  try {
    const res = await apiFetch('/api/gemini/theater-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: summaryPrompt,
        textApiConfig,
        theaterType: 'memoir',
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok && data.text) {
      return data.text.trim();
    }
  } catch {}

  return `在这场名为《${session.title}》的旅程中，${session.userRole.name}与${session.aiRole.name}并肩经历了波折与考验，两人的故事在此刻定格，成为彼此心中最珍贵的记忆。`;
}

