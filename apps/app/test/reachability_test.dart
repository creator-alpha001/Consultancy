import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Every API call the app can make must be reachable by a person.
///
/// `scripts/parity.mjs` measures whether a route literal appears
/// anywhere in `lib/`. That is the right question for drift between two
/// clients, and the wrong one for "can a user do this": a method sitting
/// in `Repository` with no screen behind it counts as covered and
/// reaches nobody.
///
/// It gave a misleading 100% while five routes had no UI at all. So this
/// test closes the gap from the other side — every public method on
/// `Repository` must be referenced from somewhere that is not
/// `repository.dart` itself.
///
/// It cannot prove the calling screen is reachable in turn, and does not
/// claim to. What it does catch is the specific, easy mistake of adding
/// a repository method, watching the coverage number go up, and never
/// building the screen.
void main() {
  late String repositorySource;
  late String elsewhere;

  setUpAll(() {
    repositorySource = File('lib/api/repository.dart').readAsStringSync();
    elsewhere = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((File f) => f.path.endsWith('.dart'))
        .where((File f) => !f.path.endsWith('repository.dart'))
        .map((File f) => f.readAsStringSync())
        .join('\n');
  });

  /// Public method names declared on `Repository`.
  ///
  /// Matched on the declaration shape rather than by parsing: a return
  /// type, a name, then an open paren, at two-space indentation. Private
  /// helpers (`_objects`) are excluded because they are implementation.
  List<String> publicMethods() {
    final RegExp decl = RegExp(
      r'^  (?:Future<[^>]*(?:<[^>]*>)?[^>]*>|String|void)\s+([a-z][A-Za-z0-9_]*)\s*\(',
      multiLine: true,
    );
    return decl
        .allMatches(repositorySource)
        .map((RegExpMatch m) => m.group(1)!)
        .where((String name) => !name.startsWith('_'))
        .toSet()
        .toList()
      ..sort();
  }

  test('Repository exposes a substantial API', () {
    // Guards against the regex silently matching nothing and the whole
    // file passing for the wrong reason.
    expect(publicMethods().length, greaterThan(40));
  });

  test('every Repository method is called from outside repository.dart', () {
    final List<String> orphans = <String>[];
    for (final String name in publicMethods()) {
      // `.name(` or `.name,` — a call, or a tear-off passed as a
      // callback. Both count as reaching it.
      final RegExp used = RegExp(r'\.' + name + r'\s*[(,)]');
      if (!used.hasMatch(elsewhere)) orphans.add(name);
    }

    expect(
      orphans,
      isEmpty,
      reason:
          'These Repository methods have no caller outside repository.dart, '
          'so route parity counts them while no person can reach them. '
          'Either build the screen or delete the method:\n'
          '${orphans.map((String o) => '  - $o').join('\n')}',
    );
  });
}
