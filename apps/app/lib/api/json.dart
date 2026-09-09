import '../pack/label.dart';

/// Reading JSON without `dynamic` leaking into typed code.
///
/// `analysis_options.yaml` turns on `strict-casts`, so an untyped value
/// out of `jsonDecode` cannot silently flow into a typed field. That is
/// deliberate — without it, a field the API renamed becomes a null at the
/// point of USE rather than an error at the point of PARSE, and the bug
/// surfaces three screens away from its cause.
///
/// These helpers are the cost of that. Each one says what to do when the
/// value is absent or the wrong shape, and every model states that answer
/// explicitly rather than inheriting a default nobody chose.
extension JsonMap on Map<String, dynamic> {
  String str(String key, [String fallback = '']) {
    final Object? v = this[key];
    return v is String ? v : fallback;
  }

  /// A required string. Throws, because an id or a code that is missing
  /// is not something a screen can render around.
  String reqStr(String key) {
    final Object? v = this[key];
    if (v is String) return v;
    throw FormatException('expected a string at "$key", got $v');
  }

  String? strOrNull(String key) {
    final Object? v = this[key];
    return v is String ? v : null;
  }

  int intOr(String key, int fallback) {
    final Object? v = this[key];
    if (v is int) return v;
    if (v is String) return int.tryParse(v) ?? fallback;
    if (v is double) return v.round();
    return fallback;
  }

  int? intOrNull(String key) {
    final Object? v = this[key];
    if (v is int) return v;
    if (v is String) return int.tryParse(v);
    if (v is double) return v.round();
    return null;
  }

  double? doubleOrNull(String key) {
    final Object? v = this[key];
    if (v is num) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  bool boolOr(String key, {bool fallback = false}) {
    final Object? v = this[key];
    return v is bool ? v : fallback;
  }

  /// Timestamps come as ISO-8601 UTC. Converted to local for display —
  /// the API also sends an IANA timezone wherever the local meaning
  /// matters, and that is carried separately rather than baked in here.
  DateTime? date(String key) {
    final Object? v = this[key];
    return v is String ? DateTime.tryParse(v)?.toLocal() : null;
  }

  Map<String, dynamic>? obj(String key) {
    final Object? v = this[key];
    return v is Map<String, dynamic> ? v : null;
  }

  List<Map<String, dynamic>> objects(String key) {
    final Object? v = this[key];
    if (v is! List) return const <Map<String, dynamic>>[];
    return <Map<String, dynamic>>[
      for (final Object? e in v)
        if (e is Map<String, dynamic>) e,
    ];
  }

  List<String> strings(String key) {
    final Object? v = this[key];
    if (v is! List) return const <String>[];
    return <String>[
      for (final Object? e in v)
        if (e is String) e,
    ];
  }

  /// A localised label. Falls back to [fallback] so a manifest that has
  /// not been translated still renders a word rather than a blank.
  Label label(String key, [String fallback = '']) {
    final Object? v = this[key];
    return v is Map<String, dynamic>
        ? Label.fromJson(v)
        : Label(<String, String>{'en': fallback});
  }
}

/// `/sessions` returns raw database rows in snake_case while every other
/// endpoint returns camelCase. Rather than spell every session field
/// twice at each call site, this reads either.
///
/// It is a workaround for an API inconsistency, not a style choice, and
/// is recorded as such in TRACKER.md — the fix belongs on the server,
/// where one shape can serve both clients.
extension EitherCase on Map<String, dynamic> {
  Object? either(String camel, String snake) => this[camel] ?? this[snake];

  String eitherStr(String camel, String snake, [String fallback = '']) {
    final Object? v = either(camel, snake);
    return v is String ? v : fallback;
  }

  String? eitherStrOrNull(String camel, String snake) {
    final Object? v = either(camel, snake);
    return v is String ? v : null;
  }

  bool eitherBool(String camel, String snake, {bool fallback = false}) {
    final Object? v = either(camel, snake);
    return v is bool ? v : fallback;
  }

  DateTime? eitherDate(String camel, String snake) {
    final Object? v = either(camel, snake);
    return v is String ? DateTime.tryParse(v)?.toLocal() : null;
  }
}
