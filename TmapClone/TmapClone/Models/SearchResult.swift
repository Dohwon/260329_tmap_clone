import Foundation
import MapKit

struct SearchResult: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let address: String
    let coordinate: CLLocationCoordinate2D
    let category: PlaceCategory

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: SearchResult, rhs: SearchResult) -> Bool {
        lhs.id == rhs.id
    }

    enum PlaceCategory: String {
        case restaurant = "음식점"
        case cafe = "카페"
        case gas = "주유소"
        case parking = "주차장"
        case hospital = "병원"
        case pharmacy = "약국"
        case convenience = "편의점"
        case bank = "은행"
        case hotel = "숙박"
        case shopping = "쇼핑"
        case attraction = "관광"
        case other = "기타"

        var icon: String {
            switch self {
            case .restaurant: return "fork.knife"
            case .cafe: return "cup.and.saucer"
            case .gas: return "fuelpump"
            case .parking: return "p.square"
            case .hospital: return "cross.case"
            case .pharmacy: return "pills"
            case .convenience: return "bag"
            case .bank: return "building.columns"
            case .hotel: return "bed.double"
            case .shopping: return "cart"
            case .attraction: return "camera"
            case .other: return "mappin"
            }
        }
    }
}

struct RouteInfo: Identifiable {
    let id = UUID()
    let distance: Double     // meters
    let duration: Double     // seconds
    let steps: [RouteStep]
    let trafficDelay: Double // seconds
    let tollFee: Int         // KRW

    var distanceText: String {
        if distance >= 1000 {
            return String(format: "%.1fkm", distance / 1000)
        } else {
            return "\(Int(distance))m"
        }
    }

    var durationText: String {
        let total = Int(duration + trafficDelay)
        let h = total / 3600
        let m = (total % 3600) / 60
        if h > 0 {
            return "\(h)시간 \(m)분"
        } else {
            return "\(m)분"
        }
    }

    var arrivalTime: String {
        let arrival = Date().addingTimeInterval(duration + trafficDelay)
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: arrival)
    }
}

struct RouteStep: Identifiable {
    let id = UUID()
    let instruction: String
    let distance: Double
    let direction: TurnDirection

    enum TurnDirection {
        case straight, left, right, uturn, destination
        var icon: String {
            switch self {
            case .straight: return "arrow.up"
            case .left: return "arrow.turn.up.left"
            case .right: return "arrow.turn.up.right"
            case .uturn: return "arrow.uturn.left"
            case .destination: return "mappin.circle.fill"
            }
        }
    }
}

struct SpeedCamera: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
    let speedLimit: Int
    let type: CameraType

    enum CameraType: String {
        case fixed = "고정식"
        case mobile = "이동식"
        case section = "구간단속"
    }
}

struct FavoritePlace: Identifiable, Codable {
    let id: UUID
    var name: String
    var address: String
    var latitude: Double
    var longitude: Double
    var isFavorite: Bool

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}
