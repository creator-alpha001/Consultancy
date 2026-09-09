import 'generated_tokens.dart';

/// Which font family a given string needs.
///
/// Inter has **no Devanagari coverage at all**, so this is not a nicety:
/// a Hindi label set in Inter renders as a row of empty boxes. The web
/// app solves it with a CSS font stack, which falls back per glyph for
/// free. Flutter has `fontFamilyFallback`, but the primary family still
/// decides metrics and weight matching, so picking the right primary per
/// string gives a noticeably better result than relying on fallback.
///
/// This is the same problem that produced the `2 मेंटरs` bug: code that
/// assumed every label was Latin. The fix there was pluralisation; the
/// fix here is typography. Both come from the same wrong assumption.
abstract final class Script {
  /// Devanagari, plus the combining marks that travel with it.
  ///
  /// Covers Hindi and Marathi, which are the two Devanagari languages in
  /// the platform's language list. The other scripts the packs declare —
  /// Tamil, Bengali, Gujarati, Gurmukhi, Telugu, Kannada, Malayalam,
  /// Odia — are NOT covered by either bundled face and fall through to
  /// the platform font, which does carry them on Android and iOS.
  ///
  /// That is a real limitation, recorded rather than hidden: those
  /// languages render correctly but not in the product's typeface.
  static final RegExp _devanagari = RegExp(r'[ऀ-ॿ꣠-ꣿ]');

  /// True when [text] contains any Devanagari.
  ///
  /// Any, not all: a label like `UPSC मुख्य परीक्षा` mixes scripts, and
  /// the Devanagari half is the half that breaks.
  static bool hasDevanagari(String text) => _devanagari.hasMatch(text);

  /// The primary font family for [text].
  static String familyFor(String text) =>
      hasDevanagari(text) ? FontFamilies.devanagari : FontFamilies.latin;

  /// The fallback chain, so a mixed string still resolves every glyph
  /// even though only one family can be primary.
  static List<String> fallbacksFor(String text) => hasDevanagari(text)
      ? const <String>[FontFamilies.latin]
      : const <String>[FontFamilies.devanagari];
}
