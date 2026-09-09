import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Everything a person has going on, in one list.
///
/// Sorted so the things needing THEM come first. A list ordered by date
/// makes someone scan for their own name; a list ordered by whose turn it
/// is answers the question they actually opened the app with.
///
/// It is also deliberately cross-field: a seeker may have an exam, a
/// university application and a tax question at once (CLAUDE.md #6), so
/// this renders the platform's neutral vocabulary and each row carries
/// its own field.
class WorkScreen extends ConsumerWidget {
  const WorkScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Engagement>> engagements = ref.watch(
      engagementsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Your work')),
      body: AsyncBody<List<Engagement>>(
        value: engagements,
        onRetry: () => ref.invalidate(engagementsProvider),
        emptyWhen: (List<Engagement> l) => l.isEmpty,
        emptyMessage:
            'Nothing here yet. Find someone verified in what you need and '
            'the work will appear here.',
        builder: (List<Engagement> list) {
          final List<Engagement> sorted = _byUrgency(list);
          return ListView.separated(
            padding: const EdgeInsets.all(Space.lg),
            itemCount: sorted.length,
            separatorBuilder: (_, _) => const SizedBox(height: Space.md),
            itemBuilder: (BuildContext context, int i) =>
                _Row(engagement: sorted[i]),
          );
        },
      ),
    );
  }

  /// Needs-you first, then live work, then everything finished.
  static List<Engagement> _byUrgency(List<Engagement> list) {
    int rank(Engagement e) {
      if (e.status == EngagementStatus.inReview ||
          e.status == EngagementStatus.delivered) {
        return 0;
      }
      if (!e.agendaReady || !e.escrowReady) {
        return e.status.isFinished ? 3 : 1;
      }
      if (e.status.isFinished) return 3;
      return 2;
    }

    final List<Engagement> out = List<Engagement>.of(list);
    out.sort((Engagement a, Engagement b) {
      final int r = rank(a).compareTo(rank(b));
      if (r != 0) return r;
      return (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0));
    });
    return out;
  }
}

class _Row extends ConsumerWidget {
  const _Row({required this.engagement});

  final Engagement engagement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final String lang = ref.watch(langProvider);
    final Engagement e = engagement;

    // The one sentence that says whose turn it is.
    final String? nudge = switch (e) {
      _ when !e.agendaReady && !e.status.isFinished => 'Waiting on you: agree the goals',
      _ when !e.escrowReady && !e.status.isFinished => 'Waiting on you: hold the money',
      _ when e.status == EngagementStatus.inReview => 'Waiting on you: check the work',
      _ when e.status == EngagementStatus.delivered => 'Waiting on you: check the work',
      _ => null,
    };

    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.lg),
        onTap: () => context.push('/work/${e.id}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: PackText(
                      e.provider?.displayName ?? e.seeker?.displayName ?? '',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  engagementChip(e.status),
                ],
              ),
              const SizedBox(height: Space.xs),
              Row(
                children: <Widget>[
                  Text(
                    e.reference,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: BaseColors.inkFaint,
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                  const Spacer(),
                  Money(
                    e.amount,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: BaseColors.inkMuted,
                    ),
                  ),
                ],
              ),
              if (nudge != null) ...<Widget>[
                const SizedBox(height: Space.md),
                Note(nudge, tone: ChipTone.caution, icon: Icons.arrow_forward),
              ],
              // Which field this belongs to, so a cross-field list is
              // readable without opening anything.
              if (e.domainCode.isNotEmpty) ...<Widget>[
                const SizedBox(height: Space.sm),
                _DomainTag(domainCode: e.domainCode, lang: lang),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _DomainTag extends ConsumerWidget {
  const _DomainTag({required this.domainCode, required this.lang});

  final String domainCode;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final Catalogue? catalogue = ref.watch(catalogueProvider).valueOrNull;
    final DomainListing? domain = catalogue?.allDomains
        .where((DomainListing d) => d.code == domainCode)
        .firstOrNull;
    return StatusChip(domain?.label(lang) ?? domainCode);
  }
}
