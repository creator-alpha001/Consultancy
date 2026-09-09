import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Keeps `apps/app/TRACKER.md` honest.
///
/// A second tracker file is a real risk in this repository — the thing
/// that keeps going wrong is a document that says something the code
/// does not. Root D56 is a page whose controls the tracker claims work
/// and which are wired to nothing; D51 is another.
///
/// So the app tracker's stub table is not maintained by hand. This test
/// reads both the file and `lib/`, and fails when they disagree in
/// either direction:
///
///   a stub added without a row — the file understates what is missing;
///   a row left behind after a screen is built — the file understates
///   what is done, which is how a backlog stops being read.
///
/// It deliberately does NOT check prose. A tracker whose every sentence
/// had to be machine-verified would say nothing worth reading; what is
/// checked is the one part that is a claim about a countable fact.
void main() {
  late String tracker;
  late List<String> libSources;

  setUpAll(() {
    tracker = File('TRACKER.md').readAsStringSync();
    libSources = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.endsWith('.dart'))
        .where((File f) => !f.path.endsWith('not_built_screen.dart'))
        .map((File f) => f.readAsStringSync())
        .toList();
  });

  int stubsInCode() => libSources.fold(
    0,
    (int n, String src) => n + RegExp(r'NotBuiltScreen\(').allMatches(src).length,
  );

  /// The rows of the "Stubbed screens" table, by their route cell.
  List<String> stubbedRoutes() {
    final int start = tracker.indexOf('## Stubbed screens');
    expect(start, isNot(-1), reason: 'TRACKER.md has no "Stubbed screens" section');
    final int end = tracker.indexOf('\n## ', start + 1);
    final String section = end == -1
        ? tracker.substring(start)
        : tracker.substring(start, end);

    return <String>[
      for (final RegExpMatch m
          in RegExp(r'^\|[^|]+\|\s*`([^`]+)`\s*\|', multiLine: true)
              .allMatches(section))
        m.group(1)!,
    ];
  }

  test('the tracker lists exactly as many stubs as the code has', () {
    final int inCode = stubsInCode();
    final List<String> listed = stubbedRoutes();

    expect(
      listed.length,
      inCode,
      reason:
          'TRACKER.md lists ${listed.length} stubbed screens but lib/ has '
          '$inCode NotBuiltScreen(...). Update the table in the same commit '
          'as the screen — that is the point of it.\nListed: $listed',
    );
  });

  test('every route the tracker calls stubbed is really a stub', () {
    // The direction that rots quietly: a screen gets built and its row is
    // never removed, so the backlog overstates what is left and people
    // stop trusting it.
    final String router = File('lib/router.dart').readAsStringSync();

    for (final String route in stubbedRoutes()) {
      // The tracker spells full paths. The router declares some at the
      // top level with their full path and nests others under a parent,
      // where only the last segment appears — so both spellings count.
      // Anchored on `path:` so this finds the route DECLARATION. A bare
      // search matched the redirect guard first, which mentions the same
      // string and told the test the opposite of the truth.
      final String leaf = route.split('/').where((String s) => s.isNotEmpty).last;
      int at = router.indexOf("path: '$route'");
      if (at == -1) at = router.indexOf("path: '$leaf'");
      expect(
        at,
        isNot(-1),
        reason: 'TRACKER.md lists $route but router.dart has no such path',
      );

      // Within the route's own block, there must still be a stub.
      final String after = router.substring(at, (at + 600).clamp(0, router.length));
      expect(
        after,
        contains('NotBuiltScreen'),
        reason:
            'TRACKER.md still lists $route as stubbed, but its route no '
            'longer renders NotBuiltScreen. Remove the row.',
      );
    }
  });

  test('the tracker points at the root file as the authority', () {
    // Two trackers only work while the split is stated. If this sentence
    // goes, so does the reason the split is safe.
    expect(
      tracker,
      contains('The root file is the authority'),
      reason:
          'The relationship between this file and the root TRACKER.md must '
          'stay explicit, or they become two documents nobody trusts.',
    );
  });
}
