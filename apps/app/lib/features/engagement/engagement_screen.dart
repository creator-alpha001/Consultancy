import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/user.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import '../provider/availability_exceptions.dart';
import '../session/book_session.dart';

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
    final bool asProvider = ref.watch(authProvider).user?.role == Role.provider;

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
          onRefresh: () async =>
              ref.invalidate(engagementProvider(engagementId)),
          children: <Widget>[
            _Summary(engagement: e, asProvider: asProvider),
            if (asProvider)
              _ProviderNextStep(engagement: e)
            else
              _NextStep(engagement: e),
            EscrowRail(escrow: e.escrow, forProvider: asProvider),
            _Links(engagement: e),
            _CallItOff(engagement: e),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.engagement, required this.asProvider});

  final Engagement engagement;
  final bool asProvider;

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
                  // The other party, never yourself.
                  (asProvider ? engagement.seeker : engagement.provider)
                          ?.displayName ??
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
                value: Money(
                  engagement.amount,
                  style: theme.textTheme.titleLarge,
                ),
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

    // Before either gate: both parties confirm this is the work they
    // mean to do. Agreeing freezes the required skills from the
    // category's mapping *as it stands now*, so a manifest republished
    // next month cannot quietly change what was agreed. That is why it
    // is a deliberate step and not something the app does on the user's
    // behalf when the screen opens.
    if (e.status == EngagementStatus.draft) {
      return Panel(
        title: 'Confirm this is right',
        note:
            'Both of you confirm before anything is written or held. It '
            'fixes what the work covers; the goals and the money come '
            'after.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_error != null) ...<Widget>[
              Note(_error!, tone: ChipTone.danger),
              const SizedBox(height: Space.md),
            ],
            FilledButton(
              onPressed: _busy ? null : _agree,
              child: const PackText('Yes, this is right'),
            ),
          ],
        ),
      );
    }

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

    if (e.status == EngagementStatus.delivered) {
      return Panel(
        title: 'With them to assess',
        note:
            'Your work has been sent. The assessment appears under "The work '
            'and its assessment" when they return it. The money stays held '
            'until you confirm.',
        child: const SizedBox.shrink(),
      );
    }

    if (e.status == EngagementStatus.disputed) {
      return Panel(
        title: 'In dispute',
        note:
            'The money is held until the dispute is decided, against the '
            'goals as they were locked.',
        child: OutlinedButton(
          onPressed: () => context.push('/work/${e.id}/dispute'),
          child: const PackText('Open the dispute'),
        ),
      );
    }

    // Complete is refused by the API in any other state.
    if (e.status == EngagementStatus.assessed) {
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

  Future<void> _agree() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).agree(widget.engagement.id);
      ref
        ..invalidate(engagementProvider(widget.engagement.id))
        ..invalidate(engagementsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
    // Releasing is final: the money reaches them and a dispute is no
    // longer open to you. One stray tap must not do that.
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Release the money?'),
        content: PackText(
          'This pays them for the work and cannot be undone. If a goal was '
          'not met, go back and choose "Something is wrong" instead — the '
          'money stays held while that is looked at.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Go back'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Release it'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

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

/// The provider's side of "what happens next".
///
/// The seeker's version asks them to confirm, write goals, hold money and
/// release it; none of those are the provider's to do, and a provider who
/// was shown "Hold the money" on their own work was being shown the wrong
/// app. Here each state says who is waiting on whom, and the provider's
/// one action — assessing work that has been sent — is the button.
class _ProviderNextStep extends ConsumerStatefulWidget {
  const _ProviderNextStep({required this.engagement});

  final Engagement engagement;

  @override
  ConsumerState<_ProviderNextStep> createState() => _ProviderNextStepState();
}

class _ProviderNextStepState extends ConsumerState<_ProviderNextStep> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final Engagement e = widget.engagement;

    return switch (e.status) {
      // Either party may confirm the terms (the API allows both).
      EngagementStatus.draft => Panel(
        title: 'Confirm this is right',
        note:
            'Confirm the kind of work, the language and the price are what '
            'you will deliver. The goals and the money come after.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (_error != null) ...<Widget>[
              Note(_error!, tone: ChipTone.danger),
              const SizedBox(height: Space.md),
            ],
            FilledButton(
              onPressed: _busy ? null : _agree,
              child: const PackText('Yes, this is right'),
            ),
          ],
        ),
      ),
      _ when !e.agendaReady && !e.status.isFinished => Panel(
        title: 'Waiting for the goals',
        note:
            'They write the goals and lock them. Read them before you start: '
            'the work is judged against exactly that list.',
        child: OutlinedButton(
          onPressed: () => context.push('/work/${e.id}/agenda'),
          child: const PackText('Read the goals'),
        ),
      ),
      _ when !e.escrowReady && !e.status.isFinished => const Panel(
        title: 'Waiting for the money to be held',
        note:
            'Do not start until it is. Until the money is held, nothing '
            'protects your time.',
        child: SizedBox.shrink(),
      ),
      EngagementStatus.working => const Panel(
        title: 'Under way',
        note:
            'The goals are locked and the money is held. When they send '
            'their work, it appears here for you to assess.',
        child: SizedBox.shrink(),
      ),
      EngagementStatus.delivered => Panel(
        title: 'Your turn: assess the work',
        note:
            'Score it against the category and mark it up. They confirm the '
            'goals were met once your assessment is back.',
        child: FilledButton(
          onPressed: () => context.push('/provider/work/${e.id}/evaluate'),
          child: const PackText('Assess this work'),
        ),
      ),
      EngagementStatus.assessed => const Panel(
        title: 'Waiting on them',
        note:
            'Your assessment is back with them. The money is released when '
            'they confirm the goals were met.',
        child: SizedBox.shrink(),
      ),
      EngagementStatus.disputed => const Panel(
        title: 'In dispute',
        note:
            'The money is held until the dispute is decided, against the '
            'goals as they were locked. A failure on the platform\'s side is '
            'never counted against you.',
        child: SizedBox.shrink(),
      ),
      EngagementStatus.completed => const Panel(
        title: 'Done',
        note: 'Released to your earnings.',
        child: SizedBox.shrink(),
      ),
      _ => const SizedBox.shrink(),
    };
  }

  Future<void> _agree() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).agree(widget.engagement.id);
      ref
        ..invalidate(engagementProvider(widget.engagement.id))
        ..invalidate(engagementsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Links extends ConsumerWidget {
  const _Links({required this.engagement});

  final Engagement engagement;

  /// Both types that involve a live meeting. `document_review` is NOT
  /// privileged anywhere in this app, and neither is any other — which
  /// is why this asks about the type rather than assuming one.
  static bool _isLive(Engagement e) =>
      e.type == EngagementType.liveSession ||
      e.type == EngagementType.reviewWithLive;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bool isProvider = ref.watch(authProvider).user?.isProvider ?? false;
    return Panel(
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
          // Live work needs a time. Offered only once both gates are
          // passed, because a session booked before the goals are locked
          // would be a meeting with nothing agreed to discuss.
          if (!isProvider && engagement.canStart && _isLive(engagement))
            NavRow(
              title: 'Book a time',
              subtitle: 'Pick from the times they are free',
              leading: const Icon(Icons.event_available_outlined, size: 20),
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => BookSessionScreen(
                    engagementId: engagement.id,
                    providerId: engagement.provider?.id ?? '',
                  ),
                ),
              ),
            ),
          // The provider's own way in. A seeker never sees it — and the API
          // refuses it for them regardless, because the redirect decides
          // what to draw and never what is allowed (CLAUDE.md #28).
          if (isProvider) ...<Widget>[
            // Only while there is work waiting to be assessed; otherwise
            // it leads to a screen with nothing to do.
            if (engagement.status == EngagementStatus.delivered)
              NavRow(
                title: 'Assess this work',
                subtitle: 'Score it against the category and mark it up',
                leading: const Icon(Icons.rate_review_outlined, size: 20),
                onTap: () =>
                    context.push('/provider/work/${engagement.id}/evaluate'),
              ),
            // Only once work is under way: before that, the price is
            // what was agreed and changing it is a new agreement.
            if (engagement.canStart && !engagement.status.isFinished)
              NavRow(
                title: 'Charge less than agreed',
                subtitle: 'The price can come down, never up',
                leading: const Icon(Icons.trending_down, size: 20),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => DiscountSheet(
                      engagementId: engagement.id,
                      currentPaise: engagement.amount.value,
                    ),
                  ),
                ),
              ),
          ],
        ],
      ),
    );
  }
}

/// Calling the whole thing off.
///
/// Only legal while the engagement is still `draft` or `agreed` — once
/// work is under way, the way out is a dispute, not a cancellation, and
/// offering a button that the API would refuse is worse than offering
/// none. So this renders nothing at all outside those two states.
///
/// If money is already held it comes back in full: cancelling before any
/// work has begun is not a judgement about anybody, so nobody loses.
class _CallItOff extends ConsumerStatefulWidget {
  const _CallItOff({required this.engagement});

  final Engagement engagement;

  @override
  ConsumerState<_CallItOff> createState() => _CallItOffState();
}

class _CallItOffState extends ConsumerState<_CallItOff> {
  final TextEditingController _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final EngagementStatus s = widget.engagement.status;
    if (s != EngagementStatus.draft && s != EngagementStatus.agreed) {
      return const SizedBox.shrink();
    }

    return Panel(
      title: 'Call this off',
      note: !widget.engagement.escrowReady
          ? 'Nothing has been agreed or held yet, so this simply ends.'
          : (ref.watch(authProvider).user?.role == Role.provider)
          ? 'The money held goes back to them in full. Nothing has been '
                'done yet, so nothing is owed either way.'
          : 'The money held comes back to you in full. Nothing has been '
                'done yet, so nothing is owed.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (_error != null) ...<Widget>[
            Note(_error!, tone: ChipTone.danger),
            const SizedBox(height: Space.md),
          ],
          OutlinedButton(
            onPressed: _busy ? null : _confirm,
            child: const PackText('Call it off'),
          ),
        ],
      ),
    );
  }

  Future<void> _confirm() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Call this off?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const PackText(
              'This ends the engagement. Any money held is refunded.',
            ),
            const SizedBox(height: Space.md),
            // Optional, and said so: a person walking away should not
            // have to justify themselves to a text field before the
            // button will work.
            TextField(
              controller: _reason,
              decoration: const InputDecoration(labelText: 'Why? (optional)'),
            ),
          ],
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Call it off'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final String reason = _reason.text.trim();
      await ref
          .read(repositoryProvider)
          .cancelEngagement(
            widget.engagement.id,
            reason: reason.isEmpty ? null : reason,
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
