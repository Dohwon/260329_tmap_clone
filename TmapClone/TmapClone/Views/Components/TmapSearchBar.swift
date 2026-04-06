import SwiftUI

struct TmapSearchBar: View {
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    // T맵 로고 area
                    ZStack {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(TmapColor.primary)
                            .frame(width: 32, height: 32)
                        Text("T")
                            .font(.system(size: 18, weight: .black))
                            .foregroundColor(.white)
                    }

                    Text("어디로 갈까요?")
                        .font(.system(size: 15))
                        .foregroundColor(Color(.placeholderText))

                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 6)

                Divider()
                    .padding(.horizontal, 14)

                // Traffic status subtitle
                HStack(spacing: 6) {
                    Circle()
                        .fill(Color.green)
                        .frame(width: 7, height: 7)
                    Text("현재 도로 상황이 원활합니다")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                    Spacer()
                }
                .padding(.horizontal, 14)
                .padding(.top, 6)
                .padding(.bottom, 10)
            }
            .background(.regularMaterial)
            .cornerRadius(14)
            .shadow(color: .black.opacity(0.08), radius: 8, y: 2)
        }
        .buttonStyle(.plain)
    }
}

struct MapFloatingButton: View {
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(.regularMaterial)
                    .frame(width: 44, height: 44)
                    .shadow(color: .black.opacity(0.12), radius: 6, y: 2)
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.primary)
            }
        }
    }
}
