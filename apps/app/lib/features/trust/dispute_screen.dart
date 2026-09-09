import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/trust.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Raising and following a dispute.
///
/// **A claim points at specific agreed goals.** The locked agenda is what
/// a ruling is made against and nothing outside it counts (CLAUDE.md #11,
/// #20) — "it wasn't good" is not something a platform can adjudicate;
/// "the second goal was not addressed" is. So the first thing this screen
/// asks for is which goals, and the selection is part of the claim rather
/// than a filter on it.
///
/// **The ladder is the family's.** How many rungs, what each is called,
/// how long it has and which is final are all manifest data. This screen
/// renders whatever shape it is given and switches on none of it, which
/// is what M7 was built to prove.
///
/// **Nobody is told an outcome is likely.** No estimate, no "most cases
/// like this are refunded" — a person raising a dispute is already having
/// a bad time, and a prediction the platform cannot honour would make it
/// worse.
class DisputeScreen extends ConsumerWidget {
  const DisputeScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(engagementId),
    );
    final AsyncValue<Dispute?> existing = ref.watch(
      disputeForEngagementProvider(engagementId),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Dispute')),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) => FamilyScope(
          family:
              ref
                  .watch(catalogueProvider)
                  .valueOrNull
                  ?.family(e.familyCode)
                  ?.theme ??
              FamilyTheme.none,
          child: existing.when(
            loading: () =>
                const Center(child: CircularProgressIndicator()),
            error: (Object err, _) => PageBody(
              children: <Widget>[
                Note(
                  err is ApiException
                      ? err.message
                      : 'Could not load this.',
                  tone: ChipTone.danger,
                ),
              ],
            ),
            data: (Dispute? d) => d == null
                ? _RaiseForm(engagement: e)
                : _DisputeDetail(dispute: d, engagement: e),
          ),
        ),
      ),
    );
  }
}

class _RaiseForm extends ConsumerStatefulWidget {
  const _RaiseForm({required this.engagement});

  final Engagement engagement;

  @override
  ConsumerState<_RaiseForm> createState() => _RaiseFormState();
}

class _RaiseFormState extends ConsumerState<_RaiseForm> {
  final Set<String> _claimed = <String>{};
  final TextEditingController _body = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String lang = ref.watch(langProvider);
    final Engagement e = widget.engagement;
    final Agenda? agenda = e.agenda;

    // Without a locked agenda there is nothing to adjudicate against.
    // Better to say so than to take a claim the platform cannot rule on.
    if (agenda == null || !agenda.isLocked) {
      return PageBody(
        children: <Widget>[
          const Note(
            'There are no locked goals on this work yet, so there is nothing '
            'for a ruling to be made against. If something has gone wrong, '
            'cancelling is the route while the goals are still open.',
            tone: ChipTone.caution,
          ),
        ],
      );
    }

    return PageBody(
      children: <Widget>[
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: PackText(
                      'Raise a dispute',
                      style: theme.textTheme.headlineSmall,
                    ),
                  ),
                  if (e.escrow != null) Money(e.escrow!.held),
                ],
              ),
              const SizedBox(height: Space.sm),
              // Stated plainly, because someone reaching for this screen
              // is often hoping it is a fast refund button. It is not.
              PackText(
                'The money stays held while this is looked at. Raising a '
                'case does not make a refund faster, and it is not the same '
                'as asking for the work to be redone.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: BaseColors.inkMuted,
                ),
              ),
            ],
          ),
        ),

        Panel(
          title: 'Which goals are you claiming about?',
          note:
              'A ruling only looks at these. Nothing outside the goals you '
              'both locked counts, in either direction.',
          child: Column(
            children: <Widget>[
              for (final AgendaItem i in agenda.items)
                CheckboxListTile(
                  value: _claimed.contains(i.id),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: PackText(i.textIn(lang)),
                  // The wording a ruling is judged on is the ORIGINAL, so
                  // if what is on screen is a translation the screen says
                  // so here of all places.
                  subtitle: i.isTranslated(lang)
                      ? PackText(
                          'Judged on the ${i.originalLanguage.toUpperCase()} '
                          'wording: "${i.original}"',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: BaseColors.inkMuted,
                          ),
                        )
                      : null,
                  onChanged: (bool? on) => setState(() {
                    if (on ?? false) {
                      _claimed.add(i.id);
                    } else {
                      _claimed.remove(i.id);
                    }
                  }),
                ),
            ],
          ),
        ),

        Panel(
          title: 'What happened?',
          note:
              'Specific and checkable. Someone who was not there has to be '
              'able to decide from this and the goals alone.',
          child: TextField(
            controller: _body,
            minLines: 5,
            maxLines: 12,
            decoration: const InputDecoration(
              hintText:
                  'e.g. the second goal asked for the structure to be marked '
                  'up; what came back only has a summary at the end.',
            ),
          ),
        ),

        _Ladder(familyCode: widget.engagement.familyCode),

        if (_error != null) Note(_error!, tone: ChipTone.danger),

        FilledButton(
          onPressed: _busy || _claimed.isEmpty || _body.text.trim().isEmpty
              ? null
              : _raise,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const PackText('Raise the dispute'),
        ),
      ],
    );
  }

  Future<void> _raise() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Agenda agenda = widget.engagement.agenda!;
      // The claimed goals are named IN the body, in their original
      // wording, because that is the text a ruling is made against and
      // the API has no separate field for the selection. Recorded as
      // owed in TRACKER: the claim would be better modelled as rows.
      final String claimed = agenda.items
          .where((AgendaItem i) => _claimed.contains(i.id))
          .map((AgendaItem i) => '• ${i.original}')
          .join('\n');

      await ref
          .read(repositoryProvider)
          .raiseDispute(
            widget.engagement.id,
            // Core constrains this to nothing at all — there is no
            // declared taxonomy of dispute reasons anywhere, unlike
            // report reasons which the family owns. One neutral code
            // until that is decided, rather than an invented list.
            reasonCode: 'agenda_not_met',
            body: 'Goals claimed:\n$claimed\n\n${_body.text.trim()}',
            lang: ref.read(langProvider),
          );
      ref
        ..invalidate(disputeForEngagementProvider(widget.engagement.id))
        ..invalidate(engagementProvider(widget.engagement.id))
        ..invalidate(engagementsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// A dispute that exists: where it is, what was decided, what is next.
class _DisputeDetail extends ConsumerWidget {
  const _DisputeDetail({required this.dispute, required this.engagement});

  final Dispute dispute;
  final Engagement engagement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final AsyncValue<List<Ruling>> rulings = ref.watch(
      disputeRulingsProvider(dispute.id),
    );
    final AsyncValue<List<DisputeTier>> tiers = ref.watch(
      disputeTiersProvider(engagement.familyCode),
    );

    final DisputeTier? here = tiers.valueOrNull
        ?.where((DisputeTier t) => t.tier == dispute.tier)
        .firstOrNull;

    return PageBody(
      onRefresh: () async {
        ref
          ..invalidate(disputeForEngagementProvider(engagement.id))
          ..invalidate(disputeRulingsProvider(dispute.id));
      },
      children: <Widget>[
        Panel(
          title: 'Your case',
          trailing: StatusChip(
            dispute.state.label,
            tone: switch (dispute.state) {
              DisputeState.settled => ChipTone.verified,
              DisputeState.withdrawn => ChipTone.neutral,
              _ => ChipTone.caution,
            },
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (here != null)
                Field(
                  label: 'Currently at',
                  value: PackText(
                    '${here.humanised}'
                    '${here.responseHours > 0 ? ' · up to ${_days(here.responseHours)} to respond' : ''}',
                  ),
                ),
              if (dispute.body.isNotEmpty) ...<Widget>[
                const SizedBox(height: Space.md),
                Field(label: 'What you said', value: PackText(dispute.body)),
              ],
              if (dispute.createdAt != null) ...<Widget>[
                const SizedBox(height: Space.md),
                PackText(
                  'Raised ${DateFormat('d MMM yyyy').format(dispute.createdAt!)}',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: BaseColors.inkFaint,
                  ),
                ),
              ],
            ],
          ),
        ),

        _Ladder(
          familyCode: engagement.familyCode,
          currentTier: dispute.tier,
        ),

        rulings.when(
          loading: () => const Panel(child: LinearProgressIndicator()),
          error: (Object e, _) => const SizedBox.shrink(),
          data: (List<Ruling> list) => list.isEmpty
              ? const Panel(
                  title: 'Decision',
                  child: Note(
                    'Nothing decided yet. You will be able to read the '
                    'reasoning here when it is.',
                  ),
                )
              : Panel(
                  title: 'Decisions',
                  // A person decided this, always. AI never rules on a
                  // dispute (CLAUDE.md #18) and a trigger enforces it.
                  note: 'Each of these was made by a person.',
                  child: Column(
                    children: <Widget>[
                      for (final Ruling r in list)
                        Padding(
                          padding: const EdgeInsets.only(bottom: Space.lg),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              StatusChip(
                                r.outcomeLabel,
                                tone: switch (r.outcome) {
                                  'refunded' => ChipTone.info,
                                  'released' => ChipTone.verified,
                                  _ => ChipTone.caution,
                                },
                              ),
                              if (r.reasoning.isNotEmpty) ...<Widget>[
                                const SizedBox(height: Space.sm),
                                PackText(r.reasoning),
                              ],
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
        ),

        if (dispute.canAppeal || dispute.canWithdraw)
          _Actions(dispute: dispute, engagement: engagement, tiers: tiers),
      ],
    );
  }

  static String _days(int hours) =>
      hours % 24 == 0 ? '${hours ~/ 24} days' : '$hours hours';
}

/// The family's ladder, drawn as rungs.
class _Ladder extends ConsumerWidget {
  const _Ladder({required this.familyCode, this.currentTier});

  final String familyCode;
  final int? currentTier;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<DisputeTier>> tiers = ref.watch(
      disputeTiersProvider(familyCode),
    );
    return tiers.maybeWhen(
      data: (List<DisputeTier> list) => list.isEmpty
          ? const SizedBox.shrink()
          : Panel(
              title: 'How this is settled',
              note: 'Each step has to answer before the next one opens.',
              child: Column(
                children: <Widget>[
                  for (final DisputeTier t in list)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.sm),
                      child: Row(
                        children: <Widget>[
                          Icon(
                            currentTier == null
                                ? Icons.circle_outlined
                                : t.tier < currentTier!
                                ? Icons.check_circle
                                : t.tier == currentTier
                                ? Icons.radio_button_checked
                                : Icons.circle_outlined,
                            size: 18,
                            color: currentTier != null && t.tier <= currentTier!
                                ? BrandTokens.of(context).brand
                                : BaseColors.inkFaint,
                          ),
                          const SizedBox(width: Space.sm),
                          Expanded(child: PackText(t.humanised)),
                          if (t.isFinal)
                            const StatusChip('Final'),
                        ],
                      ),
                    ),
                ],
              ),
            ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _Actions extends ConsumerStatefulWidget {
  const _Actions({
    required this.dispute,
    required this.engagement,
    required this.tiers,
  });

  final Dispute dispute;
  final Engagement engagement;
  final AsyncValue<List<DisputeTier>> tiers;

  @override
  ConsumerState<_Actions> createState() => _ActionsState();
}

class _ActionsState extends ConsumerState<_Actions> {
  final TextEditingController _reason = TextEditingController();
  bool _appealing = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // A ladder with no rung above this one has no appeal, and the family
    // says which rung that is — not this app.
    final DisputeTier? here = widget.tiers.valueOrNull
        ?.where((DisputeTier t) => t.tier == widget.dispute.tier)
        .firstOrNull;
    final bool canAppeal = widget.dispute.canAppeal && !(here?.isFinal ?? false);

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (_error != null) ...<Widget>[
            Note(_error!, tone: ChipTone.danger),
            const SizedBox(height: Space.md),
          ],

          if (canAppeal && !_appealing)
            OutlinedButton(
              onPressed: () => setState(() => _appealing = true),
              child: const PackText('Appeal this decision'),
            ),

          if (_appealing) ...<Widget>[
            TextField(
              controller: _reason,
              minLines: 3,
              maxLines: 8,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'What the decision missed.',
              ),
            ),
            const SizedBox(height: Space.md),
            FilledButton(
              onPressed: _busy || _reason.text.trim().isEmpty ? null : _appeal,
              child: const PackText('Send the appeal'),
            ),
          ],

          if (widget.dispute.canWithdraw) ...<Widget>[
            if (canAppeal || _appealing) const SizedBox(height: Space.sm),
            TextButton(
              onPressed: _busy ? null : _withdraw,
              child: const PackText('Withdraw this dispute'),
            ),
          ],

          if (here?.isFinal ?? false) ...<Widget>[
            const SizedBox(height: Space.sm),
            const Note(
              'This was the last step. There is no further appeal.',
              icon: Icons.gavel_outlined,
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _appeal() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .appealDispute(
            widget.dispute.id,
            body: _reason.text.trim(),
            lang: ref.read(langProvider),
          );
      _refresh();
      if (mounted) setState(() => _appealing = false);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _withdraw() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Withdraw the dispute?'),
        content: const PackText(
          'The case closes and the work goes back to where it was. You can '
          'raise it again, but the clock starts over.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Keep it open'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Withdraw'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).withdrawDispute(widget.dispute.id);
      _refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _refresh() {
    ref
      ..invalidate(disputeForEngagementProvider(widget.engagement.id))
      ..invalidate(disputeRulingsProvider(widget.dispute.id))
      ..invalidate(engagementProvider(widget.engagement.id));
  }
}
