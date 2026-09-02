import { AiCharacter, ApiConfig, ApiLog } from '../../../types';

export type TicTacToeSituation =
  | 'player_threat' // 玩家准备形成三连
  | 'ai_block'      // AI挡住玩家
  | 'ai_win'        // AI获胜
  | 'player_win'    // AI失败
  | 'draw'          // 平局
  | 'thinking'      // 思考中
  | 'normal_move';  // 普通落子

interface GetTicTacToeDialogueParams {
  character: AiCharacter;
  situation: TicTacToeSituation;
  difficulty: string;
  lastMoveIndex?: number;
  apiConfig?: ApiConfig;
  onAddApiLog?: (log: ApiLog) => void;
}

/**
 * Generate fallback character-specific lines based on persona keywords and user requirements
 */
function getTemplateDialogue(char: AiCharacter, situation: TicTacToeSituation): string {
  const persona = (char.persona || '').toLowerCase();
  const isTsundereOrCeo =
    persona.includes('总裁') || persona.includes('冷') || persona.includes('傲娇') || persona.includes('严肃');
  const isGentleSister =
    persona.includes('温柔') || persona.includes('学姐') || persona.includes('贴心') || persona.includes('甜美');
  const isPlayful =
    persona.includes('活泼') || persona.includes('可爱') || persona.includes('调皮') || persona.includes('妹');

  switch (situation) {
    case 'player_threat':
      if (isTsundereOrCeo) {
        return '嗯？你是不是想赢我？没那么容易。';
      }
      if (isGentleSister) {
        return '嗯？你是不是想赢我呀？我可要认真防守啦~';
      }
      if (isPlayful) {
        return '哇！你是不是想偷偷三连赢我？被我盯上咯！';
      }
      return '嗯？你是不是想赢我？局势都在我的计算中。';

    case 'ai_block':
      if (isTsundereOrCeo) {
        return '被我发现了。别想从这里突破。';
      }
      if (isGentleSister) {
        return '被我发现了~ 好险好险，赶紧堵住。';
      }
      if (isPlayful) {
        return '哼哼，被我发现了！休想连成三颗！';
      }
      return '被我发现了。封堵成功。';

    case 'ai_win':
      if (isTsundereOrCeo) {
        return '这局归我啦。想赢我，再练练吧。';
      }
      if (isGentleSister) {
        return '这局归我啦~ 承让承让，你也很棒哦！';
      }
      if (isPlayful) {
        return '耶！这局归我啦！快夸夸我聪明~';
      }
      return '这局归我啦。棋局结束。';

    case 'player_win':
      if (isTsundereOrCeo) {
        return '……刚才那一步不算，我走神了。哼，再来！';
      }
      if (isGentleSister) {
        return '……刚才那一步不算，我走神了呢~ 恭喜你赢啦！';
      }
      if (isPlayful) {
        return '呜哇！刚才那一步不算啦，我走神了！不服气再来一局！';
      }
      return '……刚才那一步不算，我走神了。你技高一筹。';

    case 'draw':
      if (isTsundereOrCeo) {
        return '平局！谁都没赢。看来你还算有点本事。';
      }
      if (isGentleSister) {
        return '平局！谁都没赢呢，我们真有默契~';
      }
      if (isPlayful) {
        return '平局！谁都没赢，满盘都填满啦！再来！';
      }
      return '平局！谁都没赢。势均力敌的一局。';

    case 'thinking':
      if (isTsundereOrCeo) {
        return '别催，让我想想。九宫格虽小，亦有玄机。';
      }
      if (isGentleSister) {
        return '让我想想……下一格放在哪里最好呢~';
      }
      if (isPlayful) {
        return '唔……转动我的智慧小脑袋瓜中！';
      }
      return '让我想想……正在计算最佳落子点。';

    case 'normal_move':
    default:
      if (isTsundereOrCeo) {
        return '到你了。落子利落点。';
      }
      if (isGentleSister) {
        return '轮到你啦，慢慢下不急哦。';
      }
      if (isPlayful) {
        return '该你出手咯！看你怎么接~';
      }
      return '轮到你了，请在九宫格中落子。';
  }
}

/**
 * Fetch dynamic AI dialogue (async with instant fallback)
 */
export async function getTicTacToeDialogue({
  character,
  situation,
  difficulty,
  lastMoveIndex,
  apiConfig,
  onAddApiLog,
}: GetTicTacToeDialogueParams): Promise<string> {
  const fallback = getTemplateDialogue(character, situation);

  // If no API key configured, return fallback immediately
  if (!apiConfig?.textApiKey && !apiConfig?.textBaseUrl) {
    return fallback;
  }

  try {
    const res = await fetch('/api/gemini/tictactoe-commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        character,
        situation,
        difficulty,
        lastMoveIndex,
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
    console.warn('Live AI speech generation for TicTacToe error, using persona template', e);
  }

  return fallback;
}
