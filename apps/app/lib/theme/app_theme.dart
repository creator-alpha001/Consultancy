import 'package:flutter/material.dart';

import '../pack/pack.dart';
import 'generated_tokens.dart';

/// Composing the tokens into something Flutter can render, and applying a
/// family's accent on top.
///
/// **The reflex this file exists to prevent.** In Flutter you put one
/// `ThemeData` at the root of the app and forget about it. That is wrong
/// here, for two reasons that come straight out of CLAUDE.md:
///
///   #6 — a seeker has MANY active domains. A global family theme would
///        implicitly filter every list to one of them, and a person with
///        an exam, a university application and a tax question could not
///        see them in one place.
///   #7 — the theme is scoped to a family, and a family may colour its
///        accent but may not repaint the product. The ruled-paper
///        aesthetic belongs to the exam family, not to the platform.
///
/// So: the ROOT theme is always the platform's neutral one. A family's
/// accent is applied by wrapping the subtree that shows that family's
/// record — see [FamilyScope]. A list of records from several families
/// renders neutral, which is the honest answer to "whose colour is this?"
///
/// This mirrors the web app exactly, where `themeStyle(fam)` emits custom
/// properties onto one element rather than onto `:root`.
abstract final class AppTheme {
  /// The platform's own theme. No family's costume.
  static ThemeData platform() => _build(const FamilyTheme());

  /// The platform theme with [family]'s accent applied over it.
  static ThemeData forFamily(FamilyTheme family) => _build(family);

  static ThemeData _build(FamilyTheme fam) {
    final Color brand = _parse(fam.brand) ?? BaseColors.brand;
    final Color brandSoft = _parse(fam.brandSoft) ?? BaseColors.brandSoft;
    final Color brandSoftInk =
        _parse(fam.brandSoftInk) ?? BaseColors.brandSoftInk;
    final Color brandLine = _parse(fam.brandLine) ?? BaseColors.brandLine;

    final ColorScheme scheme = ColorScheme(
      brightness: Brightness.light,
      primary: brand,
      onPrimary: BaseColors.brandInk,
      primaryContainer: brandSoft,
      onPrimaryContainer: brandSoftInk,
      secondary: BaseColors.info,
      onSecondary: BaseColors.inkInverse,
      // Verification green means *verified*, never generically "good", so
      // it is not offered as a general tertiary colour.
      tertiary: BaseColors.verified,
      onTertiary: BaseColors.inkInverse,
      error: BaseColors.danger,
      onError: BaseColors.inkInverse,
      errorContainer: BaseColors.dangerSoft,
      onErrorContainer: BaseColors.danger,
      surface: BaseColors.surface,
      onSurface: BaseColors.ink,
      surfaceContainerLowest: BaseColors.surface,
      surfaceContainerLow: BaseColors.canvas,
      surfaceContainer: BaseColors.surfaceSunk,
      onSurfaceVariant: BaseColors.inkMuted,
      outline: BaseColors.line,
      outlineVariant: BaseColors.lineStrong,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: BaseColors.canvas,
      // The default for everything that is not a PackText — typed input
      // above all, where a person may write in Hindi. Inter first with
      // Noto Sans Devanagari behind it, so no glyph is ever tofu. PackText
      // still picks the primary face per string (theme/script.dart),
      // which matches metrics better than fallback alone.
      fontFamily: FontFamilies.latin,
      fontFamilyFallback: const <String>[FontFamilies.devanagari],
      textTheme: _textTheme,
      dividerColor: BaseColors.line,
      splashFactory: InkSparkle.splashFactory,
      // The 48px floor is a hard rule from the Definition of Done, not a
      // default to be overridden per button.
      materialTapTargetSize: MaterialTapTargetSize.padded,
      visualDensity: VisualDensity.standard,
      appBarTheme: const AppBarTheme(
        backgroundColor: BaseColors.surface,
        foregroundColor: BaseColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(kTouchTarget, kTouchTarget),
          backgroundColor: brand,
          foregroundColor: BaseColors.brandInk,
          textStyle: TypeScale.body.copyWith(fontWeight: Weights.medium),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(Radii.md),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(kTouchTarget, kTouchTarget),
          foregroundColor: BaseColors.ink,
          side: const BorderSide(color: BaseColors.lineStrong),
          textStyle: TypeScale.body.copyWith(fontWeight: Weights.medium),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(Radii.md),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(kTouchTarget, kTouchTarget),
          foregroundColor: brand,
          textStyle: TypeScale.body.copyWith(fontWeight: Weights.medium),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BaseColors.surface,
        constraints: const BoxConstraints(minHeight: kTouchTarget),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: BaseColors.lineStrong),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: BaseColors.lineStrong),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: BorderSide(color: brand, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(Radii.md),
          borderSide: const BorderSide(color: BaseColors.danger),
        ),
        labelStyle: TypeScale.small.copyWith(color: BaseColors.inkMuted),
      ),
      cardTheme: CardThemeData(
        color: BaseColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(Radii.lg),
          side: const BorderSide(color: BaseColors.line),
        ),
      ),
      extensions: <ThemeExtension<dynamic>>[
        BrandTokens(
          brand: brand,
          brandHover: _parse(fam.brandHover) ?? BaseColors.brandHover,
          brandSoft: brandSoft,
          brandSoftInk: brandSoftInk,
          brandLine: brandLine,
        ),
      ],
    );
  }

  static final TextTheme _textTheme = const TextTheme().copyWith(
    displayLarge: TypeScale.hero,
    displayMedium: TypeScale.display,
    displaySmall: TypeScale.title,
    headlineMedium: TypeScale.title,
    headlineSmall: TypeScale.heading,
    titleLarge: TypeScale.heading,
    titleMedium: TypeScale.lead,
    bodyLarge: TypeScale.lead,
    bodyMedium: TypeScale.body,
    bodySmall: TypeScale.small,
    labelLarge: TypeScale.small,
    labelMedium: TypeScale.caption,
    labelSmall: TypeScale.micro,
  );

  /// `#rrggbb` from a manifest. Returns null on anything else — a family
  /// that publishes a malformed colour gets the platform's, rather than
  /// an exception on a screen the user is trying to read.
  static Color? _parse(String? hex) {
    if (hex == null) return null;
    final RegExpMatch? m = RegExp(
      r'^#?([0-9a-fA-F]{6})$',
    ).firstMatch(hex.trim());
    if (m == null) return null;
    return Color(0xFF000000 | int.parse(m.group(1)!, radix: 16));
  }
}

/// The brand ramp, reachable from any widget without threading it down.
///
/// A `ThemeExtension` rather than a bag of constants precisely so that
/// [FamilyScope] can replace it on a subtree.
class BrandTokens extends ThemeExtension<BrandTokens> {
  const BrandTokens({
    required this.brand,
    required this.brandHover,
    required this.brandSoft,
    required this.brandSoftInk,
    required this.brandLine,
  });

  final Color brand;
  final Color brandHover;
  final Color brandSoft;
  final Color brandSoftInk;
  final Color brandLine;

  static BrandTokens of(BuildContext context) =>
      Theme.of(context).extension<BrandTokens>() ?? _fallback;

  static const BrandTokens _fallback = BrandTokens(
    brand: BaseColors.brand,
    brandHover: BaseColors.brandHover,
    brandSoft: BaseColors.brandSoft,
    brandSoftInk: BaseColors.brandSoftInk,
    brandLine: BaseColors.brandLine,
  );

  @override
  BrandTokens copyWith({
    Color? brand,
    Color? brandHover,
    Color? brandSoft,
    Color? brandSoftInk,
    Color? brandLine,
  }) => BrandTokens(
    brand: brand ?? this.brand,
    brandHover: brandHover ?? this.brandHover,
    brandSoft: brandSoft ?? this.brandSoft,
    brandSoftInk: brandSoftInk ?? this.brandSoftInk,
    brandLine: brandLine ?? this.brandLine,
  );

  @override
  BrandTokens lerp(ThemeExtension<BrandTokens>? other, double t) {
    if (other is! BrandTokens) return this;
    return BrandTokens(
      brand: Color.lerp(brand, other.brand, t)!,
      brandHover: Color.lerp(brandHover, other.brandHover, t)!,
      brandSoft: Color.lerp(brandSoft, other.brandSoft, t)!,
      brandSoftInk: Color.lerp(brandSoftInk, other.brandSoftInk, t)!,
      brandLine: Color.lerp(brandLine, other.brandLine, t)!,
    );
  }
}

/// Renders [child] in [family]'s accent.
///
/// Wrap the part of a screen that belongs to ONE family's record — an
/// engagement, a provider profile, a board post. Do not wrap a list that
/// can hold records from several, and never wrap the whole app.
class FamilyScope extends StatelessWidget {
  const FamilyScope({required this.family, required this.child, super.key});

  final FamilyTheme family;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (family.isEmpty) return child;
    return Theme(data: AppTheme.forFamily(family), child: child);
  }
}
