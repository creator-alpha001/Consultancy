import '../../pack/label.dart';
import '../json.dart';
import 'engagement.dart';

/// What a seeker sent in.
class Submission {
  const Submission({
    required this.id,
    required this.note,
    this.attachmentId,
    this.attachmentContentType,
    this.submittedAt,
  });

  factory Submission.fromJson(Map<String, dynamic> json) => Submission(
    id: json.reqStr('id'),
    note: json.str('note'),
    attachmentId: json.strOrNull('attachmentId'),
    attachmentContentType: json.strOrNull('attachmentContentType'),
    submittedAt: json.date('submittedAt'),
  );

  final String id;

  /// What the seeker said when they sent it. Often the most useful thing
  /// on the screen — "ran out of time on the last part" tells a provider
  /// more than the file does.
  final String note;

  /// Reached through a signed, watermarked URL with a five-minute expiry
  /// (CLAUDE.md #29). Never a public link, and never held by the client.
  final String? attachmentId;
  final String? attachmentContentType;
  final DateTime? submittedAt;

  bool get hasFile => attachmentId != null;

  /// Whether the work is an image or a scan, which decides whether a text
  /// equivalent is REQUIRED rather than nice to have.
  bool get isImage => (attachmentContentType ?? '').startsWith('image/');
}

/// One dimension's score.
class DimensionScore {
  const DimensionScore({
    required this.dimensionCode,
    required this.score,
    this.comment = '',
  });

  factory DimensionScore.fromJson(Map<String, dynamic> json) => DimensionScore(
    dimensionCode: json.str('dimensionCode'),
    score: json.intOr('score', 0),
    comment: json.str('comment'),
  );

  final String dimensionCode;
  final int score;
  final String comment;
}

/// A mark on the work itself.
///
/// [textEquivalent] is not optional in spirit: the Definition of Done
/// requires handwritten or image content to have a text equivalent, and
/// an annotation pinned to a region of a scan is exactly that content. A
/// screen reader user who gets only "annotation at 34%, 71%" has been
/// given nothing.
class Annotation {
  const Annotation({
    required this.id,
    required this.body,
    this.dimensionCode,
    this.page,
    this.x,
    this.y,
    this.isActionItem = false,
    this.actionedAt,
  });

  factory Annotation.fromJson(Map<String, dynamic> json) => Annotation(
    id: json.reqStr('id'),
    body: json.str('body', json.str('text')),
    dimensionCode: json.strOrNull('dimensionCode'),
    page: json.intOrNull('page'),
    x: json.doubleOrNull('x'),
    y: json.doubleOrNull('y'),
    isActionItem: json.boolOr('isActionItem'),
    actionedAt: json.date('actionedAt'),
  );

  final String id;
  final String body;
  final String? dimensionCode;
  final int? page;
  final double? x;
  final double? y;

  /// Something the seeker is meant to do next. These become the progress
  /// screen's action items.
  final bool isActionItem;
  final DateTime? actionedAt;

  bool get hasPosition => x != null && y != null;

  /// What a screen reader says instead of a coordinate.
  String get textEquivalent {
    if (!hasPosition) return body;
    final String where = page != null ? 'page $page' : 'the work';
    return 'Note on $where: $body';
  }
}

/// The provider's assessment of a submission.
class Evaluation {
  const Evaluation({
    required this.id,
    required this.submissionId,
    required this.dimensions,
    required this.scores,
    required this.annotations,
    this.overallNote = '',
    this.returnedAt,
    this.templateId,
  });

  factory Evaluation.fromJson(Map<String, dynamic> json) => Evaluation(
    id: json.reqStr('id'),
    submissionId: json.str('submissionId'),
    // The dimensions travel WITH the evaluation, not looked up
    // separately: a template republished after this was written must not
    // change what these scores are labelled.
    dimensions: <AssessmentDimension>[
      for (final Map<String, dynamic> d in json.objects('dimensions'))
        AssessmentDimension.fromJson(d),
    ],
    scores: <DimensionScore>[
      for (final Map<String, dynamic> s in json.objects('scores'))
        DimensionScore.fromJson(s),
    ],
    annotations: <Annotation>[
      for (final Map<String, dynamic> a in json.objects('annotations'))
        Annotation.fromJson(a),
    ],
    overallNote: json.str('overallNote'),
    returnedAt: json.date('returnedAt'),
    templateId: json.strOrNull('templateId'),
  );

  final String id;
  final String submissionId;
  final List<AssessmentDimension> dimensions;
  final List<DimensionScore> scores;
  final List<Annotation> annotations;
  final String overallNote;

  /// Null while the provider is still working on it. A seeker sees an
  /// evaluation only once it has been returned.
  final DateTime? returnedAt;
  final String? templateId;

  bool get isReturned => returnedAt != null;

  /// Scores paired with their labels, in template order.
  ///
  /// Driven by [dimensions] rather than by [scores], so a dimension the
  /// provider left unscored still appears — silently dropping it would
  /// make an incomplete assessment look complete.
  List<(AssessmentDimension, DimensionScore?)> get scored => <(
    AssessmentDimension,
    DimensionScore?,
  )>[
    for (final AssessmentDimension d in dimensions)
      (
        d,
        scores
            .where((DimensionScore s) => s.dimensionCode == d.code)
            .firstOrNull,
      ),
  ];

  List<Annotation> get actionItems =>
      annotations.where((Annotation a) => a.isActionItem).toList();

  /// The label for a dimension code, from this evaluation's own copy.
  Label? labelFor(String code) => dimensions
      .where((AssessmentDimension d) => d.code == code)
      .map((AssessmentDimension d) => d.label)
      .firstOrNull;
}
