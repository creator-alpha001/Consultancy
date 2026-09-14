import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/assessment.dart';
import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import '../shared/attachments.dart';

/// Assessing a piece of work.
///
/// **The rule that shapes this whole screen.** Assessment templates are
/// platform-defined per category, and a provider MUST NOT create or
/// modify one (CLAUDE.md #16) — comparability across providers is the
/// entire point of having them. So there is no "add a dimension" control
/// anywhere here, no free-text dimension name, and no way to skip one
/// that the template declares. The provider scores what the category
/// says is scored.
///
/// **And the case that must not crash.** An objective category has no
/// template at all (#3). Then there is nothing to score, and the screen
/// says so and offers the note and the marks instead — which are the
/// whole of the assessment for that kind of work.
class EvaluateScreen extends ConsumerStatefulWidget {
  const EvaluateScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  ConsumerState<EvaluateScreen> createState() => _EvaluateScreenState();
}

class _EvaluateScreenState extends ConsumerState<EvaluateScreen> {
  final Map<String, int> _scores = <String, int>{};
  final TextEditingController _note = TextEditingController();
  String? _evaluationId;
  bool _seeded = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(widget.engagementId),
    );
    final AsyncValue<AssessmentTemplate?> template = ref.watch(
      assessmentTemplateProvider(widget.engagementId),
    );
    final AsyncValue<Map<String, dynamic>?> existing = ref.watch(
      latestEvaluationProvider(widget.engagementId),
    );
    final AsyncValue<Map<String, dynamic>?> submission = ref.watch(
      latestSubmissionProvider(widget.engagementId),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Assess the work')),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(widget.engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) {
          _seed(existing.valueOrNull);
          final AssessmentTemplate? t = template.valueOrNull;
          final List<AssessmentDimension> dimensions =
              t?.dimensions ?? const <AssessmentDimension>[];

          return PageBody(
            children: <Widget>[
              _TheirWork(submission: submission),
              _TheirGoals(engagement: e, lang: lang),

              if (template.isLoading)
                const Panel(child: LinearProgressIndicator())
              else if (dimensions.isEmpty)
                const Panel(
                  title: 'Scoring',
                  child: Note(
                    'This kind of work has no scale to score against — there '
                    'is no set of dimensions defined for this category. Your '
                    'note and your marks on the work are the assessment.',
                    icon: Icons.info_outline,
                  ),
                )
              else
                _ScoreEditor(
                  dimensions: dimensions,
                  lang: lang,
                  scores: _scores,
                  onChanged: (String code, int v) =>
                      setState(() => _scores[code] = v),
                ),

              Panel(
                title: 'Overall',
                note:
                    'What they should take away. Say what a stronger piece '
                    'would have done — never what it would have scored.',
                child: TextField(
                  controller: _note,
                  minLines: 4,
                  maxLines: 10,
                  decoration: const InputDecoration(
                    hintText:
                        'The structure held up; the conclusion is where marks '
                        'are being lost.',
                  ),
                ),
              ),

              if (_evaluationId != null)
                _AnnotationEditor(
                  evaluationId: _evaluationId!,
                  engagementId: widget.engagementId,
                  dimensions: dimensions,
                  lang: lang,
                ),

              if (_error != null) Note(_error!, tone: ChipTone.danger),

              FilledButton(
                onPressed: _busy ? null : _save,
                child: const PackText('Save progress'),
              ),
              OutlinedButton(
                onPressed: _busy || !_ready(dimensions) ? null : _return,
                child: const PackText('Return it to them'),
              ),
              PackText(
                dimensions.isEmpty
                    ? 'Returning it sends your assessment and asks them to '
                          'confirm the goals were met.'
                    : 'Every dimension needs a score before you can return '
                          'it. Returning sends it and asks them to confirm.',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
                textAlign: TextAlign.center,
              ),
            ],
          );
        },
      ),
    );
  }

  /// A partly-written evaluation is resumed rather than restarted.
  void _seed(Map<String, dynamic>? json) {
    if (_seeded || json == null) return;
    _seeded = true;
    final Evaluation ev = Evaluation.fromJson(json);
    _evaluationId = ev.id;
    _note.text = ev.overallNote;
    for (final DimensionScore s in ev.scores) {
      _scores[s.dimensionCode] = s.score;
    }
  }

  /// Every declared dimension must be scored. A partial assessment
  /// against a shared scale is not comparable, which is the only reason
  /// the scale exists.
  bool _ready(List<AssessmentDimension> dimensions) =>
      dimensions.every((AssessmentDimension d) => _scores.containsKey(d.code));

  Future<String?> _ensureEvaluation() async {
    if (_evaluationId != null) return _evaluationId;
    final Map<String, dynamic> created = await ref
        .read(repositoryProvider)
        .startEvaluation(widget.engagementId);
    final String? id = created['id'] as String?;
    if (mounted) setState(() => _evaluationId = id);
    return id;
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final String? id = await _ensureEvaluation();
      if (id == null) return;
      await ref
          .read(repositoryProvider)
          .scoreEvaluation(id, scores: _scores, comment: _note.text.trim());
      ref.invalidate(latestEvaluationProvider(widget.engagementId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _return() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final String? id = await _ensureEvaluation();
      if (id == null) return;
      await ref
          .read(repositoryProvider)
          .scoreEvaluation(id, scores: _scores, comment: _note.text.trim());
      await ref.read(repositoryProvider).returnEvaluation(id);
      ref
        ..invalidate(latestEvaluationProvider(widget.engagementId))
        ..invalidate(engagementProvider(widget.engagementId))
        ..invalidate(engagementsProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _TheirWork extends StatelessWidget {
  const _TheirWork({required this.submission});

  final AsyncValue<Map<String, dynamic>?> submission;

  @override
  Widget build(BuildContext context) => submission.when(
    loading: () => const Panel(child: LinearProgressIndicator()),
    error: (Object e, _) => const SizedBox.shrink(),
    data: (Map<String, dynamic>? json) {
      if (json == null) {
        return const Panel(
          title: 'Their work',
          child: Note('Nothing sent yet.', tone: ChipTone.caution),
        );
      }
      final Submission s = Submission.fromJson(json);
      return Panel(
        title: 'Their work',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            if (s.note.isNotEmpty)
              // Usually the most useful thing on the screen: "ran out of
              // time on the last part" tells you more than the file.
              Field(label: 'What they said', value: PackText(s.note)),
            if (s.hasFile) ...<Widget>[
              const SizedBox(height: Space.md),
              // A fresh signed link per view, watermarked with the
              // viewer, five minutes to live (CLAUDE.md #29). A
              // provider marking someone's work is exactly the case
              // that watermark exists for.
              NavRow(
                title: s.isImage ? 'A scan or photo' : 'A document',
                subtitle: 'Opens with a fresh private link',
                leading: const Icon(Icons.attach_file, size: 18),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => AttachmentView(
                      attachmentId: s.attachmentId!,
                      title: 'Their work',
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

/// What they asked for, which is what the assessment answers.
class _TheirGoals extends StatelessWidget {
  const _TheirGoals({required this.engagement, required this.lang});

  final Engagement engagement;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final Agenda? a = engagement.agenda;
    if (a == null || a.items.isEmpty) return const SizedBox.shrink();
    return Panel(
      title: 'What they asked for',
      note: 'Locked. This is what a disagreement would be judged against.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          for (final AgendaItem i in a.items)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: PackText('•  ${i.textIn(lang)}'),
            ),
        ],
      ),
    );
  }
}

/// Scoring, against the dimensions the category declares.
///
/// Note what this widget does not have: any way to add, rename, remove or
/// reweight a dimension. It renders exactly what it was given.
class _ScoreEditor extends StatelessWidget {
  const _ScoreEditor({
    required this.dimensions,
    required this.lang,
    required this.scores,
    required this.onChanged,
  });

  final List<AssessmentDimension> dimensions;
  final String lang;
  final Map<String, int> scores;
  final void Function(String code, int value) onChanged;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final BrandTokens brand = BrandTokens.of(context);

    return Panel(
      title: 'Scoring',
      note:
          'These dimensions come from the category, not from you — that is '
          'what makes one assessment comparable with another.',
      child: Column(
        children: <Widget>[
          for (final AssessmentDimension d in dimensions)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.lg),
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
                      Text(
                        scores[d.code]?.toString() ?? '—',
                        style: theme.textTheme.titleMedium?.copyWith(
                          color: scores.containsKey(d.code)
                              ? BaseColors.ink
                              : BaseColors.inkFaint,
                          fontFeatures: const <FontFeature>[
                            FontFeature.tabularFigures(),
                          ],
                        ),
                      ),
                    ],
                  ),
                  Slider(
                    value: (scores[d.code] ?? 0).toDouble(),
                    max: 100,
                    divisions: 100,
                    activeColor: brand.brand,
                    label: '${scores[d.code] ?? 0}',
                    // The accessible name carries the dimension, so a
                    // screen reader user is not adjusting an unnamed
                    // slider among six.
                    semanticFormatterCallback: (double v) =>
                        '${d.label(lang)}: ${v.round()} out of 100',
                    onChanged: (double v) => onChanged(d.code, v.round()),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Marks on the work.
///
/// The body text is REQUIRED and is the whole point. The work is often a
/// photograph of handwriting, so a mark that exists only as a coordinate
/// is unreadable to a screen reader and useless on a small screen — the
/// Definition of Done calls that a text equivalent, and here it is simply
/// the annotation itself.
class _AnnotationEditor extends ConsumerStatefulWidget {
  const _AnnotationEditor({
    required this.evaluationId,
    required this.engagementId,
    required this.dimensions,
    required this.lang,
  });

  final String evaluationId;
  final String engagementId;
  final List<AssessmentDimension> dimensions;
  final String lang;

  @override
  ConsumerState<_AnnotationEditor> createState() => _AnnotationEditorState();
}

class _AnnotationEditorState extends ConsumerState<_AnnotationEditor> {
  final TextEditingController _body = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<Map<String, dynamic>?> existing = ref.watch(
      latestEvaluationProvider(widget.engagementId),
    );
    final List<Annotation> annotations = existing.valueOrNull == null
        ? const <Annotation>[]
        : Evaluation.fromJson(existing.valueOrNull!).annotations;

    return Panel(
      title: 'Marks on the work',
      note:
          'Specific notes. Each one goes on their list of things to act on — '
          'they tick them off as they do.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final Annotation a in annotations)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Icon(
                    a.isActionItem ? Icons.flag_outlined : Icons.edit_outlined,
                    size: 16,
                    color: BaseColors.inkMuted,
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(child: PackText(a.body)),
                  // Removable only while the evaluation is still being
                  // written. Once it is returned the seeker has read it,
                  // and quietly deleting a mark they were shown would be
                  // editing the record of what was said.
                  IconButton(
                    icon: const Icon(Icons.close, size: 16),
                    tooltip: 'Remove this mark',
                    visualDensity: VisualDensity.compact,
                    onPressed: _busy ? null : () => _remove(a.id),
                  ),
                ],
              ),
            ),
          if (annotations.isNotEmpty) const Divider(height: Space.xl),
          TextField(
            controller: _body,
            onChanged: (_) => setState(() {}),
            minLines: 2,
            maxLines: 4,
            decoration: const InputDecoration(
              hintText:
                  'e.g. the second paragraph answers a different '
                  'question than the one asked',
            ),
          ),
          const SizedBox(height: Space.md),
          OutlinedButton(
            onPressed: _busy || _body.text.trim().isEmpty ? null : _add,
            child: const PackText('Add this mark'),
          ),
        ],
      ),
    );
  }

  Future<void> _remove(String annotationId) async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).removeAnnotation(annotationId);
      ref.invalidate(latestEvaluationProvider(widget.engagementId));
    } on ApiException {
      // As with adding: the list refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _add() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(repositoryProvider)
          .annotate(
            widget.evaluationId,
            body: _body.text.trim(),
            // The language the evaluator is writing in. The original is
            // what counts in a dispute (#20).
            lang: widget.lang,
          );
      _body.clear();
      ref.invalidate(latestEvaluationProvider(widget.engagementId));
    } on ApiException {
      // The list refreshes from the server either way.
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
        });
      }
    }
  }
}
