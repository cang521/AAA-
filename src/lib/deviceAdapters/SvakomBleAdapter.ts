import { InteractiveBleAdapter } from './InteractiveBleAdapter';

/**
 * Svakom BLE Hardware Adapter
 * Model-Specific BLE Adapter for Svakom Interactive Hardware Nodes.
 * Note: Specific GATT Service UUIDs and Byte Arrays are marked as "待真机验证".
 */
export class SvakomBleAdapter extends InteractiveBleAdapter {
  // Svakom GATT UART Service & Characteristic UUIDs
  public static readonly SVAKOM_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
  public static readonly SVAKOM_TX_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

  /**
   * Set Svakom Vibration Level (1 ~ 5 or 0 to stop)
   * Protocol format: 0x55 0x04 [level] [mode] 0xAA (待真机验证)
   */
  public async setSvakomIntensity(level: number, mode: string = 'continuous'): Promise<boolean> {
    const clamped = Math.max(0, Math.min(5, Math.round(level)));
    const percent = Math.round((clamped / 5) * 100);
    console.log(`[SvakomBleAdapter] Setting Svakom intensity: ${clamped}档 (${percent}%), mode: ${mode} (待真机验证)`);
    return this.setOutputLevel(percent);
  }
}

export const svakomBleAdapter = new SvakomBleAdapter();
