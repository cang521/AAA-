/**
 * lockScreenSecurity.ts
 * High-security password & gesture lock service for simulated phone lockscreen.
 * Enforces Salted SHA-256 password hashing (NO plaintext password storage).
 */

export type LockType = 'pin' | 'pattern';

export interface LockSecurityState {
  isLockEnabled: boolean;
  lockType: LockType;
  pinHash: string;
  patternHash: string;
  salt: string;
  isLocked: boolean;
}

const STORAGE_KEYS = {
  ENABLED: 'phone_lock_enabled_v2',
  TYPE: 'phone_lock_type_v2',
  SALT: 'phone_lock_salt_v2',
  PIN_HASH: 'phone_lock_pin_hash_v2',
  PATTERN_HASH: 'phone_lock_pattern_hash_v2',
  IS_LOCKED: 'phone_is_locked_v2',
  LEGACY_PIN: 'phone_pin_code',
  LEGACY_ENABLED: 'phone_pin_enabled',
};

// Generate random hex salt
function generateSalt(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// SHA-256 Hash algorithm using Web Crypto API with synchronous fallback
export async function hashValue(salt: string, rawValue: string): Promise<string> {
  const combined = `${salt}::${rawValue}`;
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(combined);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.warn('Web Crypto SubtleDigest failed, using fallback hash:', e);
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
  private salt: string = '';
  private isLockEnabled: boolean = true;
  private lockType: LockType = 'pin';
  private pinHash: string = '';
  private patternHash: string = '';
  private isLocked: boolean = true;
  private failedAttempts: number = 0;
  private cooldownUntil: number = 0;

  private constructor() {
    this.init();
  }

  public static getInstance(): LockScreenSecurityService {
    if (!LockScreenSecurityService.instance) {
      LockScreenSecurityService.instance = new LockScreenSecurityService();
    }
    return LockScreenSecurityService.instance;
  }

  private init() {
    try {
      // 1. Load or initialize Salt
      let storedSalt = localStorage.getItem(STORAGE_KEYS.SALT);
      if (!storedSalt) {
        storedSalt = generateSalt();
        localStorage.setItem(STORAGE_KEYS.SALT, storedSalt);
      }
      this.salt = storedSalt;

      // 2. Load Lock Enabled State
      const storedEnabled = localStorage.getItem(STORAGE_KEYS.ENABLED);
      if (storedEnabled !== null) {
        this.isLockEnabled = storedEnabled === 'true';
      } else {
        const legacyEnabled = localStorage.getItem(STORAGE_KEYS.LEGACY_ENABLED);
        this.isLockEnabled = legacyEnabled !== null ? JSON.parse(legacyEnabled) : true;
        localStorage.setItem(STORAGE_KEYS.ENABLED, String(this.isLockEnabled));
      }

      // 3. Load Lock Type ('pin' | 'pattern')
      const storedType = localStorage.getItem(STORAGE_KEYS.TYPE) as LockType;
      this.lockType = storedType === 'pattern' ? 'pattern' : 'pin';

      // 4. Load Pin Hash & Handle Legacy Plaintext Migration
      const storedPinHash = localStorage.getItem(STORAGE_KEYS.PIN_HASH);
      if (storedPinHash) {
        this.pinHash = storedPinHash;
      } else {
        const legacyPin = localStorage.getItem(STORAGE_KEYS.LEGACY_PIN) || '1234';
        // Asynchronously migrate legacy PIN to salted hash
        hashValue(this.salt, legacyPin).then((h) => {
          this.pinHash = h;
          localStorage.setItem(STORAGE_KEYS.PIN_HASH, h);
          localStorage.removeItem(STORAGE_KEYS.LEGACY_PIN);
        });
      }

      // 5. Load Pattern Hash
      this.patternHash = localStorage.getItem(STORAGE_KEYS.PATTERN_HASH) || '';

      // 6. Load IsLocked state (Re-hydrate locked state so page reloads CANNOT bypass enabled lock screen)
      const storedIsLocked = localStorage.getItem(STORAGE_KEYS.IS_LOCKED);
      if (this.isLockEnabled) {
        this.isLocked = storedIsLocked !== null ? storedIsLocked === 'true' : true;
      } else {
        this.isLocked = false;
      }
    } catch (e) {
      console.error('Failed to init LockScreenSecurityService:', e);
    }
  }

  public getSecurityState(): LockSecurityState {
    return {
      isLockEnabled: this.isLockEnabled,
      lockType: this.lockType,
      pinHash: this.pinHash,
      patternHash: this.patternHash,
      salt: this.salt,
      isLocked: this.isLocked,
    };
  }

  public getIsLocked(): boolean {
    return this.isLockEnabled && this.isLocked;
  }

  public getLockType(): LockType {
    return this.lockType;
  }

  public getIsLockEnabled(): boolean {
    return this.isLockEnabled;
  }

  public setLockedState(locked: boolean) {
    this.isLocked = locked;
    try {
      localStorage.setItem(STORAGE_KEYS.IS_LOCKED, String(locked));
    } catch (e) {}
  }

  // Check cooldown timer for failed attempts
  public getCooldownSeconds(): number {
    if (Date.now() < this.cooldownUntil) {
      return Math.ceil((this.cooldownUntil - Date.now()) / 1000);
    }
    return 0;
  }

  public recordFailedAttempt() {
    this.failedAttempts += 1;
    if (this.failedAttempts >= 5) {
      this.cooldownUntil = Date.now() + 30000; // 30s cooldown
      this.failedAttempts = 0;
    }
  }

  public resetFailedAttempts() {
    this.failedAttempts = 0;
    this.cooldownUntil = 0;
  }

  /**
   * Verify Digital PIN Code
   */
  public async verifyPin(inputPin: string): Promise<boolean> {
    if (this.getCooldownSeconds() > 0) return false;
    if (!this.pinHash) {
      // Default initial PIN 1234
      const defaultHash = await hashValue(this.salt, '1234');
      this.pinHash = defaultHash;
      localStorage.setItem(STORAGE_KEYS.PIN_HASH, defaultHash);
    }

    const inputHash = await hashValue(this.salt, inputPin);
    const matches = inputHash === this.pinHash;
    if (matches) {
      this.resetFailedAttempts();
      this.setLockedState(false);
    } else {
      this.recordFailedAttempt();
    }
    return matches;
  }

  /**
   * Verify Gesture Pattern (Path array e.g. [0, 1, 2, 5])
   */
  public async verifyPattern(patternPath: number[]): Promise<boolean> {
    if (this.getCooldownSeconds() > 0) return false;
    if (!this.patternHash) return false;

    const patternString = patternPath.join('-');
    const inputHash = await hashValue(this.salt, patternString);
    const matches = inputHash === this.patternHash;
    if (matches) {
      this.resetFailedAttempts();
      this.setLockedState(false);
    } else {
      this.recordFailedAttempt();
    }
    return matches;
  }

  /**
   * Set or Update Digital PIN Code
   */
  public async setPinCode(newPin: string): Promise<void> {
    const newHash = await hashValue(this.salt, newPin);
    this.pinHash = newHash;
    localStorage.setItem(STORAGE_KEYS.PIN_HASH, newHash);
  }

  /**
   * Set or Update Gesture Pattern
   */
  public async setPattern(patternPath: number[]): Promise<void> {
    const patternString = patternPath.join('-');
    const newHash = await hashValue(this.salt, patternString);
    this.patternHash = newHash;
    localStorage.setItem(STORAGE_KEYS.PATTERN_HASH, newHash);
  }

  /**
   * Set Lock Type ('pin' | 'pattern')
   */
  public setLockType(type: LockType) {
    this.lockType = type;
    localStorage.setItem(STORAGE_KEYS.TYPE, type);
  }

  /**
   * Toggle Lock Screen Protection Enabled / Disabled
   */
  public setLockEnabled(enabled: boolean) {
    this.isLockEnabled = enabled;
    localStorage.setItem(STORAGE_KEYS.ENABLED, String(enabled));
    localStorage.setItem(STORAGE_KEYS.LEGACY_ENABLED, JSON.stringify(enabled));
    if (!enabled) {
      this.setLockedState(false);
    }
  }

  /**
   * Check if pattern is set
   */
  public hasPatternSet(): boolean {
    return Boolean(this.patternHash);
  }
}

export const lockSecurityService = LockScreenSecurityService.getInstance();
