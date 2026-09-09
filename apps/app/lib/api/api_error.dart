/// The one error envelope, as CLAUDE.md defines it:
///
/// ```json
/// { "error": { "code": "AGENDA_LOCKED", "message": "…", "detail": {}, "requestId": "…" } }
/// ```
///
/// [code] is stable and is what callers switch on. [message] is localised
/// by the API and is displayed **as given** — never parsed, never matched
/// against, never used to decide anything.
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    required this.status,
    this.detail = const <String, dynamic>{},
    this.requestId,
  });

  /// What the client could not even reach an envelope for: DNS, a dropped
  /// connection, a timeout on a train. Users on mid-range Android over
  /// patchy networks see this one a lot, so it is a first-class case
  /// rather than a stringified socket error.
  const ApiException.offline({required this.message})
    : code = kOffline,
      status = 0,
      detail = const <String, dynamic>{},
      requestId = null;

  static const String kOffline = 'NETWORK_UNAVAILABLE';
  static const String kUnknown = 'UNKNOWN';

  final String code;
  final String message;
  final int status;
  final Map<String, dynamic> detail;
  final String? requestId;

  bool get isOffline => code == kOffline;

  /// 401/403/404 are folded together at the call sites that render for
  /// both a visitor and a member: "no such engagement" and "not yours"
  /// are deliberately the same answer to a client (CLAUDE.md #28).
  bool get isUnauthorized => status == 401;
  bool get isForbidden => status == 403;
  bool get isNotFound => status == 404;
  bool get isInvisible => isUnauthorized || isForbidden || isNotFound;

  /// The account holds a second factor and must present it. Providers and
  /// admins always will (#32).
  bool get needsSecondFactor => code == 'MFA_REQUIRED';

  @override
  String toString() => 'ApiException($code, status $status): $message';
}
