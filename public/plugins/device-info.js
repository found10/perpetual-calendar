/**
 * DeviceInfo + UniqueID + QR Code 模块
 * - 获取设备 IMEI/唯一标识
 * - 生成全局唯一ID (系统编号+时间戳+随机, 防重复)
 * - 生成/显示QR码
 */

// ============ Web 实现 ============
const WebDeviceInfo = {
  async getInfo() {
    let uuid = localStorage.getItem('_device_uuid');
    if (!uuid) {
      uuid = 'web-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).substring(2, 10);
      localStorage.setItem('_device_uuid', uuid);
    }

    return {
      imei: null,
      imei2: null,
      meid: null,
      deviceId: uuid,
      platform: 'web',
      model: navigator.platform || 'Unknown',
      manufacturer: 'Browser',
      osVersion: this._detectOS(),
      isEmulator: false,
      timestamp: new Date().toISOString()
    };
  },

  _detectOS() {
    const ua = navigator.userAgent;
    if (ua.includes('Windows NT 10')) return 'Windows 10';
    if (ua.includes('Windows NT 6')) return 'Windows 7/8';
    if (ua.includes('Mac OS X')) {
      const m = ua.match(/Mac OS X (\d+[_\d]+)/);
      return 'macOS ' + (m ? m[1].replace(/_/g, '.') : '');
    }
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) {
      const m = ua.match(/Android (\d+\.\d+)/);
      return 'Android ' + (m ? m[1] : '');
    }
    if (ua.includes('iPhone') || ua.includes('iPad')) {
      const m = ua.match(/OS (\d+[_\d]+)/);
      return 'iOS ' + (m ? m[1].replace(/_/g, '.') : '');
    }
    return 'Unknown';
  }
};

// ============ 统一模块 ============
const DeviceInfo = (() => {
  let cachedInfo = null;
  let currentUniqueId = null;

  /**
   * 获取设备信息
   */
  async function getDeviceInfo() {
    if (cachedInfo) return cachedInfo;

    // Capacitor 原生环境
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
      try {
        const { DeviceInfoPlugin } = Capacitor.Plugins;
        if (DeviceInfoPlugin) {
          cachedInfo = await DeviceInfoPlugin.getInfo();
          return cachedInfo;
        }
      } catch (e) {
        console.warn('[DeviceInfo] 原生插件失败, 降级Web:', e.message);
      }
    }

    // 鸿蒙
    if (typeof navigator !== 'undefined' &&
        (navigator.userAgent.includes('HarmonyOS') ||
         navigator.userAgent.includes('OpenHarmony'))) {
      cachedInfo = await getHarmonyOSInfo();
      return cachedInfo;
    }

    // Web
    cachedInfo = await WebDeviceInfo.getInfo();
    return cachedInfo;
  }

  async function getHarmonyOSInfo() {
    let uuid = localStorage.getItem('_hm_uuid');
    if (!uuid) {
      uuid = 'hm-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 10);
      localStorage.setItem('_hm_uuid', uuid);
    }
    return {
      imei: null, imei2: null, meid: null,
      deviceId: uuid, platform: 'harmonyos',
      model: 'HarmonyOS Device', manufacturer: 'Huawei',
      osVersion: 'HarmonyOS', isEmulator: false,
      timestamp: new Date().toISOString()
    };
  }

  function getIMEI() {
    if (!cachedInfo) return null;
    return {
      imei: cachedInfo.imei || null,
      imei2: cachedInfo.imei2 || null,
      meid: cachedInfo.meid || null,
      deviceId: cachedInfo.deviceId || null
    };
  }

  // ============ 唯一ID生成 ============

  /**
   * 生成全局唯一标识
   * 格式: CAL-{平台}-{设备短哈希}-{时间戳36进制}-{随机6位}
   * 三重防重复: 设备ID + 毫秒时间戳 + 随机数
   *
   * 每次调用生成不同ID (时间戳+随机保证)
   */
  async function generateUniqueId() {
    const info = await getDeviceInfo();
    const deviceHint = info.deviceId || info.imei ||
      (info.identifierForVendor || '') + (info.androidId || '') ||
      Math.random().toString(36).slice(2);

    // 请求服务端生成唯一ID
    try {
      const params = new URLSearchParams({
        platform: info.platform || 'web',
        device: deviceHint
      });
      const resp = await fetch('/api/unique-id?' + params.toString());
      if (resp.ok) {
        const data = await resp.json();
        currentUniqueId = data.uniqueId;
        return currentUniqueId;
      }
    } catch (e) {
      console.warn('[DeviceInfo] 服务端唯一ID失败, 本地生成');
    }

    // 本地降级生成
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    const hash = simpleHash(deviceHint).slice(0, 8);
    currentUniqueId = `CAL-${(info.platform||'W').toUpperCase().slice(0,1)}-${hash}-${ts}-${rand}`;
    return currentUniqueId;
  }

  function getCurrentUniqueId() {
    return currentUniqueId;
  }

  /**
   * 获取QR码图片URL
   * @param {string} text - QR码内容 (默认当前唯一ID)
   * @param {number} size - QR码尺寸
   * @returns {string} QR码PNG的URL
   */
  function getQRCodeUrl(text, size = 280) {
    const content = encodeURIComponent(text || currentUniqueId || 'NO_ID');
    return `/api/qrcode?text=${content}&size=${size}`;
  }

  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(16).toUpperCase().padStart(8, '0');
  }

  // ============ 设备注册 + 命令轮询 ============

  let pollingInterval = null;
  let registered = false;

  /**
   * 向服务端注册设备
   */
  async function registerDevice() {
    if (registered) return;
    try {
      const info = await getDeviceInfo();
      const uid = currentUniqueId || await generateUniqueId();
      const resp = await fetch('/api/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uniqueId: uid,
          platform: info.platform,
          brand: info.brand || info.manufacturer,
          model: info.model || info.modelName,
          osVersion: info.osVersion,
          imei: info.imei,
          deviceName: (info.brand||'') + ' ' + (info.model||'')
        })
      });
      if (resp.ok) {
        registered = true;
        console.log('[DeviceInfo] 设备已注册:', uid);
      }
    } catch(e) {
      console.warn('[DeviceInfo] 注册失败:', e.message);
    }
  }

  /**
   * 启动命令轮询 (每15秒检查一次后端命令)
   */
  function startCommandPolling() {
    if (pollingInterval) return;
    pollingInterval = setInterval(pollCommands, 15000);
    pollCommands(); // 立即执行一次
    console.log('[DeviceInfo] 命令轮询已启动 (15s)');
  }

  async function pollCommands() {
    if (!currentUniqueId) return;
    try {
      const resp = await fetch('/api/commands/pending/' + encodeURIComponent(currentUniqueId));
      if (!resp.ok) return;
      const data = await resp.json();
      for (const cmd of data.commands) {
        executeCommand(cmd);
      }
    } catch(e) { /* 静默 */ }
  }

  async function executeCommand(cmd) {
    console.log('[DeviceInfo] 执行命令:', cmd.command, cmd.params);
    let result = { ok: true };

    switch (cmd.command) {
      case 'set_gnss':
        if (typeof GPS !== 'undefined') {
          GPS.setGNSS(cmd.params?.value || cmd.params?.system || 'AUTO');
        }
        result = { system: GPS?.getGNSS?.() || 'AUTO' };
        break;

      case 'set_interval':
        // 可通过GPS模块调整上报间隔 (需要GPS支持)
        result = { interval: cmd.params?.value || 60 };
        break;

      case 'report_now':
        if (typeof GPS !== 'undefined') {
          GPS.manualSend();
        }
        break;

      case 'set_floor_height':
        if (typeof FloorCalc !== 'undefined') {
          FloorCalc.setFloorHeight(parseFloat(cmd.params?.value) || 3.0);
        }
        result = { floorHeight: cmd.params?.value || 3.0 };
        break;

      case 'restart_gps':
        if (typeof GPS !== 'undefined') {
          GPS.destroy();
          setTimeout(() => GPS.init({}), 1000);
        }
        break;

      case 'ping':
        result = { pong: true, time: new Date().toISOString() };
        break;

      default:
        result = { ok: false, reason: 'unknown_command' };
    }

    // 上报执行结果
    try {
      await fetch('/api/commands/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandId: cmd.id,
          status: 'executed',
          result: JSON.stringify(result)
        })
      });
    } catch(e) {}
  }

  return {
    getDeviceInfo,
    getIMEI,
    generateUniqueId,
    getCurrentUniqueId,
    getQRCodeUrl,
    registerDevice,
    startCommandPolling,
    clearCache: () => { cachedInfo = null; }
  };
})();

// 导出
if (typeof window !== 'undefined') {
  window.DeviceInfo = DeviceInfo;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DeviceInfo;
}
