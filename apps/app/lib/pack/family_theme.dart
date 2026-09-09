import 'pack.dart';

/// A family's accent, derived from its published theme tokens.
///
/// **Why this is not a straight read of the manifest.** A manifest
/// publishes ONE colour — `--color-accent` — and the interface needs the
/// four relations around it: hover, soft fill, soft ink, line. Deriving
/// them means a family has to get one colour right rather than five, and
/// the relations stay consistent between families instead of each
/// manifest inventing its own.
///
/// **Why the maths is copied rather than invented.** `apps/frontend`
/// already derives this ramp, in `src/lib/pack-source.ts`. If this app
/// derived it differently, the same family would be a different colour in
/// the browser and on the phone — which is exactly the drift this whole
/// arrangement exists to prevent, in its most visible possible form. So
/// the constants and the rounding below match that file deliberately, and
/// `test/pack/family_theme_test.dart` pins the outputs for the seeded
/// families.
///
/// **What a family may NOT do.** The exam family's manifest publishes
/// `--color-ink`, `--color-paper` and `--color-rule-line`. Those are the
/// ground and the ink — the platform's, not a family's (CLAUDE.md #7) —
/// and they are ignored here, exactly as the web ignores them. A family
/// may colour its signature; it may not repaint the product.
abstract final class FamilyThemeResolver {
  /// The four relations, from `theme.tokens`.
  ///
  /// Returns [FamilyTheme.none] when no accent is published, which makes
  /// the subtree render in the platform's own colour rather than an
  /// arbitrary one. `civil_services_exams` is precisely this case.
  static FamilyTheme resolve(Map<String, dynamic>? theme) {
    final Map<String, dynamic> tokens =
        (theme?['tokens'] as Map<String, dynamic>?) ?? const <String, dynamic>{};

    final String? brand =
        _str(tokens['--color-accent']) ?? _str(tokens['--brand']);
    if (brand == null || _parseHex(brand) == null) return FamilyTheme.none;

    return FamilyTheme(
      brand: brand,
      // A manifest may still publish any of these explicitly, and that
      // wins over the derivation.
      brandHover: _str(tokens['--brand-hover']) ?? _shade(brand, -0.16),
      brandSoft: _str(tokens['--brand-soft']) ?? _mixWithWhite(brand, 0.9),
      brandSoftInk: _str(tokens['--brand-soft-ink']) ?? _shade(brand, -0.3),
      brandLine: _str(tokens['--brand-line']) ?? _mixWithWhite(brand, 0.72),
    );
  }

  static String? _str(Object? v) => v is String && v.trim().isNotEmpty ? v : null;

  static List<int>? _parseHex(String hex) {
    final RegExpMatch? m = RegExp(
      r'^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$',
    ).firstMatch(hex.trim());
    if (m == null) return null;
    final String h = m.group(1)!;
    final String full = h.length == 3
        ? h.split('').map((String c) => '$c$c').join()
        : h;
    return <int>[
      int.parse(full.substring(0, 2), radix: 16),
      int.parse(full.substring(2, 4), radix: 16),
      int.parse(full.substring(4, 6), radix: 16),
    ];
  }

  static String _toHex(List<double> rgb) =>
      '#${rgb.map((double v) => v.clamp(0, 255).round().toRadixString(16).padLeft(2, '0')).join()}';

  /// Negative darkens, positive lightens.
  static String _shade(String hex, double amount) {
    final List<int>? rgb = _parseHex(hex);
    if (rgb == null) return hex;
    final double target = amount < 0 ? 0 : 255;
    final double k = amount.abs();
    return _toHex(<double>[
      for (final int v in rgb) v + (target - v) * k,
    ]);
  }

  static String _mixWithWhite(String hex, double weight) {
    final List<int>? rgb = _parseHex(hex);
    if (rgb == null) return hex;
    return _toHex(<double>[
      for (final int v in rgb) v + (255 - v) * weight,
    ]);
  }
}
