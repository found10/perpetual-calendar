/**
 * 万年历 - 农历/节气/节日计算模块
 * 覆盖范围: 1900-2100年
 * 算法: 经典查表法 + 二十四节气太阳黄经计算
 */

// ==================== 农历数据表 (1900-2100) ====================
// 每个年份一个16位编码(hex):
//   bit 0-3:  闰月月份 (0=无闰月)
//   bit 4-15: 1-12月的大小月 (1=30天, 0=29天, 从正月到腊月)
//   若有闰月: bit 16 = 闰月大小 (1=30天, 0=29天)
const LUNAR_INFO = [
  // 1900-1909
  0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
  // 1910-1919
  0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
  // 1920-1929
  0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
  // 1930-1939
  0x06566, 0x0d4a0, 0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
  // 1940-1949
  0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557,
  // 1950-1959
  0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573, 0x052b0, 0x0a9a8, 0x0e950, 0x06aa0,
  // 1960-1969
  0x0aea6, 0x0ab50, 0x04b60, 0x0aae4, 0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0,
  // 1970-1979
  0x096d0, 0x04dd5, 0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
  // 1980-1989
  0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46, 0x0ab60, 0x09570,
  // 1990-1999
  0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58, 0x05ac0, 0x0ab60, 0x096d5, 0x092e0,
  // 2000-2009
  0x0c960, 0x0d954, 0x0d4a0, 0x0da50, 0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5,
  // 2010-2019
  0x0a950, 0x0b4a0, 0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
  // 2020-2029
  0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260, 0x0ea65, 0x0d530,
  // 2030-2039
  0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0, 0x1d0b6, 0x0d250, 0x0d520, 0x0dd45,
  // 2040-2049
  0x0b5a0, 0x056d0, 0x055b2, 0x049b0, 0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0,
  // 2050-2059
  0x14b63, 0x09370, 0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
  // 2060-2069
  0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0, 0x0a6d0, 0x055d4,
  // 2070-2079
  0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50, 0x055a0, 0x0aba4, 0x0a5b0, 0x052b0,
  // 2080-2089
  0x0b273, 0x06930, 0x07337, 0x06aa0, 0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160,
  // 2090-2099
  0x0e968, 0x0d520, 0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a4d0, 0x0d150, 0x0f252,
  // 2100
  0x0d520
];

// 天干地支
const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const SHENGXIAO = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

// 农历月份名称
const LUNAR_MONTH = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'];
const LUNAR_DAY = [
  '', '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十'
];

// 十二时辰
const SHI_CHEN = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
const SHI_CHEN_HOURS = [23, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21]; // 每个时辰的起始小时(整点)

// 二十四节气
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

// 十二「节」索引 (月柱分界): 小寒=0,立春=2,惊蛰=4,清明=6,立夏=8,芒种=10,
//                         小暑=12,立秋=14,白露=16,寒露=18,立冬=20,大雪=22
const JIE_INDEX = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
// 对应的月支: 丑,寅,卯,辰,巳,午,未,申,酉,戌,亥,子
const JIE_ZHI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0];

// ==================== 二十四节气计算 (基于太阳黄经) ====================

/**
 * 计算指定年份的二十四节气日期
 * 基于太阳黄经每15度为一个节气
 * 返回数组: [{name, month, day}] 共24项
 */
function getSolarTerms(year) {
  const terms = [];
  for (let i = 0; i < 24; i++) {
    const jd = getSolarTermJD(year, i);
    const date = jdToDate(jd);
    terms.push({
      name: SOLAR_TERMS[i],
      month: date.getMonth() + 1,
      day: date.getDate()
    });
  }
  return terms;
}

/**
 * 计算第n个节气的儒略日 (n=0为小寒)
 * 太阳黄经 = n * 15°
 */
function getSolarTermJD(year, n) {
  // 基于天文算法: 每个节气的基准儒略日 + 修正
  // 使用近似公式
  const y = year;
  const century = (y - 2000) / 100;

  // 小寒(0°)大约在1月5-6日
  // 每个节气间隔约 365.2422/24 = 15.2184 天
  const baseJD = 2451545.0; // J2000.0

  // 计算太阳黄经到达指定角度的时刻 (简化算法)
  const angle = n * 15; // 度数(从春分点起算的小寒=285°, 即n=0→285°)

  // 用迭代法求太阳黄经等于指定值的时间
  // 这里使用较精确的公式
  let jd = getApproxSolarTermJD(y, n);

  // 牛顿迭代提高精度
  for (let iter = 0; iter < 5; iter++) {
    const lon = getSolarLongitude(jd);
    let diff = angle + 285 - lon;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.0001) break;
    jd += diff / 360 * 365.24 * 1.02; // 调整因子
  }

  return jd;
}

/**
 * 获取近似节气儒略日
 */
function getApproxSolarTermJD(year, n) {
  // 使用更精确的基准值
  // 每个节气相隔约15.218天
  // 以2000年的节气为基准
  const baseTerms2000 = [
    2451548.267, 2451563.104, 2451577.701, 2451592.006,
    2451606.316, 2451620.908, 2451636.014, 2451651.767,
    2451667.909, 2451683.998, 2451699.434, 2451713.598,
    2451726.127, 2451737.592, 2451748.920, 2451760.988,
    2451774.085, 2451788.392, 2451803.615, 2451819.190,
    2451834.377, 2451848.750, 2451861.552, 2451873.201
  ];

  const yearDiff = year - 2000;
  // 每个回归年约365.2422天
  const yearShift = yearDiff * 365.2422;
  // 每个节气相对小寒的偏移
  return baseTerms2000[0] + n * 15.218425 + yearShift;
}

/**
 * 计算太阳黄经 (简化但实用的算法)
 */
function getSolarLongitude(jd) {
  const T = (jd - 2451545.0) / 36525.0; // 儒略世纪数

  // 太阳平均黄经
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T * T;
  // 太阳平均近点角
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T * T;
  // 地球轨道离心率改正
  const C = (1.914600 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M * Math.PI / 180)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M * Math.PI / 180)
    + 0.000290 * Math.sin(3 * M * Math.PI / 180);

  let lon = L0 + C;
  lon = lon % 360;
  if (lon < 0) lon += 360;
  return lon;
}

/**
 * 儒略日转公历日期
 */
function jdToDate(jd) {
  const jdInt = Math.floor(jd + 0.5);
  const frac = jd + 0.5 - jdInt;

  let a = jdInt;
  if (a >= 2299161) {
    const alpha = Math.floor((a - 1867216.25) / 36524.25);
    a += 1 + alpha - Math.floor(alpha / 4);
  }

  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);

  const day = b - d - Math.floor(30.6001 * e) + frac;
  let month = e - 1;
  if (month > 12) month -= 12;
  let year = c - 4716;
  if (month <= 2) year--;

  const dayInt = Math.floor(day);
  const hours = (day - dayInt) * 24;

  return new Date(year, month - 1, dayInt, Math.floor(hours), Math.floor((hours % 1) * 60));
}

// ==================== 农历转换 ====================

// 缓存每年每个月的天数
const lunarYearCache = {};

/**
 * 解析指定年份的农历信息
 * 返回 { leapMonth, monthDays[], yearDays }
 */
function parseLunarYear(year) {
  if (lunarYearCache[year]) return lunarYearCache[year];

  const idx = year - 1900;
  if (idx < 0 || idx >= LUNAR_INFO.length) return null;

  const info = LUNAR_INFO[idx];
  const leapMonth = info & 0xf;           // bit 0-3: 闰月
  const leapMonthBig = (info >> 16) & 0x1; // bit 16: 闰月大小
  const monthBits = (info >> 4) & 0xfff;   // bit 4-15: 12个月大小

  const monthDays = [];
  for (let i = 0; i < 12; i++) {
    monthDays.push((monthBits >> i) & 1 ? 30 : 29);
  }

  // 计算年总天数
  let yearDays = 0;
  for (let i = 0; i < 12; i++) yearDays += monthDays[i];
  if (leapMonth > 0) {
    yearDays += leapMonthBig ? 30 : 29;
  }

  const result = { leapMonth, leapMonthBig, monthDays, yearDays };
  lunarYearCache[year] = result;
  return result;
}

/**
 * 计算农历年从正月初一到公历日期的偏移天数
 * 返回公历日期 (Date对象)
 */
function getLunarNewYearDate(year) {
  // 基准: 1900年正月初一 = 1900-01-31
  const baseYear = 1900;
  const baseDate = new Date(1900, 0, 31);

  let totalDays = 0;
  for (let y = baseYear; y < year; y++) {
    const info = parseLunarYear(y);
    if (info) totalDays += info.yearDays;
  }

  const result = new Date(baseDate);
  result.setDate(result.getDate() + totalDays);
  return result;
}

/**
 * 公历日期 → 农历日期
 * @param {Date} date - 公历日期
 * @returns {{ lunarYear, lunarMonth, lunarDay, isLeap, yearName, monthName, dayName, zodiac, ganzhi }}
 */
function solarToLunar(date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 计算从1900-01-31到目标日期的天数
  const baseDate = new Date(1900, 0, 31);
  const diffDays = Math.floor((date - baseDate) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return null;

  // 找到对应的农历年
  let lunarYear = 1900;
  let remaining = diffDays;

  while (lunarYear <= 2100) {
    const info = parseLunarYear(lunarYear);
    if (!info) break;
    if (remaining < info.yearDays) break;
    remaining -= info.yearDays;
    lunarYear++;
  }

  const info = parseLunarYear(lunarYear);
  if (!info) return null;

  // 找到对应的农历月
  let lunarMonth = 0;
  let isLeap = false;
  let dayInMonth = remaining;

  for (let m = 0; m < 12; m++) {
    lunarMonth = m + 1;
    const daysInMonth = info.monthDays[m];

    if (dayInMonth < daysInMonth) break;
    dayInMonth -= daysInMonth;

    // 检查闰月
    if (info.leapMonth === lunarMonth) {
      const leapDays = info.leapMonthBig ? 30 : 29;
      if (dayInMonth < leapDays) {
        isLeap = true;
        break;
      }
      dayInMonth -= leapDays;
    }
  }

  const lunarDay = dayInMonth + 1;

  // 四柱 (基于节气)
  const fourPillars = getFourPillars(date);
  const zodiac = SHENGXIAO[fourPillars.year.zhiIndex];

  return {
    lunarYear,
    lunarMonth,
    lunarDay,
    isLeap,
    yearName: fourPillars.year.yearName,
    monthName: (isLeap ? '闰' : '') + LUNAR_MONTH[lunarMonth - 1] + '月',
    dayName: LUNAR_DAY[lunarDay],
    zodiac,
    ganzhi: fourPillars.year.ganzhi,
    lunarMonthDays: isLeap ? (info.leapMonthBig ? 30 : 29) : info.monthDays[lunarMonth - 1],
    // 四柱信息
    yearPillar: fourPillars.year,
    monthPillar: fourPillars.month,
    dayPillar: fourPillars.day,
    hourPillar: fourPillars.hour
  };
}

// ==================== 干支纪日 ====================

/**
 * 计算公历日期的日干支
 * 参考基准: 1900-01-01 = 甲戌日 (六十甲子序号 10，0-based)
 * @param {Date} date
 * @returns {{ ganzhi: string, ganIndex: number, zhiIndex: number, cycleIndex: number }}
 */
function getDayGanzhi(date) {
  const baseDate = new Date(1900, 0, 1); // 1900-01-01 甲戌日
  const diffDays = Math.floor((date - baseDate) / (1000 * 60 * 60 * 24));
  // 1900-01-01 甲戌 = cycleIndex 10 (甲=0,戌=10)
  const cycleIndex = ((diffDays % 60) + 10 + 60) % 60;
  const ganIndex = cycleIndex % 10;
  const zhiIndex = cycleIndex % 12;
  return {
    ganzhi: GAN[ganIndex] + ZHI[zhiIndex],
    ganIndex,
    zhiIndex,
    cycleIndex
  };
}

// ==================== 干支纪时 ====================

/**
 * 根据小时(0-23)获取时辰名称和序号
 * @param {number} hour - 0-23
 * @returns {{ name: string, index: number, zhiIndex: number }}
 */
function getShiChen(hour) {
  let idx;
  if (hour === 23 || hour === 0) idx = 0;      // 子时 23:00-00:59
  else if (hour === 1 || hour === 2) idx = 1;   // 丑时 01:00-02:59
  else idx = Math.floor((hour + 1) / 2);         // 寅时 03:00 ~ 亥时 21:00-22:59

  return {
    name: SHI_CHEN[idx],
    index: idx,          // 0=子时, 1=丑时, ..., 11=亥时
    zhiIndex: idx         // 子=0, 丑=1, ..., 亥=11
  };
}

/**
 * 计算时柱干支
 * 公式: 时天干 = (日天干%5 * 2 + 时辰序号) % 10
 *   时辰序号: 子=0, 丑=1, ..., 亥=11
 *   甲己日→子时甲子, 乙庚日→子时丙子, 丙辛日→子时戊子
 *   丁壬日→子时庚子, 戊癸日→子时壬子
 * @param {number} dayStemIndex - 日天干序号 (甲=0)
 * @param {number} hour - 小时 (0-23)
 * @returns {{ ganzhi: string, ganIndex: number, zhiIndex: number, shichenName: string }}
 */
function getHourGanzhi(dayStemIndex, hour) {
  const shichen = getShiChen(hour);
  const hourGanIndex = ((dayStemIndex % 5) * 2 + shichen.index) % 10;
  const hourZhiIndex = shichen.zhiIndex;
  return {
    ganzhi: GAN[hourGanIndex] + ZHI[hourZhiIndex],
    ganIndex: hourGanIndex,
    zhiIndex: hourZhiIndex,
    shichenName: shichen.name
  };
}

// ==================== 干支纪月 ====================

/**
 * 根据节气计算月柱 (以"节"为月界)
 * 十二节: 小寒→丑月, 立春→寅月, 惊蛰→卯月, 清明→辰月, 立夏→巳月,
 *         芒种→午月, 小暑→未月, 立秋→申月, 白露→酉月, 寒露→戌月,
 *         立冬→亥月, 大雪→子月
 * 公式: 月天干 = (年天干%5 * 2 + 2 + 寅月起算的月序号) % 10
 *   甲己年正月丙寅→(0*2+2+0)=2=丙寅, 乙庚年正月戊寅→(1*2+2+0)=4=戊寅
 *
 * @param {Date} date - 公历日期
 * @param {number} yearStemIndex - 节气年的天干序号 (甲=0)
 * @returns {{ ganzhi: string, ganIndex: number, zhiIndex: number, monthName: string }}
 */
function getMonthGanzhi(date, yearStemIndex) {
  const year = date.getFullYear();
  const terms = getSolarTermsForYear(year);

  // 构建12个节气的日期点
  const jieDates = [];
  for (let i = 0; i < 12; i++) {
    const termIdx = JIE_INDEX[i]; // 0,2,4,6,8,10,12,14,16,18,20,22
    const term = terms[termIdx];
    jieDates.push({
      month: term.month,
      day: term.day,
      branchIndex: JIE_ZHI[i], // 对应的地支: 丑=1,寅=2,...,子=0
      iOrder: i               // 节序号: 0=小寒(丑月),1=立春(寅月),...
    });
  }

  // 将目标日期转为月日整数方便比较
  const targetMd = (date.getMonth() + 1) * 100 + date.getDate();

  // 找到日期落在哪个节之后
  let monthBranch, iOrder;

  // 先检查是否在当年最后一个节(大雪→子月)之后
  const lastJie = jieDates[11]; // 大雪
  const lastMd = lastJie.month * 100 + lastJie.day;

  if (targetMd >= lastMd) {
    monthBranch = lastJie.branchIndex; // 子
    iOrder = 11;
  } else {
    // 从后往前找
    for (let i = 10; i >= 0; i--) {
      const jieMd = jieDates[i].month * 100 + jieDates[i].day;
      if (targetMd >= jieMd) {
        monthBranch = jieDates[i].branchIndex;
        iOrder = i;
        break;
      }
    }
    // 如果在所有节之前(即在小寒之前), 属于上一年的丑月
    if (monthBranch === undefined) {
      // 使用上一年的小寒
      const prevTerms = getSolarTermsForYear(year - 1);
      monthBranch = 1; // 丑
      iOrder = 0;      // 小寒后=丑月
    }
  }

  // 月天干公式: monthStem = (yearStem%5 * 2 + 2 + 寅月起算的月序号) % 10
  // 寅月起算 = (iOrder - 1 + 12) % 12 (因为小寒=丑月是上一年的延续,寅月才是正月起点)
  const monthFromYin = (iOrder - 1 + 12) % 12; // 寅月=0,卯月=1,...,丑月=11
  const monthStem = ((yearStemIndex % 5) * 2 + 2 + monthFromYin) % 10;

  return {
    ganzhi: GAN[monthStem] + ZHI[monthBranch],
    ganIndex: monthStem,
    zhiIndex: monthBranch,
    monthName: ZHI[monthBranch] + '月'
  };
}

// ==================== 干支纪年 (节气年) ====================

/**
 * 获取节气年的年柱 (以立春为年界)
 * 立春之前属上一年, 立春之后属当年
 * @param {Date} date
 * @returns {{ ganzhi: string, ganIndex: number, zhiIndex: number, yearName: string, zodiac: string }}
 */
function getYearGanzhi(date) {
  const year = date.getFullYear();
  const terms = getSolarTermsForYear(year);
  // 立春 = terms[2]
  const lichun = terms[2]; // {month, day}
  const targetMd = (date.getMonth() + 1) * 100 + date.getDate();
  const lichunMd = lichun.month * 100 + lichun.day;

  // 立春之前的日期使用上一个节气年
  const solarYear = targetMd < lichunMd ? year - 1 : year;

  const cycleIndex = ((solarYear - 4) % 60 + 60) % 60;
  const ganIndex = cycleIndex % 10;
  const zhiIndex = cycleIndex % 12;
  const zodiac = SHENGXIAO[zhiIndex];

  return {
    ganzhi: GAN[ganIndex] + ZHI[zhiIndex],
    ganIndex,
    zhiIndex,
    yearName: GAN[ganIndex] + ZHI[zhiIndex] + '年',
    zodiac,
    solarYear
  };
}

// ==================== 四柱完整计算 ====================

/**
 * 获取完整的四柱 (年月日时)
 * @param {Date} date - 公历日期+时间
 * @returns {{
 *   year: { ganzhi, ganIndex, zhiIndex, yearName, zodiac, solarYear },
 *   month: { ganzhi, ganIndex, zhiIndex, monthName },
 *   day: { ganzhi, ganIndex, zhiIndex, cycleIndex },
 *   hour: { ganzhi, ganIndex, zhiIndex, shichenName }
 * }}
 */
function getFourPillars(date) {
  const hour = date.getHours();

  // 年柱 (以立春为界)
  const yearPillar = getYearGanzhi(date);

  // 月柱 (以节为界, 使用节气年的天干)
  const monthPillar = getMonthGanzhi(date, yearPillar.ganIndex);

  // 日柱
  const dayPillar = getDayGanzhi(date);

  // 时柱
  const hourPillar = getHourGanzhi(dayPillar.ganIndex, hour);

  return {
    year: yearPillar,
    month: monthPillar,
    day: dayPillar,
    hour: hourPillar
  };
}

// ==================== 节日/节气查询 ====================

/**
 * 获取指定公历日期的节日信息
 * 返回字符串数组
 */
function getFestivals(date, lunarInfo) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const festivals = [];

  // 公历节日
  const SOLAR_FESTIVALS = {
    '1-1': '元旦',
    '2-14': '情人节',
    '3-8': '妇女节',
    '3-12': '植树节',
    '4-1': '愚人节',
    '4-5': '清明节',
    '5-1': '劳动节',
    '5-4': '青年节',
    '6-1': '儿童节',
    '7-1': '建党节',
    '8-1': '建军节',
    '9-10': '教师节',
    '10-1': '国庆节',
    '12-25': '圣诞节'
  };

  const key = `${m}-${d}`;
  if (SOLAR_FESTIVALS[key]) {
    festivals.push(SOLAR_FESTIVALS[key]);
  }

  // 农历节日
  if (lunarInfo) {
    const lm = lunarInfo.lunarMonth;
    const ld = lunarInfo.lunarDay;
    const isLeap = lunarInfo.isLeap;

    if (!isLeap) {
      const LUNAR_FESTIVALS = {
        '1-1': '春节',
        '1-15': '元宵节',
        '5-5': '端午节',
        '7-7': '七夕',
        '7-15': '中元节',
        '8-15': '中秋节',
        '9-9': '重阳节',
        '12-30': '除夕',
        '12-29': null  // 小月的除夕
      };

      const lkey = `${lm}-${ld}`;
      if (LUNAR_FESTIVALS[lkey]) {
        festivals.push(LUNAR_FESTIVALS[lkey]);
      }
      // 小月(29天)的除夕
      if (lm === 12 && ld === 29 && lunarInfo.lunarMonthDays === 29) {
        festivals.push('除夕');
      }
    }

    // 节气 (检查是否为节气日)
    if (!isLeap) {
      const terms = getSolarTermsForYear(date.getFullYear());
      for (const term of terms) {
        if (term.month === m && term.day === d) {
          festivals.push(term.name);
          break;
        }
      }
    }
  }

  return festivals;
}

// 节气缓存
const solarTermsCache = {};

function getSolarTermsForYear(year) {
  if (solarTermsCache[year]) return solarTermsCache[year];
  const terms = getSolarTerms(year);
  solarTermsCache[year] = terms;
  return terms;
}

/**
 * 获取某月的节气
 */
function getMonthSolarTerms(year, month) {
  const terms = getSolarTermsForYear(year);
  return terms.filter(t => t.month === month);
}

// ==================== 公历辅助 ====================

/**
 * 获取某月有多少天
 */
function getMonthDays(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * 获取某月第一天是星期几 (0=周日)
 */
function getFirstDayOfWeek(year, month) {
  return new Date(year, month - 1, 1).getDay();
}

// 导出 (浏览器全局)
if (typeof window !== 'undefined') {
  window.LunarCalendar = {
    solarToLunar,
    getFestivals,
    getMonthDays,
    getFirstDayOfWeek,
    getSolarTermsForYear,
    getMonthSolarTerms,
    getFourPillars,
    getYearGanzhi,
    getMonthGanzhi,
    getDayGanzhi,
    getHourGanzhi,
    getShiChen,
    GAN,
    ZHI,
    SHENGXIAO,
    SHI_CHEN,
    SOLAR_TERMS,
    LUNAR_MONTH,
    LUNAR_DAY
  };
}

// Node.js 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    solarToLunar,
    getFestivals,
    getMonthDays,
    getFirstDayOfWeek,
    getSolarTermsForYear,
    getMonthSolarTerms,
    getFourPillars,
    getYearGanzhi,
    getMonthGanzhi,
    getDayGanzhi,
    getHourGanzhi,
    getShiChen,
    GAN, ZHI, SHENGXIAO, SHI_CHEN, SOLAR_TERMS, LUNAR_MONTH, LUNAR_DAY
  };
}
