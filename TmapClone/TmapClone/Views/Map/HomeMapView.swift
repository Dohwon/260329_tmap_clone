import SwiftUI
import MapKit

struct HomeMapView: View {
    @EnvironmentObject var appState: AppState
    @EnvironmentObject var mapVM: MapViewModel
    @State private var showNavigationMode: Bool = false
    @State private var showLayerSheet: Bool = false
    @State private var routeRefreshTask: Task<Void, Never>?

    var body: some View {
        ZStack(alignment: .top) {
            // MARK: - Map
            MapLayerView()
                .environmentObject(mapVM)
                .ignoresSafeArea()

            // MARK: - Navigation Overlay
            if showNavigationMode, let route = mapVM.selectedRoute {
                NavigationOverlayView(
                    route: route,
                    routeSummary: mapVM.routeSummaries.first(where: { $0.routeID == route.id }),
                    mergeOptions: mapVM.mergeOptions
                ) {
                    showNavigationMode = false
                    appState.isNavigating = false
                    mapVM.stopActiveNavigation()
                    mapVM.clearRoutePreview()
                    mapVM.disable3DMode()
                }
                .environmentObject(mapVM)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            // MARK: - Top Search Bar (non-nav mode)
            if !showNavigationMode {
                VStack(spacing: 0) {
                    TmapSearchBar(onTap: {
                        appState.selectedTab = .search
                    })
                    .padding(.horizontal, 16)
                    .padding(.top, 8)

                    Spacer()
                }
            }

            if mapVM.routeState == .loading {
                Color.black.opacity(0.15)
                    .ignoresSafeArea()

                VStack(spacing: 12) {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                    Text("경로를 계산하고 있습니다")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                    if let destination = appState.destination {
                        Text(destination.name)
                            .font(.system(size: 13))
                            .foregroundColor(.white.opacity(0.85))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 20)
                .background(Color.black.opacity(0.72))
                .cornerRadius(16)
            }

            // MARK: - Highway Mode Indicator
            if !showNavigationMode, let highway = mapVM.selectedHighway {
                VStack {
                    Spacer()
                        .frame(height: 100)
                    HighwayModeIndicator(highway: highway) {
                        mapVM.resetToDefaultCameras()
                    }
                    .padding(.horizontal, 16)
                    Spacer()
                }
            }

            // MARK: - Right Floating Buttons
            if !showNavigationMode {
                HStack {
                    Spacer()
                    VStack(spacing: 12) {
                        Spacer()
                        MapFloatingButton(icon: "location.fill") {
                            mapVM.centerOnUser()
                        }
                        MapFloatingButton(icon: "camera.fill") {
                            mapVM.enable3DMode()
                        }
                        MapFloatingButton(icon: "map") {
                            showLayerSheet = true
                        }
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 200)
                }
            }

            // MARK: - Bottom Quick Panel
            if !showNavigationMode {
                VStack {
                    Spacer()
                    HomeBottomPanel(onDestinationSelected: { result in
                        Task {
                            appState.destination = result
                            let didStart = await mapVM.startNavigation(
                                to: result,
                                profile: appState.driverProfile,
                                preferences: appState.routePreferences,
                                preferredHighway: mapVM.selectedHighway
                            )
                            await MainActor.run {
                                appState.showRouteSheet = didStart
                            }
                        }
                    })
                    .environmentObject(mapVM)
                    .environmentObject(appState)
                    .padding(.bottom, 88)
                }
            }

            // MARK: - Route Preview Sheet
            if appState.showRouteSheet, !mapVM.allRoutes.isEmpty {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture { appState.showRouteSheet = false }

                VStack {
                    Spacer()
                    RoutePreviewPanel(
                        routes: mapVM.allRoutes,
                        routeSummaries: mapVM.routeSummaries,
                        mergeOptions: mapVM.mergeOptions,
                        selectedRoute: Binding(
                            get: { mapVM.selectedRoute },
                            set: { newRoute in
                                if let route = newRoute {
                                    mapVM.selectRoute(route)
                                } else { mapVM.selectedRoute = nil }
                            }
                        ),
                        driverProfile: $appState.driverProfile,
                        routePreferences: $appState.routePreferences,
                        planningSummary: mapVM.preferredRoadPlan?.summary,
                        preferredRoadLabel: mapVM.selectedHighway?.displayLabel,
                        onStart: {
                            appState.showRouteSheet = false
                            appState.isNavigating = true
                            showNavigationMode = true
                            mapVM.startActiveNavigation(
                                profile: appState.driverProfile,
                                preferences: appState.routePreferences,
                                preferredHighway: mapVM.selectedHighway
                            )
                            mapVM.enable3DMode()
                        },
                        onCancel: {
                            appState.showRouteSheet = false
                            mapVM.clearRoutePreview()
                        },
                        onProfileChanged: { newProfile in
                            scheduleRouteRefresh(
                                profile: newProfile,
                                preferences: appState.routePreferences
                            )
                        },
                        onPreferencesChanged: { newPreferences in
                            scheduleRouteRefresh(
                                profile: appState.driverProfile,
                                preferences: newPreferences
                            )
                        }
                    )
                    .transition(.move(edge: .bottom))
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: appState.showRouteSheet)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: showNavigationMode)
        .sheet(isPresented: $showLayerSheet) {
            LayerToggleSheet(layerVisibility: $mapVM.layerVisibility)
        }
        .alert(
            "경로 안내",
            isPresented: Binding(
                get: { mapVM.alertMessage != nil },
                set: { if !$0 { mapVM.dismissAlert() } }
            )
        ) {
            Button("확인", role: .cancel) {}
        } message: {
            Text(mapVM.alertMessage ?? "")
        }
    }

    private func scheduleRouteRefresh(
        profile: DriverProfile,
        preferences: RoutePreferences
    ) {
        routeRefreshTask?.cancel()
        routeRefreshTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }

            let didRefresh = await mapVM.refreshRoutePreview(
                profile: profile,
                preferences: preferences,
                preferredHighway: mapVM.selectedHighway
            )

            guard !Task.isCancelled else { return }
            if !didRefresh {
                mapVM.updateRouteSummaries(
                    profile: profile,
                    preferences: preferences,
                    preferredHighway: mapVM.selectedHighway
                )
            }
        }
    }
}

// MARK: - Highway Mode Indicator

struct HighwayModeIndicator: View {
    let highway: KoreanHighway
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 4) {
                Text(highway.routeNumber)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(.white)
                    .frame(width: 22, height: 22)
                    .background(Color.green)
                    .cornerRadius(4)
                VStack(alignment: .leading, spacing: 1) {
                    Text(highway.name)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.primary)
                    Text("\(highway.startAddress) → \(highway.endAddress)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            HStack(spacing: 4) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 11))
                    .foregroundColor(.orange)
                Text("카메라 \(highway.mockCameras.count)개")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(.secondary)
            }
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.secondary)
                    .padding(6)
                    .background(Color(.systemGray5))
                    .clipShape(Circle())
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.regularMaterial)
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.08), radius: 6, y: 2)
    }
}

// MARK: - Layer Toggle Sheet

struct LayerToggleSheet: View {
    @Binding var layerVisibility: LayerVisibility
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            List {
                Section("지도 레이어") {
                    Toggle("합류/출구 지점", isOn: $layerVisibility.showMergePoints)
                    Toggle("과속 카메라", isOn: $layerVisibility.showSpeedCameras)
                    Toggle("구간단속 구역", isOn: $layerVisibility.showSectionEnforcement)
                    Toggle("제한속도 표시", isOn: $layerVisibility.showSpeedLimits)
                    Toggle("고속도로 구간 표시", isOn: $layerVisibility.showHighwayMarkers)
                }
            }
            .navigationTitle("레이어 설정")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("완료") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
    }
}
