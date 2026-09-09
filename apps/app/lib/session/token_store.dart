import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Where the session token lives.
///
/// The web app never lets the browser touch the API: the token sits in an
/// httpOnly cookie that page JavaScript cannot read, so an XSS bug on any
/// screen cannot walk off with a session that can move money.
///
/// A native app has no server half. It holds the token itself, so *where*
/// is the whole of the security argument:
///
///   Android — EncryptedSharedPreferences, keyed by the Keystore.
///   iOS     — the Keychain.
///   Web     — **memory only**. A reload signs you out.
///
/// The web fallback is deliberate and is the same decision the React
/// Native app made. `localStorage` is readable by any script on the
/// origin and is not a place for a credential that can move money; being
/// signed out by a refresh is the cheaper failure. The web target exists
/// so this app can be *driven and tested* in this environment — there is
/// no Android emulator here — and is never shipped.
abstract interface class TokenStore {
  Future<String?> read();
  Future<void> write(String token);
  Future<void> clear();

  /// The enrolment ticket.
  ///
  /// A provider or admin whose password is right but who holds no second
  /// factor gets this instead of a session (#32). It authorises enrolling
  /// a factor and NOTHING else, so it is kept apart from the session
  /// token — nothing that reads [read] can ever be handed one by mistake.
  Future<String?> readEnrolment();
  Future<void> writeEnrolment(String ticket);
  Future<void> clearEnrolment();
}

class SecureTokenStore implements TokenStore {
  SecureTokenStore({FlutterSecureStorage? storage})
    : _storage =
          storage ??
          const FlutterSecureStorage(
            // The defaults are the strong ones as of v11: AES-GCM for the
            // data, an RSA-OAEP key wrapped by the Android Keystore. The
            // old `encryptedSharedPreferences: true` flag is gone because
            // this replaced it — there is no weaker path left to opt out
            // of, which is why nothing is passed here.
            aOptions: AndroidOptions(),
            iOptions: IOSOptions(
              // Readable after the first unlock (so a session survives a
              // reboot the user has already unlocked through), and
              // `_this_device` so it never migrates to a restored backup
              // on another handset. A session token that can move money
              // should not travel with an iCloud restore.
              accessibility: KeychainAccessibility.first_unlock_this_device,
            ),
          );

  static const String _sessionKey = 'sankalp_session';
  static const String _enrolmentKey = 'sankalp_enrolment';

  final FlutterSecureStorage _storage;

  @override
  Future<String?> read() => _storage.read(key: _sessionKey);

  @override
  Future<void> write(String token) =>
      _storage.write(key: _sessionKey, value: token);

  @override
  Future<void> clear() => _storage.delete(key: _sessionKey);

  @override
  Future<String?> readEnrolment() => _storage.read(key: _enrolmentKey);

  @override
  Future<void> writeEnrolment(String ticket) =>
      _storage.write(key: _enrolmentKey, value: ticket);

  @override
  Future<void> clearEnrolment() => _storage.delete(key: _enrolmentKey);
}

/// Memory only. Used on the web target and in tests.
class MemoryTokenStore implements TokenStore {
  String? _token;
  String? _ticket;

  @override
  Future<String?> read() async => _token;

  @override
  Future<void> write(String token) async => _token = token;

  @override
  Future<void> clear() async => _token = null;

  @override
  Future<String?> readEnrolment() async => _ticket;

  @override
  Future<void> writeEnrolment(String ticket) async => _ticket = ticket;

  @override
  Future<void> clearEnrolment() async => _ticket = null;
}

/// The platform keystore where there is one; memory where there is not.
TokenStore defaultTokenStore() =>
    kIsWeb ? MemoryTokenStore() : SecureTokenStore();
