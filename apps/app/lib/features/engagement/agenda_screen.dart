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

/// Writing and locking the agenda.
///
/// This is the product's core differentiator and its biggest friction
/// risk at once: a seeker asked to fill in a form abandons; a seeker
/// helped to say what they want does not. So it is built as assistance —
/// the labels are questions, the value is stated on the screen, and the
/// example is concrete.
///
/// **The lock is the important part.** It is a separate, deliberate act
/// with its own confirmation, and after it there is **no edit affordance
/// anywhere** (CLAUDE.md #11) — the locked view below has no edit button,
/// no amend, and no way back into the draft. That absence is the feature:
/// it is what makes the list something a dispute can be judged against.
class AgendaScreen extends ConsumerWidget {
  const AgendaScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(engagementId),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Goals')),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) => (e.agenda?.isLocked ?? false)
            ? LockedAgendaView(engagement: e)
            : AgendaDraftForm(
                key: ValueKey<String>('draft-${e.id}'),
                engagement: e,
              ),
      ),
    );
  }
}

/// The locked agenda: a record, with nothing to change.
class LockedAgendaView extends ConsumerWidget {
  const LockedAgendaView({required this.engagement, super.key});

  final Engagement engagement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final String lang = ref.watch(langProvider);
    final Agenda a = engagement.agenda!;

    return PageBody(
      children: <Widget>[
        const Note(
          'These goals are locked. They cannot be edited — that is what '
          'makes them worth something if anything goes wrong. A change '
          'needs a new version you both accept.',
          tone: ChipTone.verified,
          icon: Icons.lock_outline,
        ),
        Panel(
          title: 'Agreed',
          note: 'Version ${a.version}',
          trailing: StatusChip(
            '${a.addressedCount}/${a.items.length} done',
            tone: a.addressedCount == a.items.length && a.items.isNotEmpty
                ? ChipTone.verified
                : ChipTone.neutral,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              for (final AgendaItem i in a.items)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      _Tick(
                        item: i,
                        engagementId: engagement.id,
                        // Ticking belongs to whoever is doing the work.
                        // Async work has no session room to tick from,
                        // so for those engagements this is the only
                        // place it can happen.
                        enabled:
                            (ref.watch(authProvider).user?.isProvider ??
                                false) &&
                            !i.addressed,
                      ),
                      const SizedBox(width: Space.sm),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            PackText(
                              i.textIn(lang),
                              style: theme.textTheme.bodyMedium,
                            ),
                            // The ORIGINAL-language wording is what a
                            // dispute is judged against (CLAUDE.md #20).
                            // When what is on screen is a translation the
                            // screen says so, and shows the original,
                            // rather than quietly substituting it.
                            if (i.isTranslated(lang))
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: PackText(
                                  'Translated. The '
                                  '${i.originalLanguage.toUpperCase()} wording '
                                  'is the one that counts: "${i.original}"',
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: BaseColors.inkMuted,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              if (a.outOfScope != null && a.outOfScope!.isNotEmpty) ...<Widget>[
                const Divider(height: Space.xl),
                Field(label: 'Not included', value: PackText(a.outOfScope!)),
              ],
              if (a.expectedDeliverable != null) ...<Widget>[
                const SizedBox(height: Space.md),
                Field(
                  label: 'What you get back',
                  value: PackText(a.expectedDeliverable!),
                ),
              ],
            ],
          ),
        ),
        if (a.contentHash != null)
          Panel(
            title: 'Fingerprint',
            note:
                'A checksum of the wording above, taken when it was locked. '
                'It is how "this is what we agreed" can be checked rather '
                'than argued about.',
            child: Text(
              a.contentHash!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: BaseColors.inkMuted,
                fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ),
        OutlinedButton(
          onPressed: () => context.go('/work/${engagement.id}'),
          child: const PackText('Back to the work'),
        ),
      ],
    );
  }
}

/// Marking one goal as covered.
///
/// The single mutation a locked agenda still permits (CLAUDE.md #11).
/// It is one-way: unticking a goal that was covered would be rewriting
/// the record of what happened, which is exactly what locking exists to
/// prevent.
class _Tick extends ConsumerStatefulWidget {
  const _Tick({
    required this.item,
    required this.engagementId,
    required this.enabled,
  });

  final AgendaItem item;
  final String engagementId;
  final bool enabled;

  @override
  ConsumerState<_Tick> createState() => _TickState();
}

class _TickState extends ConsumerState<_Tick> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final Widget icon = Icon(
      widget.item.addressed
          ? Icons.check_circle
          : Icons.radio_button_unchecked,
      size: 18,
      color: widget.item.addressed
          ? BaseColors.verified
          : BaseColors.inkFaint,
    );
    if (!widget.enabled) return icon;

    return Semantics(
      button: true,
      label: 'Mark this goal as covered',
      child: InkWell(
        onTap: _busy ? null : _tick,
        child: Padding(padding: const EdgeInsets.all(2), child: icon),
      ),
    );
  }

  Future<void> _tick() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).tickAgendaItem(widget.item.id);
      ref.invalidate(engagementProvider(widget.engagementId));
    } on ApiException {
      // The agenda refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class AgendaDraftForm extends ConsumerStatefulWidget {
  const AgendaDraftForm({required this.engagement, super.key});

  final Engagement engagement;

  @override
  ConsumerState<AgendaDraftForm> createState() => _AgendaDraftFormState();
}

class _AgendaDraftFormState extends ConsumerState<AgendaDraftForm> {
  final List<TextEditingController> _goals = <TextEditingController>[];
  final TextEditingController _outOfScope = TextEditingController();
  final TextEditingController _deliverable = TextEditingController();
  final TextEditingController _criteria = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    for (final AgendaItem i
        in widget.engagement.agenda?.items ?? const <AgendaItem>[]) {
      _goals.add(TextEditingController(text: i.original));
    }
    if (_goals.isEmpty) _goals.add(TextEditingController());
    _outOfScope.text = widget.engagement.agenda?.outOfScope ?? '';
    _deliverable.text = widget.engagement.agenda?.expectedDeliverable ?? '';
    _criteria.text = widget.engagement.agenda?.successCriteria ?? '';
  }

  @override
  void dispose() {
    for (final TextEditingController c in _goals) {
      c.dispose();
    }
    _outOfScope.dispose();
    _deliverable.dispose();
    _criteria.dispose();
    super.dispose();
  }

  List<String> get _texts => _goals
      .map((TextEditingController c) => c.text.trim())
      .where((String t) => t.isNotEmpty)
      .toList();

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    return PageBody(
      children: <Widget>[
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              PackText(
                'Say what you want out of this',
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: Space.sm),
              PackText(
                'Write it so another person could tick it off. This list is '
                'what protects your payment — if anything goes wrong, it is '
                'judged against exactly this and nothing else.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: BaseColors.inkMuted,
                ),
              ),
            ],
          ),
        ),

        Panel(
          title: 'Your goals',
          note:
              'Between one and five. Fewer, sharper ones settle a '
              'disagreement; a long vague list does not.',
          child: Column(
            children: <Widget>[
              for (int i = 0; i < _goals.length; i++)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.md),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Expanded(
                        child: TextField(
                          controller: _goals[i],
                          minLines: 1,
                          maxLines: 3,
                          decoration: InputDecoration(
                            labelText: 'Goal ${i + 1}',
                            hintText: i == 0
                                ? 'e.g. Tell me which part of my structure '
                                      'loses the most marks'
                                : null,
                          ),
                        ),
                      ),
                      if (_goals.length > 1)
                        IconButton(
                          icon: const Icon(Icons.close),
                          tooltip: 'Remove goal ${i + 1}',
                          onPressed: () =>
                              setState(() => _goals.removeAt(i).dispose()),
                        ),
                    ],
                  ),
                ),
              if (_goals.length < 5)
                Align(
                  alignment: Alignment.centerLeft,
                  child: TextButton.icon(
                    icon: const Icon(Icons.add),
                    label: const PackText('Add another'),
                    onPressed: () =>
                        setState(() => _goals.add(TextEditingController())),
                  ),
                ),
            ],
          ),
        ),

        Panel(
          title: 'What comes back to you',
          note:
              'The thing you will hold at the end, and how you will know it '
              'worked. Both are part of what a disagreement is judged against.',
          child: Column(
            children: <Widget>[
              TextField(
                controller: _deliverable,
                minLines: 1,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'What you will receive',
                  hintText: 'e.g. written notes on each page, and a short call',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _criteria,
                minLines: 1,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'I will know this worked if…',
                  hintText: 'e.g. every goal above has a specific answer',
                ),
              ),
            ],
          ),
        ),

        Panel(
          title: 'Anything not included?',
          note:
              'Optional, and it protects you both. Saying what is out of '
              'scope stops a disagreement about something neither of you '
              'meant to cover.',
          child: TextField(
            controller: _outOfScope,
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText: 'e.g. not a full rewrite, just the structure',
            ),
          ),
        ),

        if (_error != null) Note(_error!, tone: ChipTone.danger),

        FilledButton(
          onPressed: _busy ? null : () => _save(),
          child: const PackText('Save draft'),
        ),
        OutlinedButton(
          onPressed: _busy ? null : _confirmLock,
          child: const PackText('Agree and lock'),
        ),
        PackText(
          'Locking is final. Nothing is charged by locking.',
          style: theme.textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Future<Agenda?> _save() async {
    if (_texts.isEmpty) {
      setState(() => _error = 'Write at least one goal first.');
      return null;
    }
    if (_deliverable.text.trim().isEmpty || _criteria.text.trim().isEmpty) {
      setState(
        () => _error =
            'Say what comes back to you, and how you will know it worked.',
      );
      return null;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Agenda a = await ref
          .read(repositoryProvider)
          .saveAgenda(
            widget.engagement.id,
            items: _texts,
            language: widget.engagement.language,
            expectedDeliverable: _deliverable.text.trim(),
            successCriteria: _criteria.text.trim(),
            outOfScope: _outOfScope.text.trim().isEmpty
                ? null
                : _outOfScope.text.trim(),
          );
      ref.invalidate(engagementProvider(widget.engagement.id));
      return a;
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
      return null;
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The lock, behind an explicit confirmation that spends its words on
  /// the consequence rather than on "Are you sure?".
  ///
  /// There is no undo. Someone who locks a list they did not mean to has
  /// to raise a change order, so the dialog says that, and shows exactly
  /// what is about to become permanent.
  Future<void> _confirmLock() async {
    final Agenda? saved = await _save();
    if (saved == null || !mounted) return;

    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Lock these goals?'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const PackText(
                'After this they cannot be edited. If something needs to '
                'change, it takes a new version you both accept.',
              ),
              const SizedBox(height: Space.md),
              for (final String t in _texts)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.xs),
                  child: PackText('•  $t'),
                ),
            ],
          ),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Keep editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Lock them'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    try {
      await ref
          .read(repositoryProvider)
          .lockAgenda(
            saved.id,
            // A key the caller mints, not a generated one: locking twice
            // must be one lock even if the app is killed between the tap
            // and the reply.
            idempotencyKey: 'lock-${saved.id}-v${saved.version}',
          );
      ref.invalidate(engagementProvider(widget.engagement.id));
      ref.invalidate(engagementsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }
}
