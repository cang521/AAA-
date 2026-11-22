import { AiCharacter, TheaterPreset, TheaterRole, TheaterSession, TheaterMessage } from '../../types';
import { BUILTIN_THEATER_PRESETS } from './theaterPresets';
import { getRecentDrawIdsFromDb, addRecentDrawIdToDb, loadCustomPresetsFromDb } from './theaterDb';

export async function getAllAvailablePresets(): Promise<TheaterPreset[]> {
  const custom = await loadCustomPresetsFromDb();
  return [...BUILTIN_THEATER_PRESETS, ...custom];
}

export async function getRandomTheaterPreset(
  categoryId?: string,
  worldFilter?: string
): Promise<TheaterPreset> {
  const all = await getAllAvailablePresets();
  const recentIds = await getRecentDrawIdsFromDb();

  let filtered = all;
  if (categoryId && categoryId !== 'all') {
    filtered = filtered.filter(p => p.category === categoryId);
  }
  if (worldFilter && worldFilter !== 'all') {
    filtered = filtered.filter(p => p.worldBackground.includes(worldFilter) || p.title.includes(worldFilter));
  }

  // Deduplicate recent draws if possible
  let pool = filtered.filter(p => !recentIds.includes(p.id));
  if (pool.length === 0) {
    pool = filtered; // fallback if all were drawn recently
  }
  if (pool.length === 0) {
    pool = all; // absolute fallback
  }

  const selected = pool[Math.floor(Math.random() * pool.length)];
  await addRecentDrawIdToDb(selected.id);
  return selected;
}

export function validateGenderCompatibility(aiCharacter: AiCharacter, preset: TheaterPreset): boolean {
  const aiGender = (aiCharacter.gender || 'male').toLowerCase();
  const requiredGender = preset.aiRole.gender.toLowerCase();
  // Strict matching
  if (requiredGender === 'male' && aiGender !== 'male' && aiGender !== 'm') return false;
  if (requiredGender === 'female' && aiGender !== 'female' && aiGender !== 'f') return false;
  return true;
}

export async function generateInitialTheaterScenario(
  character: AiCharacter,
  preset: TheaterPreset,
  userNickname: string
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
  const textApiConfig = JSON.parse(localStorage.getItem('new_text_api_config') || '{}');
  
  const prompt = `请根据以下剧场预设与AI角色，为用户(${userNickname})与AI(${character.name})生成一段沉浸式角色扮演的开场剧本和双盲秘密。
【预设标题】${preset.title}
【预设分类】${preset.categoryName}
【世界观背景】${preset.worldBackground}
【初始场景】${preset.initialScene}
【初始时间】${preset.initialTime}
【初始地点】${preset.initialLocation}
【用户角色】名字：${userNickname}，身份：${preset.userRole.identity}，性别倾向：${preset.userRole.gender}。秘密模板：${preset.userRole.secretTemplate}
【AI角色】名字：${character.name}，人设：${character.persona}，剧场身份：${preset.aiRole.identity}，性别：${preset.aiRole.gender}。秘密模板：${preset.aiRole.secretTemplate}

要求返回严格的 JSON 格式（不要包含 markdown 代码块包裹，或请确保可被 JSON.parse 解析）：
{
  "title": "剧场标题",
  "worldBackground": "完善后的世界观设定...",
  "initialScene": "开场场景描述（支持动作、氛围、天气）...",
  "currentTime": "${preset.initialTime}",
  "currentLocation": "${preset.initialLocation}",
  "chapter": "第一章：初见与命运的交织",
  "userSecret": "为用户生成的具体秘密或隐藏动机...",
  "aiSecret": "为AI生成的具体秘密或隐藏动机...",
  "openingMessage": {
    "text": "AI角色的开场白台词...",
    "action": "AI角色的动作或神态描写（放在括号内）",
    "thoughts": "AI角色内心的隐秘想法（仅自己可见）"
  }
}`;

  try {
    const res = await fetch('/api/gemini/theater-scenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: textApiConfig.model,
        apiKey: textApiConfig.apiKey,
        baseUrl: textApiConfig.baseUrl,
        provider: textApiConfig.provider,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Failed to generate scenario');
    }

    const rawText = data.text.trim();
    const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleanJson);

    const userRole: TheaterRole = {
      id: 'user_main',
      name: userNickname,
      avatar: '',
      gender: preset.userRole.gender === 'female' ? 'female' : preset.userRole.gender === 'male' ? 'male' : 'other',
      identity: preset.userRole.identity,
      secret: parsed.userSecret || preset.userRole.secretTemplate,
      description: preset.userRole.identity,
    };

    const aiRole: TheaterRole = {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      gender: preset.aiRole.gender,
      identity: preset.aiRole.identity,
      secret: parsed.aiSecret || preset.aiRole.secretTemplate,
      description: character.persona,
    };

    const openingMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'ai',
      text: parsed.openingMessage?.text || preset.initialScene,
      timestamp: Date.now(),
      action: parsed.openingMessage?.action || '',
      thoughts: parsed.openingMessage?.thoughts || '',
    };

    return {
      title: parsed.title || preset.title,
      worldBackground: parsed.worldBackground || preset.worldBackground,
      initialScene: parsed.initialScene || preset.initialScene,
      currentTime: parsed.currentTime || preset.initialTime,
      currentLocation: parsed.currentLocation || preset.initialLocation,
      chapter: parsed.chapter || '第一章',
      userRole,
      aiRole,
      openingMessage: openingMsg,
    };
  } catch (e) {
    console.error('Failed to generate initial scenario via API, falling back to local default', e);
    // Fallback local construct
    const userRole: TheaterRole = {
      id: 'user_main',
      name: userNickname,
      avatar: '',
      gender: 'other',
      identity: preset.userRole.identity,
      secret: preset.userRole.secretTemplate,
      description: preset.userRole.identity,
    };

    const aiRole: TheaterRole = {
      id: character.id,
      name: character.name,
      avatar: character.avatar,
      gender: preset.aiRole.gender,
      identity: preset.aiRole.identity,
      secret: preset.aiRole.secretTemplate,
      description: character.persona,
    };

    const openingMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'ai',
      text: `（${preset.initialScene}）\n${character.name}抬起眼帘，目光落在你身上：“你来了。这里可不是什么安全的地方。”`,
      timestamp: Date.now(),
      action: preset.initialScene,
      thoughts: '观察对方的反应，判断对方是否带着敌意。',
    };

    return {
      title: preset.title,
      worldBackground: preset.worldBackground,
      initialScene: preset.initialScene,
      currentTime: preset.initialTime,
      currentLocation: preset.initialLocation,
      chapter: '第一章：初见',
      userRole,
      aiRole,
      openingMessage: openingMsg,
    };
  }
}

export async function sendTheaterChatMessage(
  session: TheaterSession,
  userMessageText: string,
  actionText?: string
): Promise<{
  replyMessage: TheaterMessage;
  updatedLocation?: string;
  updatedTime?: string;
  updatedChapter?: string;
  intimacyDelta?: number;
}> {
  const textApiConfig = JSON.parse(localStorage.getItem('new_text_api_config') || '{}');

  const contextMessages = session.messages.slice(-15).map(m => {
    const roleName = m.sender === 'user' ? session.userRole.name : m.sender === 'ai' ? session.aiRole.name : '旁白/系统';
    return `${roleName}: ${m.action ? `[动作:${m.action}] ` : ''}${m.text}`;
  }).join('\n');

  const prompt = `你正在参与名为「小剧场」的沉浸式角色扮演游戏。
【世界观设定】${session.worldBackground}
【当前章节】${session.chapter}
【当前时间与地点】${session.currentTime} · ${session.currentLocation}
【AI角色身份与秘密】名字：${session.aiRole.name}，身份：${session.aiRole.identity}，秘密：${session.aiRole.secret}。
【用户角色身份】名字：${session.userRole.name}，身份：${session.userRole.identity}。
【历史对话记录】
${contextMessages}

【用户最新发言】
用户(${session.userRole.name})${actionText ? `[动作/神态: ${actionText}]` : ''}: ${userMessageText}

要求返回严格的 JSON 格式（不要包含 markdown 代码块包裹）：
{
  "text": "AI的对话台词（符合人设与语气）...",
  "action": "AI的动作或神态描写（例如：微微挑眉，将茶杯放下）",
  "thoughts": "AI内心的真实想法或对当前局势的盘算",
  "updatedLocation": "如果地点发生变化填写新地点，否则留空",
  "updatedTime": "如果时间发生推移填写新时间，否则留空",
  "updatedChapter": "如果进入新章节填写新章节名，否则留空",
  "intimacyDelta": 1或0或-1（根据互动亲密度增减，整数）
}`;

  try {
    const res = await fetch('/api/gemini/theater-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: textApiConfig.model,
        apiKey: textApiConfig.apiKey,
        baseUrl: textApiConfig.baseUrl,
        provider: textApiConfig.provider,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || 'Failed to chat');
    }

    const rawText = data.text.trim();
    const cleanJson = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
    const parsed = JSON.parse(cleanJson);

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
      updatedLocation: parsed.updatedLocation || undefined,
      updatedTime: parsed.updatedTime || undefined,
      updatedChapter: parsed.updatedChapter || undefined,
      intimacyDelta: typeof parsed.intimacyDelta === 'number' ? parsed.intimacyDelta : 0,
    };
  } catch (e) {
    console.error('Failed theater chat API, returning fallback', e);
    const replyMsg: TheaterMessage = {
      id: 'msg_' + Date.now(),
      sender: 'ai',
      text: `（微微颔首）“你的话我记下了，接下来我们得小心行事。”`,
      timestamp: Date.now(),
      action: '微微颔首',
      thoughts: '观察对方的下一步行动。',
    };
    return {
      replyMessage: replyMsg,
      intimacyDelta: 1,
    };
  }
}

export async function generateTheaterMemoirSummary(session: TheaterSession): Promise<string> {
  const textApiConfig = JSON.parse(localStorage.getItem('new_text_api_config') || '{}');
  const summaryPrompt = `请为以下「小剧场」角色扮演游戏会话生成一段感人至深、文笔细腻的“回忆录/结局摘要”（约150-250字），记录用户(${session.userRole.name})与AI角色(${session.aiRole.name})在这场冒险中的点滴与情感羁绊：
【剧场标题】${session.title}
【世界观】${session.worldBackground}
【最终亲密度】${session.intimacy}/100
【核心对话片段摘要】
${session.messages.slice(-20).map(m => `${m.sender === 'user' ? session.userRole.name : session.aiRole.name}: ${m.text}`).join('\n')}

请直接返回纯文本摘要，不需要额外的JSON包裹。`;

  try {
    const res = await fetch('/api/gemini/theater-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: summaryPrompt,
        model: textApiConfig.model,
        apiKey: textApiConfig.apiKey,
        baseUrl: textApiConfig.baseUrl,
        provider: textApiConfig.provider,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok && data.text) {
      return data.text.trim();
    }
  } catch {}

  return `在这场名为《${session.title}》的旅程中，${session.userRole.name}与${session.aiRole.name}并肩经历了无数风雨与考验。从最初的戒备到后来的生死相托，这段共同的记忆将永远镌刻在彼此的心底。`;
}
