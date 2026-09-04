import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileText,
  Archive,
  Layers,
  Bot,
  MessageSquare,
  Brain,
  Users,
  Settings,
  ShieldCheck,
  History,
  Trash2,
  Check,
  RotateCcw,
  Sparkles,
  ArrowRight,
  FileCode,
  Sliders,
  ChevronDown,
  ChevronUp,
  Cpu,
  BookOpen,
  Clock,
  Activity,
  Wand2,
  ScanText,
  CheckCheck,
} from 'lucide-react';
import {
  ExportCategory,
  ExportFormat,
  ConflictResolutionStrategy,
  RecognitionMode,
  ImportParseOptions,
  FileIntelligenceReport,
  ImportParsedResult,
  ImportExecutionOptions,
  DataSnapshot,
  parseImportFile,
  executeImport,
  exportData,
  triggerDownload,
  listDataSnapshots,
  createDataSnapshot,
  restoreDataSnapshot,
  deleteDataSnapshot,
} from '../../lib/dataManagement';
import { loadCharacters } from '../../lib/storage';

interface DataManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataChanged: () => void; // Triggered when data is imported or rolled back to refresh parent states
  initialTab?: 'import' | 'export' | 'snapshots';
}

export const DataManagementModal: React.FC<DataManagementModalProps> = ({
  isOpen,
  onClose,
  onDataChanged,
  initialTab = 'import',
}) => {
  const [activeTab, setActiveTab] = useState<'import' | 'export' | 'snapshots'>(initialTab);

  // -------------------------------------------------------------------------
  // Import States
  // -------------------------------------------------------------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [recognitionMode, setRecognitionMode] = useState<RecognitionMode>('auto');
  const [fuzzyNameMatch, setFuzzyNameMatch] = useState(true);
  const [showIntelligenceDetails, setShowIntelligenceDetails] = useState(true);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ImportParsedResult | null>(null);
  const [conflictStrategy, setConflictStrategy] = useState<ConflictResolutionStrategy>('merge');
  const [importFlags, setImportFlags] = useState({
    characters: true,
    messages: true,
    memories: true,
    groups: true,
    settings: true,
  });
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [characterMapping, setCharacterMapping] = useState<Record<string, string>>({});
  const [assignmentMode, setAssignmentMode] = useState<'individual' | 'unified'>('individual');
  const [unifiedTargetId, setUnifiedTargetId] = useState<string>('');
  const [unifiedNotice, setUnifiedNotice] = useState<string | null>(null);
  const [isExecutingImport, setIsExecutingImport] = useState(false);
  const [importSuccessResult, setImportSuccessResult] = useState<{
    importedCharacterCount: number;
    importedMessageCount: number;
    importedGroupCount: number;
    importedMemoryCount: number;
    snapshotId: string;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Export States
  // -------------------------------------------------------------------------
  const [exportCategories, setExportCategories] = useState<ExportCategory[]>([
    'characters',
    'messages',
    'memories',
    'groups',
    'settings',
  ]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('zip');
  const [exportCharScope, setExportCharScope] = useState<'all' | 'custom'>('all');
  const [selectedExportCharIds, setSelectedExportCharIds] = useState<string[]>([]);
  const [includeThinking, setIncludeThinking] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Snapshot / Rollback States
  // -------------------------------------------------------------------------
  const [snapshots, setSnapshots] = useState<DataSnapshot[]>([]);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [snapshotNote, setSnapshotNote] = useState('');
  const [rollbackSuccessMsg, setRollbackSuccessMsg] = useState<string | null>(null);

  const charactersList = loadCharacters();

  useEffect(() => {
    if (isOpen) {
      setSnapshots(listDataSnapshots());
      setImportError(null);
      setImportSuccessResult(null);
      setRollbackSuccessMsg(null);
      setExportSuccessMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // -------------------------------------------------------------------------
  // Handlers: Import
  // -------------------------------------------------------------------------
  const executeParseFile = async (
    file: File,
    mode: RecognitionMode = recognitionMode,
    fuzzy: boolean = fuzzyNameMatch
  ) => {
    setIsParsing(true);
    setImportError(null);
    setImportSuccessResult(null);

    try {
      const res = await parseImportFile(file, {
        recognitionMode: mode,
        fuzzyNameMatch: fuzzy,
      });
      setParsedResult(res);
      setSelectedCharacterIds(res.characters.map((c) => c.id));

      // Initialize character name mapping from automatic recognition
      const initialMapping: Record<string, string> = {};
      if (res.characterMatches) {
        res.characterMatches.forEach((m) => {
          initialMapping[m.importedCharacter.id] = m.suggestedTargetId;
        });
      }
      setCharacterMapping(initialMapping);

      // Pre-set intelligent default unified target character
      const bestMatched = res.characterMatches?.find((m) => m.matchedLocalCharacter)?.matchedLocalCharacter?.id;
      const initialUnified = bestMatched || (charactersList.length > 0 ? charactersList[0].id : '__CREATE_NEW__');
      setUnifiedTargetId(initialUnified);
    } catch (err: any) {
      setImportError(`解析文件失败: ${err?.message || '未知错误'}`);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApplyUnifiedTarget = (targetId: string) => {
    setUnifiedTargetId(targetId);
    if (!parsedResult) return;

    const nextMapping: Record<string, string> = {};
    parsedResult.characters.forEach((c) => {
      nextMapping[c.id] = targetId;
    });
    setCharacterMapping(nextMapping);

    if (targetId === '__CREATE_NEW__') {
      setUnifiedNotice('已设置为统一作为全新AI角色创建，并将所有聊天记录与记忆整合收纳');
    } else {
      const targetChar = charactersList.find((c) => c.id === targetId);
      setUnifiedNotice(
        `已将本次全部 ${parsedResult.characters.length} 个角色、${parsedResult.stats.messageCount} 条聊天记录统一归入「${targetChar?.name || '指定角色'}」名下`
      );
    }
    setTimeout(() => setUnifiedNotice(null), 4000);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCurrentFile(file);
    await executeParseFile(file, recognitionMode, fuzzyNameMatch);
  };

  const handleSwitchRecognitionMode = async (newMode: RecognitionMode) => {
    setRecognitionMode(newMode);
    if (currentFile) {
      await executeParseFile(currentFile, newMode, fuzzyNameMatch);
    }
  };

  const handleToggleFuzzyMatch = async (enabled: boolean) => {
    setFuzzyNameMatch(enabled);
    if (currentFile) {
      await executeParseFile(currentFile, recognitionMode, enabled);
    }
  };

  const handleRunImport = async () => {
    if (!parsedResult) return;
    setIsExecutingImport(true);
    setImportError(null);

    const execOptions: ImportExecutionOptions = {
      conflictStrategy,
      importCharacters: importFlags.characters,
      importMessages: importFlags.messages,
      importMemories: importFlags.memories,
      importGroups: importFlags.groups,
      importSettings: importFlags.settings,
      selectedCharacterIds: selectedCharacterIds,
      characterMapping,
      unifiedTargetCharacterId: assignmentMode === 'unified' ? (unifiedTargetId || undefined) : undefined,
    };

    try {
      const result = await executeImport(parsedResult, execOptions);
      setImportSuccessResult(result);
      setSnapshots(listDataSnapshots());
      onDataChanged();
    } catch (err: any) {
      setImportError(err?.message || '导入写入失败');
    } finally {
      setIsExecutingImport(false);
    }
  };

  // -------------------------------------------------------------------------
  // Handlers: Export
  // -------------------------------------------------------------------------
  const handleRunExport = async () => {
    setIsExporting(true);
    setExportSuccessMsg(null);

    try {
      const charIds = exportCharScope === 'custom' ? selectedExportCharIds : undefined;
      const { blob, fileName } = await exportData({
        categories: exportCategories,
        format: exportFormat,
        characterIds: charIds,
        includeThinkingProcess: includeThinking,
      });

      triggerDownload(blob, fileName);
      setExportSuccessMsg(`文件 ${fileName} 导出成功并已开始下载！`);
    } catch (err: any) {
      alert(`导出数据失败: ${err?.message || '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleExportCategory = (cat: ExportCategory) => {
    if (cat === 'all') {
      if (exportCategories.includes('all') || exportCategories.length >= 5) {
        setExportCategories([]);
      } else {
        setExportCategories(['characters', 'messages', 'memories', 'groups', 'settings']);
      }
      return;
    }
    setExportCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // -------------------------------------------------------------------------
  // Handlers: Snapshot
  // -------------------------------------------------------------------------
  const handleManualCreateSnapshot = async () => {
    setIsCreatingSnapshot(true);
    try {
      await createDataSnapshot(snapshotNote.trim() || '用户手动备份快照');
      setSnapshotNote('');
      setSnapshots(listDataSnapshots());
      setRollbackSuccessMsg('快照创建成功！');
    } catch (e: any) {
      alert('创建快照失败: ' + e?.message);
    } finally {
      setIsCreatingSnapshot(false);
    }
  };

  const handleRollback = async (snapId: string) => {
    if (!window.confirm('确定要回滚到该快照状态吗？当前的所有修改将被该快照内容覆盖替换。')) {
      return;
    }

    try {
      await restoreDataSnapshot(snapId);
      setRollbackSuccessMsg('已成功回滚数据！');
      onDataChanged();
    } catch (e: any) {
      alert('回滚失败: ' + e?.message);
    }
  };

  const handleDeleteSnap = (snapId: string) => {
    deleteDataSnapshot(snapId);
    setSnapshots(listDataSnapshots());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 select-none">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-zinc-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-sm text-zinc-100 flex items-center gap-1.5">
                数据管理中心
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-normal border border-emerald-500/30">
                  本地安全处理
                </span>
              </h2>
              <p className="text-[11px] text-zinc-400">导入、导出、去重合并与数据快照回滚</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 p-1.5 mx-4 mt-3 bg-zinc-950 rounded-2xl border border-zinc-800 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('import')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'import'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            导入数据
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'export'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            导出数据
          </button>
          <button
            onClick={() => setActiveTab('snapshots')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
              activeTab === 'snapshots'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            备份与回滚 ({snapshots.length})
          </button>
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ========================================================================= */}
          {/* TAB 1: IMPORT */}
          {/* ========================================================================= */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* Smart Recognition Mode & Parameters Configuration Card (智能识别选项) */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                      <Cpu className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-zinc-200">智能识别选项与研判模式</span>
                  </div>
                  <span className="text-[10px] text-blue-400 font-medium px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                    针对不同格式深度剖析
                  </span>
                </div>

                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  系统将根据所选解析策略执行多维特征指纹提取与语法分析，支持自动推断或指定专属引擎：
                </p>

                {/* Mode Selector Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSwitchRecognitionMode('auto')}
                    className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                      recognitionMode === 'auto'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">🌟 智能自适应研判</span>
                      {recognitionMode === 'auto' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="text-[10px] opacity-80 mt-1">自动分析文件特征指纹，自适应匹配最佳解析器（推荐）</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwitchRecognitionMode('tavern_card')}
                    className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                      recognitionMode === 'tavern_card'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">📜 酒馆角色卡专属</span>
                      {recognitionMode === 'tavern_card' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="text-[10px] opacity-80 mt-1">SillyTavern V1/V2/V3 规范，提取世界书、场景与示范对话</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwitchRecognitionMode('chat_transcript')}
                    className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                      recognitionMode === 'chat_transcript'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">💬 对话转录流记录</span>
                      {recognitionMode === 'chat_transcript' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="text-[10px] opacity-80 mt-1">微信 / QQ / ChatGPT 导出文本，按发言人拆解对话轮次</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSwitchRecognitionMode('character_dossier')}
                    className={`p-2.5 rounded-xl text-left border transition flex flex-col justify-between ${
                      recognitionMode === 'character_dossier'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-200">📝 角色人设档案文档</span>
                      {recognitionMode === 'character_dossier' && <CheckCheck className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="text-[10px] opacity-80 mt-1">TXT / Markdown 格式档案，抽取人设背景、性格与长期记忆</span>
                  </button>
                </div>

                {/* Additional Option: Fuzzy Name Match Toggle */}
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={fuzzyNameMatch}
                      onChange={(e) => handleToggleFuzzyMatch(e.target.checked)}
                      className="w-4 h-4 accent-blue-500 rounded"
                    />
                    <span className="text-xs text-zinc-300 font-medium">启用角色名称智能模糊匹配</span>
                  </label>
                  <span className="text-[10px] text-zinc-400">支持同义包含与别名关联</span>
                </div>
              </div>

              {/* File Dropzone */}
              {!parsedResult && !importSuccessResult && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-700 hover:border-blue-500 rounded-3xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-zinc-950/50 hover:bg-blue-950/20 transition group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.json,.jsonl,.txt,.md"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 group-hover:bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 mb-3 transition">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-sm text-zinc-200 group-hover:text-blue-400 transition">
                    {isParsing ? '正在运用智能引擎解析文件...' : '点击选择或拖拽数据文件'}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xs">
                    支持 <span className="text-zinc-200 font-semibold">ZIP、JSON、JSONL、TXT、MD</span> 格式
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3 justify-center">
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                      📦 综合备份包
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                      📜 酒馆角色卡 (V1/V2)
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                      💬 微信/QQ记录
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300">
                      📝 人设设定集
                    </span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {importError && (
                <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-bold block">导入错误</span>
                    <span>{importError}</span>
                  </div>
                </div>
              )}

              {/* Import Success State */}
              {importSuccessResult && (
                <div className="p-5 rounded-3xl bg-emerald-950/40 border border-emerald-500/30 space-y-4 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-emerald-300">数据导入成功！</h3>
                    <p className="text-xs text-zinc-300 mt-1">
                      数据已安全写入，聊天、长期记忆与通讯录已实时生效。
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-left bg-zinc-900/80 p-3 rounded-2xl border border-zinc-800 text-xs">
                    <div className="text-zinc-400">
                      AI 角色: <span className="font-bold text-white">{importSuccessResult.importedCharacterCount} 个</span>
                    </div>
                    <div className="text-zinc-400">
                      聊天记录: <span className="font-bold text-white">{importSuccessResult.importedMessageCount} 条</span>
                    </div>
                    <div className="text-zinc-400">
                      长期记忆: <span className="font-bold text-white">{importSuccessResult.importedMemoryCount} 条</span>
                    </div>
                    <div className="text-zinc-400">
                      群聊空间: <span className="font-bold text-white">{importSuccessResult.importedGroupCount} 个</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setParsedResult(null);
                        setCurrentFile(null);
                        setImportSuccessResult(null);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-200 transition"
                    >
                      继续导入其他文件
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-xs font-bold text-white shadow-md transition"
                    >
                      完成并返回
                    </button>
                  </div>
                </div>
              )}

              {/* Parsed Preview State (文件已在APP内智能识别) */}
              {parsedResult && !importSuccessResult && (
                <div className="space-y-4">
                  {/* File Identification & Intelligence Report Card (文件智能研判分析报表) */}
                  <div className="p-4 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3 shadow-lg">
                    {/* File Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                          {parsedResult.fileType === 'zip' ? (
                            <Archive className="w-5 h-5" />
                          ) : parsedResult.report?.category === 'tavern_card' ? (
                            <Bot className="w-5 h-5" />
                          ) : parsedResult.report?.category === 'chat_transcript' ? (
                            <MessageSquare className="w-5 h-5" />
                          ) : (
                            <ScanText className="w-5 h-5" />
                          )}
                        </div>
                        <div className="truncate">
                          <div className="flex items-center gap-2">
                            <span className="block text-xs font-bold text-zinc-100 truncate">
                              {parsedResult.fileName}
                            </span>
                            <span className="px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 text-[10px] font-semibold border border-blue-500/25 shrink-0">
                              {parsedResult.report?.categoryLabel || parsedResult.detectedSource || '已识别文件'}
                            </span>
                          </div>
                          <span className="text-[10px] text-zinc-400 block mt-0.5">
                            格式: {parsedResult.fileType.toUpperCase()} · 大小: {(parsedResult.fileSize / 1024).toFixed(1)} KB · 指纹: {parsedResult.report?.formatSignature || '标准数据结构'}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setParsedResult(null);
                          setCurrentFile(null);
                          setCharacterMapping({});
                        }}
                        className="text-xs text-zinc-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-zinc-800 transition shrink-0 ml-2"
                      >
                        重新选择
                      </button>
                    </div>

                    {/* Confidence Meter Bar */}
                    {parsedResult.report && (
                      <div className="p-2.5 rounded-2xl bg-zinc-900/90 border border-zinc-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-300 text-[11px] font-medium flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            识别置信度研判
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              parsedResult.report.confidence >= 90
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : parsedResult.report.confidence >= 75
                                ? 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }`}
                          >
                            置信度 {parsedResult.report.confidence}% ·{' '}
                            {parsedResult.report.confidence >= 90
                              ? '极高可信度'
                              : parsedResult.report.confidence >= 75
                              ? '良好匹配'
                              : '启发式分析'}
                          </span>
                        </div>
                        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              parsedResult.report.confidence >= 90
                                ? 'bg-emerald-500'
                                : parsedResult.report.confidence >= 75
                                ? 'bg-blue-500'
                                : 'bg-amber-500'
                            }`}
                            style={{ width: `${parsedResult.report.confidence}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Deep Analysis Summary & Action Suggestion */}
                    {parsedResult.report && (
                      <div className="space-y-2 text-xs">
                        <div className="p-3 rounded-2xl bg-blue-950/20 border border-blue-500/25 text-blue-200 text-xs leading-relaxed space-y-1">
                          <div className="flex items-center gap-1.5 font-bold text-blue-300 text-[11px]">
                            <Activity className="w-3.5 h-3.5 text-blue-400" />
                            <span>深度研判结论：{parsedResult.report.identifiedFormat}</span>
                          </div>
                          <p className="text-[11px] text-blue-200/90 pl-5">
                            {parsedResult.report.analysisSummary}
                          </p>
                        </div>

                        {parsedResult.report.actionSuggestion && (
                          <div className="p-2.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/25 text-emerald-200 text-[11px] flex items-start gap-2">
                            <Wand2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-emerald-300 block text-[11px]">智能落地建议：</span>
                              <span className="text-emerald-200/90">{parsedResult.report.actionSuggestion}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Detected Feature Badges Cloud */}
                    {parsedResult.report?.featuresDetected && parsedResult.report.featuresDetected.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-zinc-400 block font-medium">提取到的结构特征指纹：</span>
                        <div className="flex flex-wrap gap-1.5">
                          {parsedResult.report.featuresDetected.map((feat, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded-md bg-zinc-900 border border-zinc-700 text-[10px] text-zinc-300 flex items-center gap-1"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                              {feat}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Format-Specific Detail 1: SillyTavern Metadata */}
                    {parsedResult.report?.tavernDetails && (
                      <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                          <span className="text-[10px] text-zinc-400 block">酒馆卡规范</span>
                          <span className="text-xs font-bold text-blue-300 mt-0.5 block">
                            {parsedResult.report.tavernDetails.spec || 'V2'}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                          <span className="text-[10px] text-zinc-400 block">世界书设定</span>
                          <span className="text-xs font-bold text-purple-300 mt-0.5 block">
                            {parsedResult.report.tavernDetails.hasCharacterBook
                              ? `${parsedResult.report.tavernDetails.characterBookEntriesCount} 条条目`
                              : '无世界书'}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                          <span className="text-[10px] text-zinc-400 block">场景剧情</span>
                          <span className="text-xs font-bold text-emerald-300 mt-0.5 block">
                            {parsedResult.report.tavernDetails.hasScenario ? '已解析注入' : '无场景'}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 text-center">
                          <span className="text-[10px] text-zinc-400 block">备用问候语</span>
                          <span className="text-xs font-bold text-amber-300 mt-0.5 block">
                            {parsedResult.report.tavernDetails.alternateGreetingsCount > 0
                              ? `${parsedResult.report.tavernDetails.alternateGreetingsCount} 组问候`
                              : '默认单组'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Format-Specific Detail 2: Dialogue Turns & Speaker Breakdown */}
                    {parsedResult.report?.turnStats && (
                      <div className="p-3 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-2 text-xs">
                        <div className="flex items-center justify-between text-zinc-300">
                          <span className="font-bold text-[11px] flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-400" />
                            会话转录分析 ({parsedResult.report.turnStats.totalDialogueLines} 轮交互)
                          </span>
                          {parsedResult.report.turnStats.timeSpan && (
                            <span className="text-[10px] text-zinc-400">
                              跨度: {parsedResult.report.turnStats.timeSpan}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1.5 pt-1">
                          {parsedResult.report.turnStats.participants.map((p, idx) => (
                            <div key={idx} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-zinc-200 flex items-center gap-1.5">
                                  {p.isAi ? (
                                    <Bot className="w-3 h-3 text-blue-400" />
                                  ) : (
                                    <Users className="w-3 h-3 text-emerald-400" />
                                  )}
                                  {p.name}
                                  {p.matchedLocalName && (
                                    <span className="text-[9px] text-blue-400 font-normal">
                                      (已匹配本地: {p.matchedLocalName})
                                    </span>
                                  )}
                                </span>
                                <span className="text-zinc-400 text-[10px]">
                                  {p.count} 条 ({p.percentage}%)
                                </span>
                              </div>
                              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${p.isAi ? 'bg-blue-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${p.percentage}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quick Callout for Unified Assignment if conversation flow is detected */}
                    {parsedResult.report?.turnStats && (
                      <div className="p-2.5 rounded-xl bg-blue-950/30 border border-blue-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-zinc-200">
                          <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>
                            识别到 <strong className="text-white">{parsedResult.report.turnStats.totalDialogueLines}</strong> 轮会话。觉得逐个角色指派太麻烦？
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAssignmentMode('unified');
                            const target = unifiedTargetId || charactersList[0]?.id || '__CREATE_NEW__';
                            handleApplyUnifiedTarget(target);
                          }}
                          className="px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-[11px] shadow transition flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                          一键统一归入一个角色名下
                        </button>
                      </div>
                    )}

                    {/* Quick Switcher: Re-analyze with another lens if desired */}
                    <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                      <span className="text-[10px] text-zinc-400 shrink-0">
                        若识别有偏差，可切换解析器重新研判：
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {(['auto', 'tavern_card', 'chat_transcript', 'character_dossier'] as RecognitionMode[]).map((m) => {
                          const labels: Record<RecognitionMode, string> = {
                            auto: '自适应',
                            tavern_card: '酒馆卡',
                            chat_transcript: '对话流',
                            character_dossier: '人设档案',
                            full_backup: '全量备份',
                          };
                          return (
                            <button
                              key={m}
                              onClick={() => handleSwitchRecognitionMode(m)}
                              className={`px-2 py-0.5 rounded-md text-[10px] border transition ${
                                recognitionMode === m
                                  ? 'bg-blue-600 text-white border-blue-500 font-bold'
                                  : 'bg-zinc-900 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                              }`}
                            >
                              {labels[m]}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {parsedResult.warnings && parsedResult.warnings.length > 0 && (
                      <div className="p-2 rounded-xl bg-amber-950/20 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed">
                        ⚠️ 识别提示: {parsedResult.warnings.slice(0, 2).join('；')}
                      </div>
                    )}
                  </div>

                  {/* Recognized Stats Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
                      <Bot className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                      <span className="text-sm font-bold text-white block">{parsedResult.stats.characterCount}</span>
                      <span className="text-[10px] text-zinc-400">AI角色</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
                      <MessageSquare className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <span className="text-sm font-bold text-white block">{parsedResult.stats.messageCount}</span>
                      <span className="text-[10px] text-zinc-400">聊天消息</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
                      <Brain className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                      <span className="text-sm font-bold text-white block">{parsedResult.stats.memoryCount}</span>
                      <span className="text-[10px] text-zinc-400">长期记忆</span>
                    </div>
                    <div className="p-2.5 rounded-2xl bg-zinc-950 border border-zinc-800 text-center">
                      <Users className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <span className="text-sm font-bold text-white block">{parsedResult.stats.groupCount}</span>
                      <span className="text-[10px] text-zinc-400">群聊空间</span>
                    </div>
                  </div>

                  {/* Character Name Matching & Target Assignment (支持逐个配置 与 统一归入单个角色 两种模式) */}
                  {(parsedResult.characters.length > 0 || parsedResult.stats.messageCount > 0) && (
                    <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3.5">
                      {/* Section Header with Mode Toggle */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                        <div className="flex items-center gap-2 font-bold text-zinc-200">
                          <Bot className="w-4 h-4 text-blue-400 shrink-0" />
                          <span>
                            聊天归属与角色配置
                            <span className="text-zinc-500 font-normal ml-1">
                              ({parsedResult.characters.length} 个发言角色 / {parsedResult.stats.messageCount} 条聊天)
                            </span>
                          </span>
                        </div>

                        {/* Mode Switch Tabs: Unified vs Individual */}
                        <div className="flex items-center p-1 rounded-xl bg-zinc-900 border border-zinc-800 self-start sm:self-auto">
                          <button
                            type="button"
                            onClick={() => {
                              setAssignmentMode('unified');
                              const target = unifiedTargetId || charactersList[0]?.id || '__CREATE_NEW__';
                              handleApplyUnifiedTarget(target);
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                              assignmentMode === 'unified'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            统一归入单个角色
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssignmentMode('individual')}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                              assignmentMode === 'individual'
                                ? 'bg-zinc-800 text-white shadow-sm'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5" />
                            逐个分别映射
                          </button>
                        </div>
                      </div>

                      {/* MODE 1: UNIFIED ASSIGNMENT (统一归入选项) */}
                      {assignmentMode === 'unified' ? (
                        <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/30 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                                  <CheckCheck className="w-4 h-4 text-blue-400" />
                                  ⚡ 统一归入模式（省去逐个配置的烦恼）
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                  一键聚合全部聊天
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-300 leading-relaxed">
                                本次导入的所有聊天对话流与记忆，将全部统一收纳入以下指定的单个角色名下。无需再逐个对应设置！
                              </p>
                            </div>
                          </div>

                          {/* Unified Target Selector Dropdown */}
                          <div className="space-y-1.5 pt-1">
                            <label className="text-[11px] font-semibold text-zinc-300 flex items-center justify-between">
                              <span>选择统一归入的目标角色：</span>
                              {charactersList.length > 0 && (
                                <span className="text-[10px] text-zinc-500">
                                  本地现有 {charactersList.length} 位角色
                                </span>
                              )}
                            </label>
                            <select
                              value={unifiedTargetId || (charactersList[0]?.id || '__CREATE_NEW__')}
                              onChange={(e) => handleApplyUnifiedTarget(e.target.value)}
                              className="w-full bg-zinc-900 border border-blue-500/50 rounded-xl text-xs text-zinc-100 p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium cursor-pointer"
                            >
                              {charactersList.length > 0 && (
                                <optgroup label="本地通讯录角色（统一合并写入聊天与记忆）">
                                  {charactersList.map((c) => {
                                    const exactMatched = parsedResult.characters.some(
                                      (pc) => pc.name.trim().toLowerCase() === c.name.trim().toLowerCase()
                                    );
                                    return (
                                      <option key={c.id} value={c.id}>
                                        统一归入「{c.name}」({c.relationship || 'AI好友'}{c.wxid ? ` · 微信号: ${c.wxid}` : ''})
                                        {exactMatched ? ' ★ 智能同名推荐' : ''}
                                      </option>
                                    );
                                  })}
                                </optgroup>
                              )}
                              <optgroup label="新建或独立收纳">
                                <option value="__CREATE_NEW__">➕ 作为全新统一AI角色创建（自动继承导入名字与头像）</option>
                              </optgroup>
                            </select>
                          </div>

                          {/* Target Character Preview Card */}
                          {(() => {
                            const selectedLocal = charactersList.find((c) => c.id === unifiedTargetId);
                            if (selectedLocal) {
                              return (
                                <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <img
                                      src={selectedLocal.avatar}
                                      alt={selectedLocal.name}
                                      className="w-10 h-10 rounded-full object-cover border-2 border-blue-500/50 shrink-0"
                                    />
                                    <div className="truncate">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-white">{selectedLocal.name}</span>
                                        <span className="text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 font-medium">
                                          已锁定接收角色
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                                        人设设定: {selectedLocal.persona ? selectedLocal.persona.slice(0, 50) + '...' : '暂无详细设定'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 text-[10px]">
                                    <span className="text-emerald-400 font-bold block text-xs">
                                      +{parsedResult.stats.messageCount} 条聊天
                                    </span>
                                    <span className="text-purple-400 font-medium block">
                                      +{parsedResult.stats.memoryCount} 条记忆
                                    </span>
                                  </div>
                                </div>
                              );
                            } else if (unifiedTargetId === '__CREATE_NEW__') {
                              return (
                                <div className="p-3 rounded-xl bg-zinc-900/90 border border-zinc-800 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-10 h-10 rounded-full bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold shrink-0">
                                      +
                                    </div>
                                    <div>
                                      <span className="text-xs font-bold text-white block">
                                        全新AI角色（统一收纳）
                                      </span>
                                      <span className="text-[10px] text-zinc-400 block mt-0.5">
                                        将新建角色名「{parsedResult.characters[0]?.name || parsedResult.fileName || '统一导入角色'}」
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0 text-[10px]">
                                    <span className="text-emerald-400 font-bold block text-xs">
                                      +{parsedResult.stats.messageCount} 条聊天
                                    </span>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Notice Banner */}
                          {unifiedNotice && (
                            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>{unifiedNotice}</span>
                            </div>
                          )}

                          <div className="pt-2 border-t border-blue-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-zinc-400">
                            <span>
                              当前已将全部识别发言统一指向该角色。导入后直接在与该角色的聊天窗口中查看即可！
                            </span>
                            <button
                              type="button"
                              onClick={() => setAssignmentMode('individual')}
                              className="text-blue-400 hover:text-blue-300 underline shrink-0 font-medium"
                            >
                              想要逐个角色微调映射？切换到逐个配置
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* MODE 2: INDIVIDUAL ASSIGNMENT (逐个角色映射) */
                        <div className="space-y-3">
                          {/* Quick Batch Bar in Individual Mode */}
                          <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-1.5 text-zinc-300 text-[11px] font-medium">
                              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                              <span>快捷一键统一归入：</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <select
                                value={unifiedTargetId || ''}
                                onChange={(e) => setUnifiedTargetId(e.target.value)}
                                className="bg-zinc-950 border border-zinc-700 rounded-lg text-[11px] text-zinc-200 px-2 py-1.5 focus:outline-none focus:border-blue-500 max-w-[200px] truncate"
                              >
                                <option value="">-- 选择统一归入角色 --</option>
                                {charactersList.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    统一归入「{c.name}」
                                  </option>
                                ))}
                                <option value="__CREATE_NEW__">全部统一新建为全新角色</option>
                              </select>
                              <button
                                type="button"
                                disabled={!unifiedTargetId}
                                onClick={() => {
                                  if (unifiedTargetId) handleApplyUnifiedTarget(unifiedTargetId);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-[11px] font-semibold text-white transition flex items-center gap-1"
                              >
                                <CheckCheck className="w-3 h-3" />
                                一键全部应用
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  // Reset to original smart matching
                                  const initial: Record<string, string> = {};
                                  parsedResult.characterMatches?.forEach((m) => {
                                    initial[m.importedCharacter.id] = m.suggestedTargetId;
                                  });
                                  setCharacterMapping(initial);
                                  setUnifiedNotice('已重置为智能同名自动匹配');
                                  setTimeout(() => setUnifiedNotice(null), 3000);
                                }}
                                className="px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
                              >
                                重置自动匹配
                              </button>
                            </div>
                          </div>

                          {unifiedNotice && (
                            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span>{unifiedNotice}</span>
                            </div>
                          )}

                          {/* Individual Character Cards */}
                          <div className="space-y-2.5">
                            {parsedResult.characters.map((char) => {
                              const matchDetail = parsedResult.characterMatches?.find((m) => m.importedCharacter.id === char.id);
                              const isNameMatched = matchDetail?.isNameMatched;
                              const matchedLocal = matchDetail?.matchedLocalCharacter;
                              const matchingField = matchDetail?.matchingField;
                              const currentMappingTarget = characterMapping[char.id] || (matchedLocal ? matchedLocal.id : '__CREATE_NEW__');

                              return (
                                <div
                                  key={char.id}
                                  className="p-3 rounded-xl bg-zinc-900/70 border border-zinc-800 space-y-2.5 transition"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <img
                                        src={char.avatar}
                                        alt={char.name}
                                        className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0"
                                      />
                                      <div className="truncate">
                                        <div className="flex items-center gap-2">
                                          <span className="text-xs font-bold text-zinc-100 truncate">{char.name}</span>
                                          {matchingField === 'name' ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                              同名精准匹配
                                            </span>
                                          ) : matchingField === 'fuzzy' ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 shrink-0">
                                              <Sparkles className="w-3 h-3 text-indigo-400" />
                                              模糊包含匹配
                                            </span>
                                          ) : matchedLocal ? (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1 shrink-0">
                                              <CheckCircle2 className="w-3 h-3 text-blue-400" />
                                              ID关联匹配
                                            </span>
                                          ) : (
                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 shrink-0">
                                              全新角色
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-zinc-400 block truncate mt-0.5">
                                          {char.persona ? char.persona.slice(0, 40) + '...' : '暂无详细人设设定'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="text-right shrink-0 text-[10px] text-zinc-400">
                                      <span className="text-emerald-400 block font-medium">
                                        {matchDetail?.messageCount || 0} 条消息
                                      </span>
                                      <span className="text-purple-400 block font-medium">
                                        {matchDetail?.memoryCount || 0} 条记忆
                                      </span>
                                    </div>
                                  </div>

                                  {/* Target Selector */}
                                  <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                                    <span className="text-zinc-400 text-[11px] shrink-0">
                                      {isNameMatched
                                        ? `已根据角色名称「${char.name}」自动匹配至本地：`
                                        : '数据写入目标：'}
                                    </span>
                                    <select
                                      value={currentMappingTarget}
                                      onChange={(e) =>
                                        setCharacterMapping((prev) => ({
                                          ...prev,
                                          [char.id]: e.target.value,
                                        }))
                                      }
                                      className="bg-zinc-950 border border-zinc-700 rounded-lg text-xs text-zinc-200 px-2.5 py-1.5 focus:outline-none focus:border-blue-500 cursor-pointer"
                                    >
                                      {charactersList.length > 0 && (
                                        <optgroup label="本地通讯录角色（合并消息与记忆）">
                                          {charactersList.map((c) => {
                                            const isExact = c.name.trim().toLowerCase() === char.name.trim().toLowerCase();
                                            const isFuzzy = !isExact && (c.name.includes(char.name) || char.name.includes(c.name));
                                            return (
                                              <option key={c.id} value={c.id}>
                                                归入「{c.name}」
                                                {isExact ? ' (★ 同名推荐)' : isFuzzy ? ' (🔍 模糊推荐)' : ''}
                                              </option>
                                            );
                                          })}
                                        </optgroup>
                                      )}
                                      <optgroup label="其他处理方式">
                                        <option value="__CREATE_NEW__">➕ 作为全新AI角色存入本地</option>
                                        <option value="__SKIP__">🚫 忽略跳过（不导入该角色数据）</option>
                                      </optgroup>
                                    </select>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Conflict Resolution Selector (If matching existing characters) */}
                  {(parsedResult.conflicts.length > 0 ||
                    Object.values(characterMapping).some((v) => v !== '__CREATE_NEW__' && v !== '__SKIP__')) && (
                    <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/40 space-y-2.5">
                      <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>已匹配本地角色处理策略</span>
                      </div>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        当导入文件中的角色与本地已有角色匹配时，请选择数据整合方式（所有消息与记忆将自动去重）：
                      </p>
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setConflictStrategy('merge')}
                          className={`p-2 rounded-xl text-center border transition ${
                            conflictStrategy === 'merge'
                              ? 'bg-amber-500 text-zinc-950 font-bold border-amber-400 shadow'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span className="block">⚡ 智能合并</span>
                          <span className="text-[9px] opacity-80">去重合并聊天与记忆</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConflictStrategy('keep_existing')}
                          className={`p-2 rounded-xl text-center border transition ${
                            conflictStrategy === 'keep_existing'
                              ? 'bg-amber-500 text-zinc-950 font-bold border-amber-400 shadow'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span className="block">🛡️ 保留原设定</span>
                          <span className="text-[9px] opacity-80">锁定人设仅追加记录</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConflictStrategy('import_as_new')}
                          className={`p-2 rounded-xl text-center border transition ${
                            conflictStrategy === 'import_as_new'
                              ? 'bg-amber-500 text-zinc-950 font-bold border-amber-400 shadow'
                              : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                          }`}
                        >
                          <span className="block">➕ 作为新AI</span>
                          <span className="text-[9px] opacity-80">重名也并列存为新角色</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Modules to Import Checkboxes */}
                  <div className="p-3 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                    <span className="text-xs font-bold text-zinc-300 block">选择导入的内容模块：</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importFlags.characters}
                          onChange={(e) => setImportFlags({ ...importFlags, characters: e.target.checked })}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span>AI 角色资料</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importFlags.messages}
                          onChange={(e) => setImportFlags({ ...importFlags, messages: e.target.checked })}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span>聊天消息记录</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importFlags.memories}
                          onChange={(e) => setImportFlags({ ...importFlags, memories: e.target.checked })}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span>长期记忆库</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importFlags.groups}
                          onChange={(e) => setImportFlags({ ...importFlags, groups: e.target.checked })}
                          className="w-4 h-4 accent-blue-500"
                        />
                        <span>群聊空间与消息</span>
                      </label>
                    </div>
                  </div>

                  {/* Safety Tip */}
                  <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-950/70 p-2.5 rounded-xl border border-zinc-800">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>执行导入前会自动创建本地快照备份，若有误可随时在“备份与回滚”中一键撤销。</span>
                  </div>

                  {/* Confirm Button */}
                  <button
                    onClick={handleRunImport}
                    disabled={isExecutingImport}
                    className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-sm shadow-lg shadow-blue-600/30 active:scale-98 transition flex items-center justify-center gap-2"
                  >
                    {isExecutingImport ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>正在写入本地数据库并去重...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>确认导入并写入数据</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: EXPORT */}
          {/* ========================================================================= */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              {/* Success Notification */}
              {exportSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}

              {/* Step 1: Content Selection */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">1. 选择导出内容模块</span>
                  <button
                    onClick={() => toggleExportCategory('all')}
                    className="text-xs text-blue-400 hover:underline"
                  >
                    {exportCategories.length >= 5 ? '取消全选' : '全选所有数据'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition">
                    <input
                      type="checkbox"
                      checked={exportCategories.includes('characters')}
                      onChange={() => toggleExportCategory('characters')}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <Bot className="w-3.5 h-3.5 text-blue-400" />
                    <span>AI 角色档案</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition">
                    <input
                      type="checkbox"
                      checked={exportCategories.includes('messages')}
                      onChange={() => toggleExportCategory('messages')}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>聊天历史记录</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition">
                    <input
                      type="checkbox"
                      checked={exportCategories.includes('memories')}
                      onChange={() => toggleExportCategory('memories')}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <Brain className="w-3.5 h-3.5 text-purple-400" />
                    <span>长期记忆库</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition">
                    <input
                      type="checkbox"
                      checked={exportCategories.includes('groups')}
                      onChange={() => toggleExportCategory('groups')}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <Users className="w-3.5 h-3.5 text-amber-400" />
                    <span>群聊空间与消息</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 border border-zinc-800 cursor-pointer hover:border-zinc-700 transition col-span-2">
                    <input
                      type="checkbox"
                      checked={exportCategories.includes('settings')}
                      onChange={() => toggleExportCategory('settings')}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <Settings className="w-3.5 h-3.5 text-indigo-400" />
                    <span>全局设置、用户自身人设、备忘录与世界书</span>
                  </label>
                </div>
              </div>

              {/* Step 2: Format Selection */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-3">
                <span className="text-xs font-bold text-zinc-200 block">2. 选择导出文件格式</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExportFormat('zip')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                      exportFormat === 'zip'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">ZIP 综合包</span>
                      <Archive className="w-4 h-4 text-blue-400" />
                    </div>
                    <span className="text-[10px] opacity-80">
                      推荐格式！分类存储 JSON、聊天记录与记忆
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('json')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                      exportFormat === 'json'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">JSON 标准备份</span>
                      <FileCode className="w-4 h-4 text-emerald-400" />
                    </div>
                    <span className="text-[10px] opacity-80">
                      完整结构化单一 JSON 文件，支持跨设备还原
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('jsonl')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                      exportFormat === 'jsonl'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">JSONL 行序列</span>
                      <Layers className="w-4 h-4 text-purple-400" />
                    </div>
                    <span className="text-[10px] opacity-80">
                      逐行 JSON 序列，适合大规模迁移与训练
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportFormat('txt')}
                    className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition ${
                      exportFormat === 'txt'
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white">TXT 易读报告</span>
                      <FileText className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="text-[10px] opacity-80">
                      格式化文本，方便直接阅读与打印聊天记录
                    </span>
                  </button>
                </div>
              </div>

              {/* Step 3: Character Filter Scope */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-200">3. 角色范围过滤</span>
                  <div className="flex gap-2 text-xs">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="exportScope"
                        checked={exportCharScope === 'all'}
                        onChange={() => setExportCharScope('all')}
                        className="accent-blue-500"
                      />
                      <span>全部角色</span>
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="exportScope"
                        checked={exportCharScope === 'custom'}
                        onChange={() => setExportCharScope('custom')}
                        className="accent-blue-500"
                      />
                      <span>指定角色</span>
                    </label>
                  </div>
                </div>

                {exportCharScope === 'custom' && (
                  <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-zinc-800">
                    {charactersList.map((c) => (
                      <label
                        key={c.id}
                        className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900 text-xs text-zinc-300 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedExportCharIds.includes(c.id)}
                          onChange={() => {
                            setSelectedExportCharIds((prev) =>
                              prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                            );
                          }}
                          className="accent-blue-500"
                        />
                        <span className="truncate">{c.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Action Button */}
              <button
                onClick={handleRunExport}
                disabled={isExporting || exportCategories.length === 0}
                className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 font-bold text-sm text-white shadow-lg shadow-emerald-500/25 active:scale-98 transition flex items-center justify-center gap-2"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在打包生成导出文件...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>立即开始导出与下载</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: SNAPSHOTS & ROLLBACK */}
          {/* ========================================================================= */}
          {activeTab === 'snapshots' && (
            <div className="space-y-4">
              {/* Notification Banner */}
              {rollbackSuccessMsg && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{rollbackSuccessMsg}</span>
                </div>
              )}

              {/* Create Snapshot Form */}
              <div className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2.5">
                <span className="text-xs font-bold text-zinc-200 block">创建本地即刻快照备份</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="输入快照备注（如：大版本前备份）..."
                    value={snapshotNote}
                    onChange={(e) => setSnapshotNote(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleManualCreateSnapshot}
                    disabled={isCreatingSnapshot}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-bold text-white shrink-0 transition"
                  >
                    {isCreatingSnapshot ? '创建中...' : '创建快照'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-500">
                  快照包含 IndexedDB 完整聊天记录和所有本地设置，存储在浏览器安全隔离区中。
                </p>
              </div>

              {/* Snapshots List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-zinc-300 block">
                  已有历史快照清单 ({snapshots.length})
                </span>

                {snapshots.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 text-center text-zinc-500 text-xs">
                    暂无历史快照。每次导入前系统会自动创建快照备份。
                  </div>
                ) : (
                  <div className="space-y-2">
                    {snapshots.map((snap) => (
                      <div
                        key={snap.id}
                        className="p-3.5 rounded-2xl bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-200 truncate">{snap.note}</span>
                            <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                              {new Date(snap.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5 flex gap-2">
                            <span>AI: {snap.stats.characterCount}</span>
                            <span>消息: {snap.stats.messageCount}</span>
                            <span>群聊: {snap.stats.groupCount}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleRollback(snap.id)}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1 transition"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            回滚
                          </button>
                          <button
                            onClick={() => handleDeleteSnap(snap.id)}
                            className="p-1.5 rounded-xl text-zinc-500 hover:text-rose-400 hover:bg-zinc-800 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
