import Foundation
import MapKit

// MARK: - Driver Profile

enum DriverProfile: String, CaseIterable, Identifiable {
    case beginner = "초보"
    case intermediate = "중수"
    case expert = "고수"

    var id: String { rawValue }

    var description: String {
        switch self {
        case .beginner:
            return "합류 지점이 적고 단순한 경로를 우선합니다."
        case .intermediate:
            return "조금 더 유연하게, 정체가 적은 경로를 함께 탐색합니다."
        case .expert:
            return "합류가 많거나 복잡한 길도 포함해 흐름 좋은 경로를 넓게 탐색합니다."
        }
    }
}

// MARK: - Route Preferences

struct RoutePreferences {
    var preferHighway: Bool = true          // 해당도로 선호
    var preferMountainRoad: Bool = false    // 산길도로 선호
    var allowNarrowRoad: Bool = false       // 좁은 길 포함
}

// MARK: - Layer Visibility

struct LayerVisibility {
    var showMergePoints: Bool = true
    var showSpeedCameras: Bool = true
    var showSectionEnforcement: Bool = true
    var showSpeedLimits: Bool = false
    var showHighwayMarkers: Bool = false
}

// MARK: - Route Summary

struct RouteSummary: Identifiable {
    let id = UUID()
    let routeIndex: Int
    let title: String
    let explanation: String
    let eta: Double              // seconds
    let distance: Double         // meters
    let highwayRatio: Double     // 0.0 ~ 1.0
    let nationalRoadRatio: Double
    let mergeCount: Int
    let congestionScore: Int     // 1 (원활) ~ 5 (극심)
    let fixedCameraCount: Int
    let sectionCameraCount: Int
    let sectionEnforcementKm: Double
    let dominantSpeedLimit: Int
    var mkRoute: MKRoute?

    var etaText: String {
        let total = Int(eta)
        let h = total / 3600
        let m = (total % 3600) / 60
        if h > 0 { return "\(h)시간 \(m)분" }
        return "\(m)분"
    }

    var distanceText: String {
        if distance >= 1000 { return String(format: "%.1fkm", distance / 1000) }
        return "\(Int(distance))m"
    }

    var congestionLabel: String {
        switch congestionScore {
        case 1: return "원활"
        case 2: return "서행"
        case 3: return "혼잡"
        case 4: return "정체"
        default: return "극심"
        }
    }

    var totalCameraCount: Int { fixedCameraCount + sectionCameraCount }
}

// MARK: - Merge Option

struct MergeOption: Identifiable {
    let id = UUID()
    let name: String
    let coordinate: CLLocationCoordinate2D
    let distanceFromCurrent: Double  // meters
    let addedTime: Double            // seconds (negative = saves time)
    let congestionDelta: Int         // -2 (better) to +2 (worse)
    let fixedCameraCount: Int
    let sectionCameraCount: Int
    let dominantSpeedLimit: Int
    let note: String

    var distanceText: String {
        if distanceFromCurrent >= 1000 {
            return String(format: "%.1fkm 앞", distanceFromCurrent / 1000)
        }
        return "\(Int(distanceFromCurrent))m 앞"
    }

    var addedTimeText: String {
        let mins = Int(abs(addedTime) / 60)
        if addedTime > 60 { return "+\(mins)분" }
        if addedTime < -60 { return "-\(mins)분" }
        return "동일"
    }
}

// MARK: - Korean Highway

struct KoreanHighway: Identifiable {
    let id: String
    let name: String
    let shortName: String
    let routeNumber: String
    let start: CLLocationCoordinate2D
    let end: CLLocationCoordinate2D
    let startAddress: String
    let endAddress: String
    let approximateLengthKm: Int

    var mockCameras: [SpeedCamera] {
        let steps = max(3, approximateLengthKm / 40)
        return (0..<steps).map { i in
            let fraction = Double(i + 1) / Double(steps + 1)
            let lat = start.latitude + (end.latitude - start.latitude) * fraction
            let lon = start.longitude + (end.longitude - start.longitude) * fraction
            let type: SpeedCamera.CameraType = i % 3 == 0 ? .section : .fixed
            let limit = i % 4 == 0 ? 100 : 110
            return SpeedCamera(
                coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lon),
                speedLimit: limit,
                type: type
            )
        }
    }
}

extension KoreanHighway {
    static let all: [KoreanHighway] = [
        KoreanHighway(
            id: "1",
            name: "경부고속도로",
            shortName: "경부",
            routeNumber: "1",
            start: CLLocationCoordinate2D(latitude: 37.4867, longitude: 127.0240),
            end: CLLocationCoordinate2D(latitude: 35.1796, longitude: 129.0747),
            startAddress: "서울 서초구 반포동",
            endAddress: "부산 금정구",
            approximateLengthKm: 416
        ),
        KoreanHighway(
            id: "15",
            name: "서해안고속도로",
            shortName: "서해안",
            routeNumber: "15",
            start: CLLocationCoordinate2D(latitude: 37.3894, longitude: 126.8717),
            end: CLLocationCoordinate2D(latitude: 34.8118, longitude: 126.3922),
            startAddress: "경기 시흥",
            endAddress: "전남 목포",
            approximateLengthKm: 340
        ),
        KoreanHighway(
            id: "50",
            name: "영동고속도로",
            shortName: "영동",
            routeNumber: "50",
            start: CLLocationCoordinate2D(latitude: 37.4563, longitude: 126.7052),
            end: CLLocationCoordinate2D(latitude: 37.7519, longitude: 128.8761),
            startAddress: "인천 남동구",
            endAddress: "강원 강릉",
            approximateLengthKm: 234
        ),
        KoreanHighway(
            id: "35",
            name: "중부고속도로",
            shortName: "중부",
            routeNumber: "35",
            start: CLLocationCoordinate2D(latitude: 37.4891, longitude: 127.0512),
            end: CLLocationCoordinate2D(latitude: 36.3204, longitude: 127.4128),
            startAddress: "서울 송파구",
            endAddress: "충남 대전",
            approximateLengthKm: 149
        ),
        KoreanHighway(
            id: "10",
            name: "남해고속도로",
            shortName: "남해",
            routeNumber: "10",
            start: CLLocationCoordinate2D(latitude: 35.1053, longitude: 129.0353),
            end: CLLocationCoordinate2D(latitude: 34.9407, longitude: 127.6947),
            startAddress: "부산 사상구",
            endAddress: "전남 순천",
            approximateLengthKm: 165
        ),
        KoreanHighway(
            id: "100",
            name: "수도권제1순환",
            shortName: "수도권순환",
            routeNumber: "100",
            start: CLLocationCoordinate2D(latitude: 37.7012, longitude: 127.0564),
            end: CLLocationCoordinate2D(latitude: 37.7012, longitude: 127.0564),
            startAddress: "경기 의정부",
            endAddress: "경기 의정부 (순환)",
            approximateLengthKm: 128
        ),
        KoreanHighway(
            id: "17",
            name: "세종포천고속도로",
            shortName: "세종포천",
            routeNumber: "17",
            start: CLLocationCoordinate2D(latitude: 36.4800, longitude: 127.2890),
            end: CLLocationCoordinate2D(latitude: 37.9350, longitude: 127.2000),
            startAddress: "세종시",
            endAddress: "경기 포천",
            approximateLengthKm: 172
        ),
    ]
}
