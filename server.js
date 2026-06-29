const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const initSqlJs = require('sql.js');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = 2121;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'gps_tracks.db');
const ADMIN_DIR = path.join(__dirname, 'admin');

const GNSS_SYSTEMS = ['AUTO', 'GPS', 'BDS', 'GLONASS', 'GALILEO', 'QZSS', 'IRNSS'];
const DEFAULT_ADMIN = { username: 'admin', password: 'jinyiwei888' };

let db = null;
const deviceSockets = new Map();

// ==================== SQL.js 助手 ====================

// db.exec() 不支持参数! 需要手动构建带值SQL或使用 prepare
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function execute(sql, params = []) {
  db.run(sql, params);
}

function count(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  stmt.step();
  const val = stmt.get()[0];
  stmt.free();
  return val;
}

// ==================== 初始化 ====================

async function initDatabase() {
  const fs = require('fs');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('[DB] 已加载:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] 新数据库');
  }

  // 创建表
  execute(`CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, unique_id TEXT, lat REAL NOT NULL, lng REAL NOT NULL,
    alt REAL, speed REAL, heading REAL, accuracy REAL,
    gnss_system TEXT DEFAULT 'AUTO', platform TEXT DEFAULT 'web', background INTEGER DEFAULT 0,
    client_time TEXT, server_time TEXT DEFAULT (datetime('now','localtime')),
    created_at TEXT DEFAULT (datetime('now','localtime')))`);
  execute(`CREATE INDEX IF NOT EXISTS idx_time ON locations(server_time)`);
  execute(`CREATE INDEX IF NOT EXISTS idx_gnss ON locations(gnss_system)`);
  execute(`CREATE INDEX IF NOT EXISTS idx_locations_uid ON locations(unique_id)`);

  execute(`CREATE TABLE IF NOT EXISTS daily_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT, track_date TEXT NOT NULL, unique_id TEXT,
    gnss_system TEXT DEFAULT 'AUTO', point_count INTEGER DEFAULT 0,
    total_distance_km REAL DEFAULT 0, start_lat REAL, start_lng REAL,
    end_lat REAL, end_lng REAL, avg_speed REAL, max_speed REAL,
    start_time TEXT, end_time TEXT, created_at TEXT DEFAULT (datetime('now','localtime')))`);

  execute(`CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT, unique_id TEXT UNIQUE NOT NULL, device_name TEXT DEFAULT '',
    platform TEXT DEFAULT 'unknown', brand TEXT, model TEXT, os_version TEXT, imei TEXT,
    status TEXT DEFAULT 'online', last_seen TEXT DEFAULT (datetime('now','localtime')),
    last_lat REAL, last_lng REAL, total_reports INTEGER DEFAULT 0,
    paired_by TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime')))`);
  execute(`CREATE INDEX IF NOT EXISTS idx_devices_uid ON devices(unique_id)`);

  execute(`CREATE TABLE IF NOT EXISTS commands (
    id INTEGER PRIMARY KEY AUTOINCREMENT, target_device TEXT NOT NULL, command TEXT NOT NULL,
    params TEXT DEFAULT '{}', status TEXT DEFAULT 'pending', result TEXT,
    issued_by TEXT DEFAULT 'admin', issued_at TEXT DEFAULT (datetime('now','localtime')),
    executed_at TEXT, expires_at TEXT)`);
  execute(`CREATE INDEX IF NOT EXISTS idx_cmds_device ON commands(target_device)`);
  execute(`CREATE INDEX IF NOT EXISTS idx_cmds_status ON commands(status)`);

  execute(`CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT (datetime('now','localtime')))`);

  // ===== 会员充值表 =====
  execute(`CREATE TABLE IF NOT EXISTS memberships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER UNIQUE NOT NULL,
    level TEXT DEFAULT 'free',           -- free/basic/pro/enterprise
    status TEXT DEFAULT 'expired',       -- active/expired
    start_date TEXT,
    expire_date TEXT,
    total_days INTEGER DEFAULT 0,        -- 累计充值天数
    created_at TEXT DEFAULT (datetime('now','localtime')),
    updated_at TEXT DEFAULT (datetime('now','localtime'))
  )`);

  execute(`CREATE TABLE IF NOT EXISTS recharge_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NOT NULL,
    plan_name TEXT NOT NULL,              -- 套餐名称
    days INTEGER NOT NULL,                -- 充值天数
    amount REAL NOT NULL,                 -- 金额
    payment_method TEXT DEFAULT 'system', -- 支付方式
    remark TEXT,
    before_expire TEXT,                   -- 充值前到期时间
    after_expire TEXT,                    -- 充值后到期时间
    created_at TEXT DEFAULT (datetime('now','localtime'))
  )`);
  execute(`CREATE INDEX IF NOT EXISTS idx_recharge_admin ON recharge_records(admin_id)`);

  // 默认管理员
  const adm = queryOne("SELECT id FROM admins WHERE username='admin'");
  if (!adm) {
    const hash = crypto.createHash('sha256').update(DEFAULT_ADMIN.password).digest('hex');
    execute("INSERT INTO admins (username, password_hash, role) VALUES ('admin', ?, 'superadmin')", [hash]);
    console.log('[DB] 默认管理员: admin / ' + DEFAULT_ADMIN.password);

    // 为新管理员创建会员记录(默认过期)
    const newAdm = queryOne("SELECT id FROM admins WHERE username='admin'");
    if (newAdm) {
      execute(`INSERT INTO memberships (admin_id, level, status, start_date, expire_date)
        VALUES (?, 'basic', 'expired', datetime('now','localtime'), datetime('now','localtime'))`, [newAdm.id]);
    }
  } else {
    // 确保已有管理员都有会员记录
    const admins = queryAll("SELECT id FROM admins");
    for (const a of admins) {
      const memb = queryOne("SELECT id FROM memberships WHERE admin_id=?", [a.id]);
      if (!memb) {
        execute(`INSERT INTO memberships (admin_id, level, status, start_date, expire_date)
          VALUES (?, 'basic', 'expired', datetime('now','localtime'), datetime('now','localtime'))`, [a.id]);
      }
    }
  }

  saveDatabase();
  console.log('[DB] 初始化完成 (locations/devices/commands/admins/daily_tracks)');
  setInterval(saveDatabase, 30000);
}

function saveDatabase() {
  if (!db) return;
  try { require('fs').writeFileSync(DB_PATH, Buffer.from(db.export())); }
  catch (err) { console.error('[DB] 保存失败:', err.message); }
}

// ==================== 中间件 ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(ADMIN_DIR));

// ==================== 定位上报 ====================
app.post('/api/location', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { lat, lng, alt, speed, heading, accuracy, gnssSystem, uniqueId, platform, background, timestamp } = req.body;
  if (lat == null || lng == null) return res.status(400).json({ error: '缺少lat,lng' });

  const gnss = GNSS_SYSTEMS.includes(gnssSystem) ? gnssSystem : 'AUTO';
  const now = new Date().toISOString().replace('T',' ').slice(0,19);

  try {
    execute(
      `INSERT INTO locations (unique_id,lat,lng,alt,speed,heading,accuracy,gnss_system,platform,background,client_time,server_time)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [uniqueId||null, +lat.toFixed(6), +lng.toFixed(6),
       alt!=null?+alt.toFixed(1):null, speed!=null?+speed.toFixed(2):null,
       heading!=null?+heading.toFixed(1):null, accuracy!=null?+accuracy.toFixed(1):null,
       gnss, platform||'web', background?1:0, timestamp||null, now]
    );

    // 更新设备最后位置
    if (uniqueId) {
      execute("UPDATE devices SET last_lat=?, last_lng=?, last_seen=datetime('now','localtime'), total_reports=total_reports+1 WHERE unique_id=?",
        [+lat.toFixed(6), +lng.toFixed(6), uniqueId]);
    }

    const total = count('SELECT COUNT(*) FROM locations');
    console.log(`[定位] ${gnss} | ${lat},${lng} | 共${total}条`);
    res.json({ success: true, gnssSystem: gnss, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== 位置查询 ====================
app.get('/api/locations', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const limit = Math.min(+req.query.limit||50, 500);
    const system = req.query.system, date = req.query.date, uid = req.query.uniqueId;
    let wheres = [], params = [];

    if (system && GNSS_SYSTEMS.includes(system)) { wheres.push('gnss_system=?'); params.push(system); }
    if (date) { wheres.push("date(server_time)=?"); params.push(date); }
    if (uid) { wheres.push('unique_id=?'); params.push(uid); }

    const where = wheres.length > 0 ? ' WHERE ' + wheres.join(' AND ') : '';
    const rows = queryAll(`SELECT * FROM locations${where} ORDER BY server_time DESC LIMIT ?`, [...params, limit]);
    const total = count('SELECT COUNT(*) FROM locations');
    res.json({ total, limit: rows.length, records: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 路径追踪 ====================
app.get('/api/tracks', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const date = req.query.date || new Date().toISOString().slice(0,10);
    const uid = req.query.uniqueId;

    let sql = "SELECT * FROM locations WHERE date(server_time)=?";
    const params = [date];
    if (uid) { sql += ' AND unique_id=?'; params.push(uid); }
    sql += ' ORDER BY server_time ASC';

    const rows = queryAll(sql, params);
    const points = rows.map(r => ({ lat: r.lat, lng: r.lng, alt: r.alt, speed: r.speed, gnss: r.gnss_system, time: r.server_time }));
    const gnssStats = {};
    points.forEach(p => { gnssStats[p.gnss] = (gnssStats[p.gnss]||0)+1; });

    res.json({ date, totalPoints: points.length, gnssBreakdown: gnssStats, points });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== GNSS统计 ====================
app.get('/api/gnss-stats', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const total = count('SELECT COUNT(*) FROM locations');
    const rows = queryAll(`SELECT gnss_system, COUNT(*) as cnt, AVG(accuracy) as acc, AVG(speed) as spd
      FROM locations GROUP BY gnss_system ORDER BY cnt DESC`);
    const breakdown = rows.map(r => ({
      system: r.gnss_system, count: r.cnt,
      percentage: total>0?((r.cnt/total)*100).toFixed(1):0,
      avgAccuracy: r.acc?r.acc.toFixed(1):null, avgSpeed: r.spd?r.spd.toFixed(2):null
    }));
    res.json({ total, breakdown });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 每日统计 ====================
app.get('/api/daily-stats', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const limit = Math.min(+req.query.limit||30, 90);
    const rows = queryAll('SELECT * FROM daily_tracks ORDER BY track_date DESC LIMIT ?', [limit]);
    res.json({ total: rows.length, stats: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 唯一ID + QR码 ====================
app.get('/api/unique-id', (req, res) => {
  const platform = req.query.platform || 'unknown';
  const deviceHint = req.query.device || crypto.randomBytes(4).toString('hex');
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  const deviceHash = crypto.createHash('md5').update(deviceHint).digest('hex').slice(0,8).toUpperCase();
  const uniqueId = `CAL-${platform.toUpperCase().slice(0,1)}-${deviceHash}-${timestamp}-${random}`;
  res.json({ uniqueId, timestamp: Date.now(), platform, deviceHash });
});

app.get('/api/qrcode', async (req, res) => {
  try {
    const text = req.query.text || 'NO_DATA';
    const size = parseInt(req.query.size) || 280;
    const png = await QRCode.toBuffer(text, { width: size, margin: 2,
      color: { dark: '#C62828', light: '#FFF8E7' }, errorCorrectionLevel: 'M' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(png);
  } catch (err) { res.status(500).json({ error: 'QR生成失败' }); }
});

// ==================== 设备管理 ====================
app.post('/api/devices/register', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { uniqueId, platform, brand, model, osVersion, imei, deviceName } = req.body;
  if (!uniqueId) return res.status(400).json({ error: '缺少uniqueId' });

  try {
    const existing = queryOne('SELECT id FROM devices WHERE unique_id=?', [uniqueId]);
    if (existing) {
      execute(`UPDATE devices SET platform=?, brand=?, model=?, os_version=?, imei=?,
        status='online', last_seen=datetime('now','localtime'), updated_at=datetime('now','localtime')
        WHERE unique_id=?`, [platform||'unknown', brand||null, model||null, osVersion||null, imei||null, uniqueId]);
      res.json({ success: true, action: 'updated', uniqueId });
    } else {
      execute(`INSERT INTO devices (unique_id,device_name,platform,brand,model,os_version,imei,status,last_seen)
        VALUES (?,?,?,?,?,?,?,'online',datetime('now','localtime'))`,
        [uniqueId, deviceName||'', platform||'unknown', brand||null, model||null, osVersion||null, imei||null]);
      res.json({ success: true, action: 'registered', uniqueId });
    }
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

app.get('/api/devices', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const rows = queryAll(`SELECT d.*, (SELECT COUNT(*) FROM locations l WHERE l.unique_id=d.unique_id) as rc
      FROM devices d ORDER BY d.last_seen DESC`);
    res.json({ total: rows.length, devices: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/devices/:uniqueId', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const device = queryOne('SELECT * FROM devices WHERE unique_id=?', [req.params.uniqueId]);
    const tracks = queryAll('SELECT * FROM locations WHERE unique_id=? ORDER BY server_time DESC LIMIT 50', [req.params.uniqueId]);
    const pendingCmds = queryAll("SELECT * FROM commands WHERE target_device=? AND status IN ('pending','sent') ORDER BY issued_at DESC", [req.params.uniqueId]);
    res.json({ device, recentTracks: tracks, pendingCommands: pendingCmds });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/devices/:uniqueId', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { deviceName, status, notes } = req.body;
  try {
    execute(`UPDATE devices SET device_name=COALESCE(?,device_name), status=COALESCE(?,status),
      notes=COALESCE(?,notes), updated_at=datetime('now','localtime') WHERE unique_id=?`,
      [deviceName, status, notes, req.params.uniqueId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 远程命令 ====================
app.post('/api/commands', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { targetDevice, command, params, expiresIn } = req.body;
  if (!targetDevice || !command) return res.status(400).json({ error: '缺少参数' });

  const expiresAt = expiresIn ? new Date(Date.now()+expiresIn*1000).toISOString().replace('T',' ').slice(0,19) : null;
  try {
    execute(`INSERT INTO commands (target_device,command,params,expires_at) VALUES (?,?,?,?)`,
      [targetDevice, command, JSON.stringify(params||{}), expiresAt]);
    const row = queryOne('SELECT last_insert_rowid() as id');
    const id = row ? Object.values(row)[0] : 0;

    const socket = deviceSockets.get(targetDevice);
    if (socket) {
      socket.emit('command', { id, command, params: params || {} });
      execute("UPDATE commands SET status='sent' WHERE id=?", [id]);
    }
    console.log(`[命令] → ${targetDevice.slice(-12)}: ${command}`);
    res.json({ success: true, commandId: id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/commands/pending/:uniqueId', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const rows = queryAll(
      `SELECT * FROM commands WHERE target_device=? AND status IN ('pending','sent')
       AND (expires_at IS NULL OR expires_at > datetime('now','localtime'))
       ORDER BY issued_at ASC LIMIT 5`, [req.params.uniqueId]);
    const commands = rows.map(r => ({ id: r.id, command: r.command, params: JSON.parse(r.params||'{}') }));
    res.json({ commands });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/commands/ack', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { commandId, status, result } = req.body;
  try {
    execute(`UPDATE commands SET status=?, result=?, executed_at=datetime('now','localtime') WHERE id=?`,
      [status||'executed', JSON.stringify(result||{}), commandId]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 管理员认证 ====================
app.post('/api/admin/login', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { username, password } = req.body;
  const hash = crypto.createHash('sha256').update(password||'').digest('hex');
  const row = queryOne('SELECT * FROM admins WHERE username=? AND password_hash=?', [username, hash]);
  if (row) {
    const token = crypto.randomBytes(32).toString('hex');
    res.json({ success: true, token, username, role: row.role });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// ==================== 统计面板 ====================
app.get('/api/admin/stats', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    res.json({
      totalDevices: count('SELECT COUNT(*) FROM devices'),
      onlineDevices: count("SELECT COUNT(*) FROM devices WHERE status='online'"),
      totalReports: count('SELECT COUNT(*) FROM locations'),
      pendingCmds: count("SELECT COUNT(*) FROM commands WHERE status IN ('pending','sent')"),
      todayReports: count("SELECT COUNT(*) FROM locations WHERE date(server_time)=date('now','localtime')")
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== 会员充值 API ====================

// 充值套餐定义
const RECHARGE_PLANS = {
  'monthly':   { name: '月卡', days: 30,  amount: 29.9  },
  'quarterly': { name: '季卡', days: 90,  amount: 79.9  },
  'biannual':  { name: '半年卡', days: 180, amount: 139.9 },
  'yearly':    { name: '年卡', days: 365, amount: 249.9 },
  'lifetime':  { name: '永久卡', days: 36500, amount: 999.9 }
};

// GET /api/membership/status — 查询当前管理员会员状态
app.get('/api/membership/status', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  // 通过token识别管理员 (简化: 查第一个admin)
  const admin = queryOne("SELECT id, username FROM admins LIMIT 1");
  if (!admin) return res.status(404).json({ error: '管理员不存在' });

  const m = queryOne("SELECT * FROM memberships WHERE admin_id=?", [admin.id]);
  if (!m) {
    // 创建默认过期记录
    execute(`INSERT INTO memberships (admin_id, level, status, start_date, expire_date)
      VALUES (?, 'basic', 'expired', datetime('now','localtime'), datetime('now','localtime'))`, [admin.id]);
    return res.json({ status: 'expired', level: 'basic', expireDate: null, remainingDays: 0, isActive: false });
  }

  // 检查是否到期
  if (m.status === 'active' && m.expire_date) {
    const now = new Date().toISOString().replace('T',' ').slice(0,19);
    if (m.expire_date < now) {
      execute("UPDATE memberships SET status='expired', updated_at=datetime('now','localtime') WHERE id=?", [m.id]);
      m.status = 'expired';
    }
  }

  const now = new Date();
  const expireDate = m.expire_date ? new Date(m.expire_date.replace(' ','T')) : new Date();
  const remainingMs = expireDate - now;
  const remainingDays = m.status === 'active' ? Math.max(0, Math.ceil(remainingMs / 86400000)) : 0;

  res.json({
    status: m.status,
    level: m.level,
    startDate: m.start_date,
    expireDate: m.expire_date,
    remainingDays,
    totalDays: m.total_days,
    isActive: m.status === 'active'
  });
});

// GET /api/membership/plans — 充值套餐列表
app.get('/api/membership/plans', (req, res) => {
  res.json({ plans: RECHARGE_PLANS });
});

// POST /api/membership/recharge — 充值缴费
app.post('/api/membership/recharge', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  const { planKey, paymentMethod } = req.body;
  const plan = RECHARGE_PLANS[planKey];
  if (!plan) return res.status(400).json({ error: '无效套餐: ' + planKey });

  const admin = queryOne("SELECT id, username FROM admins LIMIT 1");
  if (!admin) return res.status(404).json({ error: '管理员不存在' });

  try {
    const now = new Date().toISOString().replace('T',' ').slice(0,19);
    let m = queryOne("SELECT * FROM memberships WHERE admin_id=?", [admin.id]);

    const beforeExpire = m?.expire_date || now;

    // 计算新的到期时间
    let newExpire;
    if (m && m.status === 'active' && m.expire_date > now) {
      // 已有有效会员: 在现有到期时间上叠加
      const currentExpire = new Date(m.expire_date.replace(' ','T'));
      newExpire = new Date(currentExpire.getTime() + plan.days * 86400000);
    } else {
      // 已过期或新会员: 从现在开始
      newExpire = new Date(Date.now() + plan.days * 86400000);
    }
    const newExpireStr = newExpire.toISOString().replace('T',' ').slice(0,19);

    // 更新会员状态
    execute(`UPDATE memberships SET
      level='basic', status='active',
      start_date=COALESCE(start_date, ?),
      expire_date=?, total_days=total_days+?,
      updated_at=datetime('now','localtime')
      WHERE admin_id=?`,
      [now, newExpireStr, plan.days, admin.id]);

    // 记录充值日志
    execute(`INSERT INTO recharge_records
      (admin_id, plan_name, days, amount, payment_method, remark, before_expire, after_expire)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [admin.id, plan.name, plan.days, plan.amount,
       paymentMethod||'system', planKey, beforeExpire, newExpireStr]);

    console.log(`[充值] ${admin.username} 充值${plan.name} ¥${plan.amount} → 到期${newExpireStr}`);
    res.json({
      success: true,
      plan: plan.name,
      days: plan.days,
      amount: plan.amount,
      newExpireDate: newExpireStr,
      remainingDays: plan.days + (m?.status==='active'? Math.max(0,Math.ceil((new Date(beforeExpire.replace(' ','T'))-new Date())/86400000)) : 0)
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/membership/recharge-history — 充值记录
app.get('/api/membership/recharge-history', (req, res) => {
  if (!db) return res.status(503).json({ error: 'DB未就绪' });
  try {
    const admin = queryOne("SELECT id FROM admins LIMIT 1");
    const rows = queryAll(
      "SELECT * FROM recharge_records WHERE admin_id=? ORDER BY created_at DESC LIMIT 50",
      [admin?.id || 1]);
    res.json({ total: rows.length, records: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==================== WebSocket ====================
io.on('connection', (socket) => {
  let deviceId = null;
  socket.on('register', (data) => {
    deviceId = data.uniqueId;
    if (deviceId) {
      deviceSockets.set(deviceId, socket);
      console.log('[WS] 上线:', deviceId.slice(-12));
      execute("UPDATE devices SET status='online', last_seen=datetime('now','localtime') WHERE unique_id=?", [deviceId]);
    }
  });
  socket.on('disconnect', () => {
    if (deviceId) {
      deviceSockets.delete(deviceId);
      console.log('[WS] 离线:', deviceId.slice(-12));
      execute("UPDATE devices SET status='offline' WHERE unique_id=?", [deviceId]);
    }
  });
});

// ==================== 启动 ====================
async function start() {
  await initDatabase();
  server.listen(PORT, '0.0.0.0', () => {
    console.log('========================================');
    console.log('  万年历(前端) + 锦衣卫(后台) 系统');
    console.log('  服务器: 123.207.204.92:' + PORT);
    console.log('  前端: http://123.207.204.92:' + PORT);
    console.log('  后台: http://123.207.204.92:' + PORT + '/admin');
    console.log('  账号: admin / jinyiwei888');
    console.log('========================================');
  });
}

process.on('SIGINT', () => { saveDatabase(); process.exit(); });
process.on('SIGTERM', () => { saveDatabase(); process.exit(); });

start().catch(err => { console.error('启动失败:', err); process.exit(1); });
