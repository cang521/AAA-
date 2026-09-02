import { AiCharacter, ApiConfig, ApiLog } from '../../../types';

export type GomokuSituation =
  | 'thinking'
  | 'player_threat'
  | 'ai_attack'
  | 'ai_win'
  | 'player_win'
  | 'draw'
  | 'normal_move';

interface GetDialogueParams {
  character: AiCharacter;
  situation: GomokuSituation;
  difficulty: string;
  lastMove?: { r: number; c: number };
  boardSummary?: string;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}

/**
 * Generate fallback character-specific lines based on persona keywords
 */
function getTemplateDialogue(char: AiCharacter, situation: GomokuSituation): string {
  const name = char.name;
  const persona = (char.persona || '').toLowerCase();
  const isTsundereOrCeo = persona.includes('总裁') || persona.includes('冷') || persona.includes('傲娇') || persona.includes('严肃');
  const isGentleSister = persona.includes('温柔') || persona.includes('学姐') || persona.includes('贴心') || persona.includes('甜美');
  const isPlayful = persona.includes('活泼') || persona.includes('可爱') || persona.includes('调皮') || persona.includes('妹');

  switch (situation) {
    case 'thinking':
      if (isTsundereOrCeo) {
        return '这步棋有点意思……别急，容我推演片刻。';
      }
      if (isGentleSister) {
        return '让我想想……你下得好认真呀，我也得加油了呢。';
      }
      if (isPlayful) {
        return '唔……盯——！看我识破你的小算盘！';
      }
      return '让我想想……正在计算最佳落子点。';

    case 'player_threat':
      if (isTsundereOrCeo) {
        return '等等，你这一步有点危险……算你有点本事。';
      }
      if (isGentleSister) {
        return '呀！这一步好厉害，我差点没防住呢，好险~';
      }
      if (isPlayful) {
        return '哇！你怎么偷偷连成了杀招，休想得逞！';
      }
      return '等等，你这一步有点危险，我必须立刻拦截。';

    case 'ai_attack':
      if (isTsundereOrCeo) {
        return '这一步，我可是想了很久。看你怎么破这局。';
      }
      if (isGentleSister) {
        return '这一步我稍微认真了一点点哦，小心接招啦~';
      }
      if (isPlayful) {
        return '嘿嘿，看我的绝妙落子！看你往哪儿跑~';
      }
      return '这一步，我可是想了很久。局势掌握在我手中。';

    case 'player_win':
      if (isTsundereOrCeo) {
        return '……是你赢了。哼，别得意，下次我不会大意了。';
      }
      if (isGentleSister) {
        return '你赢了！🎉 太棒了，你的棋艺真的进步好快呀！';
      }
      if (isPlayful) {
        return '呜哇！居然输给你了！不服气，再来一局嘛~';
      }
      return '你赢了！🎉 完美的布局，这局我心服口服。';

    case 'ai_win':
      if (isTsundereOrCeo) {
        return '这局是我赢啦。我说了，我不会一直让着你的。';
      }
      if (isGentleSister) {
        return '承让承让啦~ 这局是我侥幸胜出，你下得也很棒哦！';
      }
      if (isPlayful) {
        return '耶！我赢啦！怎么样，我的五子棋厉害吧~';
      }
      return '这局是我赢啦。感谢精彩的对局！';

    case 'draw':
      if (isTsundereOrCeo) {
        return '棋逢对手么……平局，再来一局决胜负？';
      }
      if (isGentleSister) {
        return '平局，再来一局？我们俩真的好有默契呀~';
      }
      if (isPlayful) {
        return '居然下满了！平局耶，再来一局分高下！';
      }
      return '平局，再来一局？势均力敌的精彩战斗。';

    case 'normal_move':
    default:
      if (isTsundereOrCeo) {
        return '轮到你了。别让我等太久。';
      }
      if (isGentleSister) {
        return '落子啦，慢慢想不着急哦。';
      }
      if (isPlayful) {
        return '到你了到你了！快走下一步~';
      }
      return '落子完成，请走棋。';
  }
}

/**
 * Fetch dynamic AI dialogue (async with instant fallback)
 */
export async function getGomokuDialogue({
  character,
  situation,
  difficulty,
  lastMove,
  boardSummary,
  apiConfig,
  onAddApiLog,
}: GetDialogueParams): Promise<string> {
  const fallback = getTemplateDialogue(character, situation);

  // If no API key configured or background active, return fallback immediately
  if (!apiConfig?.textApiKey && !apiConfig?.textBaseUrl) {
    return fallback;
  }

  try {
    const res = await fetch('/api/gemini/gomoku-commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        situation,
        boardSummary,
        difficulty,
        lastMove,
        apiConfig,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.data?.speech) {
        if (data.apiLog && onAddApiLog) {
          onAddApiLog(data.apiLog);
        }
        return data.data.speech;
      }
    }
  } catch (e) {
    console.warn('Live AI speech generation error, using persona template', e);
  }

  return fallback;
}
