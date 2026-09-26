import { InteractiveBleAdapter } from './InteractiveBleAdapter';

/**
 * Svakom BLE Hardware Adapter
 * Model-Specific BLE Adapter for Svakom Interactive Hardware Nodes.
 * Inherits Native Android BLE & Web Bluetooth capabilities from InteractiveBleAdapter.
 */
export class SvakomBleAdapter extends InteractiveBleAdapter {
  // Svakom GATT UART Service & Characteristic UUIDs
  public static readonly SVAKOM_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
  public static readonly SVAKOM_TX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

  /**
   * Set Svakom Vibration Level (1 ~ 5 or 0 to stop)
   * Strictly returns false if device is not physically connected or BLE write fails.
   */
  public async setSvakomIntensity(level: number, mode: string = 'continuous'): Promise<boolean> {
    const clamped = Math.max(0, Math.min(5, Math.round(level)));
    const percent = Math.round((clamped / 5) * 100);
    console.log(`[SvakomBleAdapter] Setting Svakom intensity: ${clamped}档 (${percent}%), mode: ${mode}`);
    return this.setOutputLevel(percent);
  }
}

export const svakomBleAdapter = new SvakomBleAdapter();
