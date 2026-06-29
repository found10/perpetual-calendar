# 万年历 + 锦衣卫 部署指南

## 目标服务器
- **IP**: `123.207.204.92`
- **端口**: `2121`
- **系统**: Linux (Ubuntu/CentOS)

## 快速部署 (3步)

### 步骤1: 上传部署包
```bash
# 将 deploy-package.zip 上传到服务器
scp deploy-package.zip root@123.207.204.92:/opt/
```

### 步骤2: SSH连接并安装
```bash
ssh root@123.207.204.92

# 解压
cd /opt
unzip -o deploy-package.zip -d perpetual-calendar
cd perpetual-calendar

# 安装依赖
npm install --production

# 创建数据目录
mkdir -p data
```

### 步骤3: 启动服务
```bash
# 停止旧进程 (如有)
pkill -f 'node server.js' 2>/dev/null || true

# 后台启动 (端口2121)
nohup node server.js > /var/log/calendar-gps.log 2>&1 &

# 验证
sleep 2
curl http://localhost:2121/api/admin/stats
```

## 防火墙配置

```bash
# 开放2121端口
firewall-cmd --add-port=2121/tcp --permanent && firewall-cmd --reload   # CentOS
# 或
ufw allow 2121/tcp                                                       # Ubuntu
```

## 访问地址

| 应用 | 地址 |
|------|------|
| 前端万年历 | `http://123.207.204.92:2121` |
| 后台锦衣卫 | `http://123.207.204.92:2121/admin` |
| 默认账号 | `admin` / `jinyiwei888` |

## 进程管理 (使用 PM2 推荐)

```bash
npm install -g pm2
pm2 start server.js --name calendar-gps -- --port 2121
pm2 save
pm2 startup
```

## 目录结构

```
/opt/perpetual-calendar/
├── server.js            # Node.js 服务端
├── package.json         # 依赖配置
├── admin/               # 锦衣卫后台
├── public/              # 万年历前端
├── data/                # SQLite 数据库
└── scripts/             # 工具脚本
```
