import { GroupChat, GroupJoinRequest, UserProfile } from '../types';
import { apiFetch } from './localBackend';

/**
 * Client service for server-backed cross-device group chat registry and invite code joining.
 */

export async function registerGroupOnServer(group: GroupChat): Promise<boolean> {
  try {
    const res = await apiFetch('/api/groups/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ group }),
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.warn('[groupService] Register group on server failed:', err);
    return false;
  }
}

export async function findGroupByInviteCode(
  code: string
): Promise<{ success: boolean; group?: GroupChat; error?: string }> {
  try {
    const cleanCode = code.trim().toUpperCase();
    const res = await apiFetch(`/api/groups/invite/${encodeURIComponent(cleanCode)}`);
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, group: data.group };
    }
    return { success: false, error: data.error || '未找到对应的群聊，请检查邀请码是否正确' };
  } catch (err: any) {
    console.error('[groupService] Search group by invite code failed:', err);
    return { success: false, error: '网络异常，查询群邀请码失败' };
  }
}

export async function joinGroupViaServer(
  inviteCode: string,
  userProfile: UserProfile,
  message?: string
): Promise<{
  success: boolean;
  group?: GroupChat;
  request?: GroupJoinRequest;
  pendingApproval?: boolean;
  alreadyMember?: boolean;
  error?: string;
}> {
  try {
    const res = await apiFetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode: inviteCode.trim().toUpperCase(),
        userProfile: {
          id: 'user_main',
          name: userProfile.name || '小清',
          avatar: userProfile.avatar || '',
          bio: userProfile.bio || message || '申请加入群聊',
          wxid: userProfile.wxid || 'xiaoqing',
        },
        message,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return {
        success: true,
        group: data.group,
        request: data.request,
        pendingApproval: data.pendingApproval,
        alreadyMember: data.alreadyMember,
      };
    }
    return { success: false, error: data.error || '加入群聊失败' };
  } catch (err: any) {
    console.error('[groupService] Join group via server failed:', err);
    return { success: false, error: '网络异常，提交入群请求失败' };
  }
}

export async function syncGroupToServer(group: GroupChat, userId: string = 'user_main'): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/groups/${encodeURIComponent(group.id)}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        group,
      }),
    });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    console.warn('[groupService] Sync group to server failed:', err);
    return false;
  }
}

export async function fetchGroupDetailsFromServer(
  groupId: string,
  userId: string = 'user_main',
  inviteCode?: string
): Promise<GroupChat | null> {
  try {
    let url = `/api/groups/${encodeURIComponent(groupId)}?userId=${encodeURIComponent(userId)}`;
    if (inviteCode) {
      url += `&inviteCode=${encodeURIComponent(inviteCode)}`;
    }
    const res = await apiFetch(url);
    const data = await res.json();
    if (res.ok && data.success) {
      return data.group;
    }
    return null;
  } catch (err) {
    console.warn('[groupService] Fetch group details failed:', err);
    return null;
  }
}
