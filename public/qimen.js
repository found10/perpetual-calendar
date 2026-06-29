/**
 * 奇门遁甲排盘模块 - 时家奇门
 * 包含: 地盘/天盘/人盘(八门)/神盘(八神)/九星
 * 算法: 节气定局 → 三元定局 → 旬首推演
 */

const QiMen = (() => {

  // ==================== 基础数据 ====================

  // 九宫格 (后天八卦方位)
  // 4 9 2
  // 3 5 7
  // 8 1 6
  const GONG = {
    1: { name: '坎一宫', trigram: '坎', dir: '北', element: '水' },
    2: { name: '坤二宫', trigram: '坤', dir: '西南', element: '土' },
    3: { name: '震三宫', trigram: '震', dir: '东', element: '木' },
    4: { name: '巽四宫', trigram: '巽', dir: '东南', element: '木' },
    5: { name: '中五宫', trigram: '中', dir: '中', element: '土' }, // 寄坤二宫
    6: { name: '乾六宫', trigram: '乾', dir: '西北', element: '金' },
    7: { name: '兑七宫', trigram: '兑', dir: '西', element: '金' },
    8: { name: '艮八宫', trigram: '艮', dir: '东北', element: '土' },
    9: { name: '离九宫', trigram: '离', dir: '南', element: '火' }
  };

  // 八门 (原始宫位: 休1 死2 伤3 杜4 中5 开6 惊7 生8 景9)
  const MEN = ['休', '死', '伤', '杜', '中', '开', '惊', '生', '景'];
  const MEN_ORIGIN = { '休':1, '死':2, '伤':3, '杜':4, '开':6, '惊':7, '生':8, '景':9 };

  // 九星 (原始宫位)
  // 天蓬1 天芮2 天冲3 天辅4 天禽5 天心6 天柱7 天任8 天英9
  const XING = ['天蓬', '天芮', '天冲', '天辅', '天禽', '天心', '天柱', '天任', '天英'];
  const XING_ORIGIN = { '天蓬':1, '天芮':2, '天冲':3, '天辅':4, '天禽':5, '天心':6, '天柱':7, '天任':8, '天英':9 };

  // 八神 (阳遁顺排, 阴遁逆排)
  const SHEN_YANG = ['值符', '螣蛇', '太阴', '六合', '白虎', '玄武', '九地', '九天'];
  const SHEN_YIN  = ['值符', '九天', '九地', '玄武', '白虎', '六合', '太阴', '螣蛇'];

  // 天干
  const GAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];

  // 六仪 (甲子遁戊, 甲戌遁己, 甲申遁庚, 甲午遁辛, 甲辰遁壬, 甲寅遁癸)
  // 甲子戊=1, 甲戌己=2, 甲申庚=3, 甲午辛=4, 甲辰壬=5, 甲寅癸=6
  const LIUYI_GAN = ['戊', '己', '庚', '辛', '壬', '癸']; // 分别对应六甲旬

  // 旬首(六甲) → 遁仪干
  const XUN_MAP = {
    '甲子': '戊', '甲戌': '己', '甲申': '庚',
    '甲午': '辛', '甲辰': '壬', '甲寅': '癸'
  };

  // ==================== 节气定局 ====================
  // 阳遁: 冬至→芒种 (1-9局)
  // 阴遁: 夏至→大雪 (1-9局)
  // 格式: [上元, 中元, 下元]
  const SOLAR_TERM_JU = {
    // 阳遁
    '冬至': [1,7,4], '小寒': [2,8,5], '大寒': [3,9,6],
    '立春': [8,5,2], '雨水': [9,6,3], '惊蛰': [1,7,4],
    '春分': [3,9,6], '清明': [4,1,7], '谷雨': [5,2,8],
    '立夏': [4,1,7], '小满': [5,2,8], '芒种': [6,3,9],
    // 阴遁
    '夏至': [9,3,6], '小暑': [8,2,5], '大暑': [7,1,4],
    '立秋': [2,5,8], '处暑': [1,4,7], '白露': [9,3,6],
    '秋分': [7,1,4], '寒露': [6,9,3], '霜降': [5,8,2],
    '立冬': [6,9,3], '小雪': [5,8,2], '大雪': [4,7,1]
  };

  // 阳遁/阴遁判断
  function isYangDun(termName) {
    const yangTerms = ['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种'];
    return yangTerms.includes(termName);
  }

  // ==================== 三元计算 ====================
  // 一个节气15天，分上中下三元，每元5天
  // 甲己日为上元, 具体看干支

  function getYuan(dayGanzhiIndex) {
    // dayGanzhiIndex: 0-59 六十甲子序号
    // 甲子(0)→上元, 甲戌(10)→中元? 实际上看日干支:
    // 甲己日为上元头
    const gan = dayGanzhiIndex % 10;
    if (gan === 0) return 0; // 甲日: 上元第1天
    if (gan === 5) return 1; // 己日: 中元第1天
    // 简化: 前5天上元, 中5天中元, 后5天下元
    const dayInCycle = dayGanzhiIndex;
    if (dayInCycle % 15 < 5) return 0;   // 上元
    if (dayInCycle % 15 < 10) return 1;  // 中元
    return 2;                              // 下元
  }

  // ==================== 地盘: 六仪三奇排列 ====================

  /**
   * 阳遁: 顺排六仪三奇 (戊己庚辛壬癸 丁丙乙)
   * 阴遁: 逆排六仪三奇 (戊己庚辛壬癸 丁丙乙)
   * 局数=戊所在的宫位
   */
  function getDiPan(juNum, isYang) {
    const diPan = {}; // { 宫位: '天干' }
    const liuyiSanqi = ['戊','己','庚','辛','壬','癸','丁','丙','乙'];

    for (let i = 0; i < 9; i++) {
      let gong;
      if (isYang) {
        gong = ((juNum - 1 + i) % 9) + 1;
      } else {
        gong = ((juNum - 1 - i + 9) % 9) + 1;
      }
      diPan[gong] = liuyiSanqi[i];
    }
    return diPan;
  }

  // ==================== 天盘: 值符随时干 ====================

  /**
   * 天盘 = 地盘旋转, 使值符星落时干所在宫
   * 值符星: 由旬首(六甲)决定, 旬首对应的六仪在地盘的位置即值符
   */
  function getTianPan(diPan, xunShou, shiGan, zhiFuXing, isYang) {
    const tianPan = {}; // { 宫位: '天干' }

    // 值符(即旬首对应的六仪)在地盘的位置
    const zhiFuGan = XUN_MAP[xunShou]; // 旬首遁干
    let zhiFuGong = null;
    for (const [g, gan] of Object.entries(diPan)) {
      if (gan === zhiFuGan) { zhiFuGong = parseInt(g); break; }
    }

    // 时干在地盘的位置
    let shiGanGong = null;
    for (const [g, gan] of Object.entries(diPan)) {
      if (gan === shiGan) { shiGanGong = parseInt(g); break; }
    }

    if (!zhiFuGong || !shiGanGong) {
      // fallback: 返回地盘副本
      return { ...diPan };
    }

    // 旋转偏移量: 值符从zhiFuGong移到shiGanGong
    let offset;
    if (isYang) {
      offset = (shiGanGong - zhiFuGong + 9) % 9;
    } else {
      offset = (zhiFuGong - shiGanGong + 9) % 9;
    }

    // 旋转地盘得到天盘
    const ganList = [];
    for (let i = 1; i <= 9; i++) {
      ganList.push(diPan[i] || '');
    }
    // 旋转后
    const rotated = isYang
      ? [...ganList.slice(9-offset), ...ganList.slice(0, 9-offset)]
      : [...ganList.slice(offset), ...ganList.slice(0, offset)];

    for (let g = 1; g <= 9; g++) {
      tianPan[g] = rotated[g-1];
    }

    return tianPan;
  }

  // ==================== 人盘(八门): 值使随时支 ====================

  function getMenPan(juNum, isYang, xunShou, shiZhi, diPan) {
    const menPan = {}; // { 宫位: '门名' }

    // 值使门: 由旬首所在的宫位的原始门决定
    const zhiFuGan = XUN_MAP[xunShou];
    let zhiFuGong = null;
    for (const [g, gan] of Object.entries(diPan)) {
      if (gan === zhiFuGan) { zhiFuGong = parseInt(g); break; }
    }
    if (!zhiFuGong) return menPan;

    // 该宫的原始门
    const zhiShiMen = MEN[zhiFuGong - 1]; // 值使门名

    // 值使门在时支的序号
    const zhiIdx = parseInt(shiZhi); // 0-11
    // 阳遁顺数, 阴遁逆数
    const steps = isYang ? zhiIdx : (12 - zhiIdx) % 12;

    // 值使门从zhiFuGong开始, 走steps步
    const startGong = zhiFuGong;
    const menOriginArr = ['休','死','伤','杜','中','开','惊','生','景']; // 宫1-9对应

    for (let g = 1; g <= 9; g++) {
      if (g === 5) continue; // 中5宫跳过(寄坤2)
      const offset = isYang
        ? ((g - startGong + 9) % 9)
        : ((startGong - g + 9) % 9);
      const menIdx = offset % 8;
      menPan[g] = MEN_ORDER[menIdx] || '';
    }

    return menPan;
  }

  // 八门循环顺序
  const MEN_ORDER = ['休','生','伤','杜','景','死','惊','开'];

  // ==================== 神盘(八神) ====================

  function getShenPan(zhiFuXingGong, isYang) {
    const shenPan = {};
    const order = isYang ? SHEN_YANG : SHEN_YIN;

    for (let i = 0; i < 8; i++) {
      let gong;
      if (isYang) {
        gong = ((zhiFuXingGong - 1 + i) % 9) + 1;
      } else {
        gong = ((zhiFuXingGong - 1 - i + 9) % 9) + 1;
      }
      if (gong === 5) gong = isYang ? 2 : 8; // 阳遁寄坤, 阴遁寄艮
      shenPan[gong] = order[i % 8];
    }
    return shenPan;
  }

  // ==================== 九星排盘 ====================

  function getXingPan(diPan, zhiFuXing, isYang) {
    const xingPan = {};

    // 值符星原始宫位
    const zhiFuOrigin = XING_ORIGIN[zhiFuXing] || 1;

    // 值符星落宫(随天盘值符干)
    // 天盘值符干所在宫
    let targetGong = 1;
    // 简化: 值符星落地盘值符对应的天盘干位置
    // 实际: 值符星=天盘值符干所在宫的原始星
    // 先获取天盘值符干的位置然后旋转

    // 简化排法: 各星按九宫顺序旋转
    const xingList = ['天蓬','天芮','天冲','天辅','天禽','天心','天柱','天任','天英'];
    const offset = zhiFuOrigin - 1;

    for (let g = 1; g <= 9; g++) {
      const idx = isYang
        ? ((g - 1 - offset + 9) % 9)
        : ((g - 1 + offset) % 9);
      xingPan[g] = xingList[idx];
    }
    return xingPan;
  }

  // ==================== 主排盘函数 ====================

  /**
   * 时家奇门排盘
   * @param {Date} date - 公历日期时间
   * @param {object} pillars - 四柱八字 (从 lunar.js 获取)
   * @param {object} solarTerms - 当前节气信息
   * @returns {object} 完整排盘结果
   */
  function paiPan(date, pillars, solarTerms) {
    const result = {
      date: date.toISOString(),
      // 四柱
      year: pillars?.year?.ganzhi || '',
      month: pillars?.month?.ganzhi || '',
      day: pillars?.day?.ganzhi || '',
      hour: pillars?.hour?.ganzhi || '',
      // 定局
      dunType: '',       // '阳遁' or '阴遁'
      juNum: 0,          // 局数 1-9
      yuan: '',          // 上元/中元/下元
      // 旬首
      xunShou: '',       // 甲子/甲戌/...
      zhiFuGan: '',      // 值符干
      // 值符星
      zhiFuXing: '',     // 天蓬/天芮/...
      // 值使门
      zhiShiMen: '',     // 休/生/...
      // 各盘
      diPan: {},         // 地盘 { 宫位: '天干' }
      tianPan: {},       // 天盘
      menPan: {},        // 人盘(八门)
      xingPan: {},       // 九星
      shenPan: {},       // 八神
      // 九宫完整信息
      gongInfo: {}       // { 宫位: { 天干, 门, 星, 神, 宫名 } }
    };

    if (!pillars) return result;

    // 1. 确定节气 → 阴遁/阳遁 + 局数
    const terms = solarTerms || [];
    let currentTerm = null;
    // 找当前日期最近的"节"
    const m = date.getMonth() + 1, d = date.getDate();
    const targetMd = m * 100 + d;

    // 简化的节气判断——用月份估算
    const termMonthMap = {
      '冬至': [12,22], '小寒': [1,5], '大寒': [1,20], '立春': [2,4],
      '雨水': [2,19], '惊蛰': [3,5], '春分': [3,20], '清明': [4,5],
      '谷雨': [4,20], '立夏': [5,5], '小满': [5,21], '芒种': [6,5],
      '夏至': [6,21], '小暑': [7,7], '大暑': [7,22], '立秋': [8,7],
      '处暑': [8,23], '白露': [9,7], '秋分': [9,23], '寒露': [10,8],
      '霜降': [10,23], '立冬': [11,7], '小雪': [11,22], '大雪': [12,7]
    };

    // 找当前节气
    for (const [name, [tm, td]] of Object.entries(termMonthMap)) {
      const termMd = tm * 100 + td;
      if (targetMd >= termMd) {
        currentTerm = name;
      }
    }
    // 小寒 1月5日在冬至12月22日之前, 特殊处理
    if (targetMd < 105) { // 1月5日之前
      currentTerm = '冬至';
    }
    const termName = currentTerm || '夏至';

    // 定局
    const juData = SOLAR_TERM_JU[termName] || [1,7,4];
    const yang = isYangDun(termName);
    result.dunType = yang ? '阳遁' : '阴遁';

    // 三元: 基于日干支
    const dayGanzhi = pillars?.day?.cycleIndex || 0;
    const yuan = getYuan(dayGanzhi);
    result.juNum = juData[yuan];
    result.yuan = ['上元','中元','下元'][yuan];

    // 2. 旬首: 时柱天干倒推到甲
    const hourGan = pillars?.hour?.ganIndex || 0;
    const hourZhi = pillars?.hour?.zhiIndex || 0;
    // 时柱天干前推(g - zhi)找到甲
    const jiaOffset = (hourZhi - 0 + 12) % 12;
    const xunGanIdx = (hourGan - jiaOffset + 10) % 10;
    const xunZhiIdx = 0; // 旬首地支永远是子/戌/申/午/辰/寅
    // 实际旬首地支 = 时支所在的旬
    const xunZhiBase = [0, 10, 8, 6, 4, 2]; // 子/戌/申/午/辰/寅(旬首)
    let xunZhi = 0;
    for (const z of xunZhiBase) {
      if ((hourZhi - z + 12) % 12 < 10) {
        xunZhi = z; break;
      }
    }
    const xunShou = '甲' + ['子','寅','辰','午','申','戌'][xunZhiBase.indexOf(xunZhi)];
    result.xunShou = xunShou;

    // 值符干: 旬首的遁干
    result.zhiFuGan = XUN_MAP[xunShou] || '戊';

    // 3. 地盘
    const diPan = getDiPan(result.juNum, yang);
    result.diPan = diPan;

    // 4. 天盘
    const shiGan = GAN[hourGan];
    const tianPan = getTianPan(diPan, xunShou, shiGan, null, yang);
    result.tianPan = tianPan;

    // 5. 值符星: 旬首六仪所在宫的原始星
    let zhiFuGong = null;
    for (const [g, gan] of Object.entries(diPan)) {
      if (gan === result.zhiFuGan) { zhiFuGong = parseInt(g); break; }
    }
    if (zhiFuGong) {
      result.zhiFuXing = XING[zhiFuGong - 1];
      result.zhiFuGong = zhiFuGong;
    }

    // 6. 八门
    const menPan = getMenPan(result.juNum, yang, xunShou, pillars?.hour?.zhiIndex || 0, diPan);
    result.menPan = menPan;

    // 7. 九星
    if (result.zhiFuXing) {
      result.xingPan = getXingPan(diPan, result.zhiFuXing, yang);
    }

    // 8. 八神
    if (zhiFuGong) {
      result.shenPan = getShenPan(zhiFuGong, yang);
    }

    // 9. 组装九宫信息
    for (let g = 1; g <= 9; g++) {
      const info = {
        gong: g,
        name: GONG[g]?.name || '',
        trigram: GONG[g]?.trigram || '',
        diPan: diPan[g] || '',
        tianPan: tianPan[g] || '',
        men: menPan[g] || '',
        xing: result.xingPan[g] || '',
        shen: result.shenPan[g] || ''
      };
      result.gongInfo[g] = info;
    }

    return result;
  }

  // ==================== 简易排盘 (不需要完整四柱) ====================

  function quickPaiPan(date) {
    const hour = date.getHours();
    // 简易四柱
    const fakePillars = {
      year: { ganzhi: '甲子', ganIndex: 0, zhiIndex: 0 },
      month: { ganzhi: '甲子', ganIndex: 0, zhiIndex: 0 },
      day: { ganzhi: '甲子', ganIndex: 0, zhiIndex: 0, cycleIndex: 0 },
      hour: { ganzhi: GAN[hour%10] + ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'][Math.floor((hour+1)/2)%12],
        ganIndex: hour % 10, zhiIndex: Math.floor((hour+1)/2) % 12 }
    };
    return paiPan(date, fakePillars, null);
  }

  return { paiPan, quickPaiPan, GONG, MEN, XING, GAN };
})();

// 导出
if (typeof window !== 'undefined') window.QiMen = QiMen;
if (typeof module !== 'undefined') module.exports = QiMen;
