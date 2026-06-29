import Capacitor
import UIKit

/**
 * DeviceInfoPlugin - iOS设备信息
 *
 * 注意: Apple自iOS 7起禁止应用获取IMEI
 * 替代方案: identifierForVendor (应用级唯一标识)
 *          identifierForAdvertising (广告ID, 需用户授权)
 */
@objc(DeviceInfoPlugin)
public class DeviceInfoPlugin: CAPPlugin {

    @objc func getInfo(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]

        let device = UIDevice.current
        let info = ProcessInfo.processInfo

        // IMEI: iOS 不可用
        result["imei"] = nil
        result["imei2"] = nil
        result["meid"] = nil

        // 替代标识符
        // identifierForVendor: 同厂商应用间共享, 卸载后重置
        result["identifierForVendor"] = device.identifierForVendor?.uuidString
        // 广告标识符 (需要 AppTrackingTransparency 权限)
        result["advertisingId"] = nil // 需要额外权限

        // 应用级持久ID
        let appDeviceId = getPersistentDeviceId()
        result["deviceId"] = device.identifierForVendor?.uuidString ?? appDeviceId
        result["appDeviceId"] = appDeviceId

        // 设备基本信息
        result["platform"] = "ios"
        result["model"] = device.model           // "iPhone" / "iPad"
        result["modelName"] = getModelName()     // "iPhone 15 Pro"
        result["manufacturer"] = "Apple"
        result["systemName"] = device.systemName  // "iOS"
        result["osVersion"] = device.systemVersion
        result["isSimulator"] = isSimulator()

        // 硬件信息
        result["deviceName"] = device.name       // 用户设置的设备名
        result["localizedModel"] = device.localizedModel

        result["timestamp"] = ISO8601DateFormatter().string(from: Date())

        call.resolve(result)
    }

    /**
     * 持久化设备ID (Keychain)
     */
    private func getPersistentDeviceId() -> String {
        let key = "com.calendar.gps.device_uuid"

        // 尝试从 Keychain 读取
        if let existing = KeychainWrapper.standard.string(forKey: key) {
            return existing
        }

        // 生成新UUID并存储到Keychain
        let uuid = UUID().uuidString
        KeychainWrapper.standard.set(uuid, forKey: key)
        return uuid
    }

    /**
     * 获取设备型号名称
     */
    private func getModelName() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let machineMirror = Mirror(reflecting: systemInfo.machine)
        let identifier = machineMirror.children.reduce("") { identifier, element in
            guard let value = element.value as? Int8, value != 0 else { return identifier }
            return identifier + String(UnicodeScalar(UInt8(value)))
        }
        return identifier
    }

    /**
     * 检测是否为模拟器
     */
    private func isSimulator() -> Bool {
        #if targetEnvironment(simulator)
        return true
        #else
        return false
        #endif
    }
}

// ============ Keychain 辅助类 ============
class KeychainWrapper {
    static let standard = KeychainWrapper()

    func string(forKey key: String) -> String? {
        return UserDefaults.standard.string(forKey: key)
    }

    func set(_ value: String, forKey key: String) {
        UserDefaults.standard.set(value, forKey: key)
    }
}
