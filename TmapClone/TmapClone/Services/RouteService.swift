import Foundation
import MapKit
import Combine

class RouteService: ObservableObject {
    @Published var routes: [MKRoute] = []
    @Published var isLoading: Bool = false
    @Published var error: String?

    func fetchRoute(from source: CLLocationCoordinate2D,
                    to destination: CLLocationCoordinate2D,
                    transportType: MKDirectionsTransportType = .automobile) async {
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
                self.routes = response.routes.sorted { $0.expectedTravelTime < $1.expectedTravelTime }
                self.isLoading = false
            }
        } catch {
            await MainActor.run {
                self.error = error.localizedDescription
                self.isLoading = false
            }
        }
    }

    func generateSummaries(from routes: [MKRoute], profile: DriverProfile) -> [RouteSummary] {
        let fastest = routes.first?.expectedTravelTime ?? 0
        return routes.enumerated().map { index, route in
            let highwayRatio: Double
            let mergeCount: Int
            let congestionScore: Int
            let title: String
            let explanation: String

            switch index {
            case 0:
                highwayRatio = 0.75
                mergeCount = 4
                congestionScore = profile == .beginner ? 2 : 2
                title = "빠른길"
                let camCount = 3 + index
                explanation = "고속도로 중심, 합류 적음, 카메라 \(camCount)개"
            case 1:
                highwayRatio = 0.45
                mergeCount = 7
                congestionScore = 1
                title = "국도 경유"
                let extraMins = Int((route.expectedTravelTime - fastest) / 60)
                explanation = "국도 포함, \(extraMins)분 느리지만 정체 적음"
            default:
                highwayRatio = 0.20
                mergeCount = 12
                congestionScore = 2
                title = "대안\(index)"
                explanation = "우회 경로, 막힘 구간 회피"
            }

            let nationalRoadRatio = max(0, 0.95 - highwayRatio)
            let fixedCameras = 2 + index * 2
            let sectionCameras = index == 0 ? 1 : 0

            return RouteSummary(
                routeIndex: index,
                title: title,
                explanation: explanation,
                eta: route.expectedTravelTime,
                distance: route.distance,
                highwayRatio: highwayRatio,
                nationalRoadRatio: nationalRoadRatio,
                mergeCount: mergeCount,
                congestionScore: congestionScore,
                fixedCameraCount: fixedCameras,
                sectionCameraCount: sectionCameras,
                sectionEnforcementKm: Double(sectionCameras) * 3.2,
                dominantSpeedLimit: highwayRatio > 0.5 ? 100 : 80,
                mkRoute: route
            )
        }
    }

    func buildRouteInfo(from route: MKRoute) -> RouteInfo {
        let steps = route.steps.map { step -> RouteStep in
            RouteStep(
                instruction: step.instructions.isEmpty ? "직진" : step.instructions,
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
}
