import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/assessment.dart';
import '../../api/models/engagement.dart';
import '../../api/uploads.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import '../shared/attachments.dart';

/// The work, and what was made of it.
///
/// **The rule this screen exists to obey.** Assessment dimensions come
/// from the template bound to the category — never six, never any
/// particular set, and **never assumed to exist at all** (CLAUDE.md #3).
/// An objective category has no template, and the API says so by
/// answering with nothing. That is rendered as a normal state here, with
/// its own explanation, not as an error and not as an empty score table.
///
/// **The other rule.** Handwritten and image work must have a text
/// equivalent (Definition of Done). Every annotation carries one and it
/// is what a screen reader is given, because "a note at 34%, 71%" is not
/// information.
class AssessmentScreen extends ConsumerWidget {
  const AssessmentScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(engagementId),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('The work')),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) => FamilyScope(
          family: ref
                  .watch(catalogueProvider)
                  .valueOrNull
                  ?.family(e.familyCode)
                  ?.theme ??
              FamilyTheme.none,
          child: PageBody(
            onRefresh: () async {
              ref
                ..invalidate(engagementProvider(engagementId))
                ..invalidate(latestSubmissionProvider(engagementId))
                ..invalidate(latestEvaluationProvider(engagementId));
            },
            children: <Widget>[
              _SubmissionPanel(engagement: e),
              _EvaluationPanel(engagement: e),
            ],
          ),
        ),
      ),
    );
  }
}

class _SubmissionPanel extends ConsumerWidget {
  const _SubmissionPanel({required this.engagement});

  final Engagement engagement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Map<String, dynamic>?> raw = ref.watch(
      latestSubmissionProvider(engagement.id),
    );

    return raw.when(
      loading: () => const Panel(child: LinearProgressIndicator()),
      error: (Object e, _) => const Panel(
        child: Note('Could not load the work.', tone: ChipTone.danger),
      ),
      data: (Map<String, dynamic>? json) {
        if (json == null) {
          return Panel(
            title: 'Your work',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                const Note(
                  'Nothing sent yet. The goals are agreed and the money is '
                  'held — sending your work is what starts the clock.',
                ),
                const SizedBox(height: Space.lg),
                FilledButton(
                  onPressed: engagement.canStart
                      ? () => _openSubmit(context, engagement.id, ref)
                      : null,
                  child: const PackText('Send your work'),
                ),
              ],
            ),
          );
        }

        final Submission s = Submission.fromJson(json);
        return Panel(
          title: 'Your work',
          trailing: s.submittedAt == null
              ? null
              : StatusChip(
                  'Sent ${DateFormat('d MMM').format(s.submittedAt!)}',
                ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              if (s.note.isNotEmpty)
                Field(label: 'What you said', value: PackText(s.note)),
              if (s.hasFile) ...<Widget>[
                const SizedBox(height: Space.md),
                // Opening it mints a fresh signed link, watermarked with
                // whoever asked, expiring in five minutes (CLAUDE.md
                // #29). Nothing durable is held here.
                NavRow(
                  title: s.isImage ? 'A scan or photo' : 'A document',
                  subtitle: 'Opens with a fresh private link',
                  leading: const Icon(Icons.attach_file, size: 18),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => AttachmentView(
                        attachmentId: s.attachmentId!,
                        title: 'Your work',
                        isImage: s.isImage,
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  Future<void> _openSubmit(
    BuildContext context,
    String engagementId,
    WidgetRef ref,
  ) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => SubmitScreen(engagementId: engagementId),
    ),
  );
}

class _EvaluationPanel extends ConsumerWidget {
  const _EvaluationPanel({required this.engagement});

  final Engagement engagement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Map<String, dynamic>?> raw = ref.watch(
      latestEvaluationProvider(engagement.id),
    );
    final AsyncValue<AssessmentTemplate?> template = ref.watch(
      assessmentTemplateProvider(engagement.id),
    );

    return raw.when(
      loading: () => const Panel(child: LinearProgressIndicator()),
      error: (Object e, _) => const Panel(
        child: Note('Could not load the assessment.', tone: ChipTone.danger),
      ),
      data: (Map<String, dynamic>? json) {
        if (json == null) {
          return Panel(
            title: 'The assessment',
            child: Note(
              engagement.status == EngagementStatus.completed
                  ? 'This was completed without a written assessment.'
                  : 'Not written yet. It appears here when they return it.',
            ),
          );
        }

        final Evaluation ev = Evaluation.fromJson(json);

        // The case the rule is about: a category with NO template. The
        // API answers with nothing, and this is the normal state for an
        // objective category — so it gets an explanation of its own
        // rather than an empty score table or an error.
        final bool hasDimensions = ev.dimensions.isNotEmpty;
        final bool templateMissing =
            template.valueOrNull == null && !template.isLoading;

        return Stacked(
          children: <Widget>[
            Panel(
              title: 'The assessment',
              trailing: ev.isReturned
                  ? StatusChip(
                      'Returned ${DateFormat('d MMM').format(ev.returnedAt!)}',
                      tone: ChipTone.verified,
                    )
                  : const StatusChip('Being written', tone: ChipTone.caution),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  if (ev.overallNote.isNotEmpty)
                    PackText(ev.overallNote, style: Theme.of(context).textTheme.bodyMedium),
                  if (!hasDimensions) ...<Widget>[
                    if (ev.overallNote.isNotEmpty)
                      const SizedBox(height: Space.md),
                    Note(
                      templateMissing
                          ? 'This kind of work is not scored against a set of '
                                'dimensions — there is no scale for it. What '
                                'you get is the note above and the marks on '
                                'the work itself.'
                          : 'No scores were recorded.',
                      icon: Icons.info_outline,
                    ),
                  ],
                ],
              ),
            ),

            if (hasDimensions) _Scores(evaluation: ev, lang: lang),
            if (ev.annotations.isNotEmpty)
              _Annotations(evaluation: ev, lang: lang),
            if (ev.actionItems.isNotEmpty)
              _ActionItems(evaluation: ev, engagementId: engagement.id),
          ],
        );
      },
    );
  }
}

class _Scores extends StatelessWidget {
  const _Scores({required this.evaluation, required this.lang});

  final Evaluation evaluation;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final BrandTokens brand = BrandTokens.of(context);

    return Panel(
      title: 'Scored',
      // Named rather than assumed. The dimensions are whatever the
      // template bound to this category declares — this app knows none
      // of them by name.
      note: 'Against the ${evaluation.dimensions.length} dimensions this '
          'kind of work is assessed on.',
      child: Column(
        children: <Widget>[
          for (final (AssessmentDimension d, DimensionScore? s)
              in evaluation.scored)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.lg),
              child: Semantics(
                // One label for the whole row, so a screen reader reads
                // "Structure, 68 out of 100" rather than the bar.
                label: s == null
                    ? '${d.label(lang)}: not scored'
                    : '${d.label(lang)}: ${s.score} out of $_max',
                child: ExcludeSemantics(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: PackText(
                              d.label(lang),
                              style: theme.textTheme.bodyMedium,
                            ),
                          ),
                          if (s == null)
                            PackText(
                              'Not scored',
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: BaseColors.inkFaint,
                              ),
                            )
                          else
                            Text(
                              '${s.score}',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontFeatures: const <FontFeature>[
                                  FontFeature.tabularFigures(),
                                ],
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: Space.sm),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(Radii.pill),
                        child: LinearProgressIndicator(
                          value: (s?.score ?? 0) / _max,
                          minHeight: 6,
                          backgroundColor: BaseColors.surfaceSunk,
                          valueColor: AlwaysStoppedAnimation<Color>(
                            s == null ? BaseColors.line : brand.brand,
                          ),
                        ),
                      ),
                      if ((s?.comment ?? '').isNotEmpty) ...<Widget>[
                        const SizedBox(height: Space.sm),
                        PackText(
                          s!.comment,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: BaseColors.inkMuted,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// The scale the API scores on. Not a family's choice — the platform's.
  static const int _max = 100;
}

/// Marks made on the work itself.
///
/// Rendered as a LIST of text, not as pins on an image. That is
/// deliberate: the work is often a photograph of handwriting, and a
/// coordinate is not something a person using a screen reader — or
/// anyone on a 360px screen — can act on. The text equivalent is the
/// primary representation here, not a fallback.
class _Annotations extends StatelessWidget {
  const _Annotations({required this.evaluation, required this.lang});

  final Evaluation evaluation;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      title: 'Marks on your work',
      child: Column(
        children: <Widget>[
          for (final Annotation a in evaluation.annotations)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(
                    Icons.edit_outlined,
                    size: 16,
                    color: BaseColors.inkMuted,
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        PackText(
                          a.body,
                          style: theme.textTheme.bodyMedium,
                          // What a screen reader is given: the note plus
                          // where it is, in words.
                          semanticsLabel: a.textEquivalent,
                        ),
                        if (a.dimensionCode != null)
                          PackText(
                            evaluation.labelFor(a.dimensionCode!)?.call(lang) ??
                                a.dimensionCode!,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: BaseColors.inkFaint,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// What to do next, as things the seeker ticks off.
class _ActionItems extends ConsumerStatefulWidget {
  const _ActionItems({required this.evaluation, required this.engagementId});

  final Evaluation evaluation;
  final String engagementId;

  @override
  ConsumerState<_ActionItems> createState() => _ActionItemsState();
}

class _ActionItemsState extends ConsumerState<_ActionItems> {
  final Set<String> _pending = <String>{};

  @override
  Widget build(BuildContext context) => Panel(
    title: 'What to do next',
    note: 'Ticking these is for you. Nobody else sees it.',
    child: Column(
      children: <Widget>[
        for (final Annotation a in widget.evaluation.actionItems)
          CheckboxListTile(
            value: a.actionedAt != null,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: PackText(a.body),
            onChanged: a.actionedAt != null || _pending.contains(a.id)
                ? null
                : (bool? _) => _tick(a.id),
          ),
      ],
    ),
  );

  Future<void> _tick(String annotationId) async {
    setState(() => _pending.add(annotationId));
    try {
      await ref.read(repositoryProvider).markActionItem(annotationId);
      ref
        ..invalidate(latestEvaluationProvider(widget.engagementId))
        ..invalidate(progressProvider);
    } on ApiException {
      // Leave it unticked; the next refresh shows the truth.
    } finally {
      if (mounted) setState(() => _pending.remove(annotationId));
    }
  }
}

/// Sending work in.
class SubmitScreen extends ConsumerStatefulWidget {
  const SubmitScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  ConsumerState<SubmitScreen> createState() => _SubmitScreenState();
}

class _SubmitScreenState extends ConsumerState<SubmitScreen> {
  final TextEditingController _note = TextEditingController();
  final TextEditingController _textEquivalent = TextEditingController();
  PickedUpload? _attached;
  bool _busy = false;
  bool _uploading = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    _textEquivalent.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Send your work')),
    body: PageBody(
      children: <Widget>[
        Panel(
          title: 'Anything they should know?',
          note:
              'Where you struggled, or what you ran out of time on. This is '
              'often more useful than the work itself.',
          child: TextField(
            controller: _note,
            minLines: 3,
            maxLines: 8,
            decoration: const InputDecoration(
              hintText: 'e.g. ran out of time on the last part',
            ),
          ),
        ),
        Panel(
          title: 'Attach your work',
          note:
              'A scan, a photo or a PDF, up to 10 MB. It is private: only '
              'you and the person assessing it can open it, through a link '
              'that expires.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              if (_attached != null) ...<Widget>[
                Row(
                  children: <Widget>[
                    const Icon(
                      Icons.check_circle_outline,
                      size: 18,
                      color: BaseColors.verified,
                    ),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: PackText(
                        '${_attached!.filename} · ${_attached!.readableSize}',
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close),
                      tooltip: 'Remove the attachment',
                      onPressed: _busy
                          ? null
                          : () => setState(() => _attached = null),
                    ),
                  ],
                ),
                // Required, not optional, when the work is an image:
                // handwritten or image content must have a text
                // equivalent (Definition of Done). The provider reads
                // this; so does anyone using a screen reader.
                if (_attached!.isImage) ...<Widget>[
                  const SizedBox(height: Space.md),
                  TextField(
                    controller: _textEquivalent,
                    minLines: 2,
                    maxLines: 5,
                    decoration: const InputDecoration(
                      labelText: 'What does the image show?',
                      helperText:
                          'Needed for a scan or photo, so the work is '
                          'readable without seeing it.',
                    ),
                  ),
                ],
              ] else
                OutlinedButton.icon(
                  icon: _uploading
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.attach_file),
                  label: PackText(_uploading ? 'Uploading' : 'Choose a file'),
                  onPressed: _uploading || _busy ? null : _pick,
                ),
            ],
          ),
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy || !_canSubmit ? null : _submit,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const PackText('Send it'),
        ),
      ],
    ),
  );

  /// A note is always enough. An IMAGE, though, needs its text
  /// equivalent before it can be sent.
  bool get _canSubmit {
    if (_note.text.trim().isEmpty && _attached == null) return false;
    if ((_attached?.isImage ?? false) && _textEquivalent.text.trim().isEmpty) {
      return false;
    }
    return true;
  }

  Future<void> _pick() async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final PickedUpload? picked = await ref
          .read(uploadsProvider)
          .pickAndUpload();
      // Null means the picker was dismissed. That is not an error and
      // must not be shown as one.
      if (picked != null && mounted) setState(() => _attached = picked);
    } on UploadRefused catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final String equivalent = _textEquivalent.text.trim();
      final String note = <String>[
        _note.text.trim(),
        if (equivalent.isNotEmpty) 'What the image shows: $equivalent',
      ].where((String s) => s.isNotEmpty).join('\n\n');

      await ref
          .read(repositoryProvider)
          .submit(
            widget.engagementId,
            note: note,
            attachmentIds: <String>[
              if (_attached != null) _attached!.attachmentId,
            ],
          );
      ref
        ..invalidate(latestSubmissionProvider(widget.engagementId))
        ..invalidate(engagementProvider(widget.engagementId));
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
