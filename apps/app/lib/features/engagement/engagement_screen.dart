import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The engagement hub: one screen that always says what happens next.
///
/// The organising idea is CLAUDE.md #12 — no engagement enters a working
/// state without escrow held **and** agenda locked. Both halves are shown
/// as separate steps because being told "not ready" without being told
/// *which* half is missing is a dead end, and a dead end is what the
/// previous mobile app shipped when it said "fund escrow to start" and
/// offered no way to do so.
class EngagementScreen extends ConsumerWidget {
  const EngagementScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(engagementId),
    );

    return Scaffold(
      appBar: AppBar(
        title: Text(
          engagement.valueOrNull?.reference ?? '',
          style: const TextStyle(
            fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
          ),
        ),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            tooltip: 'Report a problem',
            onPressed: () =>
                context.push('/report?subject=engagement&id=$engagementId'),
          ),
        ],
      ),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) => PageBody(
          onRefresh: () async => ref.invalidate(engagementProvider(engagementId)),
          children: <Widget>[
            _Summary(engagement: e),
            _NextStep(engagement: e),
            EscrowRail(escrow: e.escrow),
            _Links(engagement: e),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.engagement});

  final Engagement engagement;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: PackText(
                  engagement.provider?.displayName ??
                      engagement.seeker?.displayName ??
                      '',
                  style: theme.textTheme.titleLarge,
                ),
              ),
              engagementChip(engagement.status),
            ],
          ),
          const SizedBox(height: Space.lg),
          Wrap(
            spacing: Space.xl,
            runSpacing: Space.lg,
            children: <Widget>[
              Field(
                label: 'Price',
                value: Money(engagement.amount, style: theme.textTheme.titleLarge),
              ),
              Field(
                label: 'Working language',
                value: PackText(engagement.language.toUpperCase()),
              ),
              if (engagement.type != null)
                Field(
                  label: 'Kind of work',
                  value: PackText(engagement.type!.neutralLabel),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// What has to happen next, and the one button that does it.
///
/// Every state of the engagement resolves to a sentence and at most one
/// primary action. A screen that lists six things you *could* do is a
/// screen nobody acts on.
class _NextStep extends ConsumerStatefulWidget {
  const _NextStep({required this.engagement});

  final Engagement engagement;

  @override
  ConsumerState<_NextStep> createState() => _NextStepState();
}

class _NextStepState extends ConsumerState<_NextStep> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final Engagement e = widget.engagement;
    final ThemeData theme = Theme.of(context);

    // The two gates, in the order they have to be passed.
    if (!e.agendaReady) {
      return Panel(
        title: 'Agree the goals',
        note:
            'Nothing starts, and nothing is charged, until you have both '
            'agreed what this is for.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            FilledButton(
              onPressed: () => context.push('/work/${e.id}/agenda'),
              child: const PackText('Write the goals'),
            ),
          ],
        ),
      );
    }

    if (!e.escrowReady) {
      return Panel(
        title: 'Fund the work',
        note:
            'Your money is held by a licensed payment provider. It reaches '
            'them only when you confirm the goals were met.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: PackText(
                    'To hold',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: BaseColors.inkMuted,
                    ),
                  ),
                ),
                Money(e.amount, style: theme.textTheme.titleLarge),
              ],
            ),
            const SizedBox(height: Space.lg),
            if (_error != null) ...<Widget>[
              Note(_error!, tone: ChipTone.danger),
              const SizedBox(height: Space.md),
            ],
            FilledButton(
              onPressed: _busy ? null : _pay,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const PackText('Hold the money'),
            ),
          ],
        ),
      );
    }

    if (e.status == EngagementStatus.inReview ||
        e.status == EngagementStatus.delivered) {
      return Panel(
        title: 'Your turn',
        note:
            'Check the work against the goals you agreed. Confirming '
            'releases the money.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_error != null) ...<Widget>[
              Note(_error!, tone: ChipTone.danger),
              const SizedBox(height: Space.md),
            ],
            FilledButton(
              onPressed: _busy ? null : _complete,
              child: const PackText('The goals were met'),
            ),
            const SizedBox(height: Space.sm),
            OutlinedButton(
              onPressed: () => context.push('/work/${e.id}/dispute'),
              child: const PackText('Something is wrong'),
            ),
          ],
        ),
      );
    }

    if (e.status == EngagementStatus.completed) {
      return Panel(
        title: 'Done',
        note: 'Money released. A review helps the next person choose.',
        child: OutlinedButton(
          onPressed: () => context.push('/work/${e.id}/review'),
          child: const PackText('Leave a review'),
        ),
      );
    }

    return Panel(
      title: 'In progress',
      note:
          'The goals are locked and the money is held. Nothing is needed '
          'from you until the work comes back.',
      child: const SizedBox.shrink(),
    );
  }

  Future<void> _pay() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .pay(
            widget.engagement.id,
            // Minted from the engagement, not random: if the app dies
            // between the tap and the reply and the user tries again,
            // the API must see the same request rather than take the
            // money twice (CLAUDE.md #10).
            idempotencyKey: 'pay-${widget.engagement.id}',
          );
      ref
        ..invalidate(engagementProvider(widget.engagement.id))
        ..invalidate(engagementsProvider)
        ..invalidate(moneyProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .complete(
            widget.engagement.id,
            idempotencyKey: 'complete-${widget.engagement.id}',
          );
      ref
        ..invalidate(engagementProvider(widget.engagement.id))
        ..invalidate(engagementsProvider)
        ..invalidate(moneyProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Links extends StatelessWidget {
  const _Links({required this.engagement});

  final Engagement engagement;

  @override
  Widget build(BuildContext context) => Panel(
    child: Column(
      children: <Widget>[
        NavRow(
          title: 'The goals',
          subtitle: engagement.agenda?.isLocked ?? false
              ? 'Locked · version ${engagement.agenda!.version}'
              : 'Not agreed yet',
          leading: const Icon(Icons.checklist_outlined, size: 20),
          onTap: () => context.push('/work/${engagement.id}/agenda'),
        ),
        NavRow(
          title: 'The work and its assessment',
          leading: const Icon(Icons.description_outlined, size: 20),
          onTap: () => context.push('/work/${engagement.id}/assessment'),
        ),
      ],
    ),
  );
}
