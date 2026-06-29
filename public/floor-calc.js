/**
 * 楼层高度计算模块
 *
 * 数据源:
 *   1. 气压传感器 (Barometer API) — 精度 ~0.1m, 最适合楼层检测
 *   2. GPS海拔           — 精度 ~10-30m, 作为降级方案
 *
 * 原理:
 *   楼层 = (当前海拔 - 基准海拔) / 层高
 *   基准海拔: 首次稳定读数自动校准 / 手动校准
 *   层高默认3.0米 (住宅2.8-3.0m, 商业3.5-4.5m)
 */

const FloorCalc = (() => {
  // 配置
  const DEFAULT_FLOOR_HEIGHT = 3.0;   // 默认层高(m)
  const CALIBRATION_SAMPLES = 6;       // 校准采样次数
  const STABLE_THRESHOLD = 2.0;        // 稳定阈值(m)
  const PRESSURE_STD_HPA = 1013.25;    // 标准海平面气压

  // 状态
  let groundAltitude = null;           // 地面基准海拔(m)
  let floorHeight = DEFAULT_FLOOR_HEIGHT;
  let currentFloor = null;
  let currentConfidence = 'low';       // low/medium/high
  let altitudeSource = 'none';         // barometer/gps/none
  let isCalibrated = false;
  let calibrationSamples = [];
  let barometerWatchId = null;
  let barometerAvailable = false;
  let lastPressure = null;

  // ==================== 初始化 ====================

  function init() {
    // 从 localStorage 恢复校准数据
    const saved = localStorage.getItem('_floor_calibration');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        groundAltitude = data.groundAltitude;
        floorHeight = data.floorHeight || DEFAULT_FLOOR_HEIGHT;
        isCalibrated = data.isCalibrated || false;
        console.log('[楼层] 恢复校准: 基准=' + groundAltitude?.toFixed(1) + 'm, 层高=' + floorHeight + 'm');
      } catch (e) { /* ignore */ }
    }

    // 检测气压传感器
    checkBarometer();
  }

  // ==================== 气压传感器 ====================

  function checkBarometer() {
    // 浏览器气压传感器 API (Generic Sensor API)
    if (typeof Barometer !== 'undefined') {
      barometerAvailable = true;
      console.log('[楼层] 气压传感器可用 (Barometer API)');
      startBarometerWatch();
    } else if ('AbsolutePressureSensor' in window) {
      barometerAvailable = true;
      console.log('[楼层] 气压传感器可用 (AbsolutePressureSensor)');
      startBarometerWatch();
    } else {
      console.log('[楼层] 气压传感器不可用，使用GPS海拔');
      barometerAvailable = false;
    }
  }

  function startBarometerWatch() {
    try {
      const SensorClass = window.Barometer || window.AbsolutePressureSensor;
      if (!SensorClass) return;

      const sensor = new SensorClass({ frequency: 1 }); // 1Hz
      sensor.addEventListener('reading', () => {
        lastPressure = sensor.pressure; // hPa
      });
      sensor.addEventListener('error', (e) => {
        console.warn('[楼层] 气压传感器错误:', e);
        barometerAvailable = false;
      });
      sensor.start();
    } catch (e) {
      console.warn('[楼层] 气压传感器启动失败:', e.message);
      barometerAvailable = false;
    }
  }

  /**
   * 气压 → 海拔 (国际标准大气压公式)
   * h = 44330 * (1 - (P/P0)^(1/5.255))
   */
  function pressureToAltitude(pressureHpa) {
    const ratio = pressureHpa / PRESSURE_STD_HPA;
    return 44330 * (1 - Math.pow(ratio, 1 / 5.255));
  }

  // ==================== 海拔更新 ====================

  /**
   * 接收GPS海拔更新
   * @param {number} gpsAlt - GPS海拔 (m)
   */
  function updateFromGPS(gpsAlt) {
    if (gpsAlt == null) return;

    altitudeSource = barometerAvailable ? 'barometer+gps' : 'gps';

    // 若气压可用，优先用气压计算相对高度
    let effectiveAlt = gpsAlt;
    if (barometerAvailable && lastPressure != null) {
      const baroAlt = pressureToAltitude(lastPressure);
      // 气压相对变化更准: 用气压变化量+GPS基准
      if (groundAltitude != null) {
        effectiveAlt = groundAltitude + (baroAlt - pressureToAltitude(1013.25));
      }
    }

    // 自动校准 (首次使用)
    if (!isCalibrated && groundAltitude == null) {
      calibrationSamples.push(effectiveAlt);
      if (calibrationSamples.length >= CALIBRATION_SAMPLES) {
        autoCalibrate();
      }
    }

    // 计算楼层
    if (isCalibrated && groundAltitude != null) {
      const relativeHeight = effectiveAlt - groundAltitude;
      currentFloor = Math.round(relativeHeight / floorHeight);
      currentConfidence = barometerAvailable ? 'high' : 'medium';
    } else if (calibrationSamples.length > 0) {
      currentConfidence = 'low';
    }
  }

  // ==================== 校准 ====================

  function autoCalibrate() {
    if (calibrationSamples.length < CALIBRATION_SAMPLES) return false;

    // 去掉最高最低, 取平均
    const sorted = [...calibrationSamples].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1);
    groundAltitude = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

    isCalibrated = true;
    calibrationSamples = [];
    altitudeSource = barometerAvailable ? 'barometer' : 'gps';
    currentConfidence = barometerAvailable ? 'high' : 'medium';

    saveCalibration();
    console.log('[楼层] 自动校准完成: 基准海拔=' + groundAltitude.toFixed(1) + 'm');
    return true;
  }

  /**
   * 手动校准: 设置当前海拔为地面层
   * @param {number} currentAlt - 当前海拔 (GPS或气压)
   */
  function manualCalibrate(currentAlt) {
    if (currentAlt == null) return false;
    groundAltitude = currentAlt;
    isCalibrated = true;
    calibrationSamples = [];
    saveCalibration();
    console.log('[楼层] 手动校准: 基准海拔=' + groundAltitude.toFixed(1) + 'm');
    return true;
  }

  /**
   * 设置已知地面海拔
   */
  function setGroundAltitude(alt) {
    if (alt == null) return false;
    groundAltitude = Number(alt);
    isCalibrated = true;
    saveCalibration();
    return true;
  }

  /**
   * 设置层高
   */
  function setFloorHeight(height) {
    if (height < 1.5 || height > 10) return false; // 合理范围
    floorHeight = Number(height);
    saveCalibration();
    return true;
  }

  // ==================== 持久化 ====================

  function saveCalibration() {
    localStorage.setItem('_floor_calibration', JSON.stringify({
      groundAltitude,
      floorHeight,
      isCalibrated,
      savedAt: new Date().toISOString()
    }));
  }

  function resetCalibration() {
    groundAltitude = null;
    isCalibrated = false;
    calibrationSamples = [];
    currentFloor = null;
    localStorage.removeItem('_floor_calibration');
  }

  // ==================== 查询 ====================

  function getFloorInfo() {
    return {
      floor: currentFloor,                        // 楼层 (0=地面, +1=1楼, -1=地下1层)
      floorLabel: getFloorLabel(),                // 显示文本
      groundAltitude,                              // 基准海拔
      currentAltitude: null,                       // 由外部更新
      floorHeight,                                 // 层高
      isCalibrated,                                // 是否已校准
      confidence: currentConfidence,               // 可信度
      source: altitudeSource,                      // 数据源
      barometerAvailable,
      calibrationProgress: isCalibrated ? 100 :
        Math.round(calibrationSamples.length / CALIBRATION_SAMPLES * 100)
    };
  }

  function getFloorLabel() {
    if (!isCalibrated) return '校准中...';
    if (currentFloor == null) return '--';
    if (currentFloor === 0) return '1层 (地面)';
    if (currentFloor > 0) return (currentFloor + 1) + '层';
    return 'B' + Math.abs(currentFloor) + '层 (地下)';
  }

  function getRelativeHeight() {
    if (!isCalibrated || groundAltitude == null) return null;
    // 这个需要外部传入当前海拔
    return null; // 由调用方计算
  }

  // 初始化
  init();

  return {
    updateFromGPS,
    getFloorInfo,
    getFloorLabel,
    manualCalibrate,
    setGroundAltitude,
    setFloorHeight,
    resetCalibration,
    isCalibrated: () => isCalibrated,
    getCurrentFloor: () => currentFloor,
    getConfidence: () => currentConfidence,
    barometerAvailable: () => barometerAvailable
  };
})();

// 导出
if (typeof window !== 'undefined') {
  window.FloorCalc = FloorCalc;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FloorCalc;
}
