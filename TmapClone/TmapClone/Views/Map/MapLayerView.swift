import SwiftUI
import MapKit

struct MapLayerView: View {
    @EnvironmentObject var mapVM: MapViewModel

    var body: some View {
        Map(position: $mapVM.cameraPosition) {
            // User location
            UserAnnotation()

            // Speed cameras
            ForEach(mapVM.speedCameras) { camera in
                Annotation(
                    "\(camera.speedLimit)km/h",
                    coordinate: camera.coordinate
                ) {
                    SpeedCameraAnnotationView(camera: camera)
                }
            }

            // Selected route
            if let route = mapVM.selectedRoute {
                MapPolyline(route.polyline)
                    .stroke(TmapColor.primary, lineWidth: 6)
            }

            // Alternative routes
            ForEach(mapVM.allRoutes.dropFirst(), id: \.self) { route in
                MapPolyline(route.polyline)
                    .stroke(Color.gray.opacity(0.5), lineWidth: 4)
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
        .onMapCameraChange { context in
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
                Image(systemName: "camera.fill")
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
