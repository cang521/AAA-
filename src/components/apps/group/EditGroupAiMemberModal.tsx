import React, { useState } from 'react';
import {
  X,
  Bot,
  Brain,
  Sparkles,
  Volume2,
  VolumeX,
  Shield,
  Trash2,
  Plus,
  Save,
} from 'lucide-react';
import { GroupMember } from '../../../types';

interface EditGroupAiMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: GroupMember;
  onSaveMember: (updatedMember: GroupMember) => void;
  onRemoveMember?: (memberId: string) => void;
  isOwnerOrAdmin: boolean;
}

export const EditGroupAiMemberModal: React.FC<EditGroupAiMemberModalProps> = ({
  isOpen,
  onClose,
  member,
  onSaveMember,
  onRemoveMember,
  isOwnerOrAdmin,
}) => {
  const [customPersona, setCustomPersona] = useState(member.customPersona || '');
  const [customPersonality, setCustomPersonality] = useState(member.customPersonality || '');
  const [customModelName, setCustomModelName] = useState(member.customModelName || '');
  const [isMuted, setIsMuted] = useState(member.isMuted || false);
  const [role, setRole] = useState(member.role);
  const [memories, setMemories] = useState<string[]>(member.memories || []);
  const [newMemory, setNewMemory] = useState('');

  if (!isOpen) return null;

  const handleAddMemory = () => {
    if (!newMemory.trim()) return;
    setMemories((prev) => [...prev, newMemory.trim()]);
    setNewMemory('');
  };

  const handleRemoveMemory = (idx: number) => {
    setMemories((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSaveMember({
      ...member,
      customPersona: customPersona.trim(),
      customPersonality: customPersonality.trim(),
      customModelName: customModelName.trim() || undefined,
      isMuted,
      role,
      memories,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
          <div className="flex items-center gap-2.5">
            <img
              src={member.avatar}
              alt={member.name}
              className="w-9 h-9 rounded-full object-cover border border-purple-400 shadow-sm"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{member.name}</h3>
                <span className="px-1.5 py-0.2 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-300 text-[9px] font-semibold">
                  {member.memberType === 'ai' ? '自定义AI' : member.memberType === 'npc' ? '系统NPC' : '真人'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-400">群内独立身份与性格配置</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
          {/* Mute & Role Toggles */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-750">
            <div className="space-y-0.5">
              <span className="text-[11px] font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1">
                {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-500" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-500" />}
                <span>群内禁言状态</span>
              </span>
              <p className="text-[10px] text-zinc-400">禁言后该AI在群内将保持沉默不会主动发言</p>
            </div>
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition ${
                isMuted
                  ? 'bg-rose-500 text-white'
                  : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {isMuted ? '已禁言' : '正常发言'}
            </button>
          </div>

          {/* Group Specific Persona */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-purple-500" />
              <span>本群专属人设设定 (Custom Persona)</span>
            </label>
            <textarea
              value={customPersona}
              onChange={(e) => setCustomPersona(e.target.value)}
              placeholder="例如：在群里是活跃气氛的小助手，经常发问候和有趣的话题..."
              rows={3}
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-purple-500 resize-none"
            />
          </div>

          {/* Group Specific Personality */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>性格特征与口吻 (Personality)</span>
            </label>
            <input
              type="text"
              value={customPersonality}
              onChange={(e) => setCustomPersonality(e.target.value)}
              placeholder="例如：活泼好动、爱开玩笑、语气温柔..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Model Name Override */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
              指定推理模型 (留空则使用全局模型)
            </label>
            <input
              type="text"
              value={customModelName}
              onChange={(e) => setCustomModelName(e.target.value)}
              placeholder="例如：gemini-3.6-flash, deepseek-chat..."
              className="w-full px-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Independent Long-Term Memories */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300 flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Brain className="w-3.5 h-3.5 text-blue-500" />
                <span>该AI成员的独立长期记忆 ({memories.length})</span>
              </span>
            </label>
            <div className="space-y-1.5 max-h-32 overflow-y-auto">
              {memories.map((mem, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-750 text-[11px]"
                >
                  <span className="text-zinc-700 dark:text-zinc-300 flex-1 pr-2">{mem}</span>
                  <button
                    onClick={() => handleRemoveMemory(idx)}
                    className="text-zinc-400 hover:text-rose-500 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMemory()}
                placeholder="添加一条专属记忆..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              <button
                onClick={handleAddMemory}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>添加</span>
              </button>
            </div>
          </div>

          {/* Remove member from group button */}
          {isOwnerOrAdmin && onRemoveMember && member.role !== 'owner' && (
            <div className="pt-2">
              <button
                onClick={() => {
                  if (confirm(`确定要将 ${member.name} 移出本群聊吗？`)) {
                    onRemoveMember(member.id);
                    onClose();
                  }
                }}
                className="w-full py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs border border-rose-500/30 transition flex items-center justify-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>从群聊中移出该成员</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-end gap-2 bg-zinc-50 dark:bg-zinc-850">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md transition flex items-center gap-1"
          >
            <Save className="w-3.5 h-3.5" />
            <span>保存配置</span>
          </button>
        </div>
      </div>
    </div>
  );
};
