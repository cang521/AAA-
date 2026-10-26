import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';

export interface GestureLockProps {
  mode: 'unlock' | 'setup';
  onUnlockSuccess?: () => void;
  onUnlockError?: () => void;
  onSetupSuccess?: (patternPath: number[]) => void;
  onVerifyPattern?: (path: number[]) => Promise<boolean>;
  isLightWallpaper?: boolean;
  cooldownSeconds?: number;
  onCancelSetup?: () => void;
}

interface Point {
  x: number;
  y: number;
}

export const GestureLock: React.FC<GestureLockProps> = ({
  mode,
  onUnlockSuccess,
  onUnlockError,
  onSetupSuccess,
  onVerifyPattern,
  isLightWallpaper = false,
  cooldownSeconds = 0,
  onCancelSetup,
}) => {
  const [selectedPath, setSelectedPath] = useState<number[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [currentPos, setCurrentPos] = useState<Point | null>(null);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [msg, setMsg] = useState<string>(
    mode === 'setup' ? '请绘制解锁手势（至少连接4个点）' : '请绘制手势解锁手机'
  );

  // Setup Flow State
  const [setupStep, setSetupStep] = useState<1 | 2>(1);
  const [firstPath, setFirstPath] = useState<number[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [nodePositions, setNodePositions] = useState<Point[]>([]);

  // Update 3x3 Node Positions relative to container
  const updatePositions = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const positions: Point[] = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const x = (col + 0.5) * (w / 3);
        const y = (row + 0.5) * (h / 3);
        positions.push({ x, y });
      }
    }
    setNodePositions(positions);
  };

  useEffect(() => {
    updatePositions();
    window.addEventListener('resize', updatePositions);
    return () => window.removeEventListener('resize', updatePositions);
  }, []);

  // Cooldown timer update
  useEffect(() => {
    if (cooldownSeconds > 0) {
      setMsg(`尝试次数过多，请 ${cooldownSeconds} 秒后再试`);
      setStatus('error');
    } else if (status === 'error' && cooldownSeconds === 0) {
      setStatus('idle');
      setMsg(mode === 'setup' ? '请绘制解锁手势（至少连接4个点）' : '请绘制手势解锁手机');
    }
  }, [cooldownSeconds]);

  // Pointer position to node index collision detection
  const getNodeAtPosition = (x: number, y: number): number | null => {
    if (!containerRef.current || nodePositions.length !== 9) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const relX = x - rect.left;
    const relY = y - rect.top;
    const radiusThreshold = 36; // Collision radius in pixels

    for (let i = 0; i < nodePositions.length; i++) {
      const pos = nodePositions[i];
      const dist = Math.hypot(relX - pos.x, relY - pos.y);
      if (dist <= radiusThreshold) {
        return i;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (cooldownSeconds > 0) return;
    e.preventDefault();
    if (!containerRef.current) return;

    // Reset previous feedback state
    setStatus('idle');
    setSelectedPath([]);
    setIsDragging(true);

    const rect = containerRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    setCurrentPos({ x: pointerX, y: pointerY });

    const nodeIdx = getNodeAtPosition(e.clientX, e.clientY);
    if (nodeIdx !== null) {
      setSelectedPath([nodeIdx]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();

    const rect = containerRef.current.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;
    setCurrentPos({ x: pointerX, y: pointerY });

    const nodeIdx = getNodeAtPosition(e.clientX, e.clientY);
    if (nodeIdx !== null && !selectedPath.includes(nodeIdx)) {
      setSelectedPath((prev) => [...prev, nodeIdx]);
    }
  };

  const handlePointerUp = async () => {
    if (!isDragging) return;
    setIsDragging(false);
    setCurrentPos(null);

    if (selectedPath.length < 4) {
      setStatus('error');
      setMsg('手势太简单，请至少连接 4 个点');
      setTimeout(() => {
        setSelectedPath([]);
        setStatus('idle');
        setMsg(
          mode === 'setup'
            ? setupStep === 1
              ? '请绘制解锁手势（至少连接4个点）'
              : '请再次绘制手势进行确认'
            : '请绘制手势解锁手机'
        );
      }, 1000);
      return;
    }

    if (mode === 'unlock') {
      if (onVerifyPattern) {
        const matches = await onVerifyPattern(selectedPath);
        if (matches) {
          setStatus('success');
          setMsg('解锁成功');
          setTimeout(() => {
            if (onUnlockSuccess) onUnlockSuccess();
          }, 200);
        } else {
          setStatus('error');
          setMsg('手势密码错误，请重新绘制');
          if (onUnlockError) onUnlockError();
          setTimeout(() => {
            setSelectedPath([]);
            setStatus('idle');
            setMsg('请绘制手势解锁手机');
          }, 1000);
        }
      }
    } else if (mode === 'setup') {
      if (setupStep === 1) {
        setFirstPath(selectedPath);
        setSetupStep(2);
        setStatus('success');
        setMsg('手势记录成功，请再次绘制进行确认');
        setTimeout(() => {
          setSelectedPath([]);
          setStatus('idle');
        }, 600);
      } else if (setupStep === 2) {
        const isMatch =
          firstPath.length === selectedPath.length &&
          firstPath.every((val, idx) => val === selectedPath[idx]);

        if (isMatch) {
          setStatus('success');
          setMsg('手势密码确认成功！');
          setTimeout(() => {
            if (onSetupSuccess) onSetupSuccess(selectedPath);
          }, 400);
        } else {
          setStatus('error');
          setMsg('两次绘制手势不一致，请重新绘制');
          setTimeout(() => {
            setSelectedPath([]);
            setSetupStep(1);
            setFirstPath([]);
            setStatus('idle');
            setMsg('请重新绘制解锁手势（至少连接4个点）');
          }, 1200);
        }
      }
    }
  };

  // Color mappings based on status
  const getLineColor = () => {
    if (status === 'error') return '#F43F5E'; // Rose red
    if (status === 'success') return '#10B981'; // Emerald green
    return isLightWallpaper ? '#38BDF8' : '#60A5FA'; // Sky blue
  };

  return (
    <div className="w-full flex flex-col items-center select-none touch-none">
      {/* Header Prompt Message */}
      <div className="text-center mb-3 min-h-[32px] flex flex-col items-center justify-center">
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full transition-all ${
            status === 'error'
              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-shake'
              : status === 'success'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : isLightWallpaper
              ? 'bg-sky-500/15 text-sky-700 border border-sky-300/40'
              : 'bg-white/10 text-white/90 border border-white/15'
          }`}
        >
          {status === 'error' ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : status === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : (
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          )}
          <span>{msg}</span>
        </div>
      </div>

      {/* 3x3 Gesture Canvas Grid */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="relative w-64 h-64 touch-none cursor-crosshair"
      >
        {/* Connecting SVG Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          {/* Segment Lines between selected nodes */}
          {selectedPath.map((nodeIdx, i) => {
            if (i === 0) return null;
            const prevPos = nodePositions[selectedPath[i - 1]];
            const currPos = nodePositions[nodeIdx];
            if (!prevPos || !currPos) return null;

            return (
              <line
                key={`line_${i}`}
                x1={prevPos.x}
                y1={prevPos.y}
                x2={currPos.x}
                y2={currPos.y}
                stroke={getLineColor()}
                strokeWidth="5"
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 6px currentColor)' }}
              />
            );
          })}

          {/* Active Line from last selected node to current pointer position */}
          {isDragging && selectedPath.length > 0 && currentPos && nodePositions[selectedPath[selectedPath.length - 1]] && (
            <line
              x1={nodePositions[selectedPath[selectedPath.length - 1]].x}
              y1={nodePositions[selectedPath[selectedPath.length - 1]].y}
              x2={currentPos.x}
              y2={currentPos.y}
              stroke={getLineColor()}
              strokeWidth="4"
              strokeDasharray="4 2"
              strokeLinecap="round"
              className="opacity-80"
            />
          )}
        </svg>

        {/* 9 Grid Circles */}
        {nodePositions.map((pos, idx) => {
          const isSelected = selectedPath.includes(idx);
          const isLast = selectedPath[selectedPath.length - 1] === idx;

          return (
            <div
              key={idx}
              style={{ left: pos.x, top: pos.y }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 flex items-center justify-center pointer-events-none z-20"
            >
              {/* Outer Ring */}
              <div
                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
                  isSelected
                    ? status === 'error'
                      ? 'border-rose-500 bg-rose-500/20 scale-110 shadow-lg shadow-rose-500/40'
                      : status === 'success'
                      ? 'border-emerald-500 bg-emerald-500/20 scale-110 shadow-lg shadow-emerald-500/40'
                      : 'border-sky-400 bg-sky-500/20 scale-110 shadow-lg shadow-sky-500/40'
                    : isLightWallpaper
                    ? 'border-sky-300/60 bg-white/40'
                    : 'border-white/30 bg-white/10'
                }`}
              >
                {/* Inner Dot Center */}
                <div
                  className={`w-3.5 h-3.5 rounded-full transition-all ${
                    isSelected
                      ? status === 'error'
                        ? 'bg-rose-500 scale-125'
                        : status === 'success'
                        ? 'bg-emerald-500 scale-125'
                        : 'bg-sky-400 scale-125'
                      : isLightWallpaper
                      ? 'bg-sky-600/70'
                      : 'bg-white/80'
                  } ${isLast && isDragging ? 'animate-ping' : ''}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Setup Reset / Cancel Action */}
      {mode === 'setup' && onCancelSetup && (
        <button
          onClick={onCancelSetup}
          className="mt-3 text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition px-3 py-1 rounded-xl bg-zinc-800/60 border border-zinc-750"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>取消设置</span>
        </button>
      )}
    </div>
  );
};
