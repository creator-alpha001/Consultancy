import 'dart:math';

import 'package:dio/dio.dart';

import '../session/token_store.dart';
import 'api_error.dart';

/// The API client.
///
/// Everything that would otherwise be "a rule everyone has to remember"
/// is an interceptor here instead:
///
///   1. the bearer token, read from the platform keystore;
///   2. `Idempotency-Key` on every mutating request (CLAUDE.md #10);
///   3. the error envelope, mapped to [ApiException] so no screen ever
///      sees a `DioException`;
///   4. a timeout budget sized for a patchy mobile network, and a retry
///      that is safe because of (2).
///
/// What is NOT here, and must never be: any way to name a user id. Every
/// authenticated route derives the actor from the session, so a request
/// builder that accepted one would be building a shape the API refuses to
/// have (CLAUDE.md #28).
class ApiClient {
  ApiClient({required String baseUrl, required TokenStore tokens, Dio? dio})
    : _tokens = tokens,
      _dio = dio ?? Dio() {
    _dio.options = _dio.options.copyWith(
      baseUrl: baseUrl,
      // Sized for a mid-range Android on a patchy network, not for a
      // developer on fibre. Long enough that a slow train does not look
      // like a failure; short enough that a dead connection does not hang
      // a screen for a minute.
      connectTimeout: const Duration(seconds: 10),
      sendTimeout: const Duration(seconds: 30),
      receiveTimeout: const Duration(seconds: 30),
      // We inspect status ourselves — every non-2xx carries an envelope
      // worth reading, and letting Dio throw first would discard it.
      validateStatus: (int? _) => true,
      responseType: ResponseType.json,
      headers: <String, String>{'content-type': 'application/json'},
    );
  }

  /// An empty body where one was required. Rare, and always a contract
  /// problem rather than something a user can act on.
  static const String kEmptyBody = 'EMPTY_BODY';

  final Dio _dio;
  final TokenStore _tokens;
  final Random _random = Random.secure();

  /// Called when the API says the session is gone, so the app can drop to
  /// the sign-in screen from wherever it is. Set once, at composition.
  void Function()? onUnauthorized;

  Future<T> get<T>(String path, {Map<String, dynamic>? query, bool asEnrolling = false}) =>
      _send<T>('GET', path, query: query, asEnrolling: asEnrolling);

  /// Mutating verbs take an [idempotencyKey]. One is generated when the
  /// caller does not supply it, which covers the common case; a caller
  /// that must survive a retry ACROSS app restarts — anything moving
  /// money — should mint and persist its own and pass it here.
  Future<T> post<T>(
    String path, {
    Object? body,
    String? idempotencyKey,
    bool asEnrolling = false,
  }) => _send<T>(
    'POST',
    path,
    body: body,
    idempotencyKey: idempotencyKey ?? _newIdempotencyKey(),
    asEnrolling: asEnrolling,
  );

  Future<T> delete<T>(String path, {String? idempotencyKey}) => _send<T>(
    'DELETE',
    path,
    idempotencyKey: idempotencyKey ?? _newIdempotencyKey(),
  );

  /// Returns null instead of throwing when there is nothing to return.
  ///
  /// Two different "nothings" fold together here, deliberately:
  ///
  ///   *You may not see this* — 401, 403 and 404 are one answer to a
  ///   client on purpose (CLAUDE.md #28), and most screens render for a
  ///   visitor as well as a member, so a 401 on one panel must not blank
  ///   the page.
  ///
  ///   *There is nothing yet* — an empty body, which is how this API says
  ///   "this category has no assessment template" and "no evaluation has
  ///   been written". Requesting `T?` rather than `T` is what makes that
  ///   a value instead of a TypeError.
  Future<T?> getOrNull<T>(String path, {Map<String, dynamic>? query}) async {
    try {
      return await _send<T?>('GET', path, query: query);
    } on ApiException catch (e) {
      if (e.isInvisible) return null;
      rethrow;
    }
  }

  Future<T> _send<T>(
    String method,
    String path, {
    Object? body,
    Map<String, dynamic>? query,
    String? idempotencyKey,
    bool asEnrolling = false,
  }) async {
    final String? token = asEnrolling
        ? await _tokens.readEnrolment()
        : await _tokens.read();

    final Map<String, String> headers = <String, String>{};
    if (token != null) headers['authorization'] = 'Bearer $token';
    // Every mutating endpoint accepts one (CLAUDE.md #10); it is
    // meaningless on a GET and is simply not sent there.
    if (idempotencyKey != null) headers['idempotency-key'] = idempotencyKey;

    Response<dynamic> res;
    try {
      res = await _withRetry(
        () => _dio.request<dynamic>(
          path,
          data: body,
          queryParameters: query,
          options: Options(method: method, headers: headers),
        ),
        // A GET is safe to repeat by definition. A mutation is safe to
        // repeat only because it carries an idempotency key — which is
        // exactly what that header is for.
        retryable: method == 'GET' || idempotencyKey != null,
      );
    } on DioException catch (e) {
      throw ApiException.offline(message: _offlineMessage(e));
    }

    return _unwrap<T>(res);
  }

  T _unwrap<T>(Response<dynamic> res) {
    final int status = res.statusCode ?? 0;

    if (status == 204 || res.data == null || res.data == '') {
      if (status >= 400) {
        throw ApiException(
          code: ApiException.kUnknown,
          message: 'The request failed with status $status.',
          status: status,
        );
      }
      // "Nothing here."
      //
      // The API now says this with a 204 — `assessment-template` for a
      // category that has no template (the normal case for an objective
      // category, CLAUDE.md #3), `evaluations/latest` before anything is
      // written, `disputes` when none was raised.
      //
      // It used to say it with an empty 200 body, and an earlier version
      // of this method returned `null as T` unconditionally: a TypeError
      // the moment T is non-nullable, so the client crashed on precisely
      // the case the rule says must render normally (TRACKER D59). The
      // API side is fixed; the empty-body branch stays because a 204 has
      // no body either, and because a client should not fall over if
      // some other route answers that way tomorrow.
      if (null is T) return null as T;
      throw ApiException(
        code: kEmptyBody,
        message: 'The server sent nothing where $T was expected.',
        status: status,
      );
    }

    if (status >= 400) {
      throw _envelope(res.data, status);
    }

    if (res.data is T) return res.data as T;

    throw ApiException(
      code: ApiException.kUnknown,
      message:
          'The server sent ${res.data.runtimeType} where $T was expected.',
      status: status,
    );
  }

  ApiException _envelope(dynamic data, int status) {
    if (data is Map) {
      final Object? error = data['error'];
      if (error is Map) {
        final Object? detail = error['detail'];
        return ApiException(
          code: error['code'] as String? ?? ApiException.kUnknown,
          // Displayed as given, never parsed.
          message:
              error['message'] as String? ??
              'The request failed with status $status.',
          status: status,
          detail: detail is Map
              ? detail.map(
                  (Object? k, Object? v) => MapEntry<String, dynamic>('$k', v),
                )
              : const <String, dynamic>{},
          requestId: error['requestId'] as String?,
        );
      }
    }
    return ApiException(
      code: ApiException.kUnknown,
      message: 'The request failed with status $status.',
      status: status,
    );
  }

  /// Two attempts, then give up.
  ///
  /// Deliberately small. A long retry ladder on a phone burns battery and
  /// keeps a spinner up long past the point the user has decided the app
  /// is broken — and the API is not made more available by being asked
  /// six times.
  Future<Response<dynamic>> _withRetry(
    Future<Response<dynamic>> Function() attempt, {
    required bool retryable,
  }) async {
    try {
      return await attempt();
    } on DioException catch (e) {
      if (!retryable || !_isTransient(e)) rethrow;
      await Future<void>.delayed(const Duration(milliseconds: 400));
      return attempt();
    }
  }

  bool _isTransient(DioException e) =>
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout ||
      e.type == DioExceptionType.sendTimeout ||
      e.type == DioExceptionType.connectionError;

  String _offlineMessage(DioException e) => switch (e.type) {
    DioExceptionType.connectionTimeout ||
    DioExceptionType.sendTimeout ||
    DioExceptionType.receiveTimeout =>
      'The connection timed out. Check your network and try again.',
    _ => 'Could not reach Sankalp. Check your network and try again.',
  };

  /// A v4-shaped random key. The API dedupes the whole request on it
  /// (`idempotency_keys`), with the ledger's own key as a second line of
  /// defence underneath.
  String _newIdempotencyKey() {
    const String hex = '0123456789abcdef';
    final StringBuffer b = StringBuffer();
    for (int i = 0; i < 32; i++) {
      if (i == 8 || i == 12 || i == 16 || i == 20) b.write('-');
      b.write(hex[_random.nextInt(16)]);
    }
    return b.toString();
  }

  Future<void> signOutLocally() async {
    await _tokens.clear();
    await _tokens.clearEnrolment();
    onUnauthorized?.call();
  }
}
