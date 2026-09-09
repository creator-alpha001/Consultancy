import 'package:flutter/material.dart';

import '../theme/script.dart';

/// Text that picks its own typeface.
///
/// Every user-facing string in this app should go through here rather
/// than through a bare [Text]. The reason is [Script]: Inter has no
/// Devanagari coverage, so a Hindi label rendered in the app's Latin face
/// is a row of empty boxes. Which face a string needs depends on the
/// string, not on the screen it is on and not on the interface language —
/// a search result list can hold both at once.
class PackText extends StatelessWidget {
  const PackText(
    this.data, {
    this.style,
    this.maxLines,
    this.overflow,
    this.textAlign,
    this.semanticsLabel,
    super.key,
  });

  final String data;
  final TextStyle? style;
  final int? maxLines;
  final TextOverflow? overflow;
  final TextAlign? textAlign;
  final String? semanticsLabel;

  @override
  Widget build(BuildContext context) {
    final TextStyle base = style ?? DefaultTextStyle.of(context).style;
    return Text(
      data,
      style: base.copyWith(
        fontFamily: Script.familyFor(data),
        fontFamilyFallback: Script.fallbacksFor(data),
      ),
      maxLines: maxLines,
      overflow: overflow,
      textAlign: textAlign,
      semanticsLabel: semanticsLabel,
    );
  }
}
