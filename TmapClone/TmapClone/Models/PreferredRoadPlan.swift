import Foundation
import MapKit

enum PreferredRoadRoutingMode: String {
    case freeRouting
    case recommendedRoad
    case corridorViaWaypoint
}

struct RouteWaypoint: Identifiable {
    let id = UUID()
    let name: String
    let coordinate: CLLocationCoordinate2D
    let reason: String
}

struct PreferredRoadRoutingPlan {
    let destination: SearchResult
    let preferredHighway: KoreanHighway?
    let mode: PreferredRoadRoutingMode
    let waypoints: [RouteWaypoint]
    let summary: String
    let tmapReady: Bool
}
