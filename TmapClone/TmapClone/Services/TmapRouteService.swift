import Foundation
import MapKit

struct TmapRouteService {
    private struct RouteCandidate {
        let strategy: AppRouteStrategy
        let plan: PreferredRoadRoutingPlan
        let searchOption: String
    }

    private let client: TmapAPIClient
    private let preferredRoadPlanner: PreferredRoadPlanner

    init(
        client: TmapAPIClient = TmapAPIClient(),
        preferredRoadPlanner: PreferredRoadPlanner = PreferredRoadPlanner()
    ) {
        self.client = client
        self.preferredRoadPlanner = preferredRoadPlanner
    }

    func makeRouteRequest(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        preferredHighway: KoreanHighway?,
        plan: PreferredRoadRoutingPlan? = nil
    ) -> PreferredRoadRoutingPlan {
        let resolvedPlan = plan ?? preferredRoadPlanner.makePlan(
            origin: origin,
            destination: destination,
            preferredHighway: preferredHighway
        )
        return resolvedPlan
    }

    func requestRoute(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway?
    ) async throws -> (PreferredRoadRoutingPlan, AppRoute) {
        let result = try await requestRoutes(
            origin: origin,
            destination: destination,
            preferences: preferences,
            preferredHighway: preferredHighway
        )
        guard let route = result.routes.first else {
            throw TmapAPIError.invalidResponse
        }
        return (result.preferredPlan, route)
    }

    func requestRoutes(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        preferences: RoutePreferences,
        preferredHighway: KoreanHighway?
    ) async throws -> (preferredPlan: PreferredRoadRoutingPlan, routes: [AppRoute]) {
        let preferredPlan = preferredRoadPlanner.makePlan(
            origin: origin,
            destination: destination,
            preferredHighway: preferredHighway
        )
        let freePlan = preferredRoadPlanner.makePlan(
            origin: origin,
            destination: destination,
            preferredHighway: nil
        )
        let candidates = routeCandidates(
            preferredPlan: preferredPlan,
            freePlan: freePlan,
            preferredHighway: preferredHighway
        )
        DebugLog.log("ROUTE", "requestRoutes destination=\(destination.name) candidates=\(candidates.map { String(describing: $0.strategy) }.joined(separator: \",\"))")

        var fetchedRoutes: [AppRoute] = []
        await withTaskGroup(of: AppRoute?.self) { group in
            for candidate in candidates {
                group.addTask {
                    try? await requestSingleRoute(
                        origin: origin,
                        destination: destination,
                        preferredHighway: preferredHighway,
                        candidate: candidate
                    )
                }
            }

            for await route in group {
                if let route {
                    fetchedRoutes.append(route)
                }
            }
        }

        let orderedRoutes = deduplicate(routes: fetchedRoutes)
            .sorted { lhs, rhs in
                strategyRank(lhs.strategy) < strategyRank(rhs.strategy)
            }
        DebugLog.log("ROUTE", "requestRoutes fetched=\(fetchedRoutes.count) unique=\(orderedRoutes.count)")

        guard !orderedRoutes.isEmpty else {
            throw TmapAPIError.invalidResponse
        }

        return (preferredPlan, orderedRoutes)
    }

    private func requestSingleRoute(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        preferredHighway: KoreanHighway?,
        candidate: RouteCandidate
    ) async throws -> AppRoute {
        let plan = makeRouteRequest(
            origin: origin,
            destination: destination,
            preferredHighway: preferredHighway,
            plan: candidate.plan
        )
        let path: String
        let data: Data

        if plan.waypoints.isEmpty {
            let request = TmapCarRouteRequest(
                origin: origin,
                destination: destination,
                searchOption: candidate.searchOption
            )
            path = "/tmap/routes?version=1&format=json"
            data = try await client.postJSONData(
                path: path,
                body: request
            )
        } else {
            let request = TmapSequentialRouteRequest(
                origin: origin,
                destination: destination,
                plan: plan,
                searchOption: candidate.searchOption
            )
            path = "/tmap/routes/routeSequential30?version=1&format=json"
            data = try await client.postJSONData(
                path: path,
                body: request
            )
        }

        DebugLog.log("ROUTE", "candidate=\(String(describing: candidate.strategy)) waypoints=\(plan.waypoints.count) path=\(path) option=\(candidate.searchOption)")
        return try parseRoute(
            from: data,
            strategy: candidate.strategy,
            preferredRoadLabel: candidate.strategy == .preferredRoad ? plan.preferredHighway?.displayLabel : nil
        )
    }

    private func parseRoute(
        from data: Data,
        strategy: AppRouteStrategy,
        preferredRoadLabel: String?
    ) throws -> AppRoute {
        guard
            let jsonObject = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let features = jsonObject["features"] as? [[String: Any]]
        else {
            throw TmapAPIError.invalidResponse
        }

        var coordinates: [CLLocationCoordinate2D] = []
        let topLevelProperties = jsonObject["properties"] as? [String: Any]
        var distance: Double = (topLevelProperties?["totalDistance"] as? NSString)?.doubleValue ?? 0
        var expectedTravelTime: Double = (topLevelProperties?["totalTime"] as? NSString)?.doubleValue ?? 0

        for feature in features {
            if
                let properties = feature["properties"] as? [String: Any],
                distance == 0,
                let totalDistance = properties["totalDistance"] as? NSNumber,
                let totalTime = properties["totalTime"] as? NSNumber
            {
                distance = totalDistance.doubleValue
                expectedTravelTime = totalTime.doubleValue
            }

            guard
                let geometry = feature["geometry"] as? [String: Any],
                let type = geometry["type"] as? String,
                type == "LineString",
                let lineCoordinates = geometry["coordinates"] as? [[Double]]
            else {
                continue
            }

            coordinates.append(contentsOf: lineCoordinates.compactMap { pair in
                guard pair.count >= 2 else { return nil }
                return CLLocationCoordinate2D(latitude: pair[1], longitude: pair[0])
            })
        }

        guard !coordinates.isEmpty else {
            throw TmapAPIError.invalidResponse
        }

        return AppRoute(
            id: UUID(),
            coordinates: coordinates,
            distance: distance,
            expectedTravelTime: expectedTravelTime,
            steps: [
                AppRouteStep(
                    instruction: primaryInstruction(for: strategy, preferredRoadLabel: preferredRoadLabel),
                    distance: distance
                )
            ],
            source: .tmap,
            strategy: strategy,
            preferredRoadLabel: preferredRoadLabel
        )
    }

    private func routeCandidates(
        preferredPlan: PreferredRoadRoutingPlan,
        freePlan: PreferredRoadRoutingPlan,
        preferredHighway: KoreanHighway?
    ) -> [RouteCandidate] {
        var candidates: [RouteCandidate] = []

        if preferredHighway != nil {
            candidates.append(RouteCandidate(strategy: .preferredRoad, plan: preferredPlan, searchOption: "0"))
        }

        candidates.append(RouteCandidate(strategy: .recommended, plan: freePlan, searchOption: "0"))
        candidates.append(RouteCandidate(strategy: .fastest, plan: freePlan, searchOption: "2"))
        candidates.append(RouteCandidate(strategy: .easy, plan: freePlan, searchOption: "3"))

        return candidates
    }

    private func primaryInstruction(
        for strategy: AppRouteStrategy,
        preferredRoadLabel: String?
    ) -> String {
        switch strategy {
        case .preferredRoad:
            return preferredRoadLabel.map { "\($0) 축을 유지하며 주행하세요" } ?? "선호 도로 중심으로 주행하세요"
        case .recommended:
            return "균형 추천 경로를 따라 주행하세요"
        case .fastest:
            return "가장 빠른 경로를 따라 주행하세요"
        case .easy:
            return "합류가 적은 쉬운 경로를 따라 주행하세요"
        case .alternate:
            return "대안 경로를 따라 주행하세요"
        }
    }

    private func deduplicate(routes: [AppRoute]) -> [AppRoute] {
        var unique: [AppRoute] = []

        for route in routes {
            if unique.contains(where: { isSimilarRoute($0, route) }) {
                continue
            }
            unique.append(route)
        }

        return unique
    }

    private func isSimilarRoute(_ lhs: AppRoute, _ rhs: AppRoute) -> Bool {
        guard
            abs(lhs.distance - rhs.distance) < 800,
            abs(lhs.expectedTravelTime - rhs.expectedTravelTime) < 240
        else {
            return false
        }

        let lhsMid = lhs.coordinates[lhs.coordinates.count / 2]
        let rhsMid = rhs.coordinates[rhs.coordinates.count / 2]
        let midDistance = CLLocation(latitude: lhsMid.latitude, longitude: lhsMid.longitude)
            .distance(from: CLLocation(latitude: rhsMid.latitude, longitude: rhsMid.longitude))

        return midDistance < 1500
    }

    private func strategyRank(_ strategy: AppRouteStrategy) -> Int {
        switch strategy {
        case .preferredRoad:
            return 0
        case .recommended:
            return 1
        case .fastest:
            return 2
        case .easy:
            return 3
        case .alternate:
            return 4
        }
    }
}
