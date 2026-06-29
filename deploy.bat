@echo off
chcp 65001 >nul
title 万年历 + 锦衣卫 部署打包

echo ========================================
echo   万年历 + 锦衣卫 部署打包工具
echo   目标服务器: 123.207.204.92:2121
echo ========================================
echo.

set PACKAGE=deploy-package.zip
set SERVER=123.207.204.92
set PORT=2121

echo [1/3] 打包项目文件...
if exist %PACKAGE% del /q %PACKAGE%

powershell -Command "Compress-Archive -Path @(
  'server.js','package.json','package-lock.json','capacitor.config.ts',
  'admin','public','scripts','data',
  'android-config.xml','ios-config.plist'
) -DestinationPath '%PACKAGE%' -Force" 2>nul

if exist %PACKAGE% (
  echo   ✅ 打包完成: %PACKAGE%
) else (
  echo   ❌ 打包失败，使用7z或手动打包
  echo   手动打包: 将以下文件夹/文件打成zip:
  echo     server.js, package.json, admin/, public/, data/, scripts/
  goto :end
)

echo.
echo [2/3] 上传到服务器...
echo   ⚠️  需要手动上传 %PACKAGE% 到服务器
echo   使用 scp 命令:
echo     scp %PACKAGE% root@%SERVER%:/opt/perpetual-calendar/
echo.
echo   或使用 WinSCP/FileZilla 等工具上传

echo.
echo [3/3] 远程部署命令...
echo.
echo   1. SSH 连接到服务器:
echo      ssh root@%SERVER%
echo.
echo   2. 解压安装:
echo      cd /opt/perpetual-calendar
echo      unzip -o %PACKAGE%
echo      npm install --production
echo.
echo   3. 创建数据目录:
echo      mkdir -p data
echo.
echo   4. 启动服务:
echo      pkill -f 'node server.js' 2^> /dev/null
echo      nohup node server.js ^> /var/log/calendar-gps.log 2^>^&1 ^&
echo.
echo   5. 验证:
echo      curl http://localhost:%PORT%/api/admin/stats

echo.
echo ========================================
echo   部署完成后的访问地址:
echo   前端万年历: http://%SERVER%:%PORT%
echo   后台锦衣卫: http://%SERVER%:%PORT%/admin
echo   账号密码:   admin / jinyiwei888
echo ========================================

:end
pause
