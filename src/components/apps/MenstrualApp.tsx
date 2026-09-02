import React, { useState } from 'react';
import { MenstrualData, MenstrualRecord } from '../../types';
import {
  computeCycleStats,
  getMonthDayStatuses,
  calculateAdaptiveMetrics,
  toDateStr,
} from '../../lib/menstrual';
import {
  ArrowLeft,
  HeartPulse,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Info,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Plus,
  Trash2,
} from 'lucide-react';

interface MenstrualAppProps {
  onBackToLauncher: () => void;
  menstrualData: MenstrualData;
  onUpdateMenstrualData: (data: MenstrualData) => void;
}

export const MenstrualApp: React.FC<MenstrualAppProps> = ({
  onBackToLauncher,
  menstrualData,
  onUpdateMenstrualData,
}) => {
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-indexed
  const [selectedDateStr, setSelectedDateStr] = useState<string>(toDateStr(new Date()));
  const [noteInput, setNoteInput] = useState('');

  const cycleStats = computeCycleStats(menstrualData);
  const monthDayStatuses = getMonthDayStatuses(currentYear, currentMonth, menstrualData);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  // 1. Mark Start Logic
  const handleMarkStart = () => {
    const existingIndex = menstrualData.records.findIndex(
      (r) => r.startDate === selectedDateStr
    );

    let newRecords = [...menstrualData.records];
    if (existingIndex >= 0) {
      newRecords[existingIndex] = { startDate: selectedDateStr };
    } else {
      newRecords.push({ startDate: selectedDateStr });
    }

    onUpdateMenstrualData({
      ...menstrualData,
      records: newRecords,
    });
  };

  // 2. Mark End Logic
  const handleMarkEnd = () => {
    // Find the latest record whose start date is before or equal to selected date
    const sorted = [...menstrualData.records].sort((a, b) => b.startDate.localeCompare(a.startDate));
    const targetRecord = sorted.find((r) => r.startDate <= selectedDateStr);

    if (targetRecord) {
      const updatedRecords = menstrualData.records.map((r) => {
        if (r.startDate === targetRecord.startDate) {
          return { ...r, endDate: selectedDateStr };
        }
        return r;
      });

      onUpdateMenstrualData({
        ...menstrualData,
        records: updatedRecords,
      });
    }
  };

  // 3. Clear record for selected date
  const handleClearRecord = () => {
    const newRecords = menstrualData.records.filter((r) => r.startDate !== selectedDateStr);
    onUpdateMenstrualData({
      ...menstrualData,
      records: newRecords,
    });
  };

  // Save Note for selected date
  const handleSaveNote = () => {
    if (!noteInput.trim()) return;
    onUpdateMenstrualData({
      ...menstrualData,
      notes: {
        ...menstrualData.notes,
        [selectedDateStr]: noteInput.trim(),
      },
    });
    setNoteInput('');
  };

  const monthName = new Date(currentYear, currentMonth, 1).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  });

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  return (
    <div className="relative w-full h-full flex flex-col bg-zinc-950 text-white font-sans overflow-hidden">
      {/* Header */}
      <div className="h-12 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between z-20 shrink-0">
        <button
          onClick={onBackToLauncher}
          className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1 rounded-xl bg-zinc-800 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>⬅ 返回桌面</span>
        </button>
        <span className="font-semibold text-sm text-zinc-100 flex items-center gap-1.5">
          <HeartPulse className="w-4 h-4 text-rose-500" />
          经期与健康预测
        </span>
        <div className="w-16" />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
        {/* Real-time Status Banner */}
        <div className="p-4 rounded-3xl bg-gradient-to-r from-rose-600 to-pink-500 shadow-lg text-white space-y-3">
          <div className="flex items-center justify-between border-b border-white/20 pb-2">
            <span className="text-xs font-semibold text-rose-100 flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              自适应周期智能预测
            </span>
            <button
              onClick={() =>
                onUpdateMenstrualData({
                  ...menstrualData,
                  aiAccessEnabled: !menstrualData.aiAccessEnabled,
                })
              }
              className={`text-[10px] px-2.5 py-1 rounded-full border transition flex items-center gap-1 ${
                menstrualData.aiAccessEnabled
                  ? 'bg-white/25 border-white/40 text-white'
                  : 'bg-black/30 border-white/10 text-rose-200'
              }`}
            >
              <ShieldCheck className="w-3 h-3" />
              {menstrualData.aiAccessEnabled ? 'AI 读取已开启' : 'AI 读取已关闭'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-xs">
              <span className="block text-[11px] text-rose-100">距离下次经期</span>
              <span className="text-2xl font-bold">{cycleStats.daysUntilNextPeriod} 天</span>
              <span className="block text-[9px] text-rose-100 mt-0.5">
                预估: {cycleStats.predictedNextStart}
              </span>
            </div>
            <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-xs">
              <span className="block text-[11px] text-rose-100">当前周期状态</span>
              <span className="text-xl font-bold">
                {cycleStats.currentPeriodDay ? `经期第 ${cycleStats.currentPeriodDay} 天` : '非经期 (常规)'}
              </span>
              <span className="block text-[9px] text-rose-100 mt-0.5">
                排卵期倒计时: {cycleStats.daysUntilOvulation} 天
              </span>
            </div>
          </div>
        </div>

        {/* Interactive Month Calendar */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 shadow-md">
          {/* Calendar Month Header */}
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">
              <ChevronLeft className="w-4 h-4 text-zinc-300" />
            </button>
            <h3 className="font-bold text-sm text-zinc-100">{monthName}</h3>
            <button onClick={nextMonth} className="p-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700">
              <ChevronRight className="w-4 h-4 text-zinc-300" />
            </button>
          </div>

          {/* Days of Week */}
          <div className="grid grid-cols-7 text-center text-xs font-semibold text-zinc-400">
            {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-xs">
            {/* Blank padding */}
            {[...Array(firstDayOfWeek)].map((_, i) => (
              <div key={'blank_' + i} className="h-9" />
            ))}

            {[...Array(daysInMonth)].map((_, i) => {
              const dayNum = i + 1;
              const dateObj = new Date(currentYear, currentMonth, dayNum);
              const dStr = toDateStr(dateObj);
              const status = monthDayStatuses[dStr];
              const isSelected = selectedDateStr === dStr;

              let bgStyle = 'bg-zinc-850 hover:bg-zinc-800 text-zinc-300';
              if (status?.isPeriod) {
                bgStyle = 'bg-rose-500 font-bold text-white shadow-sm'; // Pink highlight
              } else if (status?.isPredictedPeriod) {
                bgStyle = 'bg-rose-500/30 text-rose-300 border border-rose-500/40 font-medium'; // Light pink highlight
              } else if (status?.isOvulationDay) {
                bgStyle = 'bg-purple-600/60 text-purple-200 border border-purple-400/50 font-semibold';
              }

              return (
                <button
                  key={dStr}
                  onClick={() => setSelectedDateStr(dStr)}
                  className={`relative h-10 rounded-xl flex flex-col items-center justify-center transition ${bgStyle} ${
                    isSelected ? 'ring-2 ring-emerald-400 scale-105 z-10' : ''
                  }`}
                >
                  <span className="text-xs">{dayNum}</span>
                  {status?.isPeriod && (
                    <span className="text-[8px] opacity-90">第{status.periodDayNumber}天</span>
                  )}
                  {status?.isPredictedPeriod && <span className="text-[8px] text-rose-200">预测</span>}
                </button>
              );
            })}
          </div>

          {/* Calendar Color Legend */}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-around text-[10px] text-zinc-400">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
              <span>经期标记 (粉色)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/40 border border-rose-400" />
              <span>智能预测 (淡粉)</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-purple-500" />
              <span>排卵期</span>
            </div>
          </div>
        </div>

        {/* Physiological Phase & Care Card */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-rose-300 flex items-center gap-1.5">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              {cycleStats.phaseTitle}
            </span>
            <span className="text-[10px] text-zinc-500 font-mono">
              均期 {cycleStats.avgCycleLength} 天 · 经期 {cycleStats.avgPeriodDuration} 天
            </span>
          </div>
          <p className="text-zinc-300 leading-relaxed text-[11px] bg-zinc-850 p-2.5 rounded-2xl border border-zinc-750">
            💡 <strong>身心呵护建议：</strong>{cycleStats.phaseAdvice}
          </p>
        </div>

        {/* Selected Date Note & Symptoms Card */}
        <div className="p-4 rounded-3xl bg-zinc-900 border border-zinc-800 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-zinc-200">当前选中日期: {selectedDateStr}</span>
            {menstrualData.records.some((r) => r.startDate === selectedDateStr) && (
              <button
                onClick={handleClearRecord}
                className="text-rose-400 hover:text-rose-300 text-[11px] flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> 取消此日标记
              </button>
            )}
          </div>

          {/* Quick Symptoms Toggles for Selected Date */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400">今日身体感受/生理症状（AI 对话将感知）:</span>
            <div className="flex flex-wrap gap-1.5">
              {['痛经/腹痛', '腰酸乏力', '下腹坠胀', '疲惫嗜睡', '情绪敏感', '手脚冰凉', '食欲旺盛', '失眠头痛'].map((symptom) => {
                const currentSymptoms = menstrualData.symptoms?.[selectedDateStr] || [];
                const isChecked = currentSymptoms.includes(symptom);

                const handleToggleSymptom = () => {
                  const updatedList = isChecked
                    ? currentSymptoms.filter((s) => s !== symptom)
                    : [...currentSymptoms, symptom];
                  onUpdateMenstrualData({
                    ...menstrualData,
                    symptoms: {
                      ...(menstrualData.symptoms || {}),
                      [selectedDateStr]: updatedList,
                    },
                  });
                };

                return (
                  <button
                    key={symptom}
                    onClick={handleToggleSymptom}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition ${
                      isChecked
                        ? 'bg-rose-500 text-white shadow-xs'
                        : 'bg-zinc-800 hover:bg-zinc-750 text-zinc-400 border border-zinc-700'
                    }`}
                  >
                    {isChecked ? '✓ ' : '+ '}{symptom}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="记录当日身体感受/日记笔记..."
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-white focus:outline-none text-xs"
            />
            <button onClick={handleSaveNote} className="px-3 py-2 rounded-xl bg-emerald-500 font-medium text-white text-xs">
              保存
            </button>
          </div>

          {menstrualData.notes[selectedDateStr] && (
            <div className="p-2.5 rounded-xl bg-zinc-800 text-zinc-300 text-xs border border-zinc-700">
              📝 备注: {menstrualData.notes[selectedDateStr]}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Bottom Controls: Mark Start & Mark End */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-zinc-900/95 backdrop-blur-md border-t border-zinc-800 flex items-center gap-3 z-30">
        <button
          onClick={handleMarkStart}
          className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 font-bold text-xs text-white shadow-lg shadow-rose-500/20 active:scale-95 transition"
        >
          标记开始 ({selectedDateStr})
        </button>

        <button
          onClick={handleMarkEnd}
          className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 font-bold text-xs text-white shadow-lg shadow-purple-500/20 active:scale-95 transition"
        >
          标记结束 ({selectedDateStr})
        </button>
      </div>
    </div>
  );
};
