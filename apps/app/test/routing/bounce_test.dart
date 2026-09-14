import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/models/user.dart';
import 'package:sankalp_app/router.dart';

/// Which screens each role is sent away from.
///
/// Found on a device: a provider tapping an open request to make an offer
/// was bounced to their dashboard, because the redirect let providers into
/// a short list of screens and the board was not on it. Nor were the free
/// questions, reporting a problem, or the legal terms.
void main() {
  group('a provider', () {
    for (final String path in <String>[
      '/board/p1',
      '/board/questions',
      '/board/questions/q1',
      '/report',
      '/legal',
      '/sessions/s1',
      '/work/e1/agenda',
      '/work/e1/assessment',
      '/you',
      '/provider/requests',
      '/provider/work/e1/evaluate',
    ]) {
      test(
        'may open $path',
        () => expect(bounceFor(Role.provider, path), isNull),
      );
    }

    for (final String path in <String>[
      '/home',
      '/find',
      '/money',
      '/progress',
      '/board/new',
      '/board/ask',
    ]) {
      test('is sent from the seeker-only $path to the dashboard', () {
        expect(bounceFor(Role.provider, path), '/provider');
      });
    }
  });

  group('a seeker', () {
    test('is kept out of the provider screens', () {
      expect(bounceFor(Role.seeker, '/provider'), '/home');
      expect(bounceFor(Role.seeker, '/provider/work/e1/evaluate'), '/home');
    });

    test('is not confused by a path that merely starts with the word', () {
      expect(bounceFor(Role.seeker, '/providers/p1'), isNull);
    });
  });
}
