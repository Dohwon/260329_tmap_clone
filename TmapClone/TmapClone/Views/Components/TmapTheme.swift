import SwiftUI

enum TmapColor {
    static let primary = Color(red: 0.0, green: 0.49, blue: 1.0)       // T맵 블루 #007EFF
    static let primaryDark = Color(red: 0.0, green: 0.35, blue: 0.85)
    static let accent = Color(red: 1.0, green: 0.4, blue: 0.0)          // 주황 포인트
    static let trafficGreen = Color(red: 0.2, green: 0.78, blue: 0.35)
    static let trafficOrange = Color(red: 1.0, green: 0.6, blue: 0.0)
    static let trafficRed = Color(red: 0.95, green: 0.2, blue: 0.2)
}

extension View {
    func cornerRadius(_ radius: CGFloat, corners: UIRectCorner) -> some View {
        clipShape(RoundedCornerShape(radius: radius, corners: corners))
    }
}

struct RoundedCornerShape: Shape {
    var radius: CGFloat
    var corners: UIRectCorner

    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: corners,
            cornerRadii: CGSize(width: radius, height: radius)
        )
        return Path(path.cgPath)
    }
}
