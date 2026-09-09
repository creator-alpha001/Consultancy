import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// The rules that cannot be tested by calling something.
///
/// Some of CLAUDE.md's hard rules are about what must NOT exist. There is
/// no function to call that proves the app has no price sort — the proof
/// is that nobody wrote one. So these read the source.
///
/// A grep test is a blunt instrument and it will occasionally need a
/// deliberate exception. That is the point: an exception has to be added
/// on purpose, by someone who has read the rule, rather than a violation
/// arriving unnoticed.
void main() {
  late List<File> sources;
  late Map<String, String> byPath;

  setUpAll(() {
    sources = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.endsWith('.dart'))
        .toList();
    byPath = <String, String>{
      for (final File f in sources)
        f.path.replaceAll(r'\', '/'): f.readAsStringSync(),
    };
  });

  test('there is source to check at all', () {
    // Guards against this whole file passing vacuously because the walk
    // stopped matching anything.
    expect(sources.length, greaterThan(10));
  });

  group('domain neutrality (CLAUDE.md, "Vocabulary — enforced")', () {
    // "If `exam`, `answer`, `mains`, `aspirant` or `mentor` appears in
    // src/modules/ outside domains/, it is a bug." The same rule applies
    // here: these words live in pack data and i18n catalogues, never in
    // code that renders.
    const List<String> banned = <String>[
      'aspirant',
      'mentor',
      'mains',
      'upsc',
      'prelims',
      'rubric',
    ];

    for (final String word in banned) {
      test('"$word" appears nowhere in lib/', () {
        final List<String> offenders = _grep(byPath, _identifierWord(word));
        expect(
          offenders,
          isEmpty,
          reason:
              '"$word" is a family\'s word and belongs in a manifest, not in '
              'code.\n${offenders.join('\n')}',
        );
      });
    }

    test('"exam" appears nowhere in lib/ as a word', () {
      // A whole word only, so `examine` and `example` do not trip it.
      final List<String> offenders = _grep(
        byPath,
        RegExp(r'\bexams?\b', caseSensitive: false),
      );
      expect(offenders, isEmpty, reason: offenders.join('\n'));
    });
  });

  group('no price sort, at any layer (CLAUDE.md #15)', () {
    test('nothing sorts by price', () {
      final List<String> offenders = _grep(
        byPath,
        RegExp(
          r'''sort\s*[:=(]\s*['"]?price|sortBy.*price|price.*[Ss]ort|orderBy.*price''',
          caseSensitive: false,
        ),
      );
      expect(
        offenders,
        isEmpty,
        reason:
            'This decides whether the marketplace rewards quality or starts a '
            'price war.\n${offenders.join('\n')}',
      );
    });
  });

  group('no comparison between users (CLAUDE.md #17)', () {
    // "No streaks, leaderboards, percentile comparisons, or outcome
    // predictions. Progress compares a seeker only to their own past
    // work." In a population with a documented mental-health crisis that
    // is a correctness requirement, not a matter of taste.
    const List<String> banned = <String>[
      'streak',
      'leaderboard',
      'percentile',
      'topper',
      'rankAmong',
      'betterThan',
    ];

    for (final String word in banned) {
      test('"$word" appears nowhere in lib/', () {
        final List<String> offenders = _grep(byPath, _identifierWord(word));
        expect(offenders, isEmpty, reason: offenders.join('\n'));
      });
    }
  });

  group('money is never a double (CLAUDE.md #5)', () {
    test('no file outside money/ does arithmetic on a paise field', () {
      final List<String> offenders = _grep(
        byPath,
        RegExp(r'amountPaise\s*[/*]|\bpaise\s*/\s*100\b'),
        // Paise itself is where the one legitimate division happens, at
        // the very edge, for a string that never returns to a calculation.
        skipPath: (String p) => p.contains('/money/'),
      );
      expect(
        offenders,
        isEmpty,
        reason:
            'Money arithmetic belongs on the Paise type, which cannot become '
            'a double.\n${offenders.join('\n')}',
      );
    });
  });

  group('the client never names a user (CLAUDE.md #28)', () {
    test('no request builder sends a userId', () {
      final List<String> offenders = _grep(
        byPath,
        RegExp('''['"]userId['"]\\s*:|\\?userId='''),
      );
      expect(
        offenders,
        isEmpty,
        reason:
            'Every authenticated route derives the actor from the session. A '
            'client that nominates a user is building a shape the API refuses '
            'to have.\n${offenders.join('\n')}',
      );
    });
  });

  group('the generated files are not hand-edited', () {
    test('generated_tokens.dart still says it is generated', () {
      expect(
        byPath['lib/theme/generated_tokens.dart'],
        startsWith('// GENERATED FILE — DO NOT EDIT.'),
      );
    });
  });

  group('what is still owed', () {
    test('the not-built placeholders are counted, not forgotten', () {
      // Every one of these must be gone before the app ships. Counting
      // them makes the remaining work a number rather than a surprise,
      // and this fails the day someone adds one without saying so.
      int count = 0;
      byPath.forEach((String path, String src) {
        if (path.endsWith('not_built_screen.dart')) return;
        count += RegExp(r'NotBuiltScreen\(').allMatches(src).length;
      });
      // Raise this deliberately, never incidentally. It going DOWN is the
      // point of the remaining slices.
      expect(
        count,
        lessThanOrEqualTo(10),
        reason:
            'There are $count screens still stubbed. If a slice added one, '
            'say why in TRACKER.md and raise this number on purpose.',
      );
    });
  });
}

/// A banned word, matched so it cannot hide inside a longer one.
///
/// A naive `contains` caught "mains" inside "do**mains**" on the first
/// run — a false positive on the single most load-bearing word in the
/// domain model. The lookbehind requires the match to begin an
/// identifier, while still catching `mentorId` and `upsc_cse`.
RegExp _identifierWord(String word) =>
    RegExp('(?<![A-Za-z])$word', caseSensitive: false);

/// Every code line in every file matching [pattern], as `path: line`.
List<String> _grep(
  Map<String, String> byPath,
  RegExp pattern, {
  bool Function(String path)? skipPath,
}) {
  final List<String> offenders = <String>[];
  byPath.forEach((String path, String src) {
    if (skipPath != null && skipPath(path)) return;
    for (final String line in _codeLines(src)) {
      if (pattern.hasMatch(line)) offenders.add('$path: ${line.trim()}');
    }
  });
  return offenders;
}

/// Source lines with comments and doc comments stripped.
///
/// Without this, every one of these tests fails on its own explanation —
/// the file that says "never write `mentor` here" contains the word
/// `mentor`. Comments are where the reasoning lives and have to stay
/// readable, so the rules apply to code only.
List<String> _codeLines(String src) {
  final List<String> out = <String>[];
  bool inBlock = false;
  for (String line in src.split('\n')) {
    final String trimmed = line.trimLeft();
    if (inBlock) {
      if (trimmed.contains('*/')) inBlock = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      if (!trimmed.contains('*/')) inBlock = true;
      continue;
    }
    if (trimmed.startsWith('//')) continue;
    final int slash = line.indexOf('//');
    if (slash >= 0) line = line.substring(0, slash);
    if (line.trim().isEmpty) continue;
    out.add(line);
  }
  return out;
}
