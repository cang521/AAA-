/**
 * Interactive BLE Hardware Adapter
 * Generic & Model-Specific BLE Adapter for Interactive/Haptic Devices.
 * Supports Android Native BLE Plugin (@capacitor-community/bluetooth-le) and Web Bluetooth.
 */

import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

export interface BleDeviceInfo {
  id: string;
  name: string;
  connected: boolean;
  batteryLevel?: number;
  rssi?: number;
  serviceUuid?: string;
  txCharacteristicUuid?: string;
}

export class InteractiveBleAdapter {
  private activeDevice: BleDeviceInfo | null = null;
  private isInitialized = false;
  private isConnecting = false;
  private keepaliveTimer: any = null;

  // Active GATT connection references for Native / Web
  private nativeDeviceId: string | null = null;
  private activeServiceUuid: string | null = null;
  private activeTxUuid: string | null = null;

  // Web Bluetooth references
  private webGattServer: any = null;
  private webTxCharacteristic: any = null;

  /**
   * Check if running on native Capacitor Android APK
   */
  public isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() || Capacitor.getPlatform() === 'android';
  }

  /**
   * Check if Native or Web Bluetooth is supported in current runtime
   */
  public isBleSupported(): boolean {
    if (this.isNativeAndroid()) {
      return true; // Native Android APK always supports Native BLE Plugin
    }
    return (
      typeof navigator !== 'undefined' &&
      'bluetooth' in navigator &&
      typeof (navigator as any).bluetooth?.requestDevice === 'function'
    );
  }

  /**
   * Ensure Native BLE Plugin is initialized and Bluetooth is enabled on Android
   */
  public async ensureNativeInitialized(): Promise<boolean> {
    if (!this.isNativeAndroid()) return false;
    try {
      if (!this.isInitialized) {
        await BleClient.initialize();
        this.isInitialized = true;
      }
      const enabled = await BleClient.isEnabled();
      if (!enabled) {
        try {
          await BleClient.requestEnable();
        } catch (e) {
          console.warn('[InteractiveBleAdapter] Request enable Bluetooth cancelled/failed:', e);
        }
      }
      return await BleClient.isEnabled();
    } catch (err) {
      console.error('[InteractiveBleAdapter] BleClient initialize/enable error:', err);
      return false;
    }
  }

  /**
   * Scan and pair BLE interactive hardware
   */
  public async scanAndPair(): Promise<{ success: boolean; device?: BleDeviceInfo; error?: string }> {
    this.isConnecting = true;

    // 1. Android Capacitor Native BLE Path
    if (this.isNativeAndroid()) {
      try {
        const initOk = await this.ensureNativeInitialized();
        if (!initOk) {
          this.isConnecting = false;
          return {
            success: false,
            error: '请在 Android 手机上开启系统蓝牙并授予本应用“附近设备”与“位置”权限。',
          };
        }

        // Call Native Android Bluetooth Device Chooser (BleClient.requestDevice)
        const device = await BleClient.requestDevice({
          optionalServices: [
            '0000180f-0000-1000-8000-00805f9b34fb',
            '00001800-0000-1000-8000-00805f9b34fb',
            '0000fff0-0000-1000-8000-00805f9b34fb',
            '0000fff1-0000-1000-8000-00805f9b34fb',
            '0000ffe0-0000-1000-8000-00805f9b34fb',
          ],
        });

        if (!device || !device.deviceId) {
          this.isConnecting = false;
          return { success: false, error: '未选择任何蓝牙设备或已取消配对' };
        }

        const connectRes = await this.connectNativeDevice(device.deviceId, device.name || '外部 BLE 互动设备');
        this.isConnecting = false;
        return connectRes;
      } catch (err: any) {
        this.isConnecting = false;
        const msg = err.message || 'Android 原生 BLE 扫描配对异常';
        if (msg.includes('cancelled') || msg.includes('User cancelled')) {
          return { success: false, error: '已取消蓝牙设备选择' };
        }
        return { success: false, error: msg };
      }
    }

    // 2. Web Bluetooth Path (Browser)
    if (!this.isBleSupported()) {
      this.isConnecting = false;
      return {
        success: false,
        error: '当前 AI Studio 预览环境不支持真实蓝牙物理硬件操作。请安装 Android APK 并在真机上测试。',
      };
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          'battery_service',
          'generic_access',
          'device_information',
          '0000fff0-0000-1000-8000-00805f9b34fb',
          '0000fff1-0000-1000-8000-00805f9b34fb',
          '0000ffe0-0000-1000-8000-00805f9b34fb',
        ],
      });

      if (!device) {
        this.isConnecting = false;
        return { success: false, error: '已取消 Web 蓝牙配对' };
      }

      this.activeDevice = {
        id: device.id,
        name: device.name || '外部互动设备',
        connected: false,
      };

      if (device.gatt) {
        this.webGattServer = await device.gatt.connect();
        this.activeDevice.connected = this.webGattServer.connected;

        await this.discoverWebTxCharacteristic(this.webGattServer);

        device.addEventListener('gattserverdisconnected', () => {
          this.handleDisconnected();
        });

        this.startKeepalive();
      }

      this.isConnecting = false;
      return { success: true, device: this.activeDevice };
    } catch (err: any) {
      this.isConnecting = false;
      return { success: false, error: err.message || 'Web 蓝牙扫描配对异常' };
    }
  }

  /**
   * Connect to Native BLE Device by deviceId
   */
  public async connectNativeDevice(deviceId: string, name?: string): Promise<{ success: boolean; device?: BleDeviceInfo; error?: string }> {
    try {
      await this.ensureNativeInitialized();

      await BleClient.connect(deviceId, (disconnectedId) => {
        console.log(`[InteractiveBleAdapter] Native device disconnected: ${disconnectedId}`);
        this.handleDisconnected();
      });

      this.nativeDeviceId = deviceId;
      const services = await BleClient.getServices(deviceId);

      let foundServiceUuid: string | null = null;
      let foundTxUuid: string | null = null;

      for (const service of services) {
        for (const c of service.characteristics) {
          if (c.properties.write || c.properties.writeWithoutResponse) {
            foundServiceUuid = service.uuid;
            foundTxUuid = c.uuid;
            break;
          }
        }
        if (foundTxUuid) break;
      }

      if (!foundTxUuid && services.length > 0) {
        foundServiceUuid = services[0].uuid;
        if (services[0].characteristics.length > 0) {
          foundTxUuid = services[0].characteristics[0].uuid;
        }
      }

      this.activeServiceUuid = foundServiceUuid;
      this.activeTxUuid = foundTxUuid;

      this.activeDevice = {
        id: deviceId,
        name: name || 'BLE 蓝牙硬件',
        connected: true,
        serviceUuid: foundServiceUuid || undefined,
        txCharacteristicUuid: foundTxUuid || undefined,
      };

      this.startKeepalive();
      return { success: true, device: this.activeDevice };
    } catch (err: any) {
      this.nativeDeviceId = null;
      this.activeServiceUuid = null;
      this.activeTxUuid = null;
      if (this.activeDevice) {
        this.activeDevice.connected = false;
      }
      return { success: false, error: err.message || '原生 BLE 建立连接失败' };
    }
  }

  /**
   * Stream live BLE advertisements in Native Android APK using BleClient.requestLEScan
   */
  public async startNativeLEScan(onDeviceDiscovered: (device: BleDeviceInfo) => void): Promise<void> {
    if (!this.isNativeAndroid()) return;
    await this.ensureNativeInitialized();

    const discoveredMap = new Map<string, BleDeviceInfo>();

    await BleClient.requestLEScan(
      {
        allowDuplicates: false,
      },
      (result: ScanResult) => {
        const devName = result.device.name || result.localName || '未知 BLE 设备';
        const info: BleDeviceInfo = {
          id: result.device.deviceId,
          name: devName,
          connected: false,
          rssi: result.rssi,
        };
        if (!discoveredMap.has(info.id)) {
          discoveredMap.set(info.id, info);
          onDeviceDiscovered(info);
        }
      }
    );
  }

  public async stopNativeLEScan(): Promise<void> {
    if (!this.isNativeAndroid()) return;
    try {
      await BleClient.stopLEScan();
    } catch (e) {}
  }

  /**
   * Web Bluetooth discovery helper
   */
  private async discoverWebTxCharacteristic(server: any): Promise<void> {
    try {
      const services = await server.getPrimaryServices();
      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            if (c.properties?.write || c.properties?.writeWithoutResponse) {
              this.webTxCharacteristic = c;
              return;
            }
          }
        } catch {}
      }
    } catch (e) {
      console.warn('[InteractiveBleAdapter] Web TX discovery warning:', e);
    }
  }

  /**
   * Set output level (0 - 100%).
   * STRICT NO FAKE SUCCESS REQUIREMENT:
   * Returns false immediately if not connected or write fails!
   */
  public async setOutputLevel(level: number): Promise<boolean> {
    const clampedLevel = Math.max(0, Math.min(100, Math.round(level)));

    // 1. Native Android BLE Write Path
    if (this.isNativeAndroid()) {
      if (!this.nativeDeviceId || !this.activeDevice?.connected) {
        console.warn('[InteractiveBleAdapter] Native Android BLE 未连接硬件，拒绝假成功，返回 false');
        return false; // NO FAKE SUCCESS!
      }

      if (!this.activeServiceUuid || !this.activeTxUuid) {
        console.warn('[InteractiveBleAdapter] 未搜寻到可用写入 Characteristic，返回 false');
        return false; // NO FAKE SUCCESS!
      }

      try {
        const payload = new Uint8Array([0x55, 0x04, clampedLevel, 0xAA]);
        const dataView = new DataView(payload.buffer);

        await BleClient.writeWithoutResponse(
          this.nativeDeviceId,
          this.activeServiceUuid,
          this.activeTxUuid,
          dataView
        );
        return true; // REAL BLE WRITE SUCCESS
      } catch (err) {
        console.error('[InteractiveBleAdapter] BleClient.writeWithoutResponse 失败:', err);
        return false; // WRITE FAILED!
      }
    }

    // 2. Web Bluetooth Write Path
    if (!this.webGattServer || !this.webGattServer.connected) {
      console.warn('[InteractiveBleAdapter] Web GATT 未连接，拒绝假成功，返回 false');
      return false; // NO FAKE SUCCESS!
    }

    if (!this.webTxCharacteristic) {
      console.warn('[InteractiveBleAdapter] Web Characteristic 未找到，返回 false');
      return false; // NO FAKE SUCCESS!
    }

    try {
      const payload = new Uint8Array([0x55, 0x04, clampedLevel, 0xAA]);
      if (this.webTxCharacteristic.writeValueWithoutResponse) {
        await this.webTxCharacteristic.writeValueWithoutResponse(payload);
      } else if (this.webTxCharacteristic.writeValue) {
        await this.webTxCharacteristic.writeValue(payload);
      }
      return true; // REAL WEB WRITE SUCCESS
    } catch (err) {
      console.error('[InteractiveBleAdapter] Web Characteristic write 失败:', err);
      return false; // WRITE FAILED!
    }
  }

  public async increaseOutput(amount: number = 20): Promise<boolean> {
    return this.setOutputLevel(amount);
  }

  public async decreaseOutput(amount: number = 20): Promise<boolean> {
    return this.setOutputLevel(-amount);
  }

  public async setPattern(patternName: string): Promise<boolean> {
    if (!this.activeDevice?.connected) {
      return false; // STRICT NO FAKE SUCCESS
    }
    return this.setOutputLevel(30);
  }

  public async start(): Promise<boolean> {
    return this.setOutputLevel(20);
  }

  public async stop(): Promise<boolean> {
    return this.setOutputLevel(0);
  }

  public startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(async () => {
      if (this.isNativeAndroid()) {
        if (this.nativeDeviceId && this.activeDevice?.connected && this.activeServiceUuid && this.activeTxUuid) {
          try {
            const ping = new Uint8Array([0x00]);
            await BleClient.writeWithoutResponse(
              this.nativeDeviceId,
              this.activeServiceUuid,
              this.activeTxUuid,
              new DataView(ping.buffer)
            );
          } catch {}
        }
      } else if (this.webGattServer && this.webGattServer.connected && this.webTxCharacteristic) {
        try {
          const ping = new Uint8Array([0x00]);
          if (this.webTxCharacteristic.writeValueWithoutResponse) {
            await this.webTxCharacteristic.writeValueWithoutResponse(ping);
          }
        } catch {}
      }
    }, 5000);
  }

  public stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private handleDisconnected(): void {
    if (this.activeDevice) {
      this.activeDevice.connected = false;
    }
    this.stopKeepalive();
  }

  public async disconnect(): Promise<void> {
    this.stopKeepalive();

    if (this.isNativeAndroid() && this.nativeDeviceId) {
      try {
        await BleClient.disconnect(this.nativeDeviceId);
      } catch (e) {}
      this.nativeDeviceId = null;
      this.activeServiceUuid = null;
      this.activeTxUuid = null;
    }

    if (this.webGattServer && this.webGattServer.disconnect) {
      try {
        this.webGattServer.disconnect();
      } catch (e) {}
    }
    this.webGattServer = null;
    this.webTxCharacteristic = null;

    if (this.activeDevice) {
      this.activeDevice.connected = false;
    }
  }
}

export const interactiveBleAdapter = new InteractiveBleAdapter();
