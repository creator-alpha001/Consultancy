import 'package:flutter/foundation.dart';

/// Where the API is.
///
/// A phone's `localhost` is the phone, so a device build must be pointed
/// at the machine's LAN address — the same trap the React Native app's
/// README documented. Supplied at build time rather than baked in:
///
///   flutter run --dart-define=API_BASE_URL=http://192.168.1.42:3000
///
/// The default is the Android emulator's alias for the host loopback,
/// except on the web target where the browser really is on the host.
abstract final class Config {
  static const String _fromEnv = String.fromEnvironment('API_BASE_URL');

  static String get apiBaseUrl {
    if (_fromEnv.isNotEmpty) return _fromEnv;
    if (kIsWeb) return 'http://localhost:3000';
    // 10.0.2.2 is the Android emulator's route to the host machine. On a
    // real handset neither this nor localhost is reachable and
    // --dart-define is required; that is a loud failure rather than a
    // quiet one, which is the right way round.
    return 'http://10.0.2.2:3000';
  }

  /// The language the interface starts in. The pack supplies the words;
  /// this only says which of them to read.
  static const String defaultLang = 'en';
}
