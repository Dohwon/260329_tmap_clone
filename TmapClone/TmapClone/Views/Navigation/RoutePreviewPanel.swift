import SwiftUI
import MapKit

struct RoutePreviewPanel: View {
    let routes: [AppRoute]
    let routeSummaries: [RouteSummary]
    let mergeOptions: [MergeOption]
    @Binding var selectedRoute: AppRoute?
    @Binding var driverProfile: DriverProfile
    @Binding var routePreferences: RoutePreferences
    let planningSummary: String?
    let preferredRoadLabel: String?
    let onStart: () -> Void
    let onCancel: () -> Void
    var onProfileChanged: ((DriverProfile) -> Void)? = nil
    var onPreferencesChanged: ((RoutePreferences) -> Void)? = nil

    @State private var showMergeOptions = false

    var body: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 8)

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 12) {
                    if let preferredRoadLabel {
                        HStack(spacing: 8) {
                            Image(systemName: "road.lanes")
                                .foregroundColor(TmapColor.primary)
                            Text("선호 도로 반영: \(preferredRoadLabel)")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.primary)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color(.systemGray6))
                        .cornerRadius(12)
                        .padding(.horizontal, 16)
                    }

                    if let planningSummary {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.triangle.swap")
                                .foregroundColor(.secondary)
                            Text(planningSummary)
                                .font(.system(size: 12))
                                .foregroundColor(.secondary)
                            Spacer()
                        }
                        .padding(.horizontal, 16)
                    }

                    DriverProfilePickerView(selected: $driverProfile)
                        .padding(.horizontal, 16)

                    RoutePreferenceFilterView(preferences: $routePreferences)
                        .padding(.horizontal, 16)

                    Divider()
                        .padding(.horizontal, 16)

                    VStack(spacing: 10) {
                        if routeSummaries.isEmpty {
                            ForEach(Array(routes.enumerated()), id: \.offset) { index, route in
                                RouteOptionRow(
                                    route: route,
                                    label: index == 0 ? "빠른길" : "대안\(index)",
                                    isSelected: selectedRoute?.id == route.id,
                                    isBest: index == 0
                                )
                                .onTapGesture { selectedRoute = route }
                            }
                        } else {
                            ForEach(routeSummaries) { summary in
                                RouteSummaryCard(
                                    summary: summary,
                                    isSelected: selectedRoute?.id == summary.routeID
                                )
                                .onTapGesture {
                                    if let route = routes.first(where: { $0.id == summary.routeID }) {
                                        selectedRoute = route
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)

                    if !mergeOptions.isEmpty {
                        VStack(spacing: 8) {
                            Button(action: { withAnimation(.easeInOut(duration: 0.2)) { showMergeOptions.toggle() } }) {
                                HStack {
                                    Image(systemName: "arrow.triangle.branch")
                                        .foregroundColor(TmapColor.primary)
                                    Text("다음 10km 합류 옵션")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundColor(.primary)
                                    Spacer()
                                    Image(systemName: showMergeOptions ? "chevron.up" : "chevron.down")
                                        .foregroundColor(.secondary)
                                        .font(.system(size: 12))
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(Color(.systemGray6))
                                .cornerRadius(10)
                            }
                            .padding(.horizontal, 16)

                            if showMergeOptions {
                                ForEach(mergeOptions) { option in
                                    MergeOptionCard(option: option)
                                        .padding(.horizontal, 16)
                                }
                            }
                        }
                    }
                }
                .padding(.bottom, 8)
            }
            .frame(maxHeight: 440)

            Divider().padding(.vertical, 8)

            HStack(spacing: 12) {
                Button(action: onCancel) {
                    Text("취소")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 52)
                        .background(Color(.systemGray5))
                        .cornerRadius(12)
                }

                Button(action: onStart) {
                    HStack(spacing: 6) {
                        Image(systemName: "location.north.fill")
                        Text("안내 시작")
                    }
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .frame(height: 52)
                    .background(TmapColor.primary)
                    .cornerRadius(12)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 32)
        }
        .background(Color(.systemBackground))
        .cornerRadius(20, corners: [.topLeft, .topRight])
        .shadow(color: .black.opacity(0.12), radius: 16, y: -4)
        .onChange(of: driverProfile) { _, newProfile in
            onProfileChanged?(newProfile)
        }
        .onChange(of: routePreferences) { _, newPreferences in
            onPreferencesChanged?(newPreferences)
        }
    }
}

// MARK: - Driver Profile Picker

struct DriverProfilePickerView: View {
    @Binding var selected: DriverProfile

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("운전 성향")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.secondary)

            HStack(spacing: 8) {
                ForEach(DriverProfile.allCases) { profile in
                    Button(action: { selected = profile }) {
                        Text(profile.rawValue)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(selected == profile ? .white : .primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .background(selected == profile ? TmapColor.primary : Color(.systemGray5))
                            .cornerRadius(8)
                    }
                }
            }

            Text(selected.description)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
                .padding(.horizontal, 2)
        }
    }
}

// MARK: - Route Preference Filters

struct RoutePreferenceFilterView: View {
    @Binding var preferences: RoutePreferences

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(title: "해당도로 선호", isActive: preferences.preferHighway) {
                    preferences.preferHighway.toggle()
                }
                FilterChip(title: "산길도로 선호", isActive: preferences.preferMountainRoad) {
                    preferences.preferMountainRoad.toggle()
                }
                FilterChip(title: "좁은 길 포함", isActive: preferences.allowNarrowRoad) {
                    preferences.allowNarrowRoad.toggle()
                }
            }
        }
    }
}

struct FilterChip: View {
    let title: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(isActive ? TmapColor.primary : .secondary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    RoundedRectangle(cornerRadius: 16)
                        .fill(isActive ? TmapColor.primary.opacity(0.12) : Color(.systemGray6))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(isActive ? TmapColor.primary : Color.clear, lineWidth: 1)
                        )
                )
        }
    }
}

// MARK: - Route Summary Card

struct RouteSummaryCard: View {
    let summary: RouteSummary
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(isSelected ? TmapColor.primary : Color(.systemGray5))
                        .frame(width: 44, height: 44)
                    Image(systemName: "car.fill")
                        .font(.system(size: 18))
                        .foregroundColor(isSelected ? .white : .secondary)
                }

                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(summary.title)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(isSelected ? TmapColor.primary : .primary)
                        if summary.isRecommended {
                            Text("추천")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(TmapColor.primary)
                                .cornerRadius(4)
                        }
                    }
                    HStack(spacing: 10) {
                        Label(summary.etaText, systemImage: "clock")
                        Label(summary.distanceText, systemImage: "road.lanes")
                    }
                    .font(.system(size: 13))
                    .foregroundColor(.secondary)
                }

                Spacer()

                if isSelected {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(TmapColor.primary)
                        .font(.system(size: 20))
                }
            }

            Text(summary.explanation)
                .font(.system(size: 12))
                .foregroundColor(.secondary)

            if let preferredRoadLabel = summary.preferredRoadLabel {
                Label(preferredRoadLabel, systemImage: "star.fill")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(TmapColor.primary)
            }

            HStack(spacing: 6) {
                StatBadge(
                    icon: "road.lanes.dashed",
                    label: "고속 \(Int(summary.highwayRatio * 100))%",
                    color: .blue
                )
                StatBadge(
                    icon: "camera.fill",
                    label: "카메라 \(summary.totalCameraCount)개",
                    color: .orange
                )
                StatBadge(
                    icon: "car.2",
                    label: summary.congestionLabel,
                    color: congestionColor(summary.congestionScore)
                )
                StatBadge(
                    icon: "arrow.triangle.merge",
                    label: "합류 \(summary.mergeCount)회",
                    color: .purple
                )
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isSelected ? TmapColor.primary.opacity(0.08) : Color(.systemGray6))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(isSelected ? TmapColor.primary : Color.clear, lineWidth: 1.5)
                )
        )
    }

    private func congestionColor(_ score: Int) -> Color {
        switch score {
        case 1: return .green
        case 2: return Color(red: 0.8, green: 0.6, blue: 0)
        case 3: return .orange
        default: return .red
        }
    }
}

struct StatBadge: View {
    let icon: String
    let label: String
    let color: Color

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: icon)
                .font(.system(size: 10))
            Text(label)
                .font(.system(size: 11, weight: .medium))
        }
        .foregroundColor(color)
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(color.opacity(0.1))
        .cornerRadius(6)
    }
}

// MARK: - Merge Option Card

struct MergeOptionCard: View {
    let option: MergeOption

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.purple.opacity(0.1))
                    .frame(width: 36, height: 36)
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 14))
                    .foregroundColor(.purple)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(option.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(.primary)
                Text(option.note)
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(option.distanceText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.primary)
                Text(option.addedTimeText)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(option.addedTime <= 60 ? .green : .orange)
            }
        }
        .padding(12)
        .background(Color(.systemGray6))
        .cornerRadius(10)
    }
}

// MARK: - Legacy Route Option Row (fallback)

struct RouteOptionRow: View {
    let route: AppRoute
    let label: String
    let isSelected: Bool
    let isBest: Bool

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(isSelected ? TmapColor.primary : Color(.systemGray5))
                    .frame(width: 44, height: 44)
                Image(systemName: "car.fill")
                    .font(.system(size: 18))
                    .foregroundColor(isSelected ? .white : .secondary)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(label)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(isSelected ? TmapColor.primary : .primary)
                    if isBest {
                        Text("추천")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(TmapColor.primary)
                            .cornerRadius(4)
                    }
                }
                HStack(spacing: 12) {
                    Label(formatDuration(route.expectedTravelTime), systemImage: "clock")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                    Label(formatDistance(route.distance), systemImage: "road.lanes")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }
            }

            Spacer()

            if isSelected {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(TmapColor.primary)
                    .font(.system(size: 20))
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(isSelected ? TmapColor.primary.opacity(0.08) : Color(.systemGray6))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(isSelected ? TmapColor.primary : Color.clear, lineWidth: 1.5)
                )
        )
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        if h > 0 { return "\(h)시간 \(m)분" }
        return "\(m)분"
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters >= 1000 { return String(format: "%.1fkm", meters / 1000) }
        return "\(Int(meters))m"
    }
}
