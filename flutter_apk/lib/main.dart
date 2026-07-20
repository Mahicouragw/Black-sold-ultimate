import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

/// Black Sword Ultimate — accessible fantasy RPG, wrapped for Android.
/// Loads the live game, so every website update reaches the app instantly.
/// Fully TalkBack navigable: app bar, reload action and game content are
/// all reachable by swipe.
const String kGameUrl = 'https://black-sold-ultimate.vercel.app';
const Color kBg = Color(0xFF101018);

/// Google blocks OAuth in default WebViews by spotting `; wv)` in the stock
/// user-agent. Presenting a normal Chrome mobile UA lets players use the
/// in-app Google sign-in exactly like on the website (One Tap + link Google).
const String kChromeUserAgent =
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

void main() => runApp(const BlackSwordApp());

class BlackSwordApp extends StatelessWidget {
  const BlackSwordApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Black Sword Ultimate',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorSchemeSeed: const Color(0xFF7C4DFF),
        scaffoldBackgroundColor: kBg,
      ),
      home: const GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late final WebViewController _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(kBg)
      ..setUserAgent(kChromeUserAgent)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) => setState(() {
            _loading = true;
            _error = null;
          }),
          onPageFinished: (_) => setState(() => _loading = false),
          onWebResourceError: (WebResourceError e) {
            if (e.isForMainFrame ?? false) {
              setState(() {
                _loading = false;
                _error = 'Could not load the game (error ${e.errorCode}).\n'
                    'Check your internet connection and tap Retry.';
              });
            }
          },
        ),
      )
      ..loadRequest(Uri.parse(kGameUrl));
    // Allow game sounds & music without requiring a tap first (Android WebView).
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      platform.setMediaPlaybackRequiresUserGesture(false);
    }
  }

  void _reload() {
    setState(() {
      _error = null;
      _loading = true;
    });
    _controller.reload();
  }

  Future<void> _goBack() async {
    if (await _controller.canGoBack()) {
      await _controller.goBack();
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (bool didPop, Object? result) {
        if (!didPop) _goBack();
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Black Sword Ultimate 🗡️'),
          actions: [
            IconButton(
              tooltip: 'Reload game',
              icon: const Icon(Icons.refresh),
              onPressed: _reload,
            ),
          ],
        ),
        body: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_loading)
                const Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(minHeight: 4),
                ),
              if (_error != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: kBg,
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.wifi_off, size: 48),
                            const SizedBox(height: 12),
                            Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style: const TextStyle(height: 1.5),
                            ),
                            const SizedBox(height: 16),
                            FilledButton.icon(
                              onPressed: _reload,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
