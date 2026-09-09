import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models/money.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// A seeker's own progress, compared to nobody.
///
/// **What is deliberately absent, and must stay absent** (CLAUDE.md #17,
/// #24–26): no streak, no leaderboard, no percentile, no cohort average,
/// no "you are ahead of X% of people", and no prediction of an outcome.
/// A test in `test/rules_test.dart` greps this feature for the vocabulary
/// of comparison and fails on a hit.
///
/// That is not squeamishness. Competitive-exam preparation involves years
/// of isolation and repeated failure in a population with a documented
/// mental-health crisis; comparative gamification is not neutral there.
/// The only comparison this screen makes is between a person and their
/// own earlier work.
class ProgressScreen extends ConsumerWidget {
  const ProgressScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<ProgressSeries>> progress = ref.watch(
      progressProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Progress')),
      body: AsyncBody<List<ProgressSeries>>(
        value: progress,
        onRetry: () => ref.invalidate(progressProvider),
        emptyWhen: (List<ProgressSeries> l) => l.isEmpty,
        emptyMessage:
            'Nothing to show yet. Once a couple of pieces of work have been '
            'assessed, this compares them with each other.',
        builder: (List<ProgressSeries> list) => PageBody(
          onRefresh: () async => ref.invalidate(progressProvider),
          children: <Widget>[
            const Note(
              'This compares your work only with your own earlier work. '
              'There is nobody else on this screen.',
              icon: Icons.person_outline,
            ),
            for (final ProgressSeries s in list)
              _SeriesPanel(series: s, lang: lang),
          ],
        ),
      ),
    );
  }
}

class _SeriesPanel extends StatelessWidget {
  const _SeriesPanel({required this.series, required this.lang});

  final ProgressSeries series;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final int? change = series.change;

    return Panel(
      title: series.label(lang),
      trailing: change == null || !series.hasEnoughToPlot
          ? null
          : StatusChip(
              change == 0
                  ? 'No change'
                  : '${change > 0 ? '+' : ''}$change since your first',
              tone: change > 0
                  ? ChipTone.verified
                  : change < 0
                  ? ChipTone.caution
                  : ChipTone.neutral,
            ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (!series.hasEnoughToPlot)
            PackText(
              'One assessment so far. A second one gives this something to '
              'compare against.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: BaseColors.inkMuted,
              ),
            )
          else ...<Widget>[
            SizedBox(
              height: 90,
              child: CustomPaint(
                painter: _SparkPainter(
                  points: series.points
                      .map((ProgressPoint p) => p.score)
                      .toList(),
                  colour: BrandTokens.of(context).brand,
                ),
                size: Size.infinite,
              ),
            ),
            const SizedBox(height: Space.sm),
            Row(
              children: <Widget>[
                Field(label: 'First', value: Text('${series.first}')),
                const SizedBox(width: Space.xl),
                Field(label: 'Most recent', value: Text('${series.latest}')),
                const SizedBox(width: Space.xl),
                Field(
                  label: 'Assessments',
                  value: Text('${series.points.length}'),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// A line of a person's own scores over time.
///
/// No axis labels beyond the endpoints and no gridlines: this is a shape,
/// not a chart to be read off precisely. The numbers are underneath, and
/// a screen reader gets them from the [Field]s rather than from the
/// painting — which is why the canvas itself carries no meaning that is
/// not also in text.
class _SparkPainter extends CustomPainter {
  const _SparkPainter({required this.points, required this.colour});

  final List<int> points;
  final Color colour;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;

    final int lo = points.reduce((int a, int b) => a < b ? a : b);
    final int hi = points.reduce((int a, int b) => a > b ? a : b);
    final double span = (hi - lo) == 0 ? 1 : (hi - lo).toDouble();

    final Path path = Path();
    for (int i = 0; i < points.length; i++) {
      final double x = size.width * (i / (points.length - 1));
      final double y = size.height * (1 - (points[i] - lo) / span);
      if (i == 0) {
        path.moveTo(x, y);
      } else {
        path.lineTo(x, y);
      }
    }

    canvas.drawPath(
      path,
      Paint()
        ..color = colour
        ..strokeWidth = 2
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );

    for (int i = 0; i < points.length; i++) {
      final double x = size.width * (i / (points.length - 1));
      final double y = size.height * (1 - (points[i] - lo) / span);
      canvas.drawCircle(Offset(x, y), 3, Paint()..color = colour);
    }
  }

  @override
  bool shouldRepaint(_SparkPainter old) =>
      old.points != points || old.colour != colour;
}
