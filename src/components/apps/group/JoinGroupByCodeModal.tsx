import React, { useState } from 'react';
import {
  X,
  KeyRound,
  Users,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UserPlus,
  Send,
} from 'lucide-react';
import { GroupChat, GroupJoinRequest, UserProfile } from '../../../types';

interface JoinGroupByCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupChats: GroupChat[];
  userProfile: UserProfile;
  onJoinGroupSuccess: (group: GroupChat, newRequest?: GroupJoinRequest) => void;
  onSimulateIncomingRequest: (groupId: string, fakeUser: { name: string; avatar: string; bio: string }) => void;
}

const PRESET_SIMULATED_HUMANS = [
  {
    name: '安然 (摄影师)',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
    bio: '爱好风光摄影与旅行，希望能和大家一起探讨生活灵感！',
  },
  {
    name: '陈航 (独立开发者)',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    bio: '全栈开发工程师，关注大模型智能体与分布式架构。',
  },
  {
    name: '苏夏 (插画师)',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=300&q=80',
    bio: '喜欢手绘与二次元，在群里多向大家学习~',
  },
];

export const JoinGroupByCodeModal: React.FC<JoinGroupByCodeModalProps> = ({
  isOpen,
  onClose,
  groupChats,
  userProfile,
  onJoinGroupSuccess,
  onSimulateIncomingRequest,
}) => {
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [matchedGroup, setMatchedGroup] = useState<GroupChat | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [appliedSuccess, setAppliedSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'my_join' | 'simulate_others'>('my_join');

  if (!isOpen) return null;

  const handleSearchCode = () => {
    const code = inviteCodeInput.trim().toUpperCase();
    if (!code) {
      setErrorMsg('请输入有效的群邀请码');
      return;
    }

    const found = groupChats.find(
      (g) => g.inviteCode && g.inviteCode.toUpperCase() === code
    );

    if (!found) {
      setErrorMsg('未找到对应的群聊，请检查邀请码是否正确或已过期');
      setMatchedGroup(null);
    } else if (!found.inviteCodeActive) {
      setErrorMsg('该群聊已关闭邀请码入群功能');
      setMatchedGroup(null);
    } else {
      setErrorMsg('');
      setMatchedGroup(found);
    }
  };

  const handleApplyToJoin = () => {
    if (!matchedGroup) return;

    // Check if user is already a member
    const alreadyMember = matchedGroup.members.some((m) => m.id === 'user_main');
    if (alreadyMember) {
      alert('您已经是该群聊的成员啦！');
      onJoinGroupSuccess(matchedGroup);
      onClose();
      return;
    }

    // Submit join request
    const request: GroupJoinRequest = {
      id: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      groupId: matchedGroup.id,
      userId: 'user_main',
      userName: userProfile.name || '小清',
      userAvatar: userProfile.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
      userBio: userProfile.bio || '申请加入群聊',
      inviteCodeUsed: matchedGroup.inviteCode,
      status: 'pending',
      requestedAt: Date.now(),
    };

    onJoinGroupSuccess(matchedGroup, request);
    setAppliedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 1500);
  };

  const handleTriggerSimulatedApplicant = (fakeUser: typeof PRESET_SIMULATED_HUMANS[0]) => {
    if (!groupChats.length) return;
    const targetGroup = matchedGroup || groupChats[0];
    onSimulateIncomingRequest(targetGroup.id, fakeUser);
    alert(`已模拟好友 “${fakeUser.name}” 使用邀请码向群聊 “${targetGroup.name}” 发送入群申请！\n群主可进入群设置中的【入群申请管理】进行审核。`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-850">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">群聊邀请码加入</h3>
              <p className="text-[10px] text-zinc-400">使用 8 位群邀请码加入群聊</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-800/40 p-1">
          <button
            onClick={() => setActiveTab('my_join')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition ${
              activeTab === 'my_join'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            输入邀请码加入
          </button>
          <button
            onClick={() => setActiveTab('simulate_others')}
            className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
              activeTab === 'simulate_others'
                ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
            }`}
          >
            <Sparkles className="w-3 h-3 text-amber-500" />
            <span>模拟外网好友申请</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {activeTab === 'my_join' ? (
            <>
              {/* Input Code */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">
                  请输入 8 位群聊邀请码
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteCodeInput}
                    onChange={(e) => {
                      setInviteCodeInput(e.target.value);
                      setErrorMsg('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchCode()}
                    placeholder="例如: WX-GRP-892401"
                    className="flex-1 px-3 py-2 text-xs uppercase tracking-wider font-mono rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <button
                    onClick={handleSearchCode}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition flex items-center gap-1 shadow-sm"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>查询</span>
                  </button>
                </div>
                {errorMsg && (
                  <p className="text-[10px] text-rose-500 flex items-center gap-1 pt-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    <span>{errorMsg}</span>
                  </p>
                )}
              </div>

              {/* Quick Preset Sample Codes */}
              {groupChats.length > 0 && (
                <div className="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-750 space-y-1.5">
                  <span className="text-[10px] font-bold text-zinc-400 block">快捷测试现有群聊邀请码：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {groupChats.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          setInviteCodeInput(g.inviteCode);
                          setMatchedGroup(g);
                          setErrorMsg('');
                        }}
                        className="px-2 py-1 rounded-lg bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-mono text-[10px] hover:bg-amber-500/20 hover:text-amber-600 transition"
                      >
                        {g.name}: {g.inviteCode}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Matched Group Card */}
              {matchedGroup && (
                <div className="p-3.5 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={matchedGroup.avatar}
                      alt={matchedGroup.name}
                      className="w-12 h-12 rounded-2xl object-cover border border-amber-400/40 shadow-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                        {matchedGroup.name}
                      </h4>
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        公告：{matchedGroup.notice || '欢迎加入！'}
                      </p>
                      <div className="text-[9px] text-amber-600 dark:text-amber-400 font-semibold pt-0.5">
                        当前群成员：{matchedGroup.members.length} 人
                      </div>
                    </div>
                  </div>

                  <button
                    disabled={appliedSuccess}
                    onClick={handleApplyToJoin}
                    className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1"
                  >
                    {appliedSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>申请已提交，等待群主审核</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>申请加入该群聊</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Simulate Incoming Applicants */}
              <div className="space-y-3">
                <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-800 dark:text-purple-300">
                  <p className="text-[11px] font-bold flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>单机拟真模拟：测试邀请码审核流程</span>
                  </p>
                  <p className="text-[10px] opacity-80 pt-1 leading-relaxed">
                    点击下方模拟的真人好友，即可模拟对方在另一台设备上输入您的群邀请码并提交入群申请。
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-zinc-400">选择模拟申请人：</span>
                  {PRESET_SIMULATED_HUMANS.map((human, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-750 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={human.avatar}
                          alt={human.name}
                          className="w-9 h-9 rounded-full object-cover border border-zinc-300 dark:border-zinc-700"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                            {human.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 line-clamp-1">{human.bio}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleTriggerSimulatedApplicant(human)}
                        className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-[10px] shrink-0 ml-2 transition"
                      >
                        模拟申请
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end bg-zinc-50 dark:bg-zinc-850">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};
