import 'package:flutter/material.dart';

import '../../theme/generated_tokens.dart';
import '../../widgets/text.dart';

/// A screen that says, plainly, that it is not built yet.
///
/// This exists so the shell is navigable end to end while the slices land
/// — and so that a half-built app cannot be mistaken for a finished one.
/// It names the slice that will build it, which is the same discipline
/// `TRACKER.md` applies to the rest of the repository: a gap that is
/// recorded is debt, and a gap that is not is a surprise.
///
/// Every one of these must be gone before the app ships. A test counts
/// them, so the number is visible rather than discovered.
class NotBuiltScreen extends StatelessWidget {
  const NotBuiltScreen({
    required this.title,
    required this.slice,
    this.note,
    super.key,
  });

  final String title;
  final String slice;
  final String? note;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(title: PackText(title)),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(Space.xl),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const Icon(
                Icons.construction_outlined,
                size: 32,
                color: BaseColors.inkMuted,
              ),
              const SizedBox(height: Space.md),
              PackText(
                'Not built yet',
                style: theme.textTheme.titleLarge,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: Space.sm),
              PackText(
                note ?? 'This screen arrives in $slice.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: BaseColors.inkMuted,
                ),
                textAlign: TextAlign.center,
              ),
              if (note != null) ...<Widget>[
                const SizedBox(height: Space.sm),
                PackText(
                  slice,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: BaseColors.inkFaint,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
