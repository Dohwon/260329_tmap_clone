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
