import SwiftUI

struct MoreView: View {
    var body: some View {
        NavigationStack {
            List {
                // Drive section
                Section {
                    MoreMenuItem(icon: "gauge.high", color: .orange, title: "드라이브 기록")
                    MoreMenuItem(icon: "chart.bar.fill", color: TmapColor.primary, title: "내 운전 습관")
                    MoreMenuItem(icon: "camera.on.rectangle", color: .purple, title: "블랙박스 연결")
                } header: {
                    Text("드라이브")
                }

                // Service section
                Section {
                    MoreMenuItem(icon: "fuelpump.fill", color: .yellow, title: "주유/충전소")
                    MoreMenuItem(icon: "p.square.fill", color: .green, title: "주차장 예약")
                    MoreMenuItem(icon: "car.fill", color: TmapColor.primary, title: "대리운전")
                    MoreMenuItem(icon: "bus.fill", color: .orange, title: "대중교통")
                } header: {
                    Text("서비스")
                }

                // Safety section
                Section {
                    MoreMenuItem(icon: "exclamationmark.triangle.fill", color: .red, title: "사고 신고")
                    MoreMenuItem(icon: "speedometer", color: .orange, title: "과속 카메라 정보")
                    MoreMenuItem(icon: "shield.fill", color: TmapColor.primary, title: "안전 운전 모드")
                } header: {
                    Text("안전")
                }

                // Settings
                Section {
                    MoreMenuItem(icon: "gearshape.fill", color: .gray, title: "설정")
                    MoreMenuItem(icon: "questionmark.circle.fill", color: .gray, title: "고객센터")
                    MoreMenuItem(icon: "info.circle.fill", color: .gray, title: "앱 정보")
                } header: {
                    Text("설정")
                }

                Section {
                    HStack {
                        MoreMenuItem(
                            icon: TmapConfiguration.isConfigured ? "checkmark.shield.fill" : "exclamationmark.triangle.fill",
                            color: TmapConfiguration.isConfigured ? .green : .orange,
                            title: "TMAP 연동 상태"
                        )
                        Text(TmapConfiguration.isConfigured ? "설정됨" : "앱 키 필요")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(TmapConfiguration.isConfigured ? .green : .orange)
                    }
                } header: {
                    Text("개발 진단")
                } footer: {
                    Text("실서비스 전에는 Info.plist의 TMAPAppKey를 설정해야 합니다.")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("더보기")
            .navigationBarTitleDisplayMode(.large)
        }
    }
}

struct MoreMenuItem: View {
    let icon: String
    let color: Color
    let title: String

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(color)
                    .frame(width: 32, height: 32)
                Image(systemName: icon)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
            }
            Text(title)
                .font(.system(size: 15))
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(.tertiary)
        }
        .padding(.vertical, 2)
    }
}
