import { interactiveBleAdapter } from './InteractiveBleAdapter';

export interface ControllerState {
  currentPercent: number; // 0 - 100
  targetPercent: number;  // 0 - 100
  currentLevel: number;   // 0 - 5
  patternName: string;    // 'continuous' | 'wave' | 'pulse' | 'breath'
  isRamping: boolean;
  isEmergencyStopped: boolean;
}

export class DeviceOutputController {
  private state: ControllerState = {
    currentPercent: 0,
    targetPercent: 0,
    currentLevel: 0,
    patternName: 'continuous',
    isRamping: false,
    isEmergencyStopped: false,
  };

  private rampIntervalTimer: any = null;
  private patternTimer: any = null;

  public getState(): ControllerState {
    return { ...this.state };
  }

  /**
   * Smoothly ramp output to target percentage or level
   */
  public async setOutputTarget(
    targetLevelOrPercent: number,
    isLevel: boolean = true,
    pattern: string = 'continuous'
  ): Promise<void> {
    this.state.isEmergencyStopped = false;
    let targetPercent = 0;

    if (isLevel) {
      const clampedLevel = Math.max(0, Math.min(5, Math.round(targetLevelOrPercent)));
      targetPercent = Math.round((clampedLevel / 5) * 100);
      this.state.currentLevel = clampedLevel;
    } else {
      targetPercent = Math.max(0, Math.min(100, Math.round(targetLevelOrPercent)));
      this.state.currentLevel = Math.round((targetPercent / 100) * 5);
    }

    this.state.targetPercent = targetPercent;
    this.state.patternName = pattern;

    // Execute immediate smooth ramp
    this.startRampTransition();
  }

  /**
   * Smooth ramp transition to prevent sudden physical jar
   */
  private startRampTransition(): void {
    if (this.rampIntervalTimer) {
      clearInterval(this.rampIntervalTimer);
      this.rampIntervalTimer = null;
    }

    this.state.isRamping = true;
    const stepSize = 5; // 5% per step
    const intervalMs = 60; // Every 60ms

    this.rampIntervalTimer = setInterval(async () => {
      if (this.state.isEmergencyStopped) {
        this.stopAll();
        return;
      }

      const diff = this.state.targetPercent - this.state.currentPercent;
      if (Math.abs(diff) <= stepSize) {
        this.state.currentPercent = this.state.targetPercent;
        this.state.isRamping = false;
        clearInterval(this.rampIntervalTimer);
        this.rampIntervalTimer = null;
        await interactiveBleAdapter.setOutputLevel(this.state.currentPercent);
      } else {
        this.state.currentPercent += Math.sign(diff) * stepSize;
        await interactiveBleAdapter.setOutputLevel(this.state.currentPercent);
      }
    }, intervalMs);
  }

  /**
   * Instant Emergency Stop - Halts all output and clears all timers
   */
  public stopAll(): void {
    if (this.rampIntervalTimer) {
      clearInterval(this.rampIntervalTimer);
      this.rampIntervalTimer = null;
    }
    if (this.patternTimer) {
      clearInterval(this.patternTimer);
      this.patternTimer = null;
    }

    this.state.currentPercent = 0;
    this.state.targetPercent = 0;
    this.state.currentLevel = 0;
    this.state.isRamping = false;
    this.state.isEmergencyStopped = true;

    interactiveBleAdapter.stop().catch(() => {});
  }
}

export const deviceOutputController = new DeviceOutputController();
