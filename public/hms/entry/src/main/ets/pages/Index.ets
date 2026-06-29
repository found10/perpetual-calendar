/**
 * 鸿蒙 (HarmonyOS) ArkWeb 入口页面
 * 使用 Web 组件加载万年历GPS应用
 *
 * 构建方式:
 * 1. 安装 DevEco Studio
 * 2. 创建新项目 -> Empty Ability
 * 3. 将本文件复制到 entry/src/main/ets/pages/Index.ets
 * 4. 在 module.json5 中配置网络权限和定位权限
 * 5. 构建运行
 */

import web_webview from '@ohos.web.webview';
import geolocation from '@ohos.geoLocationManager';
import abilityAccessCtrl, { Permissions } from '@ohos.abilityAccessCtrl';

@Entry
@Component
struct CalendarGPSPage {
  controller: web_webview.WebviewController = new web_webview.WebviewController();
  @State loadingProgress: number = 0;

  aboutToAppear() {
    // 请求定位权限
    this.requestLocationPermission();
  }

  async requestLocationPermission() {
    try {
      const atManager = abilityAccessCtrl.createAtManager();
      const permissions: Array<Permissions> = [
        'ohos.permission.LOCATION',
        'ohos.permission.APPROXIMATELY_LOCATION',
        'ohos.permission.LOCATION_IN_BACKGROUND'
      ];
      const result = await atManager.requestPermissionsFromUser(getContext(), permissions);
      console.info('[鸿蒙] 定位权限请求结果:', JSON.stringify(result));
    } catch (err) {
      console.error('[鸿蒙] 权限请求失败:', JSON.stringify(err));
    }
  }

  build() {
    Column() {
      // 状态栏占位
      Row()
        .width('100%')
        .height('5%')
        .backgroundColor('#1a0a0a')

      // Web视图 - 加载万年历GPS应用
      Web({ src: 'http://123.207.204.92:2121', controller: this.controller })
        .width('100%')
        .height('95%')
        .javaScriptAccess(true)                    // 允许JS
        .domStorageAccess(true)                    // 允许本地存储
        .geolocationAccess(true)                   // 允许定位
        .onlineImageAccess(true)                   // 允许加载图片
        .mixedMode(MixedMode.All)                  // 允许混合内容
        .overviewModeAccess(true)                  // 允许缩放
        .onProgressChange((event) => {
          this.loadingProgress = event.newProgress;
        })
        // 注入JS接口: 让Web页面获取鸿蒙原生GPS数据
        .javaScriptProxy({
          object: {
            getNativeLocation: () => {
              try {
                const location = geolocation.getCurrentLocation();
                return JSON.stringify(location);
              } catch (err) {
                return JSON.stringify({ error: '定位失败' });
              }
            }
          },
          name: 'HarmonyOSBridge',
          methodList: ['getNativeLocation'],
          controller: this.controller
        })
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#1a0a0a')
  }
}
