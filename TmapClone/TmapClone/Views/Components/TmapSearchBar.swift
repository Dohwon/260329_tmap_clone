import SwiftUI

struct TmapSearchBar: View {
    @Binding var query: String
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
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

                Image(systemName: "mic.fill")
                    .foregroundColor(TmapColor.primary)
                    .font(.system(size: 16))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
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
