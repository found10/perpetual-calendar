package com.calendar.gps;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.telephony.TelephonyManager;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.TimeZone;
import java.util.UUID;

public class DeviceInfoPlugin extends Plugin {

    private static final String PREFS_NAME = "DeviceInfoPrefs";
    private static final String KEY_UUID = "device_uuid";

    @PluginMethod
    public void getInfo(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        try {
            TelephonyManager tm = (TelephonyManager)
                context.getSystemService(Context.TELEPHONY_SERVICE);

            String imei = null;
            String imei2 = null;
            String meid = null;

            // 尝试获取 IMEI (Android 9 及以下可获取)
            if (tm != null &&
                ActivityCompat.checkSelfPermission(context,
                    Manifest.permission.READ_PHONE_STATE) == PackageManager.PERMISSION_GRANTED) {

                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        imei = tm.getImei(0);      // 卡槽1
                        try { imei2 = tm.getImei(1); } catch (Exception e) {}
                        try { meid = tm.getMeid(); } catch (Exception e) {}
                    }
                    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.P) {
                        if (imei == null) imei = tm.getDeviceId();
                    }
                } catch (SecurityException e) {
                    // Android 10+ 权限不足
                } catch (Exception e) {
                    // 获取失败
                }
            }

            // 降级方案: Android ID / App UUID
            String androidId = null;
            try {
                androidId = Settings.Secure.getString(
                    context.getContentResolver(), Settings.Secure.ANDROID_ID);
            } catch (Exception e) {}

            String appDeviceId = getPersistentDeviceId(context);

            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));

            result.put("imei", imei);
            result.put("imei2", imei2);
            result.put("meid", meid);
            result.put("deviceId", imei != null ? imei : (androidId != null ? androidId : appDeviceId));
            result.put("androidId", androidId);
            result.put("appDeviceId", appDeviceId);
            result.put("platform", "android");
            result.put("model", Build.MODEL);
            result.put("manufacturer", Build.MANUFACTURER);
            result.put("brand", Build.BRAND);
            result.put("osVersion", Build.VERSION.RELEASE);
            result.put("sdkVersion", Build.VERSION.SDK_INT);
            result.put("isEmulator", isEmulator());
            result.put("timestamp", sdf.format(new Date()));

            call.resolve(result);

        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("error", e.getMessage());
            call.reject("DEVICE_INFO_ERROR", e.getMessage(), err);
        }
    }

    private String getPersistentDeviceId(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String uuid = prefs.getString(KEY_UUID, null);
        if (uuid == null) {
            uuid = "android-" + UUID.randomUUID().toString();
            prefs.edit().putString(KEY_UUID, uuid).apply();
        }
        return uuid;
    }

    private boolean isEmulator() {
        return (Build.FINGERPRINT != null && Build.FINGERPRINT.startsWith("generic"))
            || (Build.FINGERPRINT != null && Build.FINGERPRINT.startsWith("unknown"))
            || (Build.MODEL != null && Build.MODEL.contains("google_sdk"))
            || (Build.MODEL != null && Build.MODEL.contains("Emulator"))
            || (Build.MODEL != null && Build.MODEL.contains("Android SDK built for x86"))
            || (Build.MANUFACTURER != null && Build.MANUFACTURER.contains("Genymotion"))
            || (Build.BRAND != null && Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(Build.PRODUCT);
    }
}
