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

The PWA installs gameplay cues (including movement and combat effects) with the
shell. Background music streams online unless downloaded separately. After the
service worker takes control, choose **Settings → Download offline soundtrack**
(about 59 MiB). Wait for “Soundtrack ready offline” before disconnecting. Retry
incomplete downloads to fetch only missing tracks. Native bundles still include
the music files. Browser storage eviction can remove downloaded tracks.

Use **Settings → Check offline soundtrack** to count the expected tracks still
in browser storage. This check also works offline and never starts a download.
It checks the soundtrack only, not sign-in, multiplayer, or device speech voices.

To free that space, choose **Settings → Remove offline soundtrack** and confirm.
This removes only this game's optional soundtrack cache, not saves, gameplay
effects, or other apps' downloads. You can download the music again later.
