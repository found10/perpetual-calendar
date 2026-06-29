#!/bin/bash
# ============================================
#  万年历 + 锦衣卫 一键部署脚本
#  目标服务器: 123.207.204.92:2121
# ============================================
set -e

SERVER="123.207.204.92"
PORT="2121"
REMOTE_DIR="/opt/perpetual-calendar"
PACKAGE="deploy-package.tar.gz"

echo "========================================"
echo "  万年历 + 锦衣卫 部署脚本"
echo "  目标: ${SERVER}:${PORT}"
echo "========================================"

# 1. 打包项目
echo ""
echo "[1/4] 打包项目文件..."
tar -czf "$PACKAGE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.db' \
  --exclude='android/app/build' \
  --exclude='ios/App/Pods' \
  --exclude='*.log' \
  --exclude='deploy-package.tar.gz' \
  server.js \
  package.json \
  package-lock.json \
  capacitor.config.ts \
  admin/ \
  public/ \
  scripts/ \
  data/ \
  android-config.xml \
  ios-config.plist \
  2>/dev/null

echo "  ✅ 打包完成: $PACKAGE ($(du -h $PACKAGE | cut -f1))"

# 2. 上传到服务器
echo ""
echo "[2/4] 上传到 $SERVER ..."
scp -P 22 "$PACKAGE" "root@${SERVER}:${REMOTE_DIR}/" 2>/dev/null && echo "  ✅ 上传成功" || {
  echo "  ⚠️  scp上传失败，请手动上传 $PACKAGE 到服务器 $SERVER:$REMOTE_DIR/"
  echo "  手动上传命令: scp $PACKAGE root@${SERVER}:${REMOTE_DIR}/"
}

# 3. 远程安装
echo ""
echo "[3/4] 远程安装依赖..."
ssh root@${SERVER} "cd ${REMOTE_DIR} && tar -xzf $PACKAGE && npm install --production" 2>/dev/null && echo "  ✅ 依赖安装完成" || {
  echo "  ⚠️  SSH连接失败，请手动执行:"
  echo "     ssh root@${SERVER}"
  echo "     cd ${REMOTE_DIR}"
  echo "     tar -xzf $PACKAGE"
  echo "     npm install --production"
}

# 4. 启动服务
echo ""
echo "[4/4] 启动服务 (端口 $PORT)..."
ssh root@${SERVER} "cd ${REMOTE_DIR} && \
  mkdir -p data && \
  pkill -f 'node server.js' 2>/dev/null; \
  nohup node server.js > /var/log/calendar-gps.log 2>&1 & \
  sleep 2 && \
  curl -s -o /dev/null -w '%{http_code}' http://localhost:${PORT}/" 2>/dev/null && echo "  ✅ 服务已启动" || {
  echo "  ⚠️  请手动启动:"
  echo "     ssh root@${SERVER}"
  echo "     cd ${REMOTE_DIR}"
  echo "     mkdir -p data"
  echo "     pkill -f 'node server.js' || true"
  echo "     nohup node server.js > /var/log/calendar-gps.log 2>&1 &"
}

# 5. 验证
echo ""
echo "========================================"
echo "  验证部署"
echo "========================================"
echo "  前端: http://${SERVER}:${PORT}"
echo "  后台: http://${SERVER}:${PORT}/admin"
echo "  账号: admin / jinyiwei888"
echo ""
echo "  验证命令:"
echo "    curl http://${SERVER}:${PORT}/api/admin/stats"
echo "========================================"

# 清理本地包
rm -f "$PACKAGE"
echo "  本地临时包已清理"
