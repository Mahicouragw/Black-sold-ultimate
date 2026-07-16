# PWA and Capacitor Mobile Builds

## Install

```bash
npm install
```

## Security and PWA checks

```bash
npm run pwa:check
npm run security
```

## Prepare and synchronize Capacitor

```bash
npm run cap:sync
```

The generated `www/` and native public asset copies are intentionally ignored; `cap:sync` recreates them.

## Android

Requirements: Node 20+, Android Studio/SDK, and JDK 17+.

```bash
npm run cap:android
# or command-line build
cd android
./gradlew assembleDebug
```

The sandbox used during development had JDK 11, so Gradle correctly refused the final APK build with its JDK 17 requirement. Capacitor Doctor reported the Android project configuration itself as healthy.

## iOS

Requirements: macOS, Xcode, CocoaPods, Node 20+.

```bash
npm run cap:ios
```

iOS project generation succeeds cross-platform, but compiling/signing must be done on macOS with Xcode.

## PWA

Open the HTTPS website in a compatible browser and choose **Install App**, or use the browser's install menu. The service worker caches the offline game shell and runtime static assets. Online authentication, chat, translation, and multiplayer still require a connection.
