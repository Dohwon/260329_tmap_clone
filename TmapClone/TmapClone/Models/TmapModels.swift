import Foundation
import MapKit

struct TmapViaPoint: Encodable {
    let viaPointId: String
    let viaPointName: String
    let viaX: String
    let viaY: String
    let viaPoiId: String
    let viaTime: String

    init(index: Int, waypoint: RouteWaypoint) {
        viaPointId = "via-\(index)"
        viaPointName = waypoint.name
        viaX = String(waypoint.coordinate.longitude)
        viaY = String(waypoint.coordinate.latitude)
        viaPoiId = ""
        viaTime = "0"
    }
}

struct TmapCarRouteRequest: Encodable {
    let endRpFlag: String
    let reqCoordType: String
    let carType: Int
    let detailPosFlag: String
    let resCoordType: String
    let sort: String
    let startX: Double
    let startY: Double
    let endX: Double
    let endY: Double
    let searchOption: String

    init(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        searchOption: String
    ) {
        endRpFlag = "G"
        reqCoordType = "WGS84GEO"
        carType = 0
        detailPosFlag = "2"
        resCoordType = "WGS84GEO"
        sort = "index"
        startX = origin.longitude
        startY = origin.latitude
        endX = destination.coordinate.longitude
        endY = destination.coordinate.latitude
        self.searchOption = searchOption
    }
}

struct TmapSequentialRouteRequest: Encodable {
    let reqCoordType: String
    let resCoordType: String
    let startName: String
    let startX: String
    let startY: String
    let startTime: String
    let endName: String
    let endX: String
    let endY: String
    let endPoiId: String
    let searchOption: String
    let carType: String
    let viaPoints: [TmapViaPoint]

    init(
        origin: CLLocationCoordinate2D,
        destination: SearchResult,
        plan: PreferredRoadRoutingPlan,
        searchOption: String
    ) {
        reqCoordType = "WGS84GEO"
        resCoordType = "WGS84GEO"
        startName = "현재 위치"
        startX = String(origin.longitude)
        startY = String(origin.latitude)
        startTime = Self.makeStartTime()
        endName = destination.name
        endX = String(destination.coordinate.longitude)
        endY = String(destination.coordinate.latitude)
        endPoiId = destination.poiID ?? ""
        self.searchOption = searchOption
        carType = "4"
        viaPoints = plan.waypoints.enumerated().map { index, waypoint in
            TmapViaPoint(index: index, waypoint: waypoint)
        }
    }

    private static func makeStartTime() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyyMMddHHmm"
        return formatter.string(from: Date())
    }
}
