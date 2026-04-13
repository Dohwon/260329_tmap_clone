import Foundation
import MapKit

struct PreferredRoadPlanner {
    func makePlan(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        preferredHighway: KoreanHighway?
    ) -> PreferredRoadRoutingPlan {
        guard let preferredHighway else {
            return PreferredRoadRoutingPlan(
                destination: destination,
                preferredHighway: nil,
                mode: .freeRouting,
                waypoints: [],
                summary: "선호 도로 없이 일반 경로 추천",
                tmapReady: true
            )
        }

        let entryCoordinate = closestCoordinate(to: origin, candidates: preferredHighway.corridorCoordinates)
        let exitCoordinate = closestCoordinate(to: destination.coordinate, candidates: preferredHighway.corridorCoordinates)
        let corridorMidpoint = preferredHighway.corridorCoordinates[preferredHighway.corridorCoordinates.count / 2]

        let waypoints: [RouteWaypoint]
        let mode: PreferredRoadRoutingMode

        if areSameCoordinate(entryCoordinate, exitCoordinate) {
            mode = .corridorViaWaypoint
            waypoints = [
                RouteWaypoint(
                    name: "\(preferredHighway.shortName) 진입축",
                    coordinate: corridorMidpoint,
                    reason: "선호 도로 회랑을 통과하도록 유도"
                )
            ]
        } else {
            mode = .corridorViaWaypoint
            waypoints = [
                RouteWaypoint(
                    name: "\(preferredHighway.shortName) 진입",
                    coordinate: entryCoordinate,
                    reason: "출발지에서 가장 가까운 선호 도로 진입점"
                ),
                RouteWaypoint(
                    name: "\(preferredHighway.shortName) 이탈",
                    coordinate: exitCoordinate,
                    reason: "목적지로 이어지는 선호 도로 이탈점"
                )
            ]
        }

        return PreferredRoadRoutingPlan(
            destination: destination,
            preferredHighway: preferredHighway,
            mode: mode,
            waypoints: waypoints,
            summary: "\(preferredHighway.displayLabel) 축을 우선 통과하는 경로 추천",
            tmapReady: true
        )
    }

    private func closestCoordinate(
        to anchor: CLLocationCoordinate2D,
        candidates: [CLLocationCoordinate2D]
    ) -> CLLocationCoordinate2D {
        candidates.min { lhs, rhs in
            distance(from: anchor, to: lhs) < distance(from: anchor, to: rhs)
        } ?? anchor
    }

    private func distance(from lhs: CLLocationCoordinate2D, to rhs: CLLocationCoordinate2D) -> CLLocationDistance {
        CLLocation(latitude: lhs.latitude, longitude: lhs.longitude)
            .distance(from: CLLocation(latitude: rhs.latitude, longitude: rhs.longitude))
    }

    private func areSameCoordinate(_ lhs: CLLocationCoordinate2D, _ rhs: CLLocationCoordinate2D) -> Bool {
        abs(lhs.latitude - rhs.latitude) < 0.0001 && abs(lhs.longitude - rhs.longitude) < 0.0001
    }
}
