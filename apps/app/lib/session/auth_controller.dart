import 'package:flutter/foundation.dart';

import '../api/api_client.dart';
import '../api/api_error.dart';
import '../api/models/user.dart';
import 'token_store.dart';

/// Who is signed in, and the transitions between not-signed-in and
/// signed-in.
///
/// The shape here is deliberately narrow. Nothing outside this class
/// writes the token, and nothing anywhere claims a role the API did not
/// return — the app asks `/auth/me` and believes the answer. A client
/// that decided its own role would be exactly the "never trust a
/// client-supplied user ID" failure (CLAUDE.md #28) wearing a different
/// hat.
sealed class AuthState {
  const AuthState();
}

/// Before the stored token has been checked. Distinct from signed-out so
/// the app does not flash the sign-in screen at someone who is signed in.
class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.because});

  /// Set when a session ended on its own — expired, revoked, or signed
  /// out from another device — so the sign-in screen can say why rather
  /// than appearing for no visible reason.
  final String? because;
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);
  final User user;
}

/// Holds an enrolment ticket and nothing else. A provider or admin in
/// this state can reach exactly one screen: enrol a second factor (#32).
class AuthEnrolling extends AuthState {
  const AuthEnrolling();
}

class AuthController extends ChangeNotifier {
  AuthController({required ApiClient api, required TokenStore tokens})
    : _api = api,
      _tokens = tokens {
    _api.onUnauthorized = () => _set(
      const AuthSignedOut(because: 'Your session ended. Please sign in again.'),
    );
  }

  final ApiClient _api;
  final TokenStore _tokens;

  AuthState _state = const AuthUnknown();
  AuthState get state => _state;

  User? get user => switch (_state) {
    AuthSignedIn(user: final User u) => u,
    _ => null,
  };

  /// Called once at startup. Resolves [AuthUnknown] into one of the
  /// others by asking the API who the stored token belongs to.
  Future<void> restore() async {
    final String? token = await _tokens.read();
    if (token == null) {
      final String? ticket = await _tokens.readEnrolment();
      _set(ticket == null ? const AuthSignedOut() : const AuthEnrolling());
      return;
    }
    try {
      final Map<String, dynamic> me = await _api.get<Map<String, dynamic>>(
        '/auth/me',
      );
      _set(AuthSignedIn(User.fromJson(me)));
    } on ApiException catch (e) {
      if (e.isOffline) {
        // A token we cannot verify is not a token we should discard. The
        // user is on a train, not signed out — dropping their session
        // here would make a tunnel look like a security event.
        _set(const AuthSignedOut(because: null));
        return;
      }
      await _tokens.clear();
      _set(const AuthSignedOut());
    }
  }

  /// Signs in, or reports what else the API needs.
  ///
  /// Returns the outcome rather than throwing on the MFA cases, because
  /// neither of them is an error: one is "now give me your code" and the
  /// other is "you must set up a second factor first".
  Future<LoginOutcome> signIn({
    required String email,
    required String password,
    String? totpCode,
    String? recoveryCode,
  }) async {
    final Map<String, dynamic> body = <String, dynamic>{
      'email': email,
      'password': password,
    };
    if (totpCode != null) body['totpCode'] = totpCode;
    if (recoveryCode != null) body['recoveryCode'] = recoveryCode;

    final LoginOutcome outcome;
    try {
      outcome = parseLoginResult(
        await _api.post<Map<String, dynamic>>('/auth/login', body: body),
      );
    } on ApiException catch (e) {
      if (e.needsSecondFactor) return const LoginNeedsCode();
      rethrow;
    }

    switch (outcome) {
      case LoginSession(token: final String token):
        await _tokens.write(token);
        await _tokens.clearEnrolment();
        final Map<String, dynamic> me = await _api.get<Map<String, dynamic>>(
          '/auth/me',
        );
        _set(AuthSignedIn(User.fromJson(me)));
      case LoginNeedsEnrolment(enrolmentToken: final String ticket):
        // Kept apart from the session token on purpose: this authorises
        // enrolling a factor and nothing else.
        await _tokens.writeEnrolment(ticket);
        _set(const AuthEnrolling());
      case LoginNeedsCode():
        break;
    }
    return outcome;
  }

  Future<void> signOut() async {
    try {
      await _api.post<void>('/auth/logout');
    } on ApiException {
      // The local session goes either way. A network failure must not
      // leave a token on the device that the user believes is gone.
    }
    await _tokens.clear();
    await _tokens.clearEnrolment();
    _set(const AuthSignedOut());
  }

  /// Finishes second-factor enrolment and turns the ticket into a real
  /// session. Returns the recovery codes, which are shown exactly once.
  Future<List<String>> confirmEnrolment(String code) async {
    final Map<String, dynamic> res = await _api.post<Map<String, dynamic>>(
      '/auth/mfa/confirm',
      body: <String, dynamic>{'code': code},
      asEnrolling: true,
    );
    await _tokens.clearEnrolment();
    return <String>[
      for (final Object? c in (res['codes'] as List<Object?>? ?? const <Object?>[]))
        if (c is String) c,
    ];
  }

  void _set(AuthState next) {
    _state = next;
    notifyListeners();
  }
}
