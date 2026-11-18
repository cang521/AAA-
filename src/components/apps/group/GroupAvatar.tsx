import React, { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { AiCharacter, GroupMember, UserProfile } from '../../../types';
import {
  computeGroupAvatarLayout,
  GroupAvatarMode,
  resolveGroupAvatarState,
  resolveGroupMembersForAvatar,
} from '../../../lib/groupAvatar';

export interface GroupAvatarProps {
  members?: GroupMember[];
  customAvatar?: string;
  avatarMode?: GroupAvatarMode;
  /** Optional legacy GroupChat.avatar for automatic backward-compatible resolution */
  legacyAvatar?: string;
  size?: number;
  className?: string;
  alt?: string;
  /** Optional live sources so personal avatar updates immediately reflect in auto mode */
  allCharacters?: AiCharacter[];
  userProfile?: UserProfile;
}

export const GroupAvatar: React.FC<GroupAvatarProps> = ({
  members = [],
  customAvatar,
  avatarMode,
  legacyAvatar,
  size = 48,
  className = '',
  alt = '群头像',
  allCharacters,
  userProfile,
}) => {
  const [failedKeys, setFailedKeys] = useState<Record<string, boolean>>({});
  const [failedCustomUrl, setFailedCustomUrl] = useState<string | null>(null);

  const resolvedState = useMemo(
    () =>
      resolveGroupAvatarState({
        avatar: legacyAvatar,
        avatarMode,
        customAvatar,
      }),
    [legacyAvatar, avatarMode, customAvatar]
  );

  const resolvedMembers = useMemo(
    () => resolveGroupMembersForAvatar(members, allCharacters, userProfile),
    [members, allCharacters, userProfile]
  );

  const layout = useMemo(
    () => computeGroupAvatarLayout(resolvedMembers, size),
    [resolvedMembers, size]
  );

  const outerStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    aspectRatio: '1 / 1',
    borderRadius: layout.borderRadius,
    backgroundColor: '#E5E5E5',
    overflow: 'hidden',
  };

  // Custom avatar mode (unless URL failed to load -> gracefully fall back to auto composite)
  if (
    resolvedState.mode === 'custom' &&
    resolvedState.customAvatar &&
    failedCustomUrl !== resolvedState.customAvatar
  ) {
    return (
      <div
        className={`relative shrink-0 select-none ${className}`}
        style={outerStyle}
        aria-label={alt}
      >
        <img
          src={resolvedState.customAvatar}
          alt={alt}
          onError={() => setFailedCustomUrl(resolvedState.customAvatar || null)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  // Empty fallback if group has zero valid members
  if (layout.rows.length === 0) {
    return (
      <div
        className={`relative shrink-0 flex items-center justify-center text-zinc-500 select-none ${className}`}
        style={outerStyle}
        aria-label={alt}
      >
        <Users style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }} />
      </div>
    );
  }

  const fontSize = Math.max(9, Math.round(layout.tileSize * 0.46));

  return (
    <div
      className={`relative shrink-0 flex flex-col items-center justify-center select-none ${className}`}
      style={{
        ...outerStyle,
        padding: layout.padding,
        gap: layout.gap,
      }}
      aria-label={alt}
    >
      {layout.rows.map((row, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="flex items-center justify-center shrink-0"
          style={{
            gap: layout.gap,
            height: layout.tileSize,
          }}
        >
          {row.map((member) => {
            const tileKey = `${member.key}::${member.avatar}`;
            const hasValidSrc = Boolean(member.avatar) && !failedKeys[tileKey];

            return (
              <div
                key={member.key}
                className="shrink-0 overflow-hidden flex items-center justify-center"
                style={{
                  width: layout.tileSize,
                  height: layout.tileSize,
                  aspectRatio: '1 / 1',
                  borderRadius: 1.5,
                  backgroundColor: hasValidSrc ? '#D8D8D8' : member.fallbackBg,
                }}
                title={member.name}
              >
                {hasValidSrc ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    onError={() =>
                      setFailedKeys((prev) => ({
                        ...prev,
                        [tileKey]: true,
                      }))
                    }
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <span
                    className="font-semibold text-white leading-none select-none"
                    style={{ fontSize }}
                  >
                    {member.initial}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
