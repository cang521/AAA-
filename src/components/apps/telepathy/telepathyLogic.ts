import {
  AiCharacter,
  ChatMessage,
  UserProfile,
  TelepathyQuestion,
  TelepathyRoundResult,
  TelepathyRecord,
  ApiConfig,
} from '../../../types';

export const TELEPATHY_LEVELS = [
  { min: 0, max: 20, title: '刚认识', desc: '初识阶段，彼此还在互相了解摸索中~', color: 'text-zinc-400', bg: 'bg-zinc-800' },
  { min: 21, max: 40, title: '有点默契', desc: '偶尔能想到一块去，开始产生奇妙共鸣！', color: 'text-blue-400', bg: 'bg-blue-950/60' },
  { min: 41, max: 60, title: '挺有默契', desc: '越来越懂对方的心思，经常不谋而合！', color: 'text-purple-400', bg: 'bg-purple-950/60' },
  { min: 61, max: 80, title: '非常默契', desc: '心意相通，一个眼神/举动就能猜中！', color: 'text-pink-400', bg: 'bg-pink-950/60' },
  { min: 81, max: 100, title: '心有灵犀 ❤️', desc: '灵魂契合，无与伦比的极致默契！', color: 'text-rose-400', bg: 'bg-rose-950/60' },
];

export const getAffinityLevel = (score: number) => {
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  return (
    TELEPATHY_LEVELS.find((lvl) => rounded >= lvl.min && rounded <= lvl.max) ||
    TELEPATHY_LEVELS[0]
  );
};

// Rich built-in question bank across all categories
export const BUILTIN_TELEPATHY_QUESTIONS: TelepathyQuestion[] = [
  // 1. 日常选择 (Daily)
  {
    id: 'q_daily_1',
    category: 'daily',
    categoryLabel: '日常选择',
    question: '如果现在出去玩，你更想去哪里？',
    options: [
      { id: 'A', text: '吃饭', icon: '🍜' },
      { id: 'B', text: '看电影', icon: '🎬' },
      { id: 'C', text: '打游戏', icon: '🎮' },
      { id: 'D', text: '散步', icon: '🌃' },
    ],
  },
  {
    id: 'q_daily_2',
    category: 'daily',
    categoryLabel: '日常选择',
    question: '周末突然有了半天完全自由的空闲时间，你通常会先做什么？',
    options: [
      { id: 'A', text: '点杯好喝的窝着刷手机/追剧', icon: '🥤' },
      { id: 'B', text: '补个沉沉的美容觉', icon: '😴' },
      { id: 'C', text: '约朋友出门逛街探店', icon: '🛍️' },
      { id: 'D', text: '整理房间或做点手作', icon: '🧹' },
    ],
  },
  {
    id: 'q_daily_3',
    category: 'daily',
    categoryLabel: '日常选择',
    question: '深夜肚子突然饿了，你会偏向选择哪种夜宵？',
    options: [
      { id: 'A', text: '热气腾腾的泡面加蛋', icon: '🍜' },
      { id: 'B', text: '香气四溢的烧烤炸鸡', icon: '🍗' },
      { id: 'C', text: '清爽的水果或酸奶', icon: '🥛' },
      { id: 'D', text: '强忍困意直接睡觉', icon: '🛌' },
    ],
  },
  {
    id: 'q_daily_4',
    category: 'daily',
    categoryLabel: '日常选择',
    question: '去奶茶店点单时，你的甜度冰量习惯通常是？',
    options: [
      { id: 'A', text: '半糖 / 微糖微冰 (健康清爽)', icon: '🧊' },
      { id: 'B', text: '全糖正常冰 (就是要甜要爽)', icon: '🥤' },
      { id: 'C', text: '不加糖纯茶 (茶香浓郁)', icon: '🍵' },
      { id: 'D', text: '温热无糖 (养生暖胃)', icon: '🫖' },
    ],
  },

  // 2. 喜好倾向 (Preferences)
  {
    id: 'q_pref_1',
    category: 'preference',
    categoryLabel: '喜好倾向',
    question: '你更喜欢哪一种天气？',
    options: [
      { id: 'A', text: '晴天', icon: '☀️' },
      { id: 'B', text: '雨天', icon: '🌧️' },
      { id: 'C', text: '下雪', icon: '❄️' },
      { id: 'D', text: '阴天', icon: '🌙' },
    ],
  },
  {
    id: 'q_pref_2',
    category: 'preference',
    categoryLabel: '喜好倾向',
    question: '在听音乐的时候，你更容易被哪种风格打动？',
    options: [
      { id: 'A', text: '温柔治愈的流行抒情慢歌', icon: '🎧' },
      { id: 'B', text: '充满活力的轻快电子/摇滚', icon: '🎸' },
      { id: 'C', text: '纯音乐 / 钢琴爵士伴奏', icon: '🎹' },
      { id: 'D', text: '复古怀旧经典老歌', icon: '📻' },
    ],
  },
  {
    id: 'q_pref_3',
    category: 'preference',
    categoryLabel: '喜好倾向',
    question: '如果选一只毛茸茸的宠物陪伴你，你更倾向于？',
    options: [
      { id: 'A', text: '高冷又粘人的小猫咪', icon: '🐱' },
      { id: 'B', text: '热情忠诚的大狗狗', icon: '🐶' },
      { id: 'C', text: '安静可爱的仓鼠/垂耳兔', icon: '🐰' },
      { id: 'D', text: '智能电子宠物/AI云吸宠', icon: '🤖' },
    ],
  },
  {
    id: 'q_pref_4',
    category: 'preference',
    categoryLabel: '喜好倾向',
    question: '在风景中看日出还是看日落？',
    options: [
      { id: 'A', text: '破晓初升的朝霞晨光 (充满希望)', icon: '🌅' },
      { id: 'B', text: '橘红浪漫的傍晚晚霞 (温柔惬意)', icon: '🌇' },
      { id: 'C', text: '繁星密布的静谧深夜 (神秘深邃)', icon: '🌌' },
      { id: 'D', text: '午后树荫洒下的斑驳阳光', icon: '🌿' },
    ],
  },

  // 3. 性格自白 (Personality)
  {
    id: 'q_pers_1',
    category: 'personality',
    categoryLabel: '性格自白',
    question: '如果突然获得一天完全不被打扰的假期，你会？',
    options: [
      { id: 'A', text: '睡一天好好休息', icon: '🛌' },
      { id: 'B', text: '打游戏沉浸在虚拟世界', icon: '🎮' },
      { id: 'C', text: '做平时想做却没空做的事', icon: '🎨' },
      { id: 'D', text: '出门去户外或探索城市', icon: '🚗' },
    ],
  },
  {
    id: 'q_pers_2',
    category: 'personality',
    categoryLabel: '性格自白',
    question: '遇到烦心或委屈的事情时，你通常习惯如何排解？',
    options: [
      { id: 'A', text: '找信任的人大哭或倾诉吐槽', icon: '🗣️' },
      { id: 'B', text: '一个人安静地呆着慢慢自愈消化', icon: '🧘' },
      { id: 'C', text: '疯狂吃美食或买喜欢的东西转移注意', icon: '🍰' },
      { id: 'D', text: '做剧烈运动或沉浸式做别的事情打断情绪', icon: '🏃' },
    ],
  },
  {
    id: 'q_pers_3',
    category: 'personality',
    categoryLabel: '性格自白',
    question: '如果要用一个词形容你在社交场合的状态，通常是？',
    options: [
      { id: 'A', text: '慢热型 (熟了之后才会放飞自我)', icon: '🧊' },
      { id: 'B', text: '社恐型 (能不说话尽量保持透明)', icon: '🙈' },
      { id: 'C', text: '社牛型 (随和自来熟带动气氛)', icon: '🎉' },
      { id: 'D', text: '观察者 (默默看大家互动当捧哏)', icon: '👀' },
    ],
  },

  // 4. 假设情境 (Scenario)
  {
    id: 'q_scen_1',
    category: 'scenario',
    categoryLabel: '假设情境',
    question: '如果我们一起出发去一个陌生海岛旅行，你觉得第一件事情应该做什么？',
    options: [
      { id: 'A', text: '直奔当地特色美食街大吃一顿', icon: '🥘' },
      { id: 'B', text: '先去酒店办入住把行李放好洗漱休息', icon: '🏨' },
      { id: 'C', text: '立刻跑到海边踩水拍好看的照片', icon: '🏖️' },
      { id: 'D', text: '租一辆小电驴沿着环岛公路兜风', icon: '🛵' },
    ],
  },
  {
    id: 'q_scen_2',
    category: 'scenario',
    categoryLabel: '假设情境',
    question: '如果世界上真有一扇任意门，你最想瞬间到达哪里？',
    options: [
      { id: 'A', text: '北极仰望绚烂极光与冰川', icon: '🌌' },
      { id: 'B', text: '浪漫温暖的南法花海小镇', icon: '🌸' },
      { id: 'C', text: '无忧无虑的童年老家旧时光', icon: '🏡' },
      { id: 'D', text: '科技感爆棚的未来赛博都市', icon: '🏙️' },
    ],
  },
  {
    id: 'q_scen_3',
    category: 'scenario',
    categoryLabel: '假设情境',
    question: '如果我们一起逛超市采购，你最容易在哪个货架前流连忘返？',
    options: [
      { id: 'A', text: '琳琅满目的零食与薯片糖果区', icon: '🍿' },
      { id: 'B', text: '整整一整排的冰饮乳品冰淇淋区', icon: '🍦' },
      { id: 'C', text: '热气腾腾的熟食烘焙香气区', icon: '🥐' },
      { id: 'D', text: '各种可爱文具杂货玩具区', icon: '🧸' },
    ],
  },

  // 5. 羁绊与互动 (Relationship)
  {
    id: 'q_rel_1',
    category: 'relationship',
    categoryLabel: '专属互动',
    question: '在你眼里，我和你在一起相处时，最默契的瞬间往往是？',
    options: [
      { id: 'A', text: '不用说太多话，彼此就能懂对方的心情', icon: '✨' },
      { id: 'B', text: '经常同一秒想到同一个好玩的梗或话题', icon: '🤣' },
      { id: 'C', text: '疲惫时有温暖的陪伴与随时可倾诉的安全感', icon: '🫂' },
      { id: 'D', text: '一起下棋、玩小游戏切磋互动的时候', icon: '🎮' },
    ],
  },
  {
    id: 'q_rel_2',
    category: 'relationship',
    categoryLabel: '专属互动',
    question: '如果为你挑选一件随身携带的幸运小物件，你最希望是？',
    options: [
      { id: 'A', text: '刻着专属祝福的精致钥匙扣/手链', icon: '🔑' },
      { id: 'B', text: '一张写着温暖字句的拍立得照片', icon: '📷' },
      { id: 'C', text: '一只小巧软萌的治愈毛绒玩偶挂件', icon: '🧸' },
      { id: 'D', text: '一瓶散发舒缓清香的木质香氛喷雾', icon: '🌿' },
    ],
  },
];

// Fallback AI deduction logic based on player profile, character persona & memories
export const getFallbackAiChoice = (
  character: AiCharacter,
  question: TelepathyQuestion,
  userProfile?: UserProfile,
  characterMemories?: string[]
): { choiceId: string; choiceText: string } => {
  const options = question.options;
  const userPersona = (userProfile?.persona || '') + ' ' + (userProfile?.preferences || '');
  const charPersona = character?.persona || '';
  const memoriesStr = (characterMemories || []).join(' ') + ' ' + (character?.memories || []).join(' ');

  // Heuristic matching: find option most likely preferred by the user given the context
  let bestScore = -1;
  let bestOpt = options[0];

  options.forEach((opt, idx) => {
    let score = Math.random() * 2; // base variance

    // Check if user profile mentions keywords
    if (userPersona.includes(opt.text) || userPersona.includes(opt.id)) score += 5;
    if (memoriesStr.includes(opt.text)) score += 6;

    // Specific domain heuristics
    if (opt.text.includes('游戏') && (userPersona.includes('游戏') || memoriesStr.includes('游戏'))) score += 4;
    if (opt.text.includes('散步') && (userPersona.includes('散步') || charPersona.includes('学姐') || charPersona.includes('温柔'))) score += 3.5;
    if (opt.text.includes('雨天') && (userPersona.includes('雨') || memoriesStr.includes('雨'))) score += 4;
    if (opt.text.includes('晴天') && userPersona.includes('阳光')) score += 4;
    if (opt.text.includes('安静') && userPersona.includes('安静')) score += 4;
    if (opt.text.includes('奶茶') && memoriesStr.includes('半糖')) {
      if (opt.text.includes('半糖') || opt.text.includes('微糖')) score += 8;
    }
    if (opt.text.includes('睡') && (userPersona.includes('懒') || userPersona.includes('睡'))) score += 4;
    if (opt.text.includes('猫') && userPersona.includes('猫')) score += 4;

    if (score > bestScore) {
      bestScore = score;
      bestOpt = opt;
    }
  });

  return {
    choiceId: bestOpt.id,
    choiceText: bestOpt.text,
  };
};

// Fallback reaction generation
export const getFallbackReaction = (
  character: AiCharacter,
  isMatch: boolean,
  currentStreak: number,
  playerChoiceText: string,
  aiChoiceText: string
): string => {
  const name = character?.name || '我';
  const persona = character?.persona || '';

  if (isMatch) {
    if (currentStreak >= 3) {
      if (persona.includes('霸总') || persona.includes('顾沉')) {
        return `连续 ${currentStreak} 次猜中。看来你脑子里在想什么，完全逃不过我的推断。`;
      }
      if (persona.includes('学姐') || persona.includes('温柔')) {
        return `哇！居然已经连续猜中 ${currentStreak} 题啦！我们俩的脑电波真的完全连在一起了呢~ ❤️`;
      }
      return `连续猜中 ${currentStreak} 次！看来我们真的越来越了解彼此、心有灵犀了！`;
    }

    if (persona.includes('霸总') || persona.includes('顾沉')) {
      return `我就知道你会选“${playerChoiceText}”，我的判断从不会失误。`;
    }
    if (persona.includes('学姐') || persona.includes('温柔')) {
      return `嘻嘻，我就猜到你会选“${playerChoiceText}”！我们果然想到一块去了~`;
    }
    return `猜对啦！我就知道你一定会选“${playerChoiceText}”！`;
  } else {
    if (persona.includes('霸总') || persona.includes('顾沉')) {
      return `……选了“${playerChoiceText}”吗？看来你还有我意料之外的小心思，记下了。`;
    }
    if (persona.includes('学姐') || persona.includes('温柔')) {
      return `哎呀，我刚才还在“${aiChoiceText}”和“${playerChoiceText}”之间犹豫呢！下次一定猜中你~`;
    }
    return `……好吧，这道题我确实没猜中你的想法，下一题我一定努力跟上你的节奏！`;
  }
};

// Call AI API to make deduction and generate response
export const requestAiTelepathyChoice = async (
  character: AiCharacter,
  question: TelepathyQuestion,
  userProfile?: UserProfile,
  chatMessages?: ChatMessage[],
  characterMemories?: string[],
  apiConfig?: ApiConfig
): Promise<{
  choiceId: string;
  choiceText: string;
  confidenceReason?: string;
}> => {
  try {
    const res = await fetch('/api/gemini/telepathy-deduce-choice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        question,
        userProfile,
        characterMemories,
        recentChats: (chatMessages || []).slice(-6).map((m) => `${m.sender === 'user' ? '玩家' : character.name}: ${m.text}`),
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.choiceId) {
      const matchOpt = question.options.find((o) => o.id === data.data.choiceId) || question.options[0];
      return {
        choiceId: matchOpt.id,
        choiceText: matchOpt.text,
        confidenceReason: data.data.reason,
      };
    }
  } catch (err) {
    console.warn('AI telepathy deduction fallback:', err);
  }

  return getFallbackAiChoice(character, question, userProfile, characterMemories);
};

// Request AI dynamic reaction based on round match
export const requestAiTelepathyReaction = async (
  character: AiCharacter,
  question: TelepathyQuestion,
  playerChoiceText: string,
  aiChoiceText: string,
  isMatch: boolean,
  currentStreak: number,
  apiConfig?: ApiConfig
): Promise<string> => {
  try {
    const res = await fetch('/api/gemini/telepathy-reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        questionText: question.question,
        playerChoiceText,
        aiChoiceText,
        isMatch,
        currentStreak,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.reaction) {
      return data.data.reaction;
    }
  } catch (err) {
    console.warn('AI reaction fallback:', err);
  }

  return getFallbackReaction(character, isMatch, currentStreak, playerChoiceText, aiChoiceText);
};

// Generate Memory from completed game if allowed
export const generateTelepathyMemory = async (
  character: AiCharacter,
  record: TelepathyRecord,
  userProfile?: UserProfile,
  apiConfig?: ApiConfig
): Promise<string> => {
  const userName = userProfile?.name || '玩家';
  try {
    const res = await fetch('/api/gemini/telepathy-generate-memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        userName,
        record,
        apiConfig,
      }),
    });
    const data = await res.json();
    if (data.success && data.data?.memory) {
      return data.data.memory;
    }
  } catch (err) {
    console.warn('Telepathy memory generation fallback:', err);
  }

  // Fallback memory summary
  const sampleRound = record.rounds.find((r) => r.isMatch) || record.rounds[0];
  if (sampleRound) {
    return `${userName}在“心有灵犀”默契小游戏中与${character.name}默契度达到${record.matchRate}%，在“${sampleRound.question.question}”中偏好选择“${sampleRound.playerChoiceText}”。`;
  }
  return `${userName}在“心有灵犀”默契挑战中获得了${record.matchRate}%的默契分（${record.affinityLevelTitle}）。`;
};
