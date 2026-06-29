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

    // 如果之前已授权，直接跳过权限检查
    if (localStorage.getItem('_gps_granted') === 'true') {
      console.log('[GPS] 之前已授权，跳过权限检查');
      startGPS();
      updateStatus('active', '🛰️ GPS已启动 [' + platform.toUpperCase() + ']');
      startSending();
      return true;
    }

    // 检查权限状态
    checkPermission().then(granted => {
      if (granted) {
        // 已授权：记住状态，下次不再询问
        localStorage.setItem('_gps_granted', 'true');
        startGPS();
        updateStatus('active', '🛰️ GPS已启动 [' + platform.toUpperCase() + ']');
      } else {
        // 未授权：显示权限请求弹窗
        updateStatus('error', '⚠️ 定位未授权');
        showPermissionBlock();
      }
    });

    startSending();
    return true;
  }

  /**
   * 检查定位权限状态
   */
  async function checkPermission() {
    // Permissions API (现代浏览器)
    if (navigator.permissions) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        console.log('[GPS] 权限状态:', result.state);

        if (result.state === 'denied') {
          return false;
        }
        if (result.state === 'granted') {
          return true;
        }

        // prompt状态: 监听变化
        result.addEventListener('change', () => {
          console.log('[GPS] 权限变化:', result.state);
          if (result.state === 'granted') {
            startGPS();
            hidePermissionBlock();
          } else if (result.state === 'denied') {
            showPermissionBlock();
          }
        });
      } catch (e) {
        console.warn('[GPS] Permissions API不可用:', e.message);
      }
    }

    // Capacitor 原生权限检查
    if (platform === 'ios' || platform === 'android') {
      try {
        const perm = await checkCapacitorPermission();
        return perm;
      } catch (e) {}
    }

    // 降级：尝试直接获取位置来判断
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (err) => {
          if (err.code === 1) resolve(false); // PERMISSION_DENIED
          else resolve(true); // 其他错误不算权限问题
        },
        { timeout: 5000, enableHighAccuracy: false }
      );
    });
  }

  async function checkCapacitorPermission() {
    if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.Geolocation) {
      return null; // 无法判断
    }
    const result = await window.Capacitor.Plugins.Geolocation.checkPermissions();
    if (result.location === 'granted') return true;
    if (result.location === 'denied') return false;
    return null;
  }

  function startGPS() {
    if (platform === 'web' || platform === 'harmonyos') {
      initWebGPS();
    } else {
      initCapacitorGPS();
    }
  }

  // ==================== 权限拦截UI ====================

  function showPermissionBlock() {
    const block = document.getElementById('permission-block');
    if (block) block.style.display = 'flex';
    const gpsPanel = document.querySelector('.gps-panel');
    if (gpsPanel) gpsPanel.style.opacity = '0.5';
  }

  function hidePermissionBlock() {
    const block = document.getElementById('permission-block');
    if (block) block.style.display = 'none';
    const gpsPanel = document.querySelector('.gps-panel');
    if (gpsPanel) gpsPanel.style.opacity = '1';
  }

  /**
   * 强制重新请求定位权限(用户点击时调用)
   */
  function forceRequestPermission() {
    // 立即给用户视觉反馈
    var btn = document.getElementById('perm-btn-allow');
    if (btn) { btn.textContent = '⏳ 正在请求定位...'; btn.disabled = true; }

    var onDone = function() {
      if (btn) { btn.textContent = '📍 开启定位权限'; btn.disabled = false; }
    };

    // 检查 Geolocation API 是否可用
    if (!navigator.geolocation) {
      alert('您的浏览器不支持地理定位功能');
      onDone();
      return;
    }

    // HTTP环境下Geolocation可能被静默拒绝
    // 先提示用户如果是HTTP可能需要手动设置
    var isHTTP = location.protocol === 'http:';
    var detected = platform;

    // 统一处理: 直接调用 getCurrentPosition
    // 浏览器会在用户手势下弹出系统权限对话框
    navigator.geolocation.getCurrentPosition(
      // 成功回调
      function(pos) {
        console.log('[GPS] 定位成功:', pos.coords.latitude, pos.coords.longitude);
        localStorage.setItem('_gps_granted', 'true');  // 记住授权，永不再问
        hidePermissionBlock();
        startGPS();
        updateStatus('active', '📍 定位已授权');
        onDone();
      },
      // 失败回调
      function(err) {
        console.warn('[GPS] 定位失败 code=' + err.code + ' msg=' + err.message);

        if (err.code === 1) {
          // PERMISSION_DENIED: 用户拒绝或HTTP环境
          var msg = '定位权限被拒绝。\\n\\n';
          if (isHTTP) {
            msg += '⚠️ 当前使用HTTP连接，浏览器可能静默拒绝定位。\\n\\n';
            msg += '请尝试以下方法：\\n';
            msg += '1. 使用系统浏览器打开（非微信/QQ内置浏览器）\\n';
            msg += '2. 在系统设置中为浏览器开启定位权限\\n';
            msg += '3. 重试或刷新页面再次授权';
          } else {
            msg += '请按以下步骤手动开启：\\n';
          }
          msg += '\\n\\n';
          msg += getPermissionGuide(detected);
          alert(msg);
        } else if (err.code === 2) {
          // POSITION_UNAVAILABLE: 无GPS信号
          hidePermissionBlock();
          startGPS();
          updateStatus('active', '🛰️ 搜索卫星信号中...');
        } else if (err.code === 3) {
          // TIMEOUT
          hidePermissionBlock();
          startGPS();
          updateStatus('active', '⏱️ 定位超时，后台重试中...');
        } else {
          // 未知错误
          hidePermissionBlock();
          startGPS();
        }
        onDone();
      },
      {
        enableHighAccuracy: true,
        timeout: 30000,      // 30秒超时
        maximumAge: 0         // 不使用缓存
      }
    );
  }

  function getPermissionGuide(p) {
    var guides = {
      'harmonyos': '🔷 鸿蒙系统:\n1. 打开「设置」→「应用和服务」→「应用管理」\n2. 找到「浏览器」App\n3. 点击「权限」→「位置」→ 选择「始终允许」\n4. 返回浏览器刷新页面',
      'android': '🤖 Android:\n1. 打开「设置」→「应用管理」\n2. 找到「浏览器」→「权限」→「位置」\n3. 选择「始终允许」\n4. 返回浏览器刷新页面',
      'ios': '🍎 iOS:\n1. 打开「设置」→「隐私与安全性」→「定位服务」\n2. 找到「Safari」→ 选择「使用App期间」\n3. 返回浏览器刷新页面',
      'web': '🌐 浏览器:\n1. 点击地址栏左侧 🔒 图标\n2. 将「位置」设为「允许」\n3. 刷新页面'
    };
    return guides[p] || guides['web'];
  }

  /**
   * 显示手动开启权限指引（弹窗替代alert）
   */
  function showHowToEnable(p) {
    const guides = {
      'harmonyos': {
        title: '🔷 鸿蒙定位权限设置',
        steps: [
          '打开手机「设置」App',
          '搜索「应用和服务」→「应用管理」',
          '找到「万年历」或「浏览器」',
          '点击「权限」→「位置」',
          '选择「始终允许」或「使用时允许」',
          '返回App，再次点击「开启定位权限」'
        ]
      },
      'android': {
        title: '🤖 Android 定位权限设置',
        steps: [
          '打开手机「设置」→「应用管理」',
          '找到「万年历」或「Chrome浏览器」',
          '点击「权限」→「位置」',
          '选择「始终允许」（支持后台定位）',
          '返回App，再次点击「开启定位权限」'
        ]
      },
      'ios': {
        title: '🍎 iOS 定位权限设置',
        steps: [
          '打开「设置」→「隐私与安全性」',
          '点击「定位服务」→ 找到「万年历」',
          '选择「始终」',
          '返回App，再次点击「开启定位权限」'
        ]
      },
      'web': {
        title: '🌐 浏览器定位权限',
        steps: [
          '点击浏览器地址栏左侧的 🔒 图标',
          '找到「位置」权限',
          '选择「允许」',
          '刷新页面或再次点击「开启定位权限」'
        ]
      }
    };
    const g = guides[p] || guides['web'];
    const msg = g.title + '\n\n' + g.steps.map((s,i) => (i+1)+'. '+s).join('\n');
    alert(msg);
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
    forceRequestPermission,
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
