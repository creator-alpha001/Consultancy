import '../../pack/label.dart';
import '../json.dart';

/// One thing a family asks a seeker to rate.
///
/// Family data, and deliberately NOT an assessment template: a template
/// grades the *work* against a category rubric (CLAUDE.md #16), while
/// these describe what the person was like to work with. Core names none
/// of them, and a family that declares none gets a single overall rating.
class ReviewDimension {
  const ReviewDimension({required this.code, required this.label});

  factory ReviewDimension.fromJson(Map<String, dynamic> json) =>
      ReviewDimension(
        code: json.str('code'),
        label: json.label('labels', json.str('code')),
      );

  final String code;
  final Label label;
}

/// Which way a review points.
///
/// Both directions exist: a provider reviews a seeker too. The subject is
/// derived from the engagement by the API — a client says which
/// direction, never who the review is about.
enum ReviewDirection {
  seekerOnProvider('seeker_on_provider'),
  providerOnSeeker('provider_on_seeker');

  const ReviewDirection(this.wire);
  final String wire;

  static ReviewDirection? tryParse(String? raw) {
    for (final ReviewDirection d in values) {
      if (d.wire == raw) return d;
    }
    return null;
  }
}

class Review {
  const Review({
    required this.id,
    required this.rating,
    required this.body,
    required this.bodyLang,
    this.direction,
    this.reviewerId,
    this.subjectId,
    this.createdAt,
    this.dimensionScores = const <String, int>{},
    this.reply,
  });

  factory Review.fromJson(Map<String, dynamic> json) => Review(
    id: json.reqStr('id'),
    rating: json.intOr('rating', 0),
    // `bodyOriginal`, not `body`: the original wording is what is kept,
    // and a translation never replaces it (CLAUDE.md #20).
    body: json.str('bodyOriginal', json.str('body')),
    bodyLang: json.str('bodyLang', 'en'),
    direction: ReviewDirection.tryParse(json.strOrNull('direction')),
    reviewerId: json.strOrNull('reviewerId'),
    subjectId: json.strOrNull('subjectId'),
    createdAt: json.date('createdAt'),
    dimensionScores: <String, int>{
      for (final Map<String, dynamic> d in json.objects('dimensionScores'))
        d.str('dimensionCode'): d.intOr('score', 0),
    },
    reply: json.obj('reply') != null
        ? ReviewReply.fromJson(json.obj('reply')!)
        : null,
  );

  final String id;
  final int rating;
  final String body;
  final String bodyLang;
  final ReviewDirection? direction;
  final String? reviewerId;
  final String? subjectId;
  final DateTime? createdAt;
  final Map<String, int> dimensionScores;

  /// The right of reply: one, by the subject only, append-only. A review
  /// the reviewed party cannot answer is a weapon; one they could
  /// rewrite would be worth nothing.
  final ReviewReply? reply;

  bool get hasReply => reply != null;
}

class ReviewReply {
  const ReviewReply({required this.body, this.bodyLang = 'en', this.createdAt});

  factory ReviewReply.fromJson(Map<String, dynamic> json) => ReviewReply(
    body: json.str('bodyOriginal', json.str('body')),
    bodyLang: json.str('bodyLang', 'en'),
    createdAt: json.date('createdAt'),
  );

  final String body;
  final String bodyLang;
  final DateTime? createdAt;
}

/// A rung on the family's dispute ladder.
///
/// The ladder is family data — how many rungs, what each is called, how
/// long it has to respond, and which one is final. A family with a
/// differently-shaped ladder needs no code change, which is the thing M7
/// was built to prove.
class DisputeTier {
  const DisputeTier({
    required this.tier,
    required this.code,
    required this.responseHours,
    this.isFinal = false,
  });

  factory DisputeTier.fromJson(Map<String, dynamic> json) => DisputeTier(
    tier: json.intOr('tier', 1),
    code: json.str('code'),
    responseHours: json.intOr('responseHours', 0),
    isFinal: json.boolOr('final'),
  );

  final int tier;

  /// Family vocabulary — `direct_resolution`, `platform_review`. Never
  /// switched on in this app; it is shown, humanised, and nothing more.
  final String code;
  final int responseHours;
  final bool isFinal;

  /// The family's own word, made readable. Not a translation — a family
  /// that wants its rungs named properly publishes labels for them, and
  /// this is the fallback until it does.
  String get humanised =>
      code.replaceAll('_', ' ').replaceFirstMapped(
        RegExp('^[a-z]'),
        (Match m) => m[0]!.toUpperCase(),
      );
}

enum DisputeState {
  open,
  underReview,
  ruled,
  appealed,
  settled,
  withdrawn,
  unknown;

  static DisputeState parse(String? raw) => switch (raw) {
    'open' || 'raised' => DisputeState.open,
    'under_review' || 'in_review' => DisputeState.underReview,
    'ruled' => DisputeState.ruled,
    'appealed' => DisputeState.appealed,
    'settled' || 'resolved' || 'closed' => DisputeState.settled,
    'withdrawn' => DisputeState.withdrawn,
    _ => DisputeState.unknown,
  };

  String get label => switch (this) {
    DisputeState.open => 'Open',
    DisputeState.underReview => 'Being reviewed',
    DisputeState.ruled => 'Ruled',
    DisputeState.appealed => 'Appealed',
    DisputeState.settled => 'Settled',
    DisputeState.withdrawn => 'Withdrawn',
    DisputeState.unknown => '—',
  };
}

class Dispute {
  const Dispute({
    required this.id,
    required this.engagementId,
    required this.state,
    required this.tier,
    required this.body,
    this.reasonCode = '',
    this.bodyLang = 'en',
    this.raisedBy,
    this.createdAt,
  });

  factory Dispute.fromJson(Map<String, dynamic> json) => Dispute(
    id: json.reqStr('id'),
    engagementId: json.str('engagementId'),
    state: DisputeState.parse(json.strOrNull('status') ?? json.strOrNull('state')),
    tier: json.intOr('tier', 1),
    body: json.str('bodyOriginal', json.str('body')),
    reasonCode: json.str('reasonCode'),
    bodyLang: json.str('bodyLang', 'en'),
    raisedBy: json.strOrNull('raisedBy'),
    createdAt: json.date('createdAt'),
  );

  final String id;
  final String engagementId;
  final DisputeState state;

  /// Which rung of the family's ladder it has reached.
  final int tier;
  final String body;
  final String reasonCode;
  final String bodyLang;
  final String? raisedBy;
  final DateTime? createdAt;

  bool get isOpen =>
      state == DisputeState.open ||
      state == DisputeState.underReview ||
      state == DisputeState.appealed;

  bool get canAppeal => state == DisputeState.ruled;
  bool get canWithdraw => state == DisputeState.open;
}

/// A decision on a dispute.
///
/// Made by a person, always. AI never rules on a dispute (CLAUDE.md #18)
/// and a database trigger enforces it, so there is no "suggested ruling"
/// to render here and no field for one.
class Ruling {
  const Ruling({
    required this.id,
    required this.tier,
    required this.outcome,
    this.reasoning = '',
    this.decidedAt,
  });

  factory Ruling.fromJson(Map<String, dynamic> json) => Ruling(
    id: json.reqStr('id'),
    tier: json.intOr('tier', 1),
    outcome: json.str('outcome'),
    reasoning: json.str('reasoning', json.str('bodyOriginal')),
    decidedAt: json.date('decidedAt') ?? json.date('createdAt'),
  );

  final String id;
  final int tier;

  /// `released`, `refunded`, `split` — what happened to the held money.
  final String outcome;
  final String reasoning;
  final DateTime? decidedAt;

  String get outcomeLabel => switch (outcome) {
    'released' => 'Paid to them in full',
    'refunded' => 'Refunded to you in full',
    'split' => 'Split between you',
    _ => outcome,
  };
}
