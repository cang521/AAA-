import React, { useState } from 'react';
import { X, Sparkles, MapPin, Smile, BookOpen, Check, MessageSquare } from 'lucide-react';
import { SceneTemplate } from '../../lib/offline/OfflineSessionDb';
import { saveSceneTemplate } from '../../lib/offline/SceneTemplateService';

interface SceneEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTemplate?: SceneTemplate | null;
  onSaved: (template: SceneTemplate) => void;
}

export const SceneEditorModal: React.FC<SceneEditorModalProps> = ({
  isOpen,
  onClose,
  initialTemplate,
  onSaved,
}) => {
  const [name, setName] = useState(initialTemplate?.name || '');
  const [location, setLocation] = useState(initialTemplate?.location || '');
  const [atmosphere, setAtmosphere] = useState(initialTemplate?.atmosphere || '');
  const [background, setBackground] = useState(initialTemplate?.background || '');
  const [defaultOpening, setDefaultOpening] = useState(initialTemplate?.defaultOpening || '');
  const [isFavorite, setIsFavorite] = useState(initialTemplate?.isFavorite || false);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !background.trim()) {
      alert('请填写场景名称与环境背景描述');
      return;
    }

    setIsSaving(true);
    try {
      const saved = await saveSceneTemplate({
        id: initialTemplate?.id,
        name: name.trim(),
        location: location.trim() || '未指定具体地点',
        atmosphere: atmosphere.trim() || '轻松、温馨',
        description: background.trim().slice(0, 60) + '...',
        background: background.trim(),
        defaultOpening: defaultOpening.trim() || undefined,
        isFavorite,
      });

      onSaved(saved);
      onClose();
    } catch (err: any) {
      alert(`保存场景模板失败: ${err?.message || '未知错误'}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-750 rounded-3xl p-5 space-y-4 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm">{initialTemplate ? '编辑线下场景模板' : '新建自定义线下场景'}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-zinc-400 hover:text-white transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          {/* Scene Name */}
          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold block">场景名称 *</label>
            <input
              type="text"
              required
              placeholder="例如：雨夜宅家 / 深夜便利店 / 露天音乐节"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-indigo-500 font-medium"
            />
          </div>

          {/* Location & Atmosphere */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-zinc-300 font-semibold flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-400" /> 具体地点
              </label>
              <input
                type="text"
                placeholder="例如：卧室落地窗前"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-zinc-300 font-semibold flex items-center gap-1">
                <Smile className="w-3.5 h-3.5 text-emerald-400" /> 氛围基调
              </label>
              <input
                type="text"
                placeholder="例如：安静、温馨、微醺"
                value={atmosphere}
                onChange={(e) => setAtmosphere(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Background Description */}
          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" /> 详细环境背景与剧情设定 *
            </label>
            <textarea
              required
              rows={4}
              placeholder="描述当前场景的环境细节、灯光、天气、两人所处的位置关系以及此刻正在做的事情..."
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
            />
          </div>

          {/* Default Opening */}
          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5 text-purple-400" /> AI 默认开场白 / 第一句动作（可选）
            </label>
            <textarea
              rows={2}
              placeholder="例如：（把热茶递到你手上，顺势坐下）雨下得好大呢..."
              value={defaultOpening}
              onChange={(e) => setDefaultOpening(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 focus:outline-none focus:border-indigo-500 leading-relaxed resize-none"
            />
            <span className="text-[10px] text-zinc-500 block">动作请使用中文全角括号：（...）</span>
          </div>

          {/* Favorite Toggle */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              className="w-4 h-4 accent-indigo-500 rounded"
            />
            <span className="text-zinc-300 font-medium">设为常用优先显示的场景</span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSaving}
            className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>{isSaving ? '保存中...' : '保存场景模板'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
