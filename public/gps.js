/**
 * GPS定位模块 - 支持浏览器 + Capacitor 原生后台定位
 * iOS / Android / 鸿蒙 三端通用
 */
const GPS = (() => {
  // ==================== 状态 ====================
  let watchId = null;
  let currentPosition = null;
  let sendIntervalId = null;
  let isSending = false;
  let sendCount = 0;
  let errorCount = 0;
  let lastSendTime = null;
  let isBackground = false;
  let backgroundWatchId = null;
  let platform = 'web'; // 'web' | 'ios' | 'android' | 'harmonyos'

  const SEND_INTERVAL = 60 * 1000; // 60秒上报间隔
  const SERVER_URL = '/api/location';

  // 当前选择的卫星定位系统
  let currentGNSS = 'AUTO'; // AUTO/GPS/BDS/GLONASS/GALILEO
  let currentUniqueId = null; // 设备唯一ID

  let elements = {};

  // ==================== Capacitor 检测 ====================

  /**
   * 检测运行平台
   */
  function detectPlatform() {
    // 检测 Capacitor 环境
    if (typeof window !== 'undefined' && window.Capacitor) {
      const info = window.Capacitor.getPlatform();
      if (info === 'ios') platform = 'ios';
      else if (info === 'android') platform = 'android';
      else platform = 'web';

      console.log('[GPS] Capacitor平台:', platform);

      // 监听App状态变化 (前后台切换)
      try {
        const { App } = window.Capacitor.Plugins || {};
        if (App) {
          App.addListener('appStateChange', (state) => {
            isBackground = !state.isActive;
            console.log('[GPS] App状态:', state.isActive ? '前台' : '后台');
            if (isBackground) {
              startBackgroundTracking();
            } else {
              stopBackgroundTracking();
              // 回到前台立即发送一次
              setTimeout(() => sendLocation(), 1000);
            }
          });
        }
      } catch (e) {
        console.warn('[GPS] App状态监听不可用:', e.message);
      }
    }

    // 检测鸿蒙
    if (typeof navigator !== 'undefined' &&
        (navigator.userAgent.includes('HarmonyOS') ||
         navigator.userAgent.includes('OpenHarmony'))) {
      platform = 'harmonyos';
      console.log('[GPS] 检测到鸿蒙系统');
    }

    return platform;
  }

  // ==================== 初始化 ====================

  function init(els) {
    elements = els;
    platform = detectPlatform();

    // 静默启动GPS，不阻塞页面
    startGPS();
    updateStatus('active', '🛰️ GPS启动中 [' + platform.toUpperCase() + ']');
    startSending();
    return true;
  }

  function startGPS() {
    if (platform === 'web' || platform === 'harmonyos') {
      initWebGPS();
    } else {
      initCapacitorGPS();
    }
  }

  // ==================== Web GPS (浏览器/鸿蒙ArkWeb) ====================

  function initWebGPS() {
    if (!navigator.geolocation) {
      updateStatus('error', '❌ 浏览器不支持地理定位');
      return false;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 30000,     // 最大缓存30秒
      timeout: 15000         // 超时15秒
    };

    watchId = navigator.geolocation.watchPosition(
      onPositionSuccess,
      onPositionError,
      options
    );

    return true;
  }

  function onPositionSuccess(position) {
    // 首次获取位置成功 = 权限已授权，记住状态
    if (!localStorage.getItem('_gps_granted')) {
      localStorage.setItem('_gps_granted', 'true');
    }
    currentPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      alt: position.coords.altitude,
      speed: position.coords.speed,
      heading: position.coords.heading,
      accuracy: position.coords.accuracy,
      timestamp: new Date(position.timestamp).toISOString()
    };

    // 楼层计算
    if (typeof FloorCalc !== 'undefined' && position.coords.altitude != null) {
      FloorCalc.updateFromGPS(position.coords.altitude);
    }

    // 速度追踪
    if (typeof SpeedTracker !== 'undefined' && position.coords.speed != null) {
      SpeedTracker.update(position.coords.speed);
    }

    updateDisplay();
    updateStatus('active', '📍 定位已更新');
  }

  function onPositionError(error) {
    errorCount++;
    let msg = '';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        msg = '❌ 定位权限被拒绝，请在设置中允许定位';
        break;
      case error.POSITION_UNAVAILABLE:
        msg = '⚠️ 定位信息不可用，请检查GPS是否开启';
        break;
      case error.TIMEOUT:
        msg = '⏱️ 定位请求超时，正在重试...';
        break;
      default:
        msg = '❌ 定位错误: ' + error.message;
    }
    updateStatus('error', msg);
    console.error('[GPS] Error:', error);
  }

  // ==================== Capacitor 原生 GPS ====================

  async function initCapacitorGPS() {
    try {
      const Geolocation = window.Capacitor.Plugins.Geolocation;
      if (!Geolocation) {
        console.warn('[GPS] Capacitor Geolocation插件未找到，回退到Web API');
        return initWebGPS();
      }

      // 检查权限
      const permResult = await Geolocation.checkPermissions();
      console.log('[GPS] 权限状态:', permResult);

      if (permResult.location !== 'granted') {
        const reqResult = await Geolocation.requestPermissions({
          permissions: ['location', 'coarseLocation']
        });
        console.log('[GPS] 权限请求结果:', reqResult);
        if (reqResult.location !== 'granted') {
          updateStatus('error', '❌ 定位权限被拒绝');
          return false;
        }
      }

      // 开始监听位置 (支持后台)
      const watchResult = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 30000
        },
        (position, err) => {
          if (err) {
            onPositionError({ code: 2, message: err.message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
            return;
          }
          if (position) {
            onPositionSuccess({ coords: position.coords, timestamp: position.timestamp });
          }
        }
      );

      backgroundWatchId = watchResult;
      console.log('[GPS] Capacitor原生定位已启动');
      return true;
    } catch (err) {
      console.error('[GPS] Capacitor定位初始化失败:', err);
      updateStatus('error', '❌ 原生定位初始化失败');
      // 回退到Web API
      return initWebGPS();
    }
  }

  // ==================== 后台定位 ====================

  /**
   * 启动后台定位 (App进入后台时调用)
   */
  function startBackgroundTracking() {
    console.log('[GPS] 启动后台定位追踪');
    updateStatus('active', '🔵 后台定位中...');

    // Capacitor Geolocation 原生支持后台定位
    // Android: 通过 Foreground Service 保持
    // iOS: 通过 Background Modes > Location updates
    // 无需额外操作，插件自动处理

    // 发送通知告知用户 (可选)
    sendBackgroundNotification();
  }

  function stopBackgroundTracking() {
    console.log('[GPS] 停止后台定位追踪');
  }

  async function sendBackgroundNotification() {
    try {
      if (window.Capacitor && window.Capacitor.Plugins.LocalNotifications) {
        const { LocalNotifications } = window.Capacitor.Plugins;
        await LocalNotifications.schedule({
          notifications: [{
            title: '万年历GPS',
            body: '正在后台持续定位中...',
            id: 1,
            ongoing: true,
            schedule: { at: new Date(Date.now() + 1000) },
            extra: { type: 'background-location' }
          }]
        });
      }
    } catch (e) {
      // 静默失败
    }
  }

  // ==================== 定时发送 ====================

  function startSending() {
    // 3秒后发送第一次
    setTimeout(() => sendLocation(), 3000);

    // 每60秒发送
    sendIntervalId = setInterval(() => {
      sendLocation();
    }, SEND_INTERVAL);
  }

  async function sendLocation() {
    if (isSending) return;
    if (!currentPosition) {
      console.log('[GPS] 暂无定位数据，跳过发送');
      return;
    }

    isSending = true;
    updateSendStatus('sending', '📡 发送中...');

    try {
      const response = await fetch(SERVER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...currentPosition,
          gnssSystem: currentGNSS,
          uniqueId: currentUniqueId,
          platform: platform,
          background: isBackground
        })
      });

      if (response.ok) {
        const data = await response.json();
        sendCount++;
        lastSendTime = new Date();
        updateSendStatus('success', `✅ 已发送 (#${sendCount}) [${platform}]`);
        addSendRecord(true, data.total);
        console.log('[GPS] 发送成功:', data);
      } else {
        throw new Error('服务器返回 ' + response.status);
      }
    } catch (err) {
      errorCount++;
      updateSendStatus('error', `❌ 发送失败: ${err.message}`);
      addSendRecord(false);
      console.error('[GPS] 发送失败:', err);
    } finally {
      isSending = false;
    }
  }

  // ==================== UI 更新 ====================

  function updateDisplay() {
    if (!currentPosition) return;

    const pos = currentPosition;
    const setVal = (id, val, suffix = '') => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? val + suffix : '--';
    };

    setVal('gps-lat', pos.lat?.toFixed(6), '°');
    setVal('gps-lng', pos.lng?.toFixed(6), '°');
    setVal('gps-alt', pos.alt != null ? pos.alt.toFixed(1) : '--', ' m');
    setVal('gps-speed', pos.speed != null ? pos.speed.toFixed(2) : '--', ' m/s');
    setVal('gps-heading', pos.heading != null ? pos.heading.toFixed(1) : '--', '°');
    setVal('gps-accuracy', pos.accuracy != null ? pos.accuracy.toFixed(1) : '--', ' m');
    setVal('gps-time', formatTime(pos.timestamp), '');
    setVal('gps-send-count', sendCount, ' 次');
    setVal('gps-error-count', errorCount, ' 次');
    setVal('gps-platform', platform.toUpperCase(), '');

    // 楼层信息
    if (typeof FloorCalc !== 'undefined') {
      const fi = FloorCalc.getFloorInfo();
      setVal('floor-label', fi.floorLabel, '');
      setVal('floor-ground', fi.groundAltitude != null ? fi.groundAltitude.toFixed(1) : '--', ' m');
      setVal('floor-height', fi.floorHeight.toFixed(1), ' m');
      setVal('floor-source', fi.source === 'barometer' ? '气压计' :
        fi.source === 'barometer+gps' ? '气压+GPS' : fi.source === 'gps' ? 'GPS' : '--', '');

      // 校准进度
      const calEl = document.getElementById('floor-cal-progress');
      if (calEl) {
        if (fi.isCalibrated) {
          calEl.textContent = '✅ 已校准 (' + fi.confidence.toUpperCase() + ')';
          calEl.className = 'floor-cal-status cal-ok';
        } else {
          calEl.textContent = '⏳ 校准中 ' + fi.calibrationProgress + '%';
          calEl.className = 'floor-cal-status cal-pending';
        }
      }
    }

    const dot = document.getElementById('gps-dot');
    if (dot) {
      dot.className = currentPosition ? 'gps-dot active' : 'gps-dot';
    }
  }

  function updateStatus(type, msg) {
    const el = document.getElementById('gps-status');
    if (el) {
      el.textContent = msg;
      el.className = 'gps-status-text status-' + type;
    }
  }

  function updateSendStatus(type, msg) {
    const el = document.getElementById('send-status');
    if (el) {
      el.textContent = msg;
      el.className = 'send-status status-' + type;
    }
  }

  function addSendRecord(success, total) {
    const list = document.getElementById('send-log-list');
    if (!list) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', { hour12: false });
    const bg = isBackground ? ' [后台]' : '';
    const item = document.createElement('div');
    item.className = 'send-log-item ' + (success ? 'log-success' : 'log-error');
    item.innerHTML = `
      <span class="log-time">${timeStr}</span>
      <span class="log-icon">${success ? '✅' : '❌'}</span>
      <span class="log-msg">${success ? `发送成功 (共${total}条)${bg}` : '发送失败'}</span>
    `;

    list.insertBefore(item, list.firstChild);
    while (list.children.length > 20) {
      list.removeChild(list.lastChild);
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '--';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('zh-CN', { hour12: false }) + ' ' +
        d.toLocaleDateString('zh-CN');
    } catch (e) {
      return isoString;
    }
  }

  // ==================== 手动操作 ====================

  function manualSend() {
    if (!currentPosition) {
      alert('暂无定位数据，请等待GPS定位完成');
      return;
    }
    sendLocation();
  }

  function destroy() {
    if (watchId != null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (backgroundWatchId != null && window.Capacitor) {
      try {
        window.Capacitor.Plugins.Geolocation.clearWatch({ id: backgroundWatchId });
      } catch (e) {}
      backgroundWatchId = null;
    }
    if (sendIntervalId != null) {
      clearInterval(sendIntervalId);
      sendIntervalId = null;
    }
  }

  // ==================== GNSS 系统切换 ====================

  function setGNSS(system) {
    const valid = ['AUTO', 'GPS', 'BDS', 'GLONASS', 'GALILEO'];
    currentGNSS = valid.includes(system) ? system : 'AUTO';
    console.log('[GPS] 定位系统切换为:', currentGNSS);
    // 更新UI中的GNSS选择器
    const sel = document.getElementById('gnss-select');
    if (sel) sel.value = currentGNSS;
    return currentGNSS;
  }

  function getGNSS() {
    return currentGNSS;
  }

  function setUniqueId(id) {
    currentUniqueId = id;
  }

  // ==================== 导出 ====================

  return {
    init,
    manualSend,
    destroy,
    setGNSS,
    getGNSS,
    setUniqueId,
    getCurrentPosition: () => currentPosition,
    getSendCount: () => sendCount,
    getErrorCount: () => errorCount,
    getPlatform: () => platform,
    isBackground: () => isBackground,
    isActive: () => watchId != null || backgroundWatchId != null
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = GPS;
}
