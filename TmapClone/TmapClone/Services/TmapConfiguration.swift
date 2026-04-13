import Foundation

enum TmapConfiguration {
    static var appKey: String {
        let rawValue = Bundle.main.object(forInfoDictionaryKey: "TMAPAppKey") as? String ?? ""
        return rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var isConfigured: Bool {
        !appKey.isEmpty
    }
}
