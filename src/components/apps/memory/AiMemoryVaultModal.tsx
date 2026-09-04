import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Folder,
  FolderOpen,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Search,
  FileText,
  FileCode,
  Archive,
  CheckCircle2,
  AlertCircle,
  Database,
  Eye,
  Sliders,
  Sparkles,
  Layers,
  HardDrive,
  Bot,
  ChevronRight,
  ChevronLeft,
  Lock,
  ArrowUpDown,
  FileSpreadsheet,
  Check,
} from 'lucide-react';
import { AiCharacter, AiMemoryVault, AiMemoryFileMeta, AiMemoryChunk, MemoryFileType } from '../../../types';
import {
  ensureAiMemoryVault,
  getAiMemoryVault,
  listAiMemoryFiles,
  importFileToAiMemory,
  deleteAiMemoryFile,
  replaceAiMemoryFile,
  getAiMemoryFileWithContent,
  getAiMemoryChunksPaged,
  searchAiMemoryChunks,
  subscribeAiMemoryVault,
} from '../../../lib/aiMemoryVaultDb';

interface AiMemoryVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCharacter: AiCharacter;
  allCharacters?: AiCharacter[];
  onSelectCharacter?: (char: AiCharacter) => void;
}

export const AiMemoryVaultModal: React.FC<AiMemoryVaultModalProps> = ({
  isOpen,
  onClose,
  currentCharacter,
  allCharacters = [],
  onSelectCharacter,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'import' | 'test'>('files');
  const [activeChar, setActiveChar] = useState<AiCharacter>(currentCharacter);

  // Vault state
  const [vault, setVault] = useState<AiMemoryVault | null>(null);
  const [files, setFiles] = useState<AiMemoryFileMeta[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetFileId, setReplaceTargetFileId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ percent: number; msg: string }>({
    percent: 0,
    msg: '',
  });
  const [importSuccessAlert, setImportSuccessAlert] = useState<string | null>(null);
  const [importErrorAlert, setImportErrorAlert] = useState<string | null>(null);

  // File Preview Modal
  const [previewFileMeta, setPreviewFileMeta] = useState<AiMemoryFileMeta | null>(null);
  const [previewChunks, setPreviewChunks] = useState<AiMemoryChunk[]>([]);
  const [previewTotalChunks, setPreviewTotalChunks] = useState(0);
  const [previewPage, setPreviewPage] = useState(1);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Retrieval Test State
  const [testQuery, setTestQuery] = useState('');
  const [testResults, setTestResults] = useState<{
    recalledText: string;
    matchedChunks: any[];
    matchedFileNames: string[];
  } | null>(null);
  const [isTestingRecall, setIsTestingRecall] = useState(false);

  // Sync active character when props change
  useEffect(() => {
    setActiveChar(currentCharacter);
  }, [currentCharacter?.id]);

  // Load vault & files for the active character
  const loadVaultData = async (charId: string, charName: string) => {
    setIsLoading(true);
    try {
      const v = await ensureAiMemoryVault(charId, charName);
      setVault(v);
      const fileList = await listAiMemoryFiles(charId);
      setFiles(fileList);
    } catch (err) {
      console.error('Failed to load AI memory vault', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && activeChar) {
      loadVaultData(activeChar.id, activeChar.name);
    }
  }, [isOpen, activeChar?.id]);

  // Subscribe to DB changes
  useEffect(() => {
    const unsub = subscribeAiMemoryVault(() => {
      if (activeChar) {
        loadVaultData(activeChar.id, activeChar.name);
      }
    });
    return () => unsub();
  }, [activeChar?.id]);

  if (!isOpen) return null;

  // Format file size
  const formatSize = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  // Get icon by file type
  const getFileIcon = (type: MemoryFileType) => {
    switch (type) {
      case 'zip':
        return <Archive className="w-4 h-4 text-amber-400" />;
      case 'json':
      case 'jsonl':
        return <FileCode className="w-4 h-4 text-emerald-400" />;
      case 'csv':
        return <FileSpreadsheet className="w-4 h-4 text-teal-400" />;
      case 'md':
        return <FileText className="w-4 h-4 text-cyan-400" />;
      default:
        return <FileText className="w-4 h-4 text-blue-400" />;
    }
  };

  // Handle File Input Selection
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0 || !activeChar) return;

    setIsImporting(true);
    setImportErrorAlert(null);
    setImportSuccessAlert(null);

    let totalImportedCount = 0;
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const res = await importFileToAiMemory(
          activeChar.id,
          file,
          (percent, msg) => {
            setImportProgress({ percent, msg });
          }
        );
        totalImportedCount += res.length;
      }
      setImportSuccessAlert(
        `成功导入 ${totalImportedCount} 份记忆资料至「${activeChar.name}」专属记忆空间！`
      );
      // Refresh list and switch to files tab
      await loadVaultData(activeChar.id, activeChar.name);
      setTimeout(() => {
        setActiveTab('files');
      }, 900);
    } catch (err: any) {
      console.error('Import failed', err);
      setImportErrorAlert(err.message || '文件导入失败，请检查文件格式');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Handle File Replacement
  const handleTriggerReplace = (fileId: string) => {
    setReplaceTargetFileId(fileId);
    if (replaceInputRef.current) {
      replaceInputRef.current.click();
    }
  };

  const handleExecuteReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTargetFileId || !activeChar) return;

    setIsImporting(true);
    try {
      await replaceAiMemoryFile(
        activeChar.id,
        replaceTargetFileId,
        file,
        (percent, msg) => {
          setImportProgress({ percent, msg });
        }
      );
      setImportSuccessAlert(`已成功将旧文件替换为「${file.name}」！切片已重新建立。`);
      await loadVaultData(activeChar.id, activeChar.name);
    } catch (err: any) {
      alert(`更换文件失败: ${err.message}`);
    } finally {
      setIsImporting(false);
      setReplaceTargetFileId(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  // Handle Delete File
  const handleDeleteFile = async (file: AiMemoryFileMeta) => {
    if (!window.confirm(`确定从「${activeChar.name}」的记忆空间中彻底删除文件「${file.fileName}」吗？\n删除后该 AI 将无法调阅其中的记忆。`)) {
      return;
    }
    try {
      await deleteAiMemoryFile(activeChar.id, file.id);
      await loadVaultData(activeChar.id, activeChar.name);
    } catch (err: any) {
      alert(`删除失败: ${err.message}`);
    }
  };

  // Handle Download Raw File
  const handleDownloadFile = async (fileMeta: AiMemoryFileMeta) => {
    try {
      const full = await getAiMemoryFileWithContent(fileMeta.id);
      if (!full || !full.rawContent) {
        alert('未获取到该文件原始内容');
        return;
      }
      const blob = new Blob([full.rawContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileMeta.fileName.replace(/\s*\(来自.*\)$/, '');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`下载失败: ${err.message}`);
    }
  };

  // Handle Open Preview Drawer
  const handleOpenPreview = async (fileMeta: AiMemoryFileMeta) => {
    setPreviewFileMeta(fileMeta);
    setPreviewPage(1);
    setIsLoadingPreview(true);
    try {
      const { chunks, total } = await getAiMemoryChunksPaged(fileMeta.id, 1, 6);
      setPreviewChunks(chunks);
      setPreviewTotalChunks(total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (!previewFileMeta) return;
    setPreviewPage(newPage);
    setIsLoadingPreview(true);
    try {
      const { chunks, total } = await getAiMemoryChunksPaged(previewFileMeta.id, newPage, 6);
      setPreviewChunks(chunks);
      setPreviewTotalChunks(total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Handle Search Chunks Test
  const handleRunTestQuery = async () => {
    if (!testQuery.trim() || !activeChar) return;
    setIsTestingRecall(true);
    try {
      const res = await searchAiMemoryChunks(activeChar.id, testQuery.trim(), 4);
      setTestResults(res);
    } catch (err) {
      console.error('Test query failed', err);
    } finally {
      setIsTestingRecall(false);
    }
  };

  // Filtered files
  const filteredFiles = files.filter((f) =>
    f.fileName.toLowerCase().includes(searchFilter.toLowerCase().trim())
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 bg-black/75 backdrop-blur-md animate-fadeIn">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".zip,.json,.jsonl,.txt,.md,.csv,.log"
        className="hidden"
        onChange={handleFilesSelected}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".zip,.json,.jsonl,.txt,.md,.csv,.log"
        className="hidden"
        onChange={handleExecuteReplace}
      />

      <div className="w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl bg-zinc-900 border border-zinc-700/80 shadow-2xl text-zinc-100 overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-zinc-800 bg-zinc-950/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src={activeChar.avatar}
                alt={activeChar.name}
                className="w-10 h-10 rounded-2xl object-cover border border-emerald-500/40"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center text-[9px] text-white">
                <Database className="w-2.5 h-2.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <span>{activeChar.name} 专属记忆空间</span>
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  本地隔离
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                独立离线存储文件夹 · AI随时按需调阅 · 绝不污染聊天列表
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* AI Character Switcher Bar (if multiple characters) */}
        {allCharacters.length > 1 && (
          <div className="px-4 py-2 bg-zinc-900/90 border-b border-zinc-800/70 flex items-center gap-2 overflow-x-auto scrollbar-none">
            <span className="text-[11px] text-zinc-400 shrink-0 flex items-center gap-1">
              <Bot className="w-3.5 h-3.5 text-zinc-500" />
              切换AI空间:
            </span>
            <div className="flex items-center gap-1.5">
              {allCharacters.map((c) => {
                const isCurrent = c.id === activeChar.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => {
                      setActiveChar(c);
                      onSelectCharacter?.(c);
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                      isCurrent
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-750'
                    }`}
                  >
                    <img src={c.avatar} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                    <span>{c.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Vault Stats Bar */}
        <div className="px-4 py-2.5 bg-zinc-850/60 border-b border-zinc-800 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block">已存记忆文件</span>
            <span className="font-bold text-white text-xs">{files.length} 个</span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block">空间总占用</span>
            <span className="font-bold text-emerald-400 text-xs">
              {formatSize(vault?.totalSizeBytes || 0)}
            </span>
          </div>
          <div className="p-1.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <span className="text-[10px] text-zinc-400 block">可调阅切片</span>
            <span className="font-bold text-cyan-400 text-xs">
              {files.reduce((acc, f) => acc + (f.chunkCount || 0), 0)} 片段
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-zinc-800 bg-zinc-900 px-4 pt-2">
          <button
            onClick={() => setActiveTab('files')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'files'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Folder className="w-3.5 h-3.5" />
            <span>记忆资料文件 ({files.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'import'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>导入大型记忆资料</span>
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'test'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>按需检索测试</span>
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* TAB 1: FILES LIST (查看、删除、更换、下载) */}
          {activeTab === 'files' && (
            <div className="space-y-3">
              {/* Search Bar & Quick Import Button */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={`在 ${activeChar.name} 的记忆文件中搜索...`}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer shrink-0 transition"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>添加文件</span>
                </button>
              </div>

              {/* Notice Card */}
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-[11px] text-emerald-300/90 leading-relaxed flex items-start gap-2">
                <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  <b>独立存储保护</b>：导入的文件仅属于【{activeChar.name}
                  】，其他AI绝无权限查看。聊天时AI将按需检索，无需把历史消息塞入聊天界面。
                </span>
              </div>

              {/* Files Table / List */}
              {isLoading ? (
                <div className="py-12 text-center text-zinc-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>正在读取 {activeChar.name} 专属记忆库...</span>
                </div>
              ) : filteredFiles.length === 0 ? (
                <div className="py-12 text-center rounded-2xl bg-zinc-850/40 border border-zinc-800/80 p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800 mx-auto flex items-center justify-center text-zinc-400">
                    <FolderOpen className="w-6 h-6 text-zinc-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-300">
                      {searchFilter ? '未找到匹配的记忆文件' : '记忆文件夹还是空的'}
                    </h4>
                    <p className="text-[11px] text-zinc-500 mt-1 max-w-xs mx-auto leading-relaxed">
                      支持导入 ZIP、JSON、JSONL、TXT、MD
                      等各种大型文件，完整保存在本地，供AI随时回忆调阅。
                    </p>
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer transition shadow-md"
                  >
                    <Upload className="w-4 h-4" />
                    <span>立即导入第一个记忆文件</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.id}
                      className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 hover:border-zinc-650 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-zinc-900 border border-zinc-750 shrink-0 mt-0.5">
                            {getFileIcon(file.fileType)}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold text-zinc-200 truncate" title={file.fileName}>
                              {file.fileName}
                            </h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-400">
                              <span className="uppercase font-mono px-1 rounded bg-zinc-800 text-zinc-300">
                                {file.fileType}
                              </span>
                              <span>{formatSize(file.fileSizeBytes)}</span>
                              <span>·</span>
                              <span>{file.chunkCount} 个检索切片</span>
                              {file.lineCount && <span>· {file.lineCount} 行</span>}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* 1. Preview Chunks */}
                          <button
                            onClick={() => handleOpenPreview(file)}
                            title="查看切片与预览"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* 2. Replace File */}
                          <button
                            onClick={() => handleTriggerReplace(file.id)}
                            title="更换新文件内容"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-emerald-900/40 text-zinc-300 hover:text-emerald-300 transition cursor-pointer"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>

                          {/* 3. Download Raw File */}
                          <button
                            onClick={() => handleDownloadFile(file)}
                            title="下载原始文件"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* 4. Delete File */}
                          <button
                            onClick={() => handleDeleteFile(file)}
                            title="从专属空间删除"
                            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* File preview snippet (first few words) */}
                      {file.previewSnippet && (
                        <div className="p-2 rounded-xl bg-zinc-900/60 border border-zinc-800 text-[11px] text-zinc-400 font-mono leading-relaxed line-clamp-2">
                          {file.previewSnippet}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT (支持 ZIP, JSON, JSONL, TXT, MD, CSV) */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              {/* Feature Highlights */}
              <div className="p-3.5 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2.5">
                <h4 className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>独立本地空间导入规则</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-300">
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <b>支持各类大文件</b>：ZIP 归档、JSON、JSONL 对话集、TXT、MD 设定集、LOG 日志。
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <b>不污染聊天界面</b>：导入内容完全存储在独立数据库中，不会塞进聊天 messages 导致卡顿。
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <b>离线隐私安全</b>：浏览器纯本地解析 (IndexedDB)，原始数据绝不上传服务器。
                    </span>
                  </div>
                  <div className="p-2 rounded-xl bg-zinc-900/80 border border-zinc-800 flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <b>按需回忆调阅</b>：自动建立语义检索切片，AI 聊天需要时才精准提取几句话。
                    </span>
                  </div>
                </div>
              </div>

              {/* Upload Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-emerald-500 rounded-2xl p-8 text-center bg-zinc-850/40 hover:bg-zinc-800/50 transition cursor-pointer space-y-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-200">
                    点击选择文件 或 拖拽文件到这里
                  </p>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    支持 ZIP、JSON、JSONL、TXT、MD、CSV、LOG 等各种大型文件
                  </p>
                </div>
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                    .zip
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                    .json
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                    .jsonl
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                    .txt
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-300 font-mono">
                    .md
                  </span>
                </div>
              </div>

              {/* Progress Indicator */}
              {isImporting && (
                <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center justify-between text-xs text-emerald-300">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      <span>{importProgress.msg}</span>
                    </span>
                    <span className="font-mono">{importProgress.percent}%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Success Alert */}
              {importSuccessAlert && (
                <div className="p-3 rounded-xl bg-emerald-900/40 border border-emerald-500/30 text-xs text-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{importSuccessAlert}</span>
                </div>
              )}

              {/* Error Alert */}
              {importErrorAlert && (
                <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{importErrorAlert}</span>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RETRIEVAL TEST (按需检索测试) */}
          {activeTab === 'test' && (
            <div className="space-y-4">
              <div className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 space-y-2">
                <h4 className="text-xs font-semibold text-cyan-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  <span>测试 {activeChar.name} 的独立记忆检索</span>
                </h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  在下方输入任意话题或关键词（例如“上次约定的事情”、“喜欢的食物”、“世界法则”），系统将仅从【
                  {activeChar.name}
                  】的专属记忆文件中精准召回最相关的片段，展示 AI 实际调阅的效果。
                </p>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={testQuery}
                    onChange={(e) => setTestQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRunTestQuery()}
                    placeholder="输入测试话题关键词..."
                    className="flex-1 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={handleRunTestQuery}
                    disabled={isTestingRecall || !testQuery.trim()}
                    className="px-4 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 cursor-pointer transition"
                  >
                    {isTestingRecall ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>检索调阅</span>
                  </button>
                </div>
              </div>

              {/* Test Results Display */}
              {testResults && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      从 {files.length} 个专属文件中检索到{' '}
                      <b className="text-cyan-400">{testResults.matchedChunks.length}</b> 处匹配记忆
                    </span>
                    {testResults.matchedFileNames.length > 0 && (
                      <span className="text-[10px] text-zinc-500">
                        来源文件: {testResults.matchedFileNames.join(', ')}
                      </span>
                    )}
                  </div>

                  {testResults.matchedChunks.length === 0 ? (
                    <div className="p-4 rounded-xl bg-zinc-850/50 border border-zinc-800 text-center text-xs text-zinc-500">
                      在该 AI 的记忆空间中未匹配到相关片段。可尝试更换其他关键词，或在「导入资料」中补充更多相关文件。
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {testResults.matchedChunks.map((match, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-xl bg-zinc-850 border border-zinc-750 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-emerald-400 text-[11px] flex items-center gap-1">
                              <FileText className="w-3 h-3 text-emerald-400" />
                              {match.fileName} (片段 #{match.chunkIndex + 1})
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 font-mono">
                              相关度得分: {match.score}
                            </span>
                          </div>
                          <p className="text-zinc-200 text-[11px] leading-relaxed bg-zinc-900/60 p-2 rounded-lg border border-zinc-800">
                            {match.text}
                          </p>
                        </div>
                      ))}

                      {/* Prompt Format Preview */}
                      <div className="p-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] text-zinc-400 space-y-1">
                        <span className="text-zinc-500 font-semibold block">
                          AI 聊天时实际注入给模型的上下文格式：
                        </span>
                        <pre className="whitespace-pre-wrap font-mono text-zinc-300">
                          {testResults.recalledText}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/70 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            <span>存储引擎: 本地 IndexedDB (完全离线隔离)</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium transition cursor-pointer"
          >
            完成并返回
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Chunk Preview Drawer */}
      {previewFileMeta && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-zinc-900 border border-zinc-700 shadow-2xl text-zinc-100 overflow-hidden">
            <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>{previewFileMeta.fileName}</span>
                </h4>
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  共 {previewTotalChunks} 个切片 · 占用 {formatSize(previewFileMeta.fileSizeBytes)}
                </p>
              </div>
              <button
                onClick={() => setPreviewFileMeta(null)}
                className="p-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Chunk List Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoadingPreview ? (
                <div className="py-12 text-center text-zinc-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>正在分页加载切片...</span>
                </div>
              ) : (
                previewChunks.map((chunk) => (
                  <div
                    key={chunk.id}
                    className="p-3 rounded-2xl bg-zinc-850 border border-zinc-750 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-zinc-400">
                      <span className="font-mono text-emerald-400">
                        片段索引 #{chunk.chunkIndex + 1}
                      </span>
                      <span>约 {chunk.tokenEstimated || Math.round(chunk.text.length / 2)} tokens</span>
                    </div>
                    <p className="text-zinc-200 text-[11px] leading-relaxed whitespace-pre-wrap font-sans bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                      {chunk.text}
                    </p>
                  </div>
                ))
              )}
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-xs">
              <span className="text-zinc-400 text-[11px]">
                第 {previewPage} / {Math.max(1, Math.ceil(previewTotalChunks / 6))} 页
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={previewPage <= 1}
                  onClick={() => handlePageChange(previewPage - 1)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 text-zinc-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>
                <button
                  disabled={previewPage >= Math.ceil(previewTotalChunks / 6)}
                  onClick={() => handlePageChange(previewPage + 1)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-750 disabled:opacity-40 text-zinc-300 text-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
