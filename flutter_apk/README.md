# Black Sword Ultimate — Android App (Flutter wrapper)

This folder is a minimal Flutter app that wraps the live game
(https://black-sold-ultimate.vercel.app) in a full-screen native WebView.

- Every website update reaches the installed app instantly — no APK rebuilds needed.
- TalkBack-friendly: app bar + reload action + web content are swipe-navigable.
- Back button navigates back inside the game instead of closing the app.

The APK is built automatically by GitHub Actions (`.github/workflows/flutter-apk.yml`)
and published under **Releases → flutter-apk-N**.

App ID: `com.mahicouragw.black_sword`
