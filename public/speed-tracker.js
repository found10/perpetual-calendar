/**
 * 设备速度追踪模块
 * - 实时速度显示 (km/h 为主)
 * - 速度等级分类
 * - 加速/减速趋势
 * - 最高速度记录
 * - 速度可视化进度条
 */

const SpeedTracker = (() => {
  // 速度等级定义 (km/h)
  const LEVELS = [
    { max: 0.5,  label: '⏸️ 静止',   cls: 'speed-static',   icon: '🟦' },
    { max: 6,    label: '🚶 步行',   cls: 'speed-walk',     icon: '🟩' },
    { max: 25,   label: '🚴 骑行',   cls: 'speed-bike',     icon: '🟨' },
    { max: 60,   label: '🚗 城市驾驶', cls: 'speed-car',     icon: '🟧' },
    { max: 120,  label: '🚙 高速行驶', cls: 'speed-highway', icon: '🟥' },
    { max: 300,  label: '🚄 高铁',   cls: 'speed-train',    icon: '🟪' },
    { max: Infinity, label: '✈️ 飞行', cls: 'speed-flight', icon: '⬛' }
  ];

  // 状态
  let currentSpeedMS = 0;           // 当前速度 (m/s)
  let currentSpeedKMH = 0;          // 当前速度 (km/h)
  let prevSpeedKMH = 0;             // 上一次速度
  let maxSpeedKMH = 0;              // 最高速度
  let maxSpeedMS = 0;
  let speedHistory = [];            // 最近10次速度记录
  let currentLevel = LEVELS[0];
  let lastUpdateTime = null;

  // ==================== 速度更新 ====================

  /**
   * 接收GPS速度更新 (m/s)
   */
  function update(speedMS) {
    if (speedMS == null) return;

    prevSpeedKMH = currentSpeedKMH;
    currentSpeedMS = speedMS;
    currentSpeedKMH = speedMS * 3.6; // m/s → km/h

    // 记录最高速度
    if (currentSpeedKMH > maxSpeedKMH) {
      maxSpeedKMH = currentSpeedKMH;
      maxSpeedMS = currentSpeedMS;
    }

    // 速度等级
    currentLevel = getLevel(currentSpeedKMH);

    // 速度历史
    const now = Date.now();
    speedHistory.push({
      kmh: currentSpeedKMH,
      ms: currentSpeedMS,
      level: currentLevel.label,
      time: now
    });
    if (speedHistory.length > 10) speedHistory.shift();

    lastUpdateTime = now;

    // 更新DOM
    updateDisplay();
  }

  // ==================== 等级判断 ====================

  function getLevel(kmh) {
    for (const level of LEVELS) {
      if (kmh <= level.max) return level;
    }
    return LEVELS[LEVELS.length - 1];
  }

  // ==================== 趋势分析 ====================

  function getTrend() {
    const diff = currentSpeedKMH - prevSpeedKMH;
    if (Math.abs(diff) < 0.3) return { label: '→ 匀速', cls: 'trend-steady', delta: 0 };
    if (diff > 0) return { label: '↑ 加速', cls: 'trend-up', delta: diff };
    return { label: '↓ 减速', cls: 'trend-down', delta: Math.abs(diff) };
  }

  // ==================== 速度条比例 ====================

  function getBarPercent() {
    // 将速度映射到 0-100% 的进度条 (0→0%, 200km/h→100%)
    return Math.min(100, Math.round((currentSpeedKMH / 200) * 100));
  }

  // ==================== UI 更新 ====================

  function updateDisplay() {
    const trend = getTrend();

    // 主速度 (km/h)
    setText('speed-kmh', currentSpeedKMH.toFixed(1));
    // 副速度 (m/s)
    setText('speed-ms', currentSpeedMS.toFixed(2) + ' m/s');
    // 速度等级
    const levelEl = document.getElementById('speed-level');
    if (levelEl) {
      levelEl.textContent = currentLevel.icon + ' ' + currentLevel.label;
      levelEl.className = 'speed-level ' + currentLevel.cls;
    }
    // 趋势
    const trendEl = document.getElementById('speed-trend');
    if (trendEl) {
      trendEl.textContent = trend.label + (trend.delta > 0 ? ' ' + trend.delta.toFixed(1) + 'km/h' : '');
      trendEl.className = 'speed-trend ' + trend.cls;
    }
    // 最高速度
    setText('speed-max', maxSpeedKMH.toFixed(1) + ' km/h');
    // 速度条
    const barEl = document.getElementById('speed-bar-fill');
    if (barEl) {
      barEl.style.width = getBarPercent() + '%';
      barEl.className = 'speed-bar-fill ' + currentLevel.cls;
    }
    // 更新GPS面板中的简要速度
    setText('gps-speed', currentSpeedKMH.toFixed(1) + ' km/h');
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ==================== 查询 ====================

  function getInfo() {
    const trend = getTrend();
    return {
      speedKMH: currentSpeedKMH,
      speedMS: currentSpeedMS,
      level: currentLevel.label,
      levelCls: currentLevel.cls,
      trend: trend.label,
      trendCls: trend.cls,
      trendDelta: trend.delta,
      maxSpeedKMH,
      barPercent: getBarPercent(),
      history: speedHistory.slice(-5)
    };
  }

  function resetMaxSpeed() {
    maxSpeedKMH = 0;
    maxSpeedMS = 0;
    setText('speed-max', '0.0 km/h');
  }

  return {
    update,
    getInfo,
    getLevel,
    getTrend,
    resetMaxSpeed,
    getCurrentSpeedKMH: () => currentSpeedKMH,
    getCurrentSpeedMS: () => currentSpeedMS,
    getMaxSpeed: () => maxSpeedKMH,
    getHistory: () => speedHistory
  };
})();

// 导出
if (typeof window !== 'undefined') window.SpeedTracker = SpeedTracker;
if (typeof module !== 'undefined') module.exports = SpeedTracker;
