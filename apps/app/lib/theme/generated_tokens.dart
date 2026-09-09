// GENERATED FILE — DO NOT EDIT.
//
// Source:     packages/design/tokens.json
// Regenerate: node scripts/sync-tokens.mjs
//
// Editing this file directly will be overwritten, and `dev.sh test`
// fails while it disagrees with the source.
//
// These are PLAIN VALUES. Composing them into a ThemeData — and applying
// a family's brand override on top — is lib/theme/app_theme.dart's job,
// because a family may colour its accent but may not repaint the product
// (CLAUDE.md #7), and that rule is policy rather than data.

import 'package:flutter/widgets.dart';

/// The platform's neutral base palette.
abstract final class BaseColors {
  static const Color canvas = Color(0xFFF6F7F9);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surfaceSunk = Color(0xFFF1F3F7);
  static const Color surfaceRaised = Color(0xFFFFFFFF);
  static const Color overlay = Color(0x730F172A);
  static const Color ink = Color(0xFF0F172A);
  static const Color inkMuted = Color(0xFF51607A);
  static const Color inkFaint = Color(0xFF8592A9);
  static const Color inkInverse = Color(0xFFFFFFFF);
  static const Color line = Color(0xFFE4E8EF);
  static const Color lineStrong = Color(0xFFCFD6E2);
  static const Color brand = Color(0xFF4338CA);
  static const Color brandHover = Color(0xFF372FAE);
  static const Color brandInk = Color(0xFFFFFFFF);
  static const Color brandSoft = Color(0xFFEEF1FE);
  static const Color brandSoftInk = Color(0xFF3730A3);
  static const Color brandLine = Color(0xFFC7CCFA);
  static const Color verified = Color(0xFF0F7A52);
  static const Color verifiedSoft = Color(0xFFE9F6F0);
  static const Color verifiedLine = Color(0xFFB6DED0);
  static const Color caution = Color(0xFFA05A00);
  static const Color cautionSoft = Color(0xFFFDF4E7);
  static const Color cautionLine = Color(0xFFF0DCBB);
  static const Color danger = Color(0xFFC0334A);
  static const Color dangerSoft = Color(0xFFFDF0F2);
  static const Color dangerLine = Color(0xFFF3CCD4);
  static const Color info = Color(0xFF35618E);
  static const Color infoSoft = Color(0xFFEEF4FA);
  static const Color infoLine = Color(0xFFC6D9EA);
}

/// The provider surface's dark scope (design addendum §2: two roles, two
/// surfaces). Only these tokens change; everything else holds. It is a
/// scope on a subtree, not a second theme.
abstract final class DarkScopeColors {
  static const Color surface = Color(0xFF16203A);
  static const Color surfaceSunk = Color(0xFF1E2A48);
  static const Color surfaceRaised = Color(0xFF1E2A48);
  static const Color ink = Color(0xFFF4F6FB);
  static const Color inkMuted = Color(0xFFA9B5CD);
  static const Color inkFaint = Color(0xFF7C89A4);
  static const Color line = Color(0xFF2C3A5C);
  static const Color lineStrong = Color(0xFF3B4B70);
  static const Color brandSoft = Color(0xFF26315A);
  static const Color brandSoftInk = Color(0xFFC3C8FF);
  static const Color brandLine = Color(0xFF3B4680);
}

/// The type scale. `fontFamily` is deliberately absent — the family is
/// chosen per string, because Inter has no Devanagari coverage and a
/// Devanagari label set in Inter renders as tofu.
abstract final class TypeScale {
  /// 11px / 15px / 0.06em
  static const TextStyle micro = TextStyle(
    fontSize: 11,
    height: 1.3636,
    letterSpacing: 0.66,
    fontWeight: FontWeight.w500,
  );

  /// 12px / 17px / 0em
  static const TextStyle caption = TextStyle(
    fontSize: 12,
    height: 1.4167,
    letterSpacing: 0,
    fontWeight: FontWeight.w400,
  );

  /// 13px / 19px / 0em
  static const TextStyle small = TextStyle(
    fontSize: 13,
    height: 1.4615,
    letterSpacing: 0,
    fontWeight: FontWeight.w400,
  );

  /// 15px / 24px / -0.005em
  static const TextStyle body = TextStyle(
    fontSize: 15,
    height: 1.6,
    letterSpacing: -0.075,
    fontWeight: FontWeight.w400,
  );

  /// 17px / 27px / -0.01em
  static const TextStyle lead = TextStyle(
    fontSize: 17,
    height: 1.5882,
    letterSpacing: -0.17,
    fontWeight: FontWeight.w400,
  );

  /// 20px / 27px / -0.018em
  static const TextStyle heading = TextStyle(
    fontSize: 20,
    height: 1.35,
    letterSpacing: -0.36,
    fontWeight: FontWeight.w600,
  );

  /// 26px / 33px / -0.024em
  static const TextStyle title = TextStyle(
    fontSize: 26,
    height: 1.2692,
    letterSpacing: -0.624,
    fontWeight: FontWeight.w600,
  );

  /// 34px / 40px / -0.03em
  static const TextStyle display = TextStyle(
    fontSize: 34,
    height: 1.1765,
    letterSpacing: -1.02,
    fontWeight: FontWeight.w600,
  );

  /// 44px / 50px / -0.034em
  static const TextStyle hero = TextStyle(
    fontSize: 44,
    height: 1.1364,
    letterSpacing: -1.496,
    fontWeight: FontWeight.w600,
  );
}

abstract final class Space {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 40;
  static const double xxxl = 64;
}

abstract final class Radii {
  static const double xs = 6;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 22;
  static const double pill = 999;
}

abstract final class Elevation {
  static const List<BoxShadow> e1 = <BoxShadow>[
    BoxShadow(
      color: Color(0x0D0F172A),
      offset: Offset(0, 1),
      blurRadius: 2,
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Color(0x080F172A),
      offset: Offset(0, 1),
      blurRadius: 1,
      spreadRadius: 0,
    ),
  ];

  static const List<BoxShadow> e2 = <BoxShadow>[
    BoxShadow(
      color: Color(0x0D0F172A),
      offset: Offset(0, 2),
      blurRadius: 4,
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Color(0x0F0F172A),
      offset: Offset(0, 4),
      blurRadius: 12,
      spreadRadius: 0,
    ),
  ];

  static const List<BoxShadow> e3 = <BoxShadow>[
    BoxShadow(
      color: Color(0x120F172A),
      offset: Offset(0, 8),
      blurRadius: 16,
      spreadRadius: 0,
    ),
    BoxShadow(
      color: Color(0x170F172A),
      offset: Offset(0, 16),
      blurRadius: 40,
      spreadRadius: 0,
    ),
  ];
}

abstract final class Weights {
  static const FontWeight regular = FontWeight.w400;
  static const FontWeight medium = FontWeight.w500;
  static const FontWeight semibold = FontWeight.w600;
}

/// A hard floor, not a suggestion.
const double kTouchTarget = 48;

abstract final class FontFamilies {
  static const String latin = 'Inter';
  static const String devanagari = 'Noto Sans Devanagari';
}
