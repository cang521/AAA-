import { AiCharacter, ApiConfig } from '../../../types';

export type RpsSituation = 'before_throw' | 'ai_win' | 'ai_loss' | 'ai_streak' | 'ai_losing_streak' | 'draw';

export const RPS_CATEGORIES = [
  '日常问答',
  '兴趣喜好',
  '游戏与互动',
  '回忆与心事',
  '奇思假设',
  '性格自白',
  '灵魂二选一',
] as const;

export type RpsCategory = (typeof RPS_CATEGORIES)[number];

// Built-in character-tuned fallback question bank
export const FALLBACK_QUESTIONS: Record<string, { category: RpsCategory; question: string }[]> = {
  default: [
    { category: '日常问答', question: '今天过得怎么样？有没有哪一刻觉得特别开心？' },
    { category: '兴趣喜好', question: '那你最喜欢和我一起做什么事情？' },
    { category: '灵魂二选一', question: '如果只能选一样：无限期的阳光沙滩度假 vs 随时能喝到的美味奶茶？' },
    { category: '奇思假设', question: '如果流落荒岛只能带三样东西，你会把我装进行李吗？' },
    { category: '游戏与互动', question: '老实交代！刚才出拳你是不是猜中了我的心思？' },
    { category: '回忆与心事', question: '你记忆中最想回到的一天是哪一天？为什么呢？' },
    { category: '性格自白', question: '在朋友眼里，你是一个更偏向理性还是感性的人呀？' },
    { category: '日常问答', question: '最近晚上睡得好吗？有没有什么烦心事想跟我倾诉？' },
    { category: '灵魂二选一', question: '甜咸之争！吃豆花或粽子你更偏向甜党还是咸党？' },
    { category: '奇思假设', question: '如果能拥有一种超能力，你最想拥有瞬间移动还是读心术？' },
  ],
};

// Built-in fallback dialogues based on character persona keywords
export const getRpsFallbackDialogue = (
  character: AiCharacter,
  situation: RpsSituation,
  streak: number = 0
): string => {
  const name = character?.name || 'AI';
  const persona = character?.persona || '';

  // Gentle / Senior sister (e.g. 林思微)
  if (persona.includes('温柔') || persona.includes('学姐') || persona.includes('关心')) {
    switch (situation) {
      case 'before_throw':
        return '准备好了吗？这次学姐可要认真出拳咯~';
      case 'ai_win':
        return '嘿嘿，这局归我啦！那我要向你提个小问题~';
      case 'ai_loss':
        return '哇，被你赢走啦！请提问吧，学姐愿赌服输~';
      case 'ai_streak':
        return '连赢几局啦，今天我的手气好像格外好呢！';
      case 'ai_losing_streak':
        return '连输两局啦……下一把我得重新集中注意力才行！';
      case 'draw':
        return '呀，又是平局！看来我们俩心有灵犀呢~';
    }
  }

  // Calm / Cool / CEO (e.g. 顾沉)
  if (persona.includes('冷静') || persona.includes('严谨') || persona.includes('沉稳') || persona.includes('总裁')) {
    switch (situation) {
      case 'before_throw':
        return '出拳吧。概率上我已经推算出你的倾向了。';
      case 'ai_win':
        return '这局我赢了。按照约定，回答我一个问题。';
      case 'ai_loss':
        return '……运气不错。说吧，你想问什么？';
      case 'ai_streak':
        return '你出拳的规律已经被我完全看穿了。';
      case 'ai_losing_streak':
        return '等等……你是不是临时改变了心理博弈策略？';
      case 'draw':
        return '默契不错，继续。';
    }
  }

  // Lively / Tsundere / Cute
  if (persona.includes('活泼') || persona.includes('傲娇') || persona.includes('可爱')) {
    switch (situation) {
      case 'before_throw':
        return '这次我可绝对不会让你！接招吧！';
      case 'ai_win':
        return '哼哼！本大厨/本天才赢啦！乖乖接招回答问题吧！';
      case 'ai_loss':
        return '呜……刚才不算！好吧好吧，你想问什么快问！';
      case 'ai_streak':
        return '哇咔咔！连胜势不可挡，你是不是根本摸不清我的套路！';
      case 'ai_losing_streak':
        return '等等！我严重怀疑你偷偷作弊了！下一把看我绝地反击！';
      case 'draw':
        return '哇！居然一模一样！再来一次！';
    }
  }

  // Default
  switch (situation) {
    case 'before_throw':
      return '石头剪刀布，这次我可不会让你哦！';
    case 'ai_win':
      return '嘿嘿，这局归我！准备好回答我的问题了吗？';
    case 'ai_loss':
      return '……好啦你赢了，愿赌服输，你想问我什么？';
    case 'ai_streak':
      return '你是不是已经被我看穿套路啦？连胜真开心！';
    case 'ai_losing_streak':
      return '等等，我怀疑你作弊！下一把一定要赢回来！';
    case 'draw':
      return '平局，真有默契！再来一次！';
  }
};

// Fetch live dialogue from backend API
export const fetchRpsDialogue = async (
  character: AiCharacter,
  situation: RpsSituation,
  streak: number,
  roundResult: string,
  apiConfig?: ApiConfig
): Promise<string> => {
  try {
    const res = await fetch('/api/gemini/rps-dialogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        situation,
        streak,
        roundResult,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.speech) {
      return data.data.speech;
    }
  } catch (e) {
    console.warn('Failed to fetch RPS dialogue:', e);
  }
  return getRpsFallbackDialogue(character, situation, streak);
};

// Generate Question when AI wins
export const generateRpsQuestion = async (
  character: AiCharacter,
  targetName: string,
  recentQuestions: string[] = [],
  category?: string,
  apiConfig?: ApiConfig
): Promise<{ question: string; category: string }> => {
  try {
    const res = await fetch('/api/gemini/rps-generate-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        targetName,
        recentQuestions,
        category,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.question) {
      return {
        question: data.data.question,
        category: data.data.category || category || '日常问答',
      };
    }
  } catch (e) {
    console.warn('Failed to generate RPS question:', e);
  }

  // Fallback question
  const pool = FALLBACK_QUESTIONS.default;
  const filtered = pool.filter((item) => !recentQuestions.includes(item.question));
  const selected = (filtered.length > 0 ? filtered : pool)[
    Math.floor(Math.random() * (filtered.length > 0 ? filtered.length : pool.length))
  ];

  return {
    question: selected.question,
    category: selected.category,
  };
};

// Answer Question when AI loses (or in EvE)
export const answerRpsQuestion = async (
  character: AiCharacter,
  question: string,
  askerName: string,
  apiConfig?: ApiConfig
): Promise<string> => {
  try {
    const res = await fetch('/api/gemini/rps-answer-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        question,
        askerName,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.answer) {
      return data.data.answer;
    }
  } catch (e) {
    console.warn('Failed to answer RPS question:', e);
  }

  // Fallback answer
  const name = character?.name || '我';
  return `既然猜拳输给了你，那${name}就认真回答啦：关于这个问题，我觉得只要能和你在一起聊天，就已经是让我感到最开心的事情啦！`;
};
