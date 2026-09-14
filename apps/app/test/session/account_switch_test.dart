import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/api_client.dart';
import 'package:sankalp_app/api/models/engagement.dart';
import 'package:sankalp_app/data.dart';
import 'package:sankalp_app/providers.dart';
import 'package:sankalp_app/session/token_store.dart';

/// Two people, one phone.
///
/// Found on a device: sign out, sign in as someone else, and the list of
/// engagements was the previous person's, served from memory. The API was
/// right (#28); the app never asked it again.
void main() {
  test('a different account never sees the last one\'s cached data', () async {
    final MemoryTokenStore tokens = MemoryTokenStore();
    String? signedInAs;

    final Dio dio = Dio();
    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (RequestOptions o, RequestInterceptorHandler h) {
          Object? body;
          switch (o.path) {
            case '/auth/login':
              final Map<String, dynamic> req = o.data is String
                  ? jsonDecode(o.data as String) as Map<String, dynamic>
                  : o.data as Map<String, dynamic>;
              signedInAs = req['email'] as String;
              body = <String, dynamic>{
                'outcome': 'session',
                'token': 'tok-$signedInAs',
              };
            case '/auth/me':
              body = <String, dynamic>{
                'id': 'id-$signedInAs',
                'email': signedInAs,
                'role': 'seeker',
                'status': 'active',
              };
            case '/auth/logout':
              signedInAs = null;
            case '/engagements':
              body = <Map<String, dynamic>>[
                <String, dynamic>{'id': 'eng-of-$signedInAs'},
              ];
          }
          h.resolve(
            Response<dynamic>(requestOptions: o, data: body, statusCode: 200),
          );
        },
      ),
    );

    final ProviderContainer container = ProviderContainer(
      overrides: <Override>[
        tokenStoreProvider.overrideWithValue(tokens),
        apiClientProvider.overrideWithValue(
          ApiClient(baseUrl: 'http://api.test', tokens: tokens, dio: dio),
        ),
      ],
    );
    addTearDown(container.dispose);
    // Keep the list alive the way an open screen would.
    container.listen(engagementsProvider, (_, _) {});

    await container
        .read(authProvider)
        .signIn(email: 'first@test', password: 'p');
    final List<Engagement> first = await container.read(
      engagementsProvider.future,
    );
    expect(first.single.id, 'eng-of-first@test');

    await container.read(authProvider).signOut();
    await container
        .read(authProvider)
        .signIn(email: 'second@test', password: 'p');
    final List<Engagement> second = await container.read(
      engagementsProvider.future,
    );
    expect(second.single.id, 'eng-of-second@test');
  });
}
