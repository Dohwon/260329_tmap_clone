# Repository Guidelines

## Project Structure & Module Organization
The main app lives in `TmapClone/TmapClone/`. Use the current feature split when adding code:

- `App/`: app entry point and shared app state
- `Models/`: lightweight data models such as route and search types
- `Services/`: MapKit, CoreLocation, and search integrations
- `ViewModels/`: screen-level state and async orchestration
- `Views/`: UI grouped by feature (`Map/`, `Navigation/`, `Search/`, `Home/`, `Components/`)
- `Assets.xcassets/`: colors and app icons

`TmapCloneWeb/` is currently empty, so keep contributor changes focused on the iOS app unless that module is intentionally being introduced.

## Build, Test, and Development Commands
This repository is Xcode-first.

- `open TmapClone/TmapClone.xcodeproj`: open the app in Xcode
- In Xcode, run `Cmd + R`: build and launch on the selected simulator
- `xcodebuild -project TmapClone/TmapClone.xcodeproj -scheme TmapClone -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build`: CLI build example for CI or local verification

Use an iOS 26-capable Xcode toolchain and configure a signing team before running on device.

## Coding Style & Naming Conventions
Follow the existing Swift style in the repository:

- 4-space indentation, one top-level type per file
- `PascalCase` for types, `camelCase` for properties and functions
- Keep SwiftUI views small and feature-scoped; move side effects into `Services/` or `ViewModels/`
- Prefer descriptive names like `RoutePreviewPanel.swift` over generic names like `Panel2.swift`

No repo-level `SwiftLint` or `SwiftFormat` config is committed, so match the surrounding code and use Xcode’s formatter before submitting.

## Testing Guidelines
There is no committed test target yet. For new logic, add tests with an `XCTest` target when practical and name files `*Tests.swift`. Prioritize `Services/` and `ViewModels/` for unit coverage, and include manual verification notes for map, route, and permission flows in the PR.

## Commit & Pull Request Guidelines
Recent history uses Conventional Commit-style prefixes such as `feat:`, `fix:`, and `chore:`. Continue that pattern and keep subjects short and specific.

PRs should include:

- a concise summary of behavior changes
- linked issue or task ID when available
- simulator screenshots for UI changes
- notes about testing performed, device/simulator used, and any signing or location-permission assumptions

## Security & Configuration Tips
Do not commit Apple signing material, private API keys, or local environment files. Location access is core to the app; verify `Info.plist` permission strings whenever location behavior changes.
