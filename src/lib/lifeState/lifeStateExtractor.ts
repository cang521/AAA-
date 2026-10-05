import { ChatMessage, LifeEvent, LifeEventStatus, LifeEventType } from '../../types';
import { apiFetch } from '../localBackend';
import { loadApiConfig, loadUserProfile } from '../storage';
import { loadProactiveSettings } from '../proactive/proactiveStore';
import {
  getLifeEventsSync,
  resolveLifeEvent,
  saveLifeEvent,
  updateLifeEvent,
} from './lifeStateStore';

let isExtracting = false;
let lastExtractTime = 0;

/**
 * Triggers asynchronous life event extraction from recent messages.
 * Runs in background without blocking chat UI.
 */
export async function triggerLifeStateExtraction(
  messages: ChatMessage[],
  characterId?: string
): Promise<void> {
  const settings = loadProactiveSettings();
  if (settings.lifeState?.enabled === false || settings.lifeState?.autoExtractFromChat === false) {
    return;
  }

  // Rate limit: extract at most once every 30 seconds
  const now = Date.now();
  if (now - lastExtractTime < 30000 || isExtracting) {
    return;
  }

  // Filter last 10 messages
  const recent = messages.slice(-10);
  if (recent.length === 0) return;

  // Ensure there is at least one user message in recent messages
  const userMsgs = recent.filter((m) => m.sender === 'user');
  if (userMsgs.length === 0) return;

  isExtracting = true;
  lastExtractTime = now;

  try {
    const existingEvents = getLifeEventsSync();
    const userProfile = loadUserProfile();
    const apiConfig = loadApiConfig();

    const res = await apiFetch('/api/gemini/extract-life-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: recent.map((m) => ({
          sender: m.sender,
          text: m.text,
          timestamp: m.timestamp,
        })),
        existingEvents,
        userProfile,
        apiConfig,
      }),
    });

    const data = await res.json();
    if (data.success && Array.isArray(data.events)) {
      for (const item of data.events) {
        if (item.action === 'resolve' && item.id) {
          await resolveLifeEvent(item.id, item.resolutionSummary || item.latestProgress);
        } else if (item.action === 'update' && item.id) {
          await updateLifeEvent(item.id, {
            latestProgress: item.latestProgress,
            resolutionSummary: item.resolutionSummary,
            status: item.status as LifeEventStatus,
            summary: item.summary || undefined,
          });
        } else if (item.action === 'create' && item.title) {
          await saveLifeEvent({
            title: item.title,
            type: (item.type as LifeEventType) || 'custom',
            summary: item.summary || item.title,
            status: (item.status as LifeEventStatus) || 'ongoing',
            importance: item.importance || 3,
            latestProgress: item.latestProgress,
            sourceType: 'chat_extraction',
            allowedCharacterIds: characterId ? [characterId] : undefined,
            sourceMessageIds: userMsgs.map((m) => m.id),
          });
        }
      }
    }
  } catch (err) {
    console.warn('[LifeStateExtractor] Background extraction warning:', err);
  } finally {
    isExtracting = false;
  }
}
