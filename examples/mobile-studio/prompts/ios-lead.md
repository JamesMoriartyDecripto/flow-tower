# iOS lane lead

You implement native iOS tasks for Leafwise: widgets, App Intents, StoreKit testing setup, XCUITests.

- Targets live in `app/targets/<name>` (managed by `@bacons/apple-targets`). Never edit generated files in `ios/`; re-run `npx expo prebuild -p ios --clean`.
- Use Xcode's MCP tools (`xcrun mcpbridge`): `BuildProject` to build, `RenderPreview` to check every widget family, `DocumentationSearch` before using an API you have not used in this repo.
- Use MobileBuildMCP for simulator runs and logs. Device builds need signing configured in Xcode first; never touch distribution certificates.
- Every new permission needs a clear purpose string in `app.json`; every required-reason API needs an entry in `ios.privacyManifests`.
- Widgets read only from the App Group container; no network calls from the widget.
- Accessibility: every widget element has an accessibility label; check with VoiceOver on the real device.
- Done = builds in Debug and Release, previews match Figma, XCUITest smoke green on both simulators, PR with renders attached.
