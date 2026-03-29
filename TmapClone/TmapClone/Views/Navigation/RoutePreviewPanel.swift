import SwiftUI
import MapKit

struct RoutePreviewPanel: View {
    let routes: [MKRoute]
    @Binding var selectedRoute: MKRoute?
    let onStart: () -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            Capsule()
                .fill(Color.secondary.opacity(0.3))
                .frame(width: 40, height: 4)
                .padding(.top, 12)
                .padding(.bottom, 8)

            // Route options
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 10) {
                    ForEach(Array(routes.enumerated()), id: \.offset) { index, route in
                        RouteOptionRow(
                            route: route,
                            label: index == 0 ? "빠른길" : "대안\(index)",
                            isSelected: selectedRoute == route,
                            isBest: index == 0
                        )
                        .onTapGesture { selectedRoute = route }
                    }
                }
                .padding(.horizontal, 16)
            }
            .frame(maxHeight: 240)

            Divider().padding(.vertical, 8)

            // Action buttons
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
    }
}

struct RouteOptionRow: View {
    let route: MKRoute
    let label: String
    let isSelected: Bool
    let isBest: Bool

    var body: some View {
        HStack(spacing: 14) {
            // Route type icon
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
