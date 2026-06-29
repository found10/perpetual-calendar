import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.calendar.gps',
  appName: '万年历GPS',
  webDir: 'public',
  server: {
    // 开发时可指向本地服务端，生产构建时注释掉
    cleartext: true,
    androidScheme: 'https',
  },
  plugins: {
    // 后台定位配置
    Geolocation: {
      // Android 后台定位权限 (Android 10+)
      permissions: ['android.permission.ACCESS_FINE_LOCATION',
                    'android.permission.ACCESS_COARSE_LOCATION',
                    'android.permission.ACCESS_BACKGROUND_LOCATION',
                    'android.permission.FOREGROUND_SERVICE'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_calendar',
      iconColor: '#C62828',
    }
  },
  // iOS 配置
  ios: {
    contentInset: 'automatic',
    scheme: 'CalendarGPS',
    // 后台模式在 Xcode 中配置: Background Modes > Location updates
  },
  // Android 配置
  android: {
    allowMixedContent: true,
    captureInput: true,
    // 后台服务配置
    backgroundColor: '#C62828',
  }
};

export default config;
