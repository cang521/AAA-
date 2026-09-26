import React, { useState, useEffect } from 'react';
import { Sparkles, MapPin, Smile, Plus, Star, Edit, Trash2, ArrowRight, BookOpen, Clock } from 'lucide-react';
import { SceneTemplate } from '../../lib/offline/OfflineSessionDb';
import { loadSceneTemplates, deleteSceneTemplate } from '../../lib/offline/SceneTemplateService';
import { SceneEditorModal } from './SceneEditorModal';

interface SceneSelectorProps {
  onSelectScene: (scene: { name: string; location: string; atmosphere: string; background: string; defaultOpening?: string }, templateId?: string) => void;
  onBack: () => void;
}

export const SceneSelector: React.FC<SceneSelectorProps> = ({ onSelectScene, onBack }) => {
  const [templates, setTemplates] = useState<SceneTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<'preset' | 'custom' | 'temporary'>('preset');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Custom Temporary Scene Inputs
  const [tempName, setTempName] = useState('');
  const [tempLocation, setTempLocation] = useState('');
  const [tempAtmosphere, setTempAtmosphere] = useState('');
  const [tempBackground, setTempBackground] = useState('');
  const [tempOpening, setTempOpening] = useState('');

  // Modal Editor
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SceneTemplate | null>(null);

  useEffect(() => {
    refreshTemplates();
  }, []);

  const refreshTemplates = async () => {
    const list = await loadSceneTemplates();
    setTemplates(list);
    if (list.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(list[0].id);
    }
  };

  const handleStartWithSelectedTemplate = () => {
    const selected = templates.find((t) => t.id === selectedTemplateId);
    if (!selected) {
      alert('请先选择一个场景');
      return;
    }
    onSelectScene(
      {
        name: selected.name,
        location: selected.location,
        atmosphere: selected.atmosphere,
        background: selected.background,
        defaultOpening: selected.defaultOpening,
      },
      selected.id
    );
  };

  const handleStartTemporaryScene = () => {
    if (!tempName.trim() || !tempBackground.trim()) {
      alert('请填写临时场景名称与背景描述');
      return;
    }
    onSelectScene({
      name: tempName.trim(),
      location: tempLocation.trim() || '未指定地点',
      atmosphere: tempAtmosphere.trim() || '随性、自然',
      background: tempBackground.trim(),
      defaultOpening: tempOpening.trim() || undefined,
    });
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('确定删除此场景模板吗？')) {
      await deleteSceneTemplate(id);
      await refreshTemplates();
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-4 text-zinc-100">
      {/* Top Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <h2 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            步骤 2/2：选择或构想线下场景
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">场景决定线下相处的环境背景、氛围与专属互动逻辑</p>
        </div>
        <button
          onClick={() => {
            setEditingTemplate(null);
            setShowEditorModal(true);
          }}
          className="px-2.5 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          新建场景
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center p-1 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs">
        <button
          onClick={() => setActiveTab('preset')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'preset' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          经典场景库 ({templates.length})
        </button>
        <button
          onClick={() => setActiveTab('temporary')}
          className={`flex-1 py-2 rounded-xl font-bold transition flex items-center justify-center gap-1.5 ${
            activeTab === 'temporary' ? 'bg-indigo-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          临时快速场景
        </button>
      </div>

      {/* TAB 1: PRESET & SAVED TEMPLATES */}
      {activeTab === 'preset' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2.5 max-h-[50vh] overflow-y-auto pr-1">
            {templates.map((tpl) => {
              const isSelected = selectedTemplateId === tpl.id;
              return (
                <div
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer select-none space-y-2 relative ${
                    isSelected
                      ? 'bg-gradient-to-r from-indigo-950/70 to-purple-950/50 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                      : 'bg-zinc-850/80 border-zinc-750 hover:bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-zinc-100">{tpl.name}</h4>
                      {tpl.isFavorite && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTemplate(tpl);
                          setShowEditorModal(true);
                        }}
                        className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700/60 transition"
                        title="编辑模板"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(e, tpl.id)}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-400 hover:bg-zinc-700/60 transition"
                        title="删除模板"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1 text-amber-300/90 font-medium">
                      <MapPin className="w-3 h-3" /> {tpl.location}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-300/90 font-medium">
                      <Smile className="w-3 h-3" /> {tpl.atmosphere}
                    </span>
                  </div>

                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">{tpl.background}</p>

                  {tpl.defaultOpening && (
                    <p className="text-[11px] text-purple-300/90 italic truncate pt-0.5">
                      “{tpl.defaultOpening}”
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onBack}
              className="px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition"
            >
              上一步
            </button>
            <button
              onClick={handleStartWithSelectedTemplate}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
            >
              <span>开始线下模式</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* TAB 2: TEMPORARY SCENE */}
      {activeTab === 'temporary' && (
        <div className="p-4 rounded-2xl bg-zinc-850/80 border border-zinc-750 space-y-3.5 text-xs">
          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold block">场景名称 *</label>
            <input
              type="text"
              placeholder="例如：露天咖啡馆看雨"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-zinc-300 font-semibold block">地点</label>
              <input
                type="text"
                placeholder="街角咖啡馆"
                value={tempLocation}
                onChange={(e) => setTempLocation(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>
            <div className="space-y-1">
              <label className="text-zinc-300 font-semibold block">氛围</label>
              <input
                type="text"
                placeholder="悠闲、惬意"
                value={tempAtmosphere}
                onChange={(e) => setTempAtmosphere(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold block">环境设定描述 *</label>
            <textarea
              rows={3}
              placeholder="描述当前场景细节、气候背景以及你们正在做的事情..."
              value={tempBackground}
              onChange={(e) => setTempBackground(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100 resize-none leading-relaxed"
            />
          </div>

          <div className="space-y-1">
            <label className="text-zinc-300 font-semibold block">开场动作 / 对白（可选）</label>
            <input
              type="text"
              placeholder="（轻轻靠过来）在想什么呢？"
              value={tempOpening}
              onChange={(e) => setTempOpening(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-100"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onBack}
              className="px-4 py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition"
            >
              上一步
            </button>
            <button
              onClick={handleStartTemporaryScene}
              className="flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition"
            >
              <span>以此临时场景开始</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      <SceneEditorModal
        isOpen={showEditorModal}
        onClose={() => {
          setShowEditorModal(false);
          setEditingTemplate(null);
        }}
        initialTemplate={editingTemplate}
        onSaved={async () => {
          await refreshTemplates();
        }}
      />
    </div>
  );
};
