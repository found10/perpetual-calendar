/**
 * 锦衣卫 · 设备后台管理系统
 * 含: 登录 / 会员充值 / 过期拦截 / 设备管理 / 扫码关联 / 远程控制
 */

let token = '', devices = [], selectedPlan = null;
let currentStream = null, scanActive = false, animationId = null;
let membershipActive = false;

// ==================== 登录 ====================

async function doLogin() {
  const username = document.getElementById('loginUser').value;
  const password = document.getElementById('loginPass').value;
  const errEl = document.getElementById('loginError');
  try {
    const resp = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (resp.ok) {
      const data = await resp.json();
      token = data.token;
      sessionStorage.setItem('jinyiwei_token', token);
      document.getElementById('adminName').textContent = data.username;
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('appMain').classList.add('visible');
      initApp();
    } else { errEl.style.display = 'block'; }
  } catch (e) { errEl.style.display = 'block'; }
}

function logout() {
  token = '';
  sessionStorage.removeItem('jinyiwei_token');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appMain').classList.remove('visible');
  stopScan();
}

// ==================== 初始化 ====================

async function initApp() {
  const saved = sessionStorage.getItem('jinyiwei_token');
  if (saved) { token = saved; document.getElementById('loginScreen').style.display = 'none'; document.getElementById('appMain').classList.add('visible'); }

  // 检查会员状态
  await checkMembership();

  if (membershipActive) {
    refreshAll();
    setInterval(refreshAll, 10000);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('jinyiwei_token');
  if (saved) { token = saved; document.getElementById('loginScreen').style.display = 'none'; document.getElementById('appMain').classList.add('visible'); initApp(); }
});

// ==================== 会员状态 ====================

async function checkMembership() {
  try {
    const resp = await fetch('/api/membership/status');
    if (!resp.ok) { membershipActive = false; updateMemberUI(); return; }
    const m = await resp.json();
    membershipActive = m.isActive;
    updateMemberUI(m);
    toggleExpiredOverlay(!m.isActive);
    return m;
  } catch (e) {
    membershipActive = false;
    updateMemberUI();
    toggleExpiredOverlay(true);
  }
}

function updateMemberUI(m) {
  const badge = document.getElementById('memberBadge');
  const remain = document.getElementById('memberRemaining');
  if (!badge) return;

  if (m && m.isActive) {
    badge.className = 'member-badge active';
    badge.textContent = '👑 会员已激活';
    if (remain) remain.textContent = '剩余 ' + m.remainingDays + ' 天';
  } else {
    badge.className = 'member-badge expired';
    badge.textContent = m ? '❌ 已过期' : '⏳ 加载中...';
    if (remain) remain.textContent = '';
  }
}

function toggleExpiredOverlay(show) {
  const overlay = document.getElementById('expiredOverlay');
  if (show) {
    overlay.classList.remove('hidden');
    // 停止数据刷新
  } else {
    overlay.classList.add('hidden');
    refreshAll();
  }
}

// ==================== 充值页面 ====================

async function openRecharge() {
  document.getElementById('rechargePage').classList.add('show');
  selectedPlan = null;
  document.getElementById('btnConfirmRecharge').textContent = '💳 请选择套餐';

  // 加载套餐
  try {
    const resp = await fetch('/api/membership/plans');
    if (resp.ok) {
      const data = await resp.json();
      const grid = document.getElementById('plansGrid');
      const plans = data.plans;
      const bestPlan = 'biannual';

      grid.innerHTML = Object.entries(plans).map(([key, p]) => `
        <div class="plan-card" data-plan="${key}" onclick="selectPlan('${key}')">
          <div class="plan-name">${p.name}</div>
          <div class="plan-days">${p.days}天</div>
          <div class="plan-price">¥${p.amount}<span>/${p.days>=365?'永久':p.days+'天'}</span></div>
          ${p.days >= 365 ? '<div class="plan-days">¥'+(p.amount/365).toFixed(2)+'/天</div>' : '<div class="plan-days">¥'+(p.amount/p.days).toFixed(2)+'/天</div>'}
          ${key === bestPlan ? '<span class="plan-tag best">推荐</span>' : ''}
        </div>
      `).join('');

      // 默认选中月卡
      selectPlan('monthly');
    }
  } catch (e) { console.error('加载套餐失败:', e); }

  // 加载充值记录
  loadRechargeHistory();
}

function selectPlan(key) {
  selectedPlan = key;
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.plan-card[data-plan="${key}"]`);
  if (card) card.classList.add('selected');
  const btn = document.getElementById('btnConfirmRecharge');
  btn.textContent = '💳 确认充值';
}

function closeRecharge() {
  document.getElementById('rechargePage').classList.remove('show');
  checkMembership(); // 重新检查会员状态
}

async function doRecharge() {
  if (!selectedPlan) return alert('请选择充值套餐');
  const btn = document.getElementById('btnConfirmRecharge');
  btn.textContent = '处理中...';
  btn.disabled = true;

  try {
    const resp = await fetch('/api/membership/recharge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey: selectedPlan, paymentMethod: 'system' })
    });
    if (resp.ok) {
      const r = await resp.json();
      alert('✅ 充值成功!\n\n套餐: ' + r.plan + '\n天数: ' + r.days + '天\n金额: ¥' + r.amount + '\n到期: ' + r.newExpireDate + '\n剩余: ' + r.remainingDays + '天');
      await checkMembership();
      toggleExpiredOverlay(!membershipActive);
      if (membershipActive) refreshAll();
      loadRechargeHistory();
    } else {
      const err = await resp.json();
      alert('充值失败: ' + err.error);
    }
  } catch (e) {
    alert('充值失败: ' + e.message);
  } finally {
    btn.textContent = '💳 确认充值';
    btn.disabled = false;
  }
}

async function loadRechargeHistory() {
  try {
    const resp = await fetch('/api/membership/recharge-history');
    if (!resp.ok) return;
    const data = await resp.json();
    const el = document.getElementById('rechargeHistory');
    if (data.records.length === 0) {
      el.innerHTML = '<div style="color:#666;text-align:center;padding:12px">暂无充值记录</div>';
      return;
    }
    el.innerHTML = `<table class="history-table"><thead><tr>
      <th>时间</th><th>套餐</th><th>天数</th><th>金额</th><th>充值前到期</th><th>充值后到期</th>
    </tr></thead><tbody>` + data.records.map(r => `
      <tr>
        <td>${(r.created_at||'').slice(0,16)}</td>
        <td>${r.plan_name}</td>
        <td>${r.days}天</td>
        <td style="color:var(--gold);font-weight:700">¥${r.amount}</td>
        <td style="font-size:10px">${(r.before_expire||'--').slice(0,16)}</td>
        <td style="font-size:10px;color:var(--green)">${(r.after_expire||'--').slice(0,16)}</td>
      </tr>`).join('') + '</tbody></table>';
  } catch(e){}
}

// ==================== 设备管理 (需会员) ====================

async function refreshAll() {
  if (!membershipActive) return;
  await Promise.all([refreshStats(), refreshDevices()]);
}

async function refreshStats() {
  try {
    const resp = await fetch('/api/admin/stats');
    if (!resp.ok) return;
    const d = await resp.json();
    document.getElementById('stat-devices').textContent = d.totalDevices;
    document.getElementById('stat-online').textContent = d.onlineDevices;
    document.getElementById('stat-reports').textContent = d.totalReports;
    document.getElementById('stat-cmds').textContent = d.pendingCmds;
  } catch(e){}
}

async function refreshDevices() {
  try {
    const resp = await fetch('/api/devices');
    if (!resp.ok) return;
    const data = await resp.json();
    devices = data.devices;
    const sel = document.getElementById('cmdTarget');
    const cv = sel.value;
    sel.innerHTML = '<option value="">选择设备...</option>';
    devices.forEach(d => {
      const o = document.createElement('option');
      o.value = d.unique_id;
      o.textContent = (d.device_name || d.unique_id?.slice(-8)) + ' [' + d.platform + ']';
      sel.appendChild(o);
    });
    sel.value = cv;

    const tbody = document.getElementById('deviceTable');
    if (devices.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="color:#666;text-align:center;padding:20px">暂无设备，用扫码关联</td></tr>';
      return;
    }
    tbody.innerHTML = devices.map(d => `
      <tr>
        <td><strong>${d.device_name||'--'}</strong><br><span style="font-size:10px;color:#888">${(d.unique_id||'').slice(0,16)}</span></td>
        <td>${d.platform}</td>
        <td style="font-size:11px;font-family:monospace">${d.imei?d.imei.slice(0,8)+'...':'--'}</td>
        <td><span class="badge ${d.status}">${d.status==='online'?'在线':'离线'}</span></td>
        <td>${d.rc||d.total_reports||0}</td>
        <td style="font-size:11px">${(d.last_seen||'--').slice(0,16)}</td>
        <td><button class="btn sm orange" onclick="quickCmd('${d.unique_id}','report_now')">定位</button></td>
      </tr>`).join('');
  } catch(e){}
}

// ==================== QR 扫码 ====================

async function startScan() {
  if (!membershipActive) return alert('会员已过期，请先充值');
  if (scanActive) return;
  try {
    currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: 640, height: 480 } });
    const area = document.getElementById('scannerArea');
    const ov = area.querySelector('video'); if (ov) ov.remove();
    const video = document.createElement('video');
    video.srcObject = currentStream; video.setAttribute('playsinline', 'true');
    video.style.cssText = 'width:100%;height:100%;object-fit:cover';
    area.appendChild(video); video.play();
    scanActive = true;
    document.getElementById('btnStartScan').style.display = 'none';
    document.getElementById('btnStopScan').style.display = 'inline-block';

    const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
    function tick() {
      if (!scanActive) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code && code.data) { onQRScanned(code.data); stopScan(); return; }
      }
      animationId = requestAnimationFrame(tick);
    }
    tick();
  } catch (e) { alert('摄像头权限被拒绝: ' + e.message); stopScan(); }
}

function stopScan() {
  scanActive = false;
  if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
  if (currentStream) { currentStream.getTracks().forEach(t => t.stop()); currentStream = null; }
  document.getElementById('btnStartScan').style.display = 'inline-block';
  document.getElementById('btnStopScan').style.display = 'none';
  const v = document.getElementById('scannerArea').querySelector('video'); if (v) v.remove();
}

async function onQRScanned(data) {
  const uid = data.trim();
  document.getElementById('scanResult').style.display = 'block';
  document.getElementById('scanResult').style.background = 'rgba(34,197,94,.1)';
  document.getElementById('scanResult').style.border = '1px solid var(--green)';
  document.getElementById('scanResult').style.color = 'var(--green)';
  document.getElementById('scanResult').textContent = '✅ 已扫描: ' + uid.slice(0,30) + '...';
  try {
    await fetch('/api/devices/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uniqueId: uid, platform: 'linked', deviceName: '扫码关联设备' })
    });
    addCmdLog('扫码关联: ' + uid.slice(-12), 'ok');
    refreshAll();
  } catch(e){ addCmdLog('关联失败', 'fail'); }
}

// ==================== 远程控制 ====================

async function sendCommand() {
  if (!membershipActive) return alert('会员已过期');
  const target = document.getElementById('cmdTarget').value;
  const command = document.getElementById('cmdType').value;
  const params = document.getElementById('cmdParams').value;
  if (!target) return alert('请选择设备');
  try {
    let p = {};
    if (params) { try { p = JSON.parse(params); } catch { p = { value: params }; } }
    const resp = await fetch('/api/commands', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetDevice: target, command, params: p, expiresIn: 300 })
    });
    if (resp.ok) {
      const r = await resp.json();
      addCmdLog('命令 #' + r.commandId + ' → ' + target.slice(-8) + ': ' + command, 'ok');
      document.getElementById('cmdParams').value = '';
      refreshStats();
    }
  } catch(e){ addCmdLog('错误: ' + e.message, 'fail'); }
}

function quickCmd(deviceId, command) {
  document.getElementById('cmdTarget').value = deviceId;
  document.getElementById('cmdType').value = command;
  document.getElementById('cmdParams').value = '';
  sendCommand();
}

function addCmdLog(msg, type) {
  const log = document.getElementById('cmdLog');
  const d = document.createElement('div');
  d.style.color = type === 'ok' ? 'var(--green)' : type === 'fail' ? 'var(--accent)' : 'var(--orange)';
  d.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
  log.insertBefore(d, log.firstChild);
  if (log.children.length > 50) log.lastChild.remove();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('loginScreen').style.display !== 'none') doLogin();
});
