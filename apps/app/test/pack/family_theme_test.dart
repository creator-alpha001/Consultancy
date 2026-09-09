import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/pack/family_theme.dart';
import 'package:sankalp_app/pack/pack.dart';

/// The cross-client colour check.
///
/// A family publishes ONE accent and both clients derive four relations
/// from it. If the two derivations disagree, the same family is a
/// different colour in the browser and on the phone — drift, in its most
/// visible possible form, and exactly what the token pipeline exists to
/// stop.
///
/// So the expected values below are not invented. They are the output of
/// `apps/frontend/src/lib/pack-source.ts`'s own `shade()` and
/// `mixWithWhite()`, run against the accents the seeded manifests
/// actually publish. If someone changes either implementation, this
/// fails.
void main() {
  group('the ramp matches apps/frontend, colour for colour', () {
    test('accountancy — #14532d', () {
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{
          '--color-accent': '#14532d',
          '--color-correction': '#b45309',
        },
      });
      expect(t.brand, '#14532d');
      expect(t.brandHover, '#114626');
      expect(t.brandSoft, '#e8eeea');
      expect(t.brandSoftInk, '#0e3a20');
      expect(t.brandLine, '#bdcfc4');
    });

    test('higher_education — #1e3a8a', () {
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{'--color-accent': '#1e3a8a'},
      });
      expect(t.brand, '#1e3a8a');
      expect(t.brandHover, '#193174');
      expect(t.brandSoft, '#e9ebf3');
      expect(t.brandSoftInk, '#152961');
      expect(t.brandLine, '#c0c8de');
    });
  });

  group('a family may colour its accent, not repaint the product', () {
    test('the exam family publishes no accent, so it gets none', () {
      // civil_services_exams publishes --color-ink, --color-paper,
      // --color-rule-line and --color-ink-correction: the ground and the
      // ink. Those are the PLATFORM's (CLAUDE.md #7), and a family that
      // sets them gets the platform's own colour rather than its own
      // ruled-paper costume leaking onto every screen.
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{
          '--color-ink': '#1a1a2e',
          '--color-paper': '#fdfcf7',
          '--color-rule-line': '#dbe4ee',
          '--color-ink-correction': '#c1121f',
        },
      });
      expect(t.isEmpty, isTrue, reason: 'no accent published');
      expect(t.brand, isNull);
    });

    test('ink, paper and rule-line are never read as an accent', () {
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{'--color-ink': '#ff0000'},
      });
      expect(t.brand, isNot('#ff0000'));
    });
  });

  group('degrading rather than breaking', () {
    test('no theme at all', () {
      expect(FamilyThemeResolver.resolve(null).isEmpty, isTrue);
    });

    test('a theme with no tokens', () {
      expect(
        FamilyThemeResolver.resolve(<String, dynamic>{}).isEmpty,
        isTrue,
      );
    });

    test('a malformed accent falls back rather than throwing', () {
      // A screen the user is trying to read must not die because a
      // manifest has a typo in a colour.
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{'--color-accent': 'not-a-colour'},
      });
      expect(t.isEmpty, isTrue);
    });

    test('three-digit hex expands the same way the web expands it', () {
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{'--color-accent': '#08f'},
      });
      // #08f -> #0088ff; mixWithWhite(0.9) on that is the soft fill.
      expect(t.brandSoft, '#e6f3ff');
    });

    test('an explicitly published relation wins over the derivation', () {
      final FamilyTheme t = FamilyThemeResolver.resolve(<String, dynamic>{
        'tokens': <String, dynamic>{
          '--color-accent': '#14532d',
          '--brand-soft': '#123456',
        },
      });
      expect(t.brandSoft, '#123456');
      expect(t.brandHover, '#114626', reason: 'the rest still derive');
    });
  });
}
