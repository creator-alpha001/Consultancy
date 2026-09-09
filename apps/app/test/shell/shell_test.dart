import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/api/models/user.dart';
import 'package:sankalp_app/pack/label.dart';
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

  group('the tabs speak the pack, not the code', () {
    test("a family's word for a provider reaches the tab", () {
      const Vocab exams = Vocab(
        seeker: Label(<String, String>{'en': 'Aspirant', 'hi': 'अभ्यर्थी'}),
        provider: Label(<String, String>{'en': 'Mentor', 'hi': 'मेंटर'}),
        engagement: Label(<String, String>{'en': 'Task', 'hi': 'कार्य'}),
        agenda: Label(<String, String>{'en': 'Goals'}),
        agendaItem: Label(<String, String>{'en': 'Goal'}),
        assessment: Label(<String, String>{'en': 'Evaluation'}),
        category: Label(<String, String>{'en': 'Paper'}),
      );
      final List<ShellTab> tabs = Shells.seeker(exams);
      expect(tabs[1].label('en'), 'Mentor');
      expect(tabs[1].label('hi'), 'मेंटर');
      expect(tabs[2].label('hi'), 'कार्य');
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
