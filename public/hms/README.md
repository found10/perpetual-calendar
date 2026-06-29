# 鸿蒙 (HarmonyOS) 适配指南

## 方案一：ArkWeb 内嵌 (推荐)

使用鸿蒙的 Web 组件加载万年历GPS网页，简单快速。

### 步骤

1. 安装 **DevEco Studio** (华为官方IDE)
2. 新建项目: `File > New > Create Project > Empty Ability`
3. 复制本目录下的文件到项目对应位置:
   - `entry/src/main/ets/pages/Index.ets` → 替换主页
4. 在 `entry/src/main/module.json5` 中添加权限:

```json5
{
  "module": {
    "requestPermissions": [
      {
        "name": "ohos.permission.LOCATION",
        "reason": "$string:location_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "always"
        }
      },
      {
        "name": "ohos.permission.LOCATION_IN_BACKGROUND",
        "reason": "$string:background_location_reason",
        "usedScene": {
          "abilities": ["EntryAbility"],
          "when": "always"
        }
      },
      {
        "name": "ohos.permission.APPROXIMATELY_LOCATION",
        "reason": "$string:location_reason"
      },
      {
        "name": "ohos.permission.INTERNET"
      }
    ]
  }
}
```

5. 在 `entry/src/main/resources/base/element/string.json` 添加描述
6. 修改 `Index.ets` 中的服务器地址为实际IP
7. 连接鸿蒙设备，点击 Run 构建运行

## 方案二：PWA 安装

鸿蒙系统支持 PWA 安装到桌面：
1. 用鸿蒙浏览器打开 `http://123.207.204.92:2121`
2. 浏览器菜单 → "添加到桌面"
3. 获得类原生体验，GPS/通知均可用

## 方案三：Capacitor HarmonyOS 插件

社区有 `capacitor-harmonyos` 插件，可编译为原生鸿蒙应用。
详见: https://github.com/ionic-team/capacitor-plugins
