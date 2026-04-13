import Foundation
import MapKit

enum DebugLog {
    static var isEnabled: Bool = true

    static func log(_ category: String, _ message: String) {
        guard isEnabled else { return }
        print("[DEBUG][\(category)] \(message)")
    }
}

enum TmapAPIError: LocalizedError {
    case missingAppKey
    case invalidResponse
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .missingAppKey:
            return "TMAP 앱 키가 설정되지 않았습니다."
        case .invalidResponse:
            return "TMAP 응답을 해석하지 못했습니다."
        case .httpError(let code):
            return "TMAP API 호출이 실패했습니다. HTTP \(code)"
        }
    }
}

struct TmapAPIClient {
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func getJSONData(
        path: String,
        queryItems: [URLQueryItem]
    ) async throws -> Data {
        guard TmapConfiguration.isConfigured else {
            throw TmapAPIError.missingAppKey
        }

        var components = URLComponents(string: "https://apis.openapi.sk.com\(path)")
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw TmapAPIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(TmapConfiguration.appKey, forHTTPHeaderField: "appKey")
        DebugLog.log("TMAP", "GET \(path) query=\(queryItems.map { "\($0.name)=\($0.value ?? "")" }.joined(separator: "&"))")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TmapAPIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            DebugLog.log("TMAP", "GET \(path) failed status=\(httpResponse.statusCode)")
            throw TmapAPIError.httpError(httpResponse.statusCode)
        }
        DebugLog.log("TMAP", "GET \(path) ok status=\(httpResponse.statusCode) bytes=\(data.count)")
        return data
    }

    func postJSON<Response: Decodable, Body: Encodable>(
        path: String,
        body: Body,
        responseType: Response.Type
    ) async throws -> Response {
        guard TmapConfiguration.isConfigured else {
            throw TmapAPIError.missingAppKey
        }

        let url = URL(string: "https://apis.openapi.sk.com\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(TmapConfiguration.appKey, forHTTPHeaderField: "appKey")
        request.httpBody = try JSONEncoder().encode(body)
        DebugLog.log("TMAP", "POST \(path) json")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TmapAPIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            DebugLog.log("TMAP", "POST \(path) failed status=\(httpResponse.statusCode)")
            throw TmapAPIError.httpError(httpResponse.statusCode)
        }
        DebugLog.log("TMAP", "POST \(path) ok status=\(httpResponse.statusCode) bytes=\(data.count)")
        return try JSONDecoder().decode(Response.self, from: data)
    }

    func postJSONData<Body: Encodable>(
        path: String,
        body: Body
    ) async throws -> Data {
        guard TmapConfiguration.isConfigured else {
            throw TmapAPIError.missingAppKey
        }

        let url = URL(string: "https://apis.openapi.sk.com\(path)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(TmapConfiguration.appKey, forHTTPHeaderField: "appKey")
        request.httpBody = try JSONEncoder().encode(body)
        DebugLog.log("TMAP", "POST \(path) raw-json")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TmapAPIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            DebugLog.log("TMAP", "POST \(path) failed status=\(httpResponse.statusCode)")
            throw TmapAPIError.httpError(httpResponse.statusCode)
        }
        DebugLog.log("TMAP", "POST \(path) ok status=\(httpResponse.statusCode) bytes=\(data.count)")
        return data
    }

    func postFormData(
        path: String,
        queryItems: [URLQueryItem] = [],
        formFields: [String: String]
    ) async throws -> Data {
        guard TmapConfiguration.isConfigured else {
            throw TmapAPIError.missingAppKey
        }

        var components = URLComponents(string: "https://apis.openapi.sk.com\(path)")
        components?.queryItems = queryItems

        guard let url = components?.url else {
            throw TmapAPIError.invalidResponse
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(TmapConfiguration.appKey, forHTTPHeaderField: "appKey")
        request.httpBody = formFields
            .map { key, value in
                let escaped = value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
                return "\(key)=\(escaped)"
            }
            .sorted()
            .joined(separator: "&")
            .data(using: .utf8)
        DebugLog.log("TMAP", "POST \(path) form keys=\(formFields.keys.sorted().joined(separator: ","))")

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw TmapAPIError.invalidResponse
        }
        guard (200...299).contains(httpResponse.statusCode) else {
            DebugLog.log("TMAP", "POST \(path) failed status=\(httpResponse.statusCode)")
            throw TmapAPIError.httpError(httpResponse.statusCode)
        }
        DebugLog.log("TMAP", "POST \(path) ok status=\(httpResponse.statusCode) bytes=\(data.count)")
        return data
    }
}

struct TmapNearbyRoadMatch {
    let roadName: String
    let roadCategory: Int
    let tollLink: Int
    let linkId: String
    let speed: Int
}

struct TmapMatchedPoint {
    let coordinate: CLLocationCoordinate2D
    let roadCategory: Int
    let speed: Int
    let linkId: String
}

struct TmapMatchedRoadTrace {
    let totalDistance: Int
    let matchedLinkCount: Int
    let matchedPoints: [TmapMatchedPoint]
}

struct TmapRoadService {
    private let client: TmapAPIClient

    init(client: TmapAPIClient = TmapAPIClient()) {
        self.client = client
    }

    func nearestRoad(to coordinate: CLLocationCoordinate2D) async throws -> TmapNearbyRoadMatch {
        let data = try await client.getJSONData(
            path: "/tmap/road/nearToRoad",
            queryItems: [
                URLQueryItem(name: "version", value: "1"),
                URLQueryItem(name: "lat", value: String(coordinate.latitude)),
                URLQueryItem(name: "lon", value: String(coordinate.longitude)),
                URLQueryItem(name: "opt", value: "0"),
                URLQueryItem(name: "radius", value: "80"),
                URLQueryItem(name: "vehicleType", value: "5")
            ]
        )

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let resultData = json["resultData"] as? [String: Any],
            let header = resultData["header"] as? [String: Any]
        else {
            throw TmapAPIError.invalidResponse
        }

        let roadName = (header["roadName"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let roadCategory = (header["roadCategory"] as? NSNumber)?.intValue ?? 99
        let tollLink = (header["tollLink"] as? NSNumber)?.intValue ?? 0
        let speed = (header["speed"] as? NSNumber)?.intValue ?? 0
        let linkId = (header["linkId"] as? String) ?? ""

        return TmapNearbyRoadMatch(
            roadName: roadName,
            roadCategory: roadCategory,
            tollLink: tollLink,
            linkId: linkId,
            speed: speed
        )
    }

    func matchRoads(for coordinates: [CLLocationCoordinate2D]) async throws -> TmapMatchedRoadTrace {
        guard coordinates.count >= 2 else {
            throw TmapAPIError.invalidResponse
        }

        let serializedCoords = coordinates
            .map { "\($0.longitude),\($0.latitude)" }
            .joined(separator: "|")

        let data = try await client.postFormData(
            path: "/tmap/road/matchToRoads",
            queryItems: [URLQueryItem(name: "version", value: "1")],
            formFields: [
                "responseType": "1",
                "coords": serializedCoords
            ]
        )

        guard
            let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let resultData = json["resultData"] as? [String: Any],
            let header = resultData["header"] as? [String: Any],
            let rawPoints = resultData["matchedPoints"] as? [[String: Any]]
        else {
            throw TmapAPIError.invalidResponse
        }

        let matchedPoints = rawPoints.compactMap { point -> TmapMatchedPoint? in
            guard
                let matchedLocation = point["matchedLocation"] as? [String: Any],
                let latitude = Self.doubleValue(in: matchedLocation, keys: ["latitude", "lat"]),
                let longitude = Self.doubleValue(in: matchedLocation, keys: ["longitude", "lon"])
            else {
                return nil
            }

            return TmapMatchedPoint(
                coordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
                roadCategory: (point["roadCategory"] as? NSNumber)?.intValue ?? 99,
                speed: (point["speed"] as? NSNumber)?.intValue ?? 0,
                linkId: (point["linkId"] as? String) ?? ""
            )
        }

        return TmapMatchedRoadTrace(
            totalDistance: (header["totalDistance"] as? NSNumber)?.intValue ?? 0,
            matchedLinkCount: (header["matchedLinkCount"] as? NSNumber)?.intValue ?? 0,
            matchedPoints: matchedPoints
        )
    }

    private static func doubleValue(in dictionary: [String: Any], keys: [String]) -> Double? {
        for key in keys {
            if let value = dictionary[key] as? Double {
                return value
            }
            if let value = dictionary[key] as? NSNumber {
                return value.doubleValue
            }
            if let value = dictionary[key] as? String, let parsed = Double(value) {
                return parsed
            }
        }
        return nil
    }
}
