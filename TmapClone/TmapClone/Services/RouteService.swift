import Foundation
import MapKit
import Combine

class RouteService: ObservableObject {
    @Published var routes: [AppRoute] = []
    @Published var isLoading: Bool = false
    @Published var error: String?

    func fetchRoute(from source: CLLocationCoordinate2D,
                    to destination: CLLocationCoordinate2D,
                    transportType: MKDirectionsTransportType = .automobile) async -> Bool {
        await MainActor.run { isLoading = true; error = nil }

        let sourcePlacemark = MKPlacemark(coordinate: source)
        let destPlacemark = MKPlacemark(coordinate: destination)

        let request = MKDirections.Request()
        request.source = MKMapItem(placemark: sourcePlacemark)
        request.destination = MKMapItem(placemark: destPlacemark)
        request.transportType = transportType
        request.requestsAlternateRoutes = true

        let directions = MKDirections(request: request)
        do {
            let response = try await directions.calculate()
            await MainActor.run {
                self.routes = response.routes
                    .sorted { $0.expectedTravelTime < $1.expectedTravelTime }
                    .enumerated()
                    .map { index, route in
                        Self.makeAppRoute(from: route, index: index)
                    }
                if self.routes.isEmpty {
                    self.error = "경로를 찾지 못했습니다."
                }
                self.isLoading = false
            }
            return !self.routes.isEmpty
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.routes = []
                self.isLoading = false
            }
            return false
        }
    }

    func generateSummaries(from routes: [AppRoute], profile: DriverProfile, preferences: RoutePreferences = RoutePreferences()) -> [RouteSummary] {
        generateSummaries(from: routes, profile: profile, preferences: preferences, preferredHighway: nil)
    }

    func generateSummaries(
        from routes: [AppRoute],
        profile: DriverProfile,
        preferences: RoutePreferences = RoutePreferences(),
        preferredHighway: KoreanHighway?
    ) -> [RouteSummary] {
        let fastest = routes.map(\.expectedTravelTime).min() ?? 0
        let scored = routes.map { route -> (route: AppRoute, score: Double, metadata: SummaryMetadata) in
            let metadata = metadata(
                for: route,
                fastest: fastest,
                preferredHighway: preferredHighway
            )
            let provisionalSummary = RouteSummary(
                routeIndex: 0,
                isRecommended: false,
                title: metadata.title,
                explanation: metadata.explanation,
                eta: route.expectedTravelTime,
                distance: route.distance,
                highwayRatio: metadata.highwayRatio,
                nationalRoadRatio: metadata.nationalRoadRatio,
                mergeCount: metadata.mergeCount,
                congestionScore: metadata.congestionScore,
                fixedCameraCount: metadata.fixedCameraCount,
                sectionCameraCount: metadata.sectionCameraCount,
                sectionEnforcementKm: Double(metadata.sectionCameraCount) * 3.2,
                dominantSpeedLimit: metadata.dominantSpeedLimit,
                preferredRoadLabel: route.preferredRoadLabel,
                routeID: route.id
            )
            let score = routeScore(
                for: provisionalSummary,
                profile: profile,
                preferences: preferences,
                preferredHighway: preferredHighway
            )
            return (route, score, metadata)
        }
        return scored
            .sorted { lhs, rhs in
                lhs.score > rhs.score
            }
            .enumerated()
            .map { index, entry in
                RouteSummary(
                    routeIndex: index,
                    isRecommended: index == 0,
                    title: entry.metadata.title,
                    explanation: entry.metadata.explanation,
                    eta: entry.route.expectedTravelTime,
                    distance: entry.route.distance,
                    highwayRatio: entry.metadata.highwayRatio,
                    nationalRoadRatio: entry.metadata.nationalRoadRatio,
                    mergeCount: entry.metadata.mergeCount,
                    congestionScore: entry.metadata.congestionScore,
                    fixedCameraCount: entry.metadata.fixedCameraCount,
                    sectionCameraCount: entry.metadata.sectionCameraCount,
                    sectionEnforcementKm: Double(entry.metadata.sectionCameraCount) * 3.2,
                    dominantSpeedLimit: entry.metadata.dominantSpeedLimit,
                    preferredRoadLabel: entry.route.preferredRoadLabel,
                    routeID: entry.route.id
                )
            }
    }

    func buildRouteInfo(from route: AppRoute) -> RouteInfo {
        let steps = route.steps.map { step -> RouteStep in
            RouteStep(
                instruction: step.instruction,
                distance: step.distance,
                direction: .straight
            )
        }
        return RouteInfo(
            distance: route.distance,
            duration: route.expectedTravelTime,
            steps: steps,
            trafficDelay: 0,
            tollFee: 0
        )
    }

    private static func makeAppRoute(from route: MKRoute, index: Int) -> AppRoute {
        let polyline = route.polyline
        let points = polyline.points()
        let coordinates = (0..<polyline.pointCount).map { points[$0].coordinate }
        let steps = route.steps
            .filter { !$0.instructions.isEmpty || $0.distance > 0 }
            .map { AppRouteStep(instruction: $0.instructions.isEmpty ? "직진" : $0.instructions, distance: $0.distance) }
        let strategy: AppRouteStrategy
        switch index {
        case 0:
            strategy = .fastest
        case 1:
            strategy = .recommended
        case 2:
            strategy = .easy
        default:
            strategy = .alternate
        }

        return AppRoute(
            id: UUID(),
            coordinates: coordinates,
            distance: route.distance,
            expectedTravelTime: route.expectedTravelTime,
            steps: steps,
            source: .mapKit,
            strategy: strategy,
            preferredRoadLabel: nil
        )
    }

    private func metadata(
        for route: AppRoute,
        fastest: Double,
        preferredHighway: KoreanHighway?
    ) -> SummaryMetadata {
        let delayMinutes = max(0, Int((route.expectedTravelTime - fastest) / 60))

        switch route.strategy {
        case .preferredRoad:
            let title = preferredHighway.map { "\($0.shortName) 우선" } ?? "선호 도로"
            let explanation = preferredHighway.map { "\($0.shortName) 축을 우선 통과하는 경로" } ?? "선호 도로 중심 경로"
            return SummaryMetadata(
                title: title,
                explanation: explanation,
                highwayRatio: 0.82,
                nationalRoadRatio: 0.18,
                mergeCount: 4,
                congestionScore: 2,
                fixedCameraCount: 4,
                sectionCameraCount: 1,
                dominantSpeedLimit: 100
            )
        case .recommended:
            return SummaryMetadata(
                title: "균형 추천",
                explanation: "시간과 흐름을 함께 고려한 기본 추천 경로",
                highwayRatio: 0.62,
                nationalRoadRatio: 0.38,
                mergeCount: 5,
                congestionScore: 2,
                fixedCameraCount: 3,
                sectionCameraCount: 1,
                dominantSpeedLimit: 100
            )
        case .fastest:
            return SummaryMetadata(
                title: "빠른길",
                explanation: delayMinutes == 0 ? "도착 시간을 가장 우선한 경로" : "\(delayMinutes)분 차이의 빠른 경로",
                highwayRatio: 0.72,
                nationalRoadRatio: 0.28,
                mergeCount: 6,
                congestionScore: 3,
                fixedCameraCount: 5,
                sectionCameraCount: 1,
                dominantSpeedLimit: 110
            )
        case .easy:
            return SummaryMetadata(
                title: "쉬운길",
                explanation: "합류와 복잡도를 줄인 초보자 친화 경로",
                highwayRatio: 0.48,
                nationalRoadRatio: 0.52,
                mergeCount: 3,
                congestionScore: 1,
                fixedCameraCount: 2,
                sectionCameraCount: 0,
                dominantSpeedLimit: 90
            )
        case .alternate:
            return SummaryMetadata(
                title: "대안 경로",
                explanation: delayMinutes == 0 ? "혼잡 구간 회피 대안" : "\(delayMinutes)분 느리지만 우회 가능한 경로",
                highwayRatio: 0.38,
                nationalRoadRatio: 0.62,
                mergeCount: 7,
                congestionScore: 2,
                fixedCameraCount: 3,
                sectionCameraCount: 0,
                dominantSpeedLimit: 80
            )
        }
    }

    private func routeScore(
        for summary: RouteSummary,
        profile: DriverProfile,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway?
    ) -> Double {
        var score = 10_000 - summary.eta
        score -= Double(summary.congestionScore) * 600

        if preferences.preferHighway {
            score += summary.highwayRatio * 1200
        }
        if preferences.preferMountainRoad {
            score += summary.nationalRoadRatio * 300
        }
        if preferences.allowNarrowRoad {
            score += Double(summary.mergeCount) * 20
        } else {
            score -= Double(summary.mergeCount) * 35
        }

        switch profile {
        case .beginner:
            score -= Double(summary.mergeCount) * 50
            score -= Double(summary.congestionScore) * 120
        case .intermediate:
            score += summary.highwayRatio * 150
        case .expert:
            score += Double(summary.mergeCount) * 15
            score += summary.nationalRoadRatio * 120
        }

        if preferredHighway != nil {
            score += summary.highwayRatio * 2200
            score -= summary.nationalRoadRatio * 250
        }

        return score
    }
}

private struct SummaryMetadata {
    let title: String
    let explanation: String
    let highwayRatio: Double
    let nationalRoadRatio: Double
    let mergeCount: Int
    let congestionScore: Int
    let fixedCameraCount: Int
    let sectionCameraCount: Int
    let dominantSpeedLimit: Int
}
