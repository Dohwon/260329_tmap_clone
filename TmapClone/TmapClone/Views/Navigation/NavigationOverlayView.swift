import SwiftUI
import MapKit

struct NavigationOverlayView: View {
    @EnvironmentObject var mapVM: MapViewModel
    let route: AppRoute
    let routeSummary: RouteSummary?
    let mergeOptions: [MergeOption]
    let onEnd: () -> Void

    @State private var currentStepIndex: Int = 0

    private var currentStep: AppRouteStep? {
        guard currentStepIndex < route.steps.count else { return nil }
        return route.steps[currentStepIndex]
    }

    private var speedLimit: Int {
        routeSummary?.dominantSpeedLimit ?? 100
    }

    private var remainingDistance: Double {
        mapVM.navigationProgress?.remainingDistance ?? route.distance
    }

    private var remainingTime: Double {
        mapVM.navigationProgress?.remainingTime ?? route.expectedTravelTime
    }

    private var preferredRoadLabel: String? {
        route.preferredRoadLabel
    }

    var body: some View {
        VStack(spacing: 0) {
            // MARK: - Turn Direction Banner
            HStack(spacing: 16) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(TmapColor.primary)
                        .frame(width: 64, height: 64)
                    Image(systemName: "arrow.up")
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                }

                VStack(alignment: .leading, spacing: 4) {
                    if let step = currentStep {
                        Text(step.instruction)
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                            .lineLimit(2)
                        Text(formatDistance(step.distance))
                            .font(.system(size: 15))
                            .foregroundColor(.white.opacity(0.85))
                    } else {
                        Text("목적지에 도착했습니다")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(.white)
                    }
                }
                Spacer()

                Button(action: onEnd) {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.white)
                        .padding(10)
                        .background(Color.white.opacity(0.2))
                        .clipShape(Circle())
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(
                LinearGradient(
                    colors: [TmapColor.primary, TmapColor.primaryDark],
                    startPoint: .leading,
                    endPoint: .trailing
                )
            )

            // MARK: - Route Stats Bar
            HStack {
                NavigationStatItem(
                    title: "남은거리",
                    value: formatDistance(remainingDistance),
                    icon: "road.lanes"
                )
                Divider().frame(height: 32)
                NavigationStatItem(
                    title: "도착예정",
                    value: arrivalTime(),
                    icon: "clock"
                )
                Divider().frame(height: 32)
                NavigationStatItem(
                    title: "남은시간",
                    value: formatDuration(remainingTime),
                    icon: "timer"
                )

                Spacer()

                if mapVM.locationService.speed > 0 {
                    VStack(spacing: 2) {
                        Text("\(Int(mapVM.locationService.speed))")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(TmapColor.primary)
                        Text("km/h")
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                    .padding(.trailing, 16)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 10)
            .background(Color.white)
            .shadow(color: .black.opacity(0.08), radius: 4, y: 2)

            HStack {
                Label(mapVM.isRerouting ? "실시간 재탐색 중" : mapVM.navigationStatusMessage, systemImage: "dot.radiowaves.left.and.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(mapVM.navigationProgress?.isOffRoute == true ? .orange : TmapColor.primary)
                Spacer()
                if let preferredRoadLabel {
                    VStack(alignment: .trailing, spacing: 1) {
                        Text("\(preferredRoadLabel) • \(mapVM.preferredRoadAdherence.shortLabel)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(preferredRoadColor)
                        if let currentRoadName = mapVM.preferredRoadAdherence.currentRoadName {
                            Text(currentRoadName)
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        } else if let distance = mapVM.preferredRoadAdherence.distanceToPreferredRoad {
                            Text("도로 축 \(formatDistance(distance))")
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                        }
                    }
                } else if let progress = mapVM.navigationProgress {
                    Text("이탈 \(Int(progress.distanceFromRoute))m")
                        .font(.system(size: 11))
                        .foregroundColor(progress.isOffRoute ? .orange : .secondary)
                } else {
                    Text("현재는 경로 미리보기 기반 안내")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color(.systemGray6))

            // MARK: - Camera & Speed Limit Info Bar
            HStack(spacing: 0) {
                // Speed limit badge
                HStack(spacing: 6) {
                    ZStack {
                        Circle()
                            .stroke(Color.red, lineWidth: 2.5)
                            .frame(width: 32, height: 32)
                        Text("\(speedLimit)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.red)
                    }
                    Text("제한")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 14)

                Divider().frame(height: 28)

                // Next fixed camera (mock Phase 1)
                HStack(spacing: 6) {
                    Image(systemName: "camera.fill")
                        .foregroundColor(.orange)
                        .font(.system(size: 14))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("다음 카메라")
                            .font(.system(size: 10))
                            .foregroundColor(.secondary)
                        Text("2.3km")
                            .font(.system(size: 13, weight: .semibold))
                    }
                }
                .padding(.horizontal, 14)

                if let summary = routeSummary, summary.sectionCameraCount > 0 {
                    Divider().frame(height: 28)

                    // Section enforcement
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.triangle.fill")
                            .foregroundColor(.red)
                            .font(.system(size: 13))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("구간단속")
                                .font(.system(size: 10))
                                .foregroundColor(.secondary)
                            Text(String(format: "%.1fkm 남음", summary.sectionEnforcementKm))
                                .font(.system(size: 13, weight: .semibold))
                        }
                    }
                    .padding(.horizontal, 14)
                }

                Spacer()
            }
            .padding(.vertical, 8)
            .background(Color(.systemGray6))

            // MARK: - Next Merge Preview
            if let nextMerge = mergeOptions.first {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.triangle.branch")
                        .foregroundColor(.purple)
                        .font(.system(size: 14))
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(nextMerge.distanceText) • \(nextMerge.name)")
                            .font(.system(size: 13, weight: .semibold))
                            .lineLimit(1)
                        Text(nextMerge.note)
                            .font(.system(size: 11))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Text(nextMerge.addedTimeText)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(nextMerge.addedTime <= 60 ? .green : .orange)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.white)
                .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
            }
        }
    }

    private func formatDistance(_ meters: Double) -> String {
        if meters >= 1000 {
            return String(format: "%.1fkm", meters / 1000)
        }
        return "\(Int(meters))m"
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = Int(seconds)
        let h = total / 3600
        let m = (total % 3600) / 60
        if h > 0 { return "\(h)시간\(m)분" }
        return "\(m)분"
    }

    private func arrivalTime() -> String {
        let arrival = Date().addingTimeInterval(remainingTime)
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: arrival)
    }

    private var preferredRoadColor: Color {
        switch mapVM.preferredRoadAdherence.state {
        case .onPreferredRoad:
            return .green
        case .approaching:
            return .blue
        case .leavingPreferredRoad, .offPreferredRoad:
            return .orange
        case .evaluating:
            return TmapColor.primary
        case .inactive:
            return .secondary
        }
    }
}

struct NavigationStatItem: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(spacing: 2) {
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.primary)
            Text(title)
                .font(.system(size: 11))
                .foregroundColor(.secondary)
        }
        .padding(.horizontal, 12)
    }
}
