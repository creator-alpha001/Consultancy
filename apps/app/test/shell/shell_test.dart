import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/models/user.dart';
import 'package:sankalp_app/pack/pack.dart';
import 'package:sankalp_app/shell/shell.dart';
import 'package:sankalp_app/theme/app_theme.dart';

/// "One app, two shells" — asserted rather than asserted-about.
void main() {
  group('the role picks the shell', () {
    test('a seeker gets the discovery tabs', () {
      final List<String> paths = Shells.forRole(
        Role.seeker,
        Vocab.platform,
      ).map((ShellTab t) => t.path).toList();
      expect(paths, <String>['/home', '/find', '/work', '/sessions', '/you']);
    });

    test('a provider gets the supply tabs, and none of the seeker ones', () {
      final List<String> paths = Shells.forRole(
        Role.provider,
        Vocab.platform,
      ).map((ShellTab t) => t.path).toList();
      expect(paths, contains('/provider'));
      expect(paths, contains('/provider/earnings'));
      expect(paths, isNot(contains('/home')));
      expect(paths, isNot(contains('/find')));
    });

    test('an admin gets no tabs at all — operations is a web surface', () {
      expect(Shells.forRole(Role.admin, Vocab.platform), isEmpty);
    });
  });

  group("the tabs use structural words, not any field's nouns", () {
    // The shell sits above every field a person is in at once, so no one
    // family's word fits it, and the platform's own nouns ("Provider",
    // "Engagement") read as jargon on a phone's tab bar.
    test('a seeker sees plain words, the same whatever their fields', () {
      final List<String> labels = Shells.seeker(Vocab.platform)
          .map((ShellTab t) => t.label('en'))
          .toList();
      expect(labels, <String>['Home', 'Find', 'Work', 'Sessions', 'You']);
      expect(Shells.seeker(Vocab.platform)[2].label('hi'), 'काम');
    });

    test('a provider sees their own plain words', () {
      final List<String> labels = Shells.provider(Vocab.platform)
          .map((ShellTab t) => t.label('en'))
          .toList();
      expect(labels, <String>['Dashboard', 'Requests', 'Work', 'Earnings', 'You']);
    });

    test('the platform vocabulary is neutral, naming no field', () {
      final String all = Shells.seeker(Vocab.platform)
          .map((ShellTab t) => t.label('en'))
          .join(' ')
          .toLowerCase();
      // CLAUDE.md's enforced vocabulary: these are family words and must
      // never be what core renders.
      for (final String banned in <String>[
        'mentor',
        'aspirant',
        'exam',
        'answer',
        'mains',
      ]) {
        expect(all, isNot(contains(banned)), reason: '"$banned" is pack data');
      }
    });
  });

  group('the shell as drawn', () {
    Widget wrap(Widget child) =>
        MaterialApp(theme: AppTheme.platform(), home: child);

    testWidgets('an admin is told where operations lives, not shown a stub', (
      WidgetTester tester,
    ) async {
      await tester.pumpWidget(wrap(const AdminElsewhere()));
      expect(find.textContaining('Operations runs on the web'), findsOneWidget);
    });

    testWidgets('every tap target clears the 48px floor', (
      WidgetTester tester,
    ) async {
      final SemanticsHandle handle = tester.ensureSemantics();
      await tester.pumpWidget(wrap(const AdminElsewhere()));

      // Flutter ships these as assertable guidelines, which is the app's
      // equivalent of the web's axe-core gate — and unlike a visual
      // review, it runs on every push.
      await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
      await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
      await expectLater(tester, meetsGuideline(textContrastGuideline));
      handle.dispose();
    });
  });
}
