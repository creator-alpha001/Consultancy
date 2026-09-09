import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/api_client.dart';
import 'package:sankalp_app/api/api_error.dart';
import 'package:sankalp_app/session/token_store.dart';

/// The four things the client must do on every call, tested against a
/// stubbed transport rather than a live API — these are properties of the
/// client, and a network in the loop would only make them flaky.
Dio _dioReturning(
  Object? body, {
  int status = 200,
  List<RequestOptions>? seen,
}) {
  final Dio dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (RequestOptions o, RequestInterceptorHandler h) {
        seen?.add(o);
        h.resolve(
          Response<dynamic>(requestOptions: o, data: body, statusCode: status),
        );
      },
    ),
  );
  return dio;
}

void main() {
  late MemoryTokenStore tokens;

  setUp(() => tokens = MemoryTokenStore());

  ApiClient client(Dio dio) =>
      ApiClient(baseUrl: 'http://api.test', tokens: tokens, dio: dio);

  group('the bearer token', () {
    test('is sent when there is one', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await tokens.write('tok-123');
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).get<Map<String, dynamic>>('/auth/me');
      expect(seen.single.headers['authorization'], 'Bearer tok-123');
    });

    test('is absent when there is none, rather than sent empty', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).get<Map<String, dynamic>>('/catalogue');
      expect(seen.single.headers.containsKey('authorization'), isFalse);
    });

    test('an enrolment ticket is never sent as a session token', () async {
      // The two are kept apart precisely so this cannot happen: a ticket
      // authorises enrolling a second factor and nothing else (#32).
      final List<RequestOptions> seen = <RequestOptions>[];
      await tokens.writeEnrolment('ticket-abc');
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).get<Map<String, dynamic>>('/auth/me');
      expect(seen.single.headers.containsKey('authorization'), isFalse);
    });

    test('and is sent when the call explicitly asks to use it', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await tokens.writeEnrolment('ticket-abc');
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).post<Map<String, dynamic>>('/auth/mfa/confirm', asEnrolling: true);
      expect(seen.single.headers['authorization'], 'Bearer ticket-abc');
    });
  });

  group('idempotency (CLAUDE.md #10)', () {
    test('every POST carries a key', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).post<Map<String, dynamic>>('/engagements');
      expect(seen.single.headers['idempotency-key'], isNotNull);
    });

    test('a GET does not, because it is meaningless there', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).get<Map<String, dynamic>>('/catalogue');
      expect(seen.single.headers.containsKey('idempotency-key'), isFalse);
    });

    test('two calls get two different keys', () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      final ApiClient c = client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      );
      await c.post<Map<String, dynamic>>('/engagements');
      await c.post<Map<String, dynamic>>('/engagements');
      expect(
        seen[0].headers['idempotency-key'],
        isNot(seen[1].headers['idempotency-key']),
      );
    });

    test("a caller's own key is used, so a retry across restarts dedupes", () async {
      final List<RequestOptions> seen = <RequestOptions>[];
      await client(
        _dioReturning(<String, dynamic>{'ok': true}, seen: seen),
      ).post<Map<String, dynamic>>('/engagements/e1/payment', idempotencyKey: 'mine-1');
      expect(seen.single.headers['idempotency-key'], 'mine-1');
    });
  });

  group('the error envelope', () {
    test('becomes an ApiException carrying the stable code', () async {
      final Dio dio = _dioReturning(<String, dynamic>{
        'error': <String, dynamic>{
          'code': 'AGENDA_LOCKED',
          'message': 'This agenda is locked.',
          'detail': <String, dynamic>{'agendaId': 'a1'},
          'requestId': 'req-9',
        },
      }, status: 409);

      await expectLater(
        client(dio).post<Map<String, dynamic>>('/agendas/a1/lock'),
        throwsA(
          isA<ApiException>()
              .having((ApiException e) => e.code, 'code', 'AGENDA_LOCKED')
              .having((ApiException e) => e.status, 'status', 409)
              .having(
                (ApiException e) => e.message,
                'message',
                'This agenda is locked.',
              )
              .having(
                (ApiException e) => e.detail['agendaId'],
                'detail',
                'a1',
              )
              .having((ApiException e) => e.requestId, 'requestId', 'req-9'),
        ),
      );
    });

    test('a body with no envelope still produces a usable message', () async {
      await expectLater(
        client(_dioReturning('not json at all', status: 500))
            .get<Map<String, dynamic>>('/catalogue'),
        throwsA(
          isA<ApiException>()
              .having((ApiException e) => e.code, 'code', ApiException.kUnknown)
              .having((ApiException e) => e.status, 'status', 500),
        ),
      );
    });

    test('MFA_REQUIRED is recognised as a demand, not a failure', () async {
      try {
        await client(
          _dioReturning(<String, dynamic>{
            'error': <String, dynamic>{
              'code': 'MFA_REQUIRED',
              'message': 'Enter your code.',
            },
          }, status: 401),
        ).post<Map<String, dynamic>>('/auth/login');
        fail('should have thrown');
      } on ApiException catch (e) {
        expect(e.needsSecondFactor, isTrue);
      }
    });

    test('401, 403 and 404 are all "you cannot see this"', () {
      for (final int status in <int>[401, 403, 404]) {
        expect(
          ApiException(code: 'X', message: 'm', status: status).isInvisible,
          isTrue,
        );
      }
    });
  });

  group('an empty body is a value, not a crash', () {
    // Several endpoints answer "" rather than null or a 404 — including
    // /engagements/:id/assessment-template for a category that has no
    // template, which is the NORMAL case for an objective category
    // (CLAUDE.md #3). An earlier version did `null as T` unconditionally
    // and threw a TypeError on exactly that path.
    test('getOrNull returns null for an empty-string body', () async {
      final Object? out = await client(
        _dioReturning(''),
      ).getOrNull<Map<String, dynamic>>('/engagements/e1/assessment-template');
      expect(out, isNull);
    });

    test('getOrNull returns null for a null body', () async {
      final Object? out = await client(
        _dioReturning(null),
      ).getOrNull<Map<String, dynamic>>('/engagements/e1/evaluations/latest');
      expect(out, isNull);
    });

    test('getOrNull still returns a real body when there is one', () async {
      final Map<String, dynamic>? out = await client(
        _dioReturning(<String, dynamic>{'code': 'answer_writing.v1'}),
      ).getOrNull<Map<String, dynamic>>('/engagements/e1/assessment-template');
      expect(out?['code'], 'answer_writing.v1');
    });

    test('a REQUIRED body that arrives empty raises, rather than pretending', () async {
      // The other half of the same rule: where a caller genuinely needs a
      // body, an empty one is a contract problem and must be loud.
      await expectLater(
        client(_dioReturning('')).get<Map<String, dynamic>>('/auth/me'),
        throwsA(
          isA<ApiException>().having(
            (ApiException e) => e.code,
            'code',
            ApiClient.kEmptyBody,
          ),
        ),
      );
    });

    test('a void endpoint is still happy with nothing back', () async {
      // 204 on a POST is normal and must not raise.
      await client(_dioReturning('', status: 204)).post<void>('/auth/logout');
    });
  });

  group('getOrNull', () {
    test('returns null rather than blanking a page', () async {
      final Object? out = await client(
        _dioReturning(<String, dynamic>{
          'error': <String, dynamic>{'code': 'NOT_FOUND', 'message': 'no'},
        }, status: 404),
      ).getOrNull<Map<String, dynamic>>('/engagements/nope');
      expect(out, isNull);
    });

    test('still throws on a real server error', () async {
      await expectLater(
        client(
          _dioReturning(<String, dynamic>{
            'error': <String, dynamic>{'code': 'BOOM', 'message': 'no'},
          }, status: 500),
        ).getOrNull<Map<String, dynamic>>('/engagements/x'),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('offline', () {
    test('a connection failure is a first-class state, not a stack trace', () async {
      final Dio dio = Dio();
      dio.interceptors.add(
        InterceptorsWrapper(
          onRequest: (RequestOptions o, RequestInterceptorHandler h) {
            h.reject(
              DioException(
                requestOptions: o,
                type: DioExceptionType.connectionError,
              ),
            );
          },
        ),
      );
      try {
        await client(dio).get<Map<String, dynamic>>('/catalogue');
        fail('should have thrown');
      } on ApiException catch (e) {
        expect(e.isOffline, isTrue);
        // A sentence a person can act on, not an exception type.
        expect(e.message, contains('network'));
      }
    });
  });

  group('the token store', () {
    test('keeps the session and the enrolment ticket apart', () async {
      await tokens.write('session');
      await tokens.writeEnrolment('ticket');
      expect(await tokens.read(), 'session');
      expect(await tokens.readEnrolment(), 'ticket');

      await tokens.clear();
      expect(await tokens.read(), isNull);
      expect(
        await tokens.readEnrolment(),
        'ticket',
        reason: 'clearing one must not clear the other',
      );
    });
  });
}
