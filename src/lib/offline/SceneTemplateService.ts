/**
 * SceneTemplateService.ts
 * Manages Scene Templates for Offline Scene Mode.
 */

import { SceneTemplate, getDbSceneTemplates, saveDbSceneTemplate, deleteDbSceneTemplate } from './OfflineSessionDb';

export const PRESET_SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: 'preset_rainy_night',
    name: '雨夜宅家',
    description: '窗外雨声淅沥，与 AI 晚上呆在温馨的卧室里，分享茶饮与独处时光。',
    location: '家中卧室 / 落地窗前',
    atmosphere: '安静、温馨、亲密、放松',
    background: '窗外下着淅淅沥沥的暴雨，房间里开着暖黄色的落地灯，放着舒缓的爵士乐。香薰散发着淡淡的木质香气。',
    defaultOpening: '（把刚泡好的热红茶递到你手上，顺势在你身旁坐下，听着窗外的雨声轻笑）雨下得好大呢，不过... 这样待在一起感觉真好。',
    createdAt: Date.now() - 86400000 * 5,
    updatedAt: Date.now() - 86400000 * 5,
  },
  {
    id: 'preset_convenience_store',
    name: '深夜便利店',
    description: '凌晨一点的街角便利店，温暖的光线与蒸气，随心聊着平日没说出口的心事。',
    location: '街角 24 小时便利店靠窗高脚凳',
    atmosphere: '随性、微妙、惬意、接地气',
    background: '深夜的街道寂静无声，便利店里微波炉叮地一声响起，关东煮散发着热气。两人坐在高脚凳上看着窗外零星过往的车辆。',
    defaultOpening: '（咬了一口热气腾腾的关东煮，转过头看你）这个点还在外面闲逛，是不是心里藏着什么没跟我说的事？',
    createdAt: Date.now() - 86400000 * 4,
    updatedAt: Date.now() - 86400000 * 4,
  },
  {
    id: 'preset_seaside_sunset',
    name: '海边落日踱步',
    description: '黄昏时分的海边沙滩，海风吹过发丝，在漫天晚霞下沿着海岸线并肩漫步。',
    location: '海边沙滩与沿海栈道',
    atmosphere: '浪漫、深情、开阔、治愈',
    background: '夕阳将海面染成金粉色，咸咸的海风夹杂着浪花声。沙滩上留下一深一浅两串脚印。',
    defaultOpening: '（脱下鞋子赤脚踩在细软的沙滩上，侧过头微笑着看向你，晚风吹乱了发丝）快看，今天的晚霞好美... 能和你一起来这里真好。',
    createdAt: Date.now() - 86400000 * 3,
    updatedAt: Date.now() - 86400000 * 3,
  },
  {
    id: 'preset_bookstore',
    name: '古书店角落偶遇',
    description: '巷子深处的复古老书店，空气中弥漫着纸墨香气，在书架夹缝间悄悄对视。',
    location: '老街古旧书店二楼角落',
    atmosphere: '文雅、沉静、怀旧、心动',
    background: '高耸入天花板的原木书架，斑驳的光影透过来。唱片机放着老旧的黑胶唱片，偶尔传来翻书的沙沙声。',
    defaultOpening: '（手里拿着一本精装旧书，从书架缝隙里探出头来，眼睛亮晶晶地注视着你）嘘... 没想到你也喜欢这本书呢？要不要过来一起看？',
    createdAt: Date.now() - 86400000 * 2,
    updatedAt: Date.now() - 86400000 * 2,
  },
  {
    id: 'preset_private_cinema',
    name: '周末私人影院',
    description: '昏暗舒适的私人私人影音室，幕布放着经典老电影，冰气泡水与微醺氛围。',
    location: '私人影院包厢大榻榻米',
    atmosphere: '惬意、微醺、暧昧、专注',
    background: '巨大的投影幕布正播放着温暖的电影画面，室内光线昏暗，只有荧幕亮光映照着两人的脸庞。身边摆着冰镇饮料与零食。',
    defaultOpening: '（拿着遥控器把灯光调暗了一些，往你身边挪了挪，递给你一杯冰汽水）电影要开始咯，准备好了吗？要是害怕的话... 可以随时抓紧我。',
    createdAt: Date.now() - 86400000 * 1,
    updatedAt: Date.now() - 86400000 * 1,
  },
];

export async function loadSceneTemplates(): Promise<SceneTemplate[]> {
  const dbTemplates = await getDbSceneTemplates();
  if (dbTemplates.length === 0) {
    // Seed initial preset templates into IndexedDB
    for (const t of PRESET_SCENE_TEMPLATES) {
      await saveDbSceneTemplate(t);
    }
    return [...PRESET_SCENE_TEMPLATES];
  }
  return dbTemplates;
}

export async function saveSceneTemplate(template: Omit<SceneTemplate, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SceneTemplate> {
  const now = Date.now();
  const fullTemplate: SceneTemplate = {
    id: template.id || `tpl_${now}_${Math.random().toString(36).substring(2, 7)}`,
    name: template.name,
    description: template.description,
    location: template.location,
    atmosphere: template.atmosphere,
    background: template.background,
    defaultOpening: template.defaultOpening,
    isFavorite: template.isFavorite || false,
    createdAt: now,
    updatedAt: now,
  };

  await saveDbSceneTemplate(fullTemplate);
  return fullTemplate;
}

export async function deleteSceneTemplate(id: string): Promise<void> {
  await deleteDbSceneTemplate(id);
}
