import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/theme/generated_tokens.dart';

/// The faces are bundled, and every file pubspec names is really there.
///
/// A missing asset is not a build error in every path Flutter takes, and
/// a family name with no files behind it silently falls through to the
/// platform font — which is exactly how "not yet on-brand" went unnoticed
/// before. So this checks the files, not just the declaration.
void main() {
  final String pubspec = File('pubspec.yaml').readAsStringSync();
  final List<String> assets = RegExp(r'^\s+- asset: (assets/fonts/\S+\.ttf)\s*$', multiLine: true)
      .allMatches(pubspec)
      .map((RegExpMatch m) => m.group(1)!)
      .toList();

  test('both families are declared, uncommented', () {
    expect(pubspec, contains('    - family: ${FontFamilies.latin}'));
    expect(pubspec, contains('    - family: ${FontFamilies.devanagari}'));
    expect(assets, hasLength(6));
  });

  test('every declared font file exists and is a real font', () {
    for (final String path in assets) {
      final File f = File(path);
      expect(f.existsSync(), isTrue, reason: '$path is declared but missing');
      // TrueType files start with 0x00010000; anything else here is an
      // HTML error page saved under a .ttf name.
      final List<int> head = f.openSync().readSync(4);
      expect(head, <int>[0, 1, 0, 0], reason: '$path is not a TrueType file');
    }
  });

  test('the licences travel with the files', () {
    expect(File('assets/fonts/Inter-LICENSE.txt').existsSync(), isTrue);
    expect(File('assets/fonts/NotoSansDevanagari-OFL.txt').existsSync(), isTrue);
  });
}
