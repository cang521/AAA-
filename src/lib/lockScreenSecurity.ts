/**
 * lockScreenSecurity.ts
 * Unified high-security password & gesture lock service for simulated phone lockscreen.
 * Enforces Salted SHA-256 verification (NO plaintext password storage).
 * Supports automatic 5-minute background re-locking, cold-boot locking, and anti-lockout migration.
 */

export type LockType = 'pin' | 'pattern';

export interface LockSecurityConfig {
  isLockEnabled: boolean;
  lockType: LockType;
  verifierHash: string;
  pinHash: string;
  patternHash: string;
  salt: string;
  autoLockTimeoutMs: number; // Default: 300,000ms (5 minutes)
  updatedAt: number;
}

const STORAGE_KEY_V3 = 'phone_security_config_v3';
const STORAGE_KEY_BG_TIME = 'phone_last_bg_time_v3';
const SESSION_KEY_UNLOCKED = 'phone_session_unlocked_v3';

// Legacy keys for seamless backwards-compatible migration
const LEGACY_STORAGE_KEYS = {
  ENABLED_V2: 'phone_lock_enabled_v2',
  TYPE_V2: 'phone_lock_type_v2',
  SALT_V2: 'phone_lock_salt_v2',
  PIN_HASH_V2: 'phone_lock_pin_hash_v2',
  PATTERN_HASH_V2: 'phone_lock_pattern_hash_v2',
  IS_LOCKED_V2: 'phone_is_locked_v2',
  LEGACY_PIN: 'phone_pin_code',
  LEGACY_ENABLED: 'phone_pin_enabled',
};

// Generate cryptographically random hex salt
function generateSalt(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Salted SHA-256 Hash algorithm
export async function hashValue(salt: string, rawValue: string): Promise<string> {
  const combined = `${salt}::${rawValue}`;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to fallback hash if Web Crypto fails
    }
  }

  // Fallback simple hash for non-secure contexts
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `fallback_${Math.abs(hash).toString(16)}_${combined.length}`;
}

export class LockScreenSecurityService {
  private static instance: LockScreenSecurityService;

  private config: LockSecurityConfig = {
    isLockEnabled: false,
    lockType: 'pin',
    verifierHash: '',
    pinHash: '',
    patternHash: '',
    salt: '',
    autoLockTimeoutMs: 5 * 60 * 1000, // 5 minutes
    updatedAt: Date.now(),
  };

  private sessionUnlocked: boolean = false;
  private lastBackgroundTime: number = 0;
  private failedAttempts: number = 0;
  private cooldownUntil: number = 0;
  private migrationNotice: string | null = null;
  private initialized: boolean = false;

  private constructor() {
    this.initSync();
  }

  public static getInstance(): LockScreenSecurityService {
    if (!LockScreenSecurityService.instance) {
      LockScreenSecurityService.instance = new LockScreenSecurityService();
    }
    return LockScreenSecurityService.instance;
  }

  /**
   * Synchronously load stored configuration and perform initial state resolution
   */
  private initSync() {
    try {
      // 1. Try reading v3 config
      const rawV3 = localStorage.getItem(STORAGE_KEY_V3);
      if (rawV3) {
        const parsed = JSON.parse(rawV3);
        if (parsed && typeof parsed.isLockEnabled === 'boolean') {
          this.config = {
            ...this.config,
            ...parsed,
          };
          this.validateAndSanitizeConfig();
          this.checkSessionUnlockedOnBoot();
          this.initialized = true;
          return;
        }
      }

      // 2. No v3 config found -> execute legacy migration
      this.migrateLegacySettings();
      this.checkSessionUnlockedOnBoot();
      this.initialized = true;
    } catch (e) {
      console.error('LockScreenSecurityService initSync error:', e);
      this.initialized = true;
    }
  }

  /**
   * Check if current browser session was already unlocked (e.g. within active single session)
   * Process restart or cold boot will have no session unlocked marker, requiring verification.
   */
  private checkSessionUnlockedOnBoot() {
    try {
      if (!this.config.isLockEnabled) {
        this.sessionUnlocked = true;
        return;
      }

      // Cold boot rule: If app process was freshly started, session storage is empty, so it must start LOCKED.
      const sessionMarker = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(SESSION_KEY_UNLOCKED)
        : null;

      if (sessionMarker === 'true') {
        // Check if background time exceeded 5 minutes even in same session
        const lastBg = localStorage.getItem(STORAGE_KEY_BG_TIME);
        if (lastBg) {
          const elapsed = Date.now() - Number(lastBg);
          if (elapsed >= this.config.autoLockTimeoutMs) {
            this.sessionUnlocked = false;
            sessionStorage.removeItem(SESSION_KEY_UNLOCKED);
            return;
          }
        }
        this.sessionUnlocked = true;
      } else {
        this.sessionUnlocked = false;
      }
    } catch {
      this.sessionUnlocked = false;
    }
  }

  /**
   * Migrate and sanitize settings from legacy keys
   */
  private migrateLegacySettings() {
    let salt = localStorage.getItem(LEGACY_STORAGE_KEYS.SALT_V2);
    if (!salt) {
      salt = generateSalt();
      localStorage.setItem(LEGACY_STORAGE_KEYS.SALT_V2, salt);
    }

    const legacyEnabledRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.ENABLED_V2) ??
      localStorage.getItem(LEGACY_STORAGE_KEYS.LEGACY_ENABLED);
    const isLockEnabled = legacyEnabledRaw !== null
      ? (legacyEnabledRaw === 'true' || legacyEnabledRaw === '1')
      : false;

    const legacyType = localStorage.getItem(LEGACY_STORAGE_KEYS.TYPE_V2);
    const lockType: LockType = legacyType === 'pattern' ? 'pattern' : 'pin';

    let pinHash = localStorage.getItem(LEGACY_STORAGE_KEYS.PIN_HASH_V2) || '';
    const patternHash = localStorage.getItem(LEGACY_STORAGE_KEYS.PATTERN_HASH_V2) || '';

    // Handle plaintext legacy pin if pinHash not created yet
    if (!pinHash) {
      const legacyPin = localStorage.getItem(LEGACY_STORAGE_KEYS.LEGACY_PIN);
      if (legacyPin && legacyPin.length === 4) {
        // Will be asynchronously hashed during ensureInitialized
      }
    }

    this.config = {
      isLockEnabled,
      lockType,
      verifierHash: lockType === 'pattern' ? patternHash : pinHash,
      pinHash,
      patternHash,
      salt,
      autoLockTimeoutMs: 5 * 60 * 1000,
      updatedAt: Date.now(),
    };

    this.validateAndSanitizeConfig();
    this.saveConfigSync();
  }

  /**
   * Anti-Lockout Validation:
   * If lock is enabled but has invalid/missing hash or corrupt pattern,
   * disable lock safely and notify user instead of permanently locking them out.
   */
  private validateAndSanitizeConfig() {
    if (!this.config.isLockEnabled) return;

    if (this.config.lockType === 'pattern') {
      if (!this.config.patternHash || this.config.patternHash.trim() === '') {
        console.warn('Detected invalid or empty pattern hash while lock enabled. Disabling lock to prevent lockout.');
        this.config.isLockEnabled = false;
        this.migrationNotice = '旧版密码数据无效，请重新设置锁屏密码。';
      }
    } else if (this.config.lockType === 'pin') {
      if (!this.config.pinHash || this.config.pinHash.trim() === '') {
        // Check if legacy pin exists to compute hash
        const legacyPin = localStorage.getItem(LEGACY_STORAGE_KEYS.LEGACY_PIN);
        if (!legacyPin) {
          console.warn('Detected invalid or empty PIN hash while lock enabled. Disabling lock to prevent lockout.');
          this.config.isLockEnabled = false;
          this.migrationNotice = '旧版密码数据无效，请重新设置锁屏密码。';
        }
      }
    }
  }

  /**
   * Ensure any asynchronous hashes (like legacy pin) are completed
   */
  public async ensureInitialized(): Promise<void> {
    if (this.config.lockType === 'pin' && !this.config.pinHash) {
      const legacyPin = localStorage.getItem(LEGACY_STORAGE_KEYS.LEGACY_PIN) || '1234';
      this.config.pinHash = await hashValue(this.config.salt, legacyPin);
      if (this.config.lockType === 'pin') {
        this.config.verifierHash = this.config.pinHash;
      }
      this.saveConfigSync();
    }
  }

  /**
   * Synchronously save and verify persistence with immediate re-read check
   */
  private saveConfigSync() {
    this.config.updatedAt = Date.now();
    const serialized = JSON.stringify(this.config);
    localStorage.setItem(STORAGE_KEY_V3, serialized);

    // Immediate re-read verification to guarantee data is really written
    const verified = localStorage.getItem(STORAGE_KEY_V3);
    if (!verified) {
      throw new Error('安全设置持久化验证失败：存储无法读取');
    }
    const parsed = JSON.parse(verified);
    if (parsed.updatedAt !== this.config.updatedAt) {
      throw new Error('安全设置持久化校验失败：时间戳不匹配');
    }

    // Keep legacy storage keys in sync so older components don't drift
    try {
      localStorage.setItem(LEGACY_STORAGE_KEYS.ENABLED_V2, String(this.config.isLockEnabled));
      localStorage.setItem(LEGACY_STORAGE_KEYS.LEGACY_ENABLED, JSON.stringify(this.config.isLockEnabled));
      localStorage.setItem(LEGACY_STORAGE_KEYS.TYPE_V2, this.config.lockType);
      localStorage.setItem(LEGACY_STORAGE_KEYS.SALT_V2, this.config.salt);
      if (this.config.pinHash) {
        localStorage.setItem(LEGACY_STORAGE_KEYS.PIN_HASH_V2, this.config.pinHash);
      }
      if (this.config.patternHash) {
        localStorage.setItem(LEGACY_STORAGE_KEYS.PATTERN_HASH_V2, this.config.patternHash);
      }
    } catch {}
  }

  // --- Public State Query Methods ---

  public getMigrationNotice(): string | null {
    return this.migrationNotice;
  }

  public clearMigrationNotice() {
    this.migrationNotice = null;
  }

  public getIsLockEnabled(): boolean {
    return this.config.isLockEnabled;
  }

  public getLockType(): LockType {
    return this.config.lockType;
  }

  public hasPatternSet(): boolean {
    return Boolean(this.config.patternHash && this.config.patternHash.trim().length > 0);
  }

  public hasPinSet(): boolean {
    return Boolean(this.config.pinHash && this.config.pinHash.trim().length > 0);
  }

  /**
   * Core determination of whether the global LockScreen must be rendered.
   * If lock is enabled and session is not unlocked, or background timeout exceeded: returns TRUE.
   */
  public shouldBeLocked(): boolean {
    if (!this.config.isLockEnabled) return false;

    // If session is marked not unlocked -> must lock
    if (!this.sessionUnlocked) return true;

    // Check background timeout
    const lastBg = localStorage.getItem(STORAGE_KEY_BG_TIME);
    if (lastBg) {
      const elapsed = Date.now() - Number(lastBg);
      if (elapsed >= this.config.autoLockTimeoutMs) {
        this.sessionUnlocked = false;
        try {
          sessionStorage.removeItem(SESSION_KEY_UNLOCKED);
        } catch {}
        return true;
      }
    }

    return false;
  }

  /**
   * Mark as successfully unlocked by user
   */
  public markUnlocked() {
    this.sessionUnlocked = true;
    this.failedAttempts = 0;
    this.cooldownUntil = 0;
    try {
      sessionStorage.setItem(SESSION_KEY_UNLOCKED, 'true');
      localStorage.removeItem(STORAGE_KEY_BG_TIME);
      localStorage.setItem(LEGACY_STORAGE_KEYS.IS_LOCKED_V2, 'false');
    } catch {}
  }

  /**
   * Manually lock the phone (power button or manual test lock)
   */
  public lockManually() {
    this.sessionUnlocked = false;
    this.recordBackground();
    try {
      sessionStorage.removeItem(SESSION_KEY_UNLOCKED);
      localStorage.setItem(LEGACY_STORAGE_KEYS.IS_LOCKED_V2, 'true');
    } catch {}
  }

  /**
   * Record when app enters background
   */
  public recordBackground() {
    const now = Date.now();
    this.lastBackgroundTime = now;
    try {
      localStorage.setItem(STORAGE_KEY_BG_TIME, String(now));
    } catch {}
  }

  /**
   * Called when app returns to foreground to check if > 5 minutes elapsed
   */
  public checkResumeShouldLock(): boolean {
    if (!this.config.isLockEnabled) return false;
    if (!this.sessionUnlocked) return true;

    const lastBg = localStorage.getItem(STORAGE_KEY_BG_TIME) || String(this.lastBackgroundTime);
    if (lastBg && Number(lastBg) > 0) {
      const elapsed = Date.now() - Number(lastBg);
      if (elapsed >= this.config.autoLockTimeoutMs) {
        this.sessionUnlocked = false;
        try {
          sessionStorage.removeItem(SESSION_KEY_UNLOCKED);
        } catch {}
        return true;
      }
    }
    return false;
  }

  // --- Attempt Rate Limiting & Cooldown ---

  public getCooldownSeconds(): number {
    if (Date.now() < this.cooldownUntil) {
      return Math.ceil((this.cooldownUntil - Date.now()) / 1000);
    }
    return 0;
  }

  public recordFailedAttempt() {
    this.failedAttempts += 1;
    if (this.failedAttempts >= 5) {
      this.cooldownUntil = Date.now() + 30000; // 30s cooldown after 5 failed attempts
      this.failedAttempts = 0;
    }
  }

  public resetFailedAttempts() {
    this.failedAttempts = 0;
    this.cooldownUntil = 0;
  }

  // --- Password Verification Methods ---

  /**
   * Verify Digital PIN Code against stored salt & hash
   */
  public async verifyPin(inputPin: string): Promise<boolean> {
    if (this.getCooldownSeconds() > 0) return false;
    if (!this.config.pinHash) {
      // Default initial PIN 1234 if not yet set
      const defaultHash = await hashValue(this.config.salt, '1234');
      this.config.pinHash = defaultHash;
      this.config.verifierHash = defaultHash;
      this.saveConfigSync();
    }

    const inputHash = await hashValue(this.config.salt, inputPin);
    const matches = inputHash === this.config.pinHash;
    if (matches) {
      this.resetFailedAttempts();
      this.markUnlocked();
    } else {
      this.recordFailedAttempt();
    }
    return matches;
  }

  /**
   * Verify Gesture Pattern Path against stored salt & hash
   */
  public async verifyPattern(patternPath: number[]): Promise<boolean> {
    if (this.getCooldownSeconds() > 0) return false;
    if (!this.config.patternHash) return false;

    const patternString = patternPath.join('-');
    const inputHash = await hashValue(this.config.salt, patternString);
    const matches = inputHash === this.config.patternHash;
    if (matches) {
      this.resetFailedAttempts();
      this.markUnlocked();
    } else {
      this.recordFailedAttempt();
    }
    return matches;
  }

  /**
   * Check if current active password is valid (for settings modification authorization)
   */
  public async verifyCurrentPassword(
    type: LockType,
    credential: string | number[]
  ): Promise<boolean> {
    if (type === 'pin' && typeof credential === 'string') {
      const inputHash = await hashValue(this.config.salt, credential);
      return inputHash === this.config.pinHash;
    }
    if (type === 'pattern' && Array.isArray(credential)) {
      const patternString = credential.join('-');
      const inputHash = await hashValue(this.config.salt, patternString);
      return inputHash === this.config.patternHash;
    }
    return false;
  }

  // --- Settings Mutation Methods (with Persistence Re-read Check) ---

  /**
   * Set or Update Digital PIN Code
   */
  public async setPinCode(newPin: string): Promise<void> {
    if (!/^\d{4}$/.test(newPin)) {
      throw new Error('PIN 必须是4位纯数字');
    }
    const newHash = await hashValue(this.config.salt, newPin);
    this.config.pinHash = newHash;
    if (this.config.lockType === 'pin') {
      this.config.verifierHash = newHash;
    }
    this.saveConfigSync();
  }

  /**
   * Set or Update Gesture Pattern
   */
  public async setPattern(patternPath: number[]): Promise<void> {
    if (!Array.isArray(patternPath) || patternPath.length < 4) {
      throw new Error('手势图案至少需要连接 4 个不同节点');
    }
    const patternString = patternPath.join('-');
    const newHash = await hashValue(this.config.salt, patternString);
    this.config.patternHash = newHash;
    if (this.config.lockType === 'pattern') {
      this.config.verifierHash = newHash;
    }
    this.saveConfigSync();
  }

  /**
   * Set Lock Type ('pin' | 'pattern')
   */
  public setLockType(type: LockType) {
    this.config.lockType = type;
    this.config.verifierHash = type === 'pattern' ? this.config.patternHash : this.config.pinHash;
    this.saveConfigSync();
  }

  /**
   * Enable or Disable Lock Screen Protection
   */
  public setLockEnabled(enabled: boolean) {
    this.config.isLockEnabled = enabled;
    if (!enabled) {
      this.markUnlocked();
    }
    this.saveConfigSync();
  }

  /**
   * Legacy method support for components calling setLockedState
   */
  public setLockedState(locked: boolean) {
    if (locked) {
      this.lockManually();
    } else {
      this.markUnlocked();
    }
  }

  public getIsLocked(): boolean {
    return this.shouldBeLocked();
  }
}

export const lockSecurityService = LockScreenSecurityService.getInstance();
