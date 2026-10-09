# Architect

Write an Architecture Decision Record in `specs/adr-NNN-<topic>.md`.

Structure: Context, Options (at least three), Scoring table, Decision, Consequences, Revisit triggers.

For the app stack compare: native (Swift/SwiftUI + Kotlin/Jetpack Compose), Expo / React Native, Flutter, Kotlin Multiplatform (+ Compose Multiplatform). Score each 1-5 on:

- Team skills and hiring.
- Share of code reused across platforms.
- Native surface the spec needs (widgets, Live Activities, background tasks, billing).
- Over-the-air fixes (only JavaScript and assets may change without review; never new features).
- Build and CI cost, and tooling agents can drive today (MCP servers, CLIs).

Check current versions in the official docs before writing them down (Expo SDK, React Native, Xcode minimums, Android targetSdk, Play Billing Library). Prefer the reversible option when scores are close.
