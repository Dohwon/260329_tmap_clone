import SwiftUI
import MapKit

struct MapLayerView: View {
    @EnvironmentObject var mapVM: MapViewModel

    var body: some View {
        Map(position: $mapVM.cameraPosition) {
            UserAnnotation()

            // Speed cameras (when layer visible)
            if mapVM.layerVisibility.showSpeedCameras {
                ForEach(mapVM.speedCameras) { camera in
                    Annotation(
                        "\(camera.speedLimit)km/h",
                        coordinate: camera.coordinate
                    ) {
                        SpeedCameraAnnotationView(camera: camera)
                    }
                }
            }

            // Selected route
            if let route = mapVM.selectedRoute {
                MapPolyline(coordinates: route.coordinates)
                    .stroke(TmapColor.primary, lineWidth: 6)
            }

            // Alternative routes
            ForEach(mapVM.allRoutes.dropFirst(), id: \.id) { route in
                MapPolyline(coordinates: route.coordinates)
                    .stroke(Color.gray.opacity(0.5), lineWidth: 4)
            }

            // Preferred road context: show endpoints and planned waypoints instead of a fake straight line
            if let highway = mapVM.selectedHighway {
                // Highway start annotation
                Annotation(highway.startAddress, coordinate: highway.start) {
                    HighwayEndpointView(label: "기점", color: .green)
                }

                // Highway end annotation (skip for circular routes)
                if highway.start.latitude != highway.end.latitude ||
                   highway.start.longitude != highway.end.longitude {
                    Annotation(highway.endAddress, coordinate: highway.end) {
                        HighwayEndpointView(label: "종점", color: .red)
                    }
                }
            }

            if let plan = mapVM.preferredRoadPlan {
                ForEach(plan.waypoints) { waypoint in
                    Annotation(waypoint.name, coordinate: waypoint.coordinate) {
                        PreferredRoadWaypointView(waypoint: waypoint)
                    }
                }
            }

            // Merge points (when layer visible and route selected)
            if mapVM.layerVisibility.showMergePoints, mapVM.selectedRoute != nil {
                ForEach(mapVM.mergeOptions) { option in
                    Annotation(option.name, coordinate: option.coordinate) {
                        MergePointAnnotationView(option: option)
                    }
                }
            }

            // Nearby POIs
            ForEach(mapVM.nearbyPOIs) { poi in
                Annotation(poi.name, coordinate: poi.coordinate) {
                    POIAnnotationView(poi: poi)
                }
            }
        }
        .mapControls {
            MapCompass()
                .mapControlVisibility(.visible)
        }
        .mapStyle(.standard(elevation: .realistic, pointsOfInterest: .all, showsTraffic: true))
        .onMapCameraChange { _ in
            mapVM.isTrackingUser = false
        }
    }
}

struct SpeedCameraAnnotationView: View {
    let camera: SpeedCamera

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(Color.orange)
                    .frame(width: 32, height: 32)
                Image(systemName: camera.type == .section ? "camera.metering.matrix" : "camera.fill")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundColor(.white)
            }
            Text("\(camera.speedLimit)")
                .font(.system(size: 10, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 4)
                .background(Color.orange.cornerRadius(4))
        }
    }
}

struct HighwayEndpointView: View {
    let label: String
    let color: Color

    var body: some View {
        VStack(spacing: 2) {
            ZStack {
                Circle()
                    .fill(color)
                    .frame(width: 28, height: 28)
                    .shadow(color: color.opacity(0.4), radius: 4, y: 2)
                Image(systemName: "flag.fill")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.white)
            }
            Text(label)
                .font(.system(size: 9, weight: .bold))
                .foregroundColor(.white)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(color)
                .cornerRadius(4)
        }
    }
}

struct MergePointAnnotationView: View {
    let option: MergeOption

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.purple.opacity(0.15))
                .frame(width: 36, height: 36)
            Circle()
                .stroke(Color.purple, lineWidth: 1.5)
                .frame(width: 36, height: 36)
            Image(systemName: "arrow.triangle.branch")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.purple)
        }
    }
}

struct POIAnnotationView: View {
    let poi: SearchResult

    var body: some View {
        ZStack {
            Circle()
                .fill(TmapColor.primary)
                .frame(width: 28, height: 28)
            Image(systemName: poi.category.icon)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
        }
    }
}

struct PreferredRoadWaypointView: View {
    let waypoint: RouteWaypoint

    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .fill(TmapColor.primary.opacity(0.15))
                    .frame(width: 34, height: 34)
                Circle()
                    .stroke(TmapColor.primary, lineWidth: 1.5)
                    .frame(width: 34, height: 34)
                Image(systemName: "point.topleft.down.curvedto.point.bottomright.up")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(TmapColor.primary)
            }

            Text(waypoint.name)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.primary)
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color(.systemBackground))
                .cornerRadius(6)
        }
    }
}
