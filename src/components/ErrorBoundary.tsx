import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2, Smartphone } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in component tree:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetStorage = () => {
    if (
      window.confirm(
        '确定要重置应用本地数据并重新加载吗？这可以解决因缓存数据格式冲突导致的白屏问题。'
      )
    ) {
      try {
        localStorage.clear();
      } catch (e) {
        console.error('Failed to clear storage:', e);
      }
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-4 text-white font-sans select-none">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl border border-zinc-800 p-6 shadow-2xl flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-rose-500" />
            </div>

            <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>Android AI Phone OS</span>
            </div>

            <h2 className="text-xl font-semibold text-zinc-100 mb-2">系统遇到意外错误</h2>
            <p className="text-xs text-zinc-400 mb-4 max-w-xs">
              应用运行时捕获到未处理异常，系统已拦截白屏崩溃。
            </p>

            {/* Error Message Box */}
            <div className="w-full bg-black/60 rounded-xl p-3 border border-zinc-800 text-left mb-6 overflow-auto max-h-36">
              <p className="text-xs font-mono text-rose-400 font-semibold mb-1">
                {this.state.error?.name}: {this.state.error?.message}
              </p>
              {this.state.errorInfo?.componentStack && (
                <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap leading-tight">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 shadow-md shadow-emerald-900/20"
              >
                <RefreshCw className="w-4 h-4" />
                <span>刷新重试</span>
              </button>
              <button
                onClick={this.handleResetStorage}
                className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs flex items-center justify-center gap-2 transition active:scale-95 border border-zinc-700"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
                <span>重置缓存并恢复</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
