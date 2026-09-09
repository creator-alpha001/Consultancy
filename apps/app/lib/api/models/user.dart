/// Who is signed in.
///
/// A user row holds exactly ONE role — the API's `user_role` enum is
/// `seeker | provider | admin`, not a set. That is why this app has one
/// shell chosen at sign-in rather than an in-app role switcher: there is
/// nothing to switch between.
enum Role {
  seeker,
  provider,
  admin;

  static Role parse(String raw) => switch (raw) {
    'seeker' => Role.seeker,
    'provider' => Role.provider,
    'admin' => Role.admin,
    _ => throw FormatException('unknown role: $raw'),
  };

  String get wire => name;
}

enum UserStatus {
  active,
  suspended,
  deactivated;

  static UserStatus parse(String raw) => switch (raw) {
    'active' => UserStatus.active,
    'suspended' => UserStatus.suspended,
    'deactivated' => UserStatus.deactivated,
    _ => throw FormatException('unknown user status: $raw'),
  };
}

class User {
  const User({
    required this.id,
    required this.email,
    required this.role,
    required this.status,
    this.emailVerifiedAt,
    this.adultConfirmedAt,
    this.lastLoginAt,
  });

  factory User.fromJson(Map<String, dynamic> json) => User(
    id: json['id'] as String,
    email: json['email'] as String,
    role: Role.parse(json['role'] as String),
    status: UserStatus.parse(json['status'] as String),
    emailVerifiedAt: _date(json['emailVerifiedAt']),
    adultConfirmedAt: _date(json['adultConfirmedAt']),
    lastLoginAt: _date(json['lastLoginAt']),
  );

  final String id;
  final String email;
  final Role role;
  final UserStatus status;
  final DateTime? emailVerifiedAt;

  /// CLAUDE.md #27 — the platform is 18+, and registration is refused
  /// without this. It is surfaced so a screen can say so rather than
  /// failing opaquely.
  final DateTime? adultConfirmedAt;
  final DateTime? lastLoginAt;

  bool get isProvider => role == Role.provider;
  bool get isSeeker => role == Role.seeker;

  /// Admins are served by the web console, not by this app. The app
  /// signs them in and then tells them where to go — it does not pretend
  /// the surface exists here.
  bool get isAdmin => role == Role.admin;
}

DateTime? _date(Object? raw) =>
    raw is String ? DateTime.tryParse(raw)?.toLocal() : null;

/// The three ways a login can end.
///
/// Modelled as a sealed union for the same reason the API models it as
/// one: it must be impossible to treat a half-finished login as an
/// authenticated session.
sealed class LoginOutcome {
  const LoginOutcome();
}

/// Signed in.
class LoginSession extends LoginOutcome {
  const LoginSession({required this.token, required this.expiresAt});
  final String token;
  final DateTime? expiresAt;
}

/// The password was right, but this provider or admin holds no second
/// factor yet (#32). The ticket authorises enrolling one and nothing
/// else, and is kept in its own slot so nothing that reads the session
/// token can be handed it by mistake.
class LoginNeedsEnrolment extends LoginOutcome {
  const LoginNeedsEnrolment({required this.enrolmentToken, this.expiresAt});
  final String enrolmentToken;
  final DateTime? expiresAt;
}

/// The account has a factor and must present a code. Arrives as an
/// `MFA_REQUIRED` error rather than a body, so it is raised at the call
/// site and turned into this.
class LoginNeedsCode extends LoginOutcome {
  const LoginNeedsCode();
}

LoginOutcome parseLoginResult(Map<String, dynamic> json) {
  final Object? outcome = json['outcome'];
  return switch (outcome) {
    'session' => LoginSession(
      token: json['token'] as String,
      expiresAt: _date((json['session'] as Map<String, dynamic>?)?['expiresAt']),
    ),
    'mfa_enrolment_required' => LoginNeedsEnrolment(
      enrolmentToken: json['enrolmentToken'] as String,
      expiresAt: _date(json['expiresAt']),
    ),
    _ => throw FormatException('unknown login outcome: $outcome'),
  };
}
