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

struct RoutePreferences: Equatable {
    var preferHighway: Bool = true          // 해당도로 선호
    var preferMountainRoad: Bool = false    // 산길도로 선호
    var allowNarrowRoad: Bool = false       // 좁은 길 포함
}

enum RouteRequestState: Equatable {
    case idle
    case loading
    case success
    case empty
    case permissionDenied
    case error(String)

    var message: String? {
        switch self {
        case .idle, .loading, .success:
            return nil
        case .empty:
            return "경로를 찾지 못했습니다. 다른 목적지나 조건으로 다시 시도해 주세요."
        case .permissionDenied:
            return "현재 위치 권한이 필요합니다. 설정에서 위치 접근을 허용해 주세요."
        case .error(let message):
            return message
        }
    }
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
    let isRecommended: Bool
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
    let preferredRoadLabel: String?
    let routeID: UUID

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

enum AppRouteStrategy {
    case preferredRoad
    case recommended
    case fastest
    case easy
    case alternate
}

struct AppRoute: Identifiable {
    enum Source {
        case mapKit
        case tmap
    }

    let id: UUID
    let coordinates: [CLLocationCoordinate2D]
    let distance: Double
    let expectedTravelTime: Double
    let steps: [AppRouteStep]
    let source: Source
    let strategy: AppRouteStrategy
    let preferredRoadLabel: String?
}

struct AppRouteStep: Identifiable {
    let id = UUID()
    let instruction: String
    let distance: Double
}

struct NavigationProgress {
    let remainingDistance: Double
    let remainingTime: Double
    let distanceFromRoute: Double
    let isOffRoute: Bool
}

enum PreferredRoadAdherenceState {
    case inactive
    case evaluating
    case approaching
    case onPreferredRoad
    case leavingPreferredRoad
    case offPreferredRoad
}

struct PreferredRoadAdherence {
    let state: PreferredRoadAdherenceState
    let currentRoadName: String?
    let distanceToPreferredRoad: Double?

    var shortLabel: String {
        switch state {
        case .inactive:
            return "일반 경로"
        case .evaluating:
            return "도로 확인 중"
        case .approaching:
            return "선호 도로 접근 중"
        case .onPreferredRoad:
            return "선호 도로 주행 중"
        case .leavingPreferredRoad:
            return "선호 도로 이탈 징후"
        case .offPreferredRoad:
            return "선호 도로 벗어남"
        }
    }
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
    let centerline: [CLLocationCoordinate2D]

    var displayLabel: String {
        "\(routeNumber) \(shortName)"
    }

    var corridorCoordinates: [CLLocationCoordinate2D] {
        if centerline.isEmpty {
            return [start, end]
        }

        var points = centerline
        if !Self.isSameCoordinate(points.first, start) {
            points.insert(start, at: 0)
        }
        if !Self.isSameCoordinate(points.last, end) {
            points.append(end)
        }
        return points
    }

    var mockCameras: [SpeedCamera] {
        let steps = max(3, approximateLengthKm / 40)
        let path = corridorCoordinates
        return (0..<steps).compactMap { i in
            let fraction = Double(i + 1) / Double(steps + 1)
            guard let coordinate = Self.coordinate(on: path, fraction: fraction) else { return nil }
            let type: SpeedCamera.CameraType = i % 3 == 0 ? .section : .fixed
            let limit = i % 4 == 0 ? 100 : 110
            return SpeedCamera(
                coordinate: coordinate,
                speedLimit: limit,
                type: type
            )
        }
    }

    private static func coordinate(on path: [CLLocationCoordinate2D], fraction: Double) -> CLLocationCoordinate2D? {
        guard path.count >= 2 else { return path.first }

        let totalDistance = path.segmentDistances.reduce(0, +)
        guard totalDistance > 0 else { return path.first }

        let targetDistance = totalDistance * min(max(fraction, 0), 1)
        var accumulated: CLLocationDistance = 0

        for index in 0..<(path.count - 1) {
            let start = path[index]
            let end = path[index + 1]
            let segmentDistance = path.segmentDistances[index]
            if accumulated + segmentDistance >= targetDistance {
                let localFraction = (targetDistance - accumulated) / max(segmentDistance, 1)
                return CLLocationCoordinate2D(
                    latitude: start.latitude + (end.latitude - start.latitude) * localFraction,
                    longitude: start.longitude + (end.longitude - start.longitude) * localFraction
                )
            }
            accumulated += segmentDistance
        }

        return path.last
    }

    private static func isSameCoordinate(_ lhs: CLLocationCoordinate2D?, _ rhs: CLLocationCoordinate2D?) -> Bool {
        guard let lhs, let rhs else { return false }
        return abs(lhs.latitude - rhs.latitude) < 0.0001 && abs(lhs.longitude - rhs.longitude) < 0.0001
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
            approximateLengthKm: 416,
            centerline: [
                CLLocationCoordinate2D(latitude: 37.3348, longitude: 127.1025),
                CLLocationCoordinate2D(latitude: 36.8151, longitude: 127.1139),
                CLLocationCoordinate2D(latitude: 36.3504, longitude: 127.3845),
                CLLocationCoordinate2D(latitude: 35.8714, longitude: 128.6014),
                CLLocationCoordinate2D(latitude: 35.5384, longitude: 129.3114)
            ]
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
            approximateLengthKm: 340,
            centerline: [
                CLLocationCoordinate2D(latitude: 36.9921, longitude: 126.9260),
                CLLocationCoordinate2D(latitude: 36.7845, longitude: 126.4503),
                CLLocationCoordinate2D(latitude: 35.9677, longitude: 126.7369),
                CLLocationCoordinate2D(latitude: 35.1600, longitude: 126.8540)
            ]
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
            approximateLengthKm: 234,
            centerline: [
                CLLocationCoordinate2D(latitude: 37.2636, longitude: 127.0286),
                CLLocationCoordinate2D(latitude: 37.3422, longitude: 127.9202),
                CLLocationCoordinate2D(latitude: 37.4919, longitude: 128.2147),
                CLLocationCoordinate2D(latitude: 37.6109, longitude: 128.7250)
            ]
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
            approximateLengthKm: 149,
            centerline: [
                CLLocationCoordinate2D(latitude: 37.5393, longitude: 127.2148),
                CLLocationCoordinate2D(latitude: 37.0075, longitude: 127.2790),
                CLLocationCoordinate2D(latitude: 36.8554, longitude: 127.4356)
            ]
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
            approximateLengthKm: 165,
            centerline: [
                CLLocationCoordinate2D(latitude: 35.2285, longitude: 128.8894),
                CLLocationCoordinate2D(latitude: 35.1800, longitude: 128.1076),
                CLLocationCoordinate2D(latitude: 35.0039, longitude: 128.0645)
            ]
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
            approximateLengthKm: 128,
            centerline: [
                CLLocationCoordinate2D(latitude: 37.6500, longitude: 127.1800),
                CLLocationCoordinate2D(latitude: 37.5393, longitude: 127.2148),
                CLLocationCoordinate2D(latitude: 37.4300, longitude: 127.0900),
                CLLocationCoordinate2D(latitude: 37.3910, longitude: 126.9550),
                CLLocationCoordinate2D(latitude: 37.5650, longitude: 126.8250),
                CLLocationCoordinate2D(latitude: 37.6584, longitude: 126.8320)
            ]
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
            approximateLengthKm: 172,
            centerline: [
                CLLocationCoordinate2D(latitude: 36.9950, longitude: 127.1470),
                CLLocationCoordinate2D(latitude: 37.5393, longitude: 127.2148),
                CLLocationCoordinate2D(latitude: 37.6350, longitude: 127.2165)
            ]
        ),
    ]
}

private extension Array where Element == CLLocationCoordinate2D {
    var segmentDistances: [CLLocationDistance] {
        guard count >= 2 else { return [] }
        return (0..<(count - 1)).map { index in
            CLLocation(latitude: self[index].latitude, longitude: self[index].longitude)
                .distance(from: CLLocation(latitude: self[index + 1].latitude, longitude: self[index + 1].longitude))
        }
    }
}
