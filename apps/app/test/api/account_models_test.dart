import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/models/supply.dart';
import 'package:sankalp_app/api/models/user.dart';

void main() {
  group('MyProfile', () {
    test('a provider carries a headline and a bio with its language', () {
      final MyProfile p = MyProfile.fromJson(<String, dynamic>{
        'email': 'd@test.local',
        'emailVerified': false,
        'preferredLang': 'hi',
        'displayName': 'Dev',
        'provider': <String, dynamic>{
          'headline': 'Essays',
          'bio': 'निबंध',
          'bioLang': 'hi',
        },
      });
      expect(p.isProvider, isTrue);
      expect(p.bio, 'निबंध');
      expect(p.bioLang, 'hi');
      expect(p.emailVerified, isFalse);
    });

    test('a seeker has no provider half at all', () {
      final MyProfile p = MyProfile.fromJson(<String, dynamic>{
        'email': 's@test.local',
        'emailVerified': true,
        'preferredLang': 'en',
        'provider': null,
      });
      expect(p.isProvider, isFalse);
      expect(p.headline, isNull);
      expect(p.displayName, isNull);
    });
  });

  group('Readiness', () {
    test('reads the families it was computed for, and never invents one', () {
      final Readiness r = Readiness.fromJson(<String, dynamic>{
        'bookable': false,
        'families': <String>['civil_services_exams'],
        'steps': <Map<String, dynamic>>[
          <String, dynamic>{'code': 'email_verified', 'done': false, 'blocking': true},
          <String, dynamic>{'code': 'profile_complete', 'done': true, 'blocking': true},
        ],
      });
      expect(r.families, <String>['civil_services_exams']);
      expect(r.blockers.map((ReadinessStep s) => s.code), <String>['email_verified']);
      expect(Readiness.fromJson(<String, dynamic>{'steps': <Object>[]}).families, isEmpty);
    });

    test('names the new steps in words, not codes', () {
      for (final String code in <String>['email_verified', 'profile_complete']) {
        final ReadinessStep s = ReadinessStep(code: code, done: false, blocking: true);
        expect(s.title, isNot(contains('_')));
        expect(s.why, isNotEmpty);
      }
    });
  });
}
