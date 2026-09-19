export interface DiagnosticLogEvent {
  id: string;
  timestamp: string;
  tag: string;
  baseUrlLen: number;
  baseUrlVal?: string;
  keyLen: number;
  keyLast4: string;
  renderIndex?: number;
  details?: string;
}

type Listener = (logs: DiagnosticLogEvent[]) => void;

let diagnosticLogs: DiagnosticLogEvent[] = [];
let listeners: Listener[] = [];
let globalRenderIndexPanel = 0;
let globalRenderIndexSettingsApp = 0;

export function addDiagnosticLog(log: Omit<DiagnosticLogEvent, 'id' | 'timestamp'>) {
  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

  const event: DiagnosticLogEvent = {
    ...log,
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: timeStr,
  };

  diagnosticLogs = [event, ...diagnosticLogs].slice(0, 50);
  listeners.forEach((fn) => fn(diagnosticLogs));

  console.log(`[DIAGNOSTIC] ${event.timestamp} ${event.tag} baseLen=${event.baseUrlLen} keyLen=${event.keyLen} (last4=${event.keyLast4}) ${event.details || ''}`);
}

export function getDiagnosticLogs(): DiagnosticLogEvent[] {
  return diagnosticLogs;
}

export function subscribeDiagnosticLogs(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

export function getNextPanelRenderIndex() {
  globalRenderIndexPanel += 1;
  return globalRenderIndexPanel;
}

export function getNextSettingsAppRenderIndex() {
  globalRenderIndexSettingsApp += 1;
  return globalRenderIndexSettingsApp;
}
