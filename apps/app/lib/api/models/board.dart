import '../../money/paise.dart';
import '../json.dart';
import 'engagement.dart';
import 'provider.dart';

/// A paid request a seeker posts for providers to propose against.
class BoardPost {
  const BoardPost({
    required this.id,
    required this.reference,
    required this.domainCode,
    required this.familyCode,
    required this.language,
    required this.description,
    required this.status,
    required this.budgetMin,
    required this.budgetMax,
    this.type,
    this.categoryId,
    this.seeker,
    this.postedAt,
    this.proposalCount = 0,
  });

  factory BoardPost.fromJson(Map<String, dynamic> json) => BoardPost(
    id: json.reqStr('id'),
    reference: json.str('reference'),
    domainCode: json.str('domainCode'),
    familyCode: json.str('familyCode'),
    language: json.str('language', 'en'),
    description: json.str('description'),
    status: json.str('status', 'open'),
    budgetMin: Paise.tryParse(json['budgetMinPaise']) ?? Paise.zero,
    budgetMax: Paise.tryParse(json['budgetMaxPaise']) ?? Paise.zero,
    type: EngagementType.tryParse(json.strOrNull('engagementType')),
    categoryId: json.strOrNull('categoryId'),
    seeker: json.obj('seeker') != null ? Party.fromJson(json.obj('seeker')!) : null,
    postedAt: json.date('postedAt'),
    proposalCount: json.intOr('proposalCount', 0),
  );

  final String id;
  final String reference;
  final String domainCode;
  final String familyCode;

  /// A matching dimension, not a preference. A provider who cannot work
  /// in this language cannot propose (CLAUDE.md #19).
  final String language;
  final String description;
  final String status;

  /// A range the seeker is willing to pay, which is NOT the same as an
  /// invitation to undercut. Proposals are never sorted by price
  /// (CLAUDE.md #15).
  final Paise budgetMin;
  final Paise budgetMax;

  final EngagementType? type;
  final String? categoryId;
  final Party? seeker;
  final DateTime? postedAt;
  final int proposalCount;

  bool get isOpen => status == 'open';
}

/// A provider's offer against a post.
class Proposal {
  const Proposal({
    required this.id,
    required this.postId,
    required this.providerId,
    required this.amount,
    required this.status,
    this.message,
    this.providerName,
    this.tier,
    this.createdAt,
    this.turnaroundHours,
    this.durationMinutes,
  });

  factory Proposal.fromJson(Map<String, dynamic> json) => Proposal(
    id: json.reqStr('id'),
    postId: json.str('postId', json.str('boardPostId')),
    providerId: json.str('providerId'),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    status: json.str('status', 'open'),
    message: json.strOrNull('message'),
    providerName:
        json.obj('provider') != null
        ? Party.fromJson(json.obj('provider')!).displayName
        : json.strOrNull('providerName'),
    tier: Tier.tryParse(json.strOrNull('tier')),
    createdAt: json.date('createdAt'),
    turnaroundHours: json.intOrNull('turnaroundHours'),
    durationMinutes: json.intOrNull('durationMinutes'),
  );

  final String id;
  final String postId;
  final String providerId;
  final Paise amount;
  final String status;
  final String? message;
  final String? providerName;
  final Tier? tier;
  final DateTime? createdAt;
  final int? turnaroundHours;
  final int? durationMinutes;

  bool get isOpen => status == 'open' || status == 'submitted';
}

/// How a list of proposals may be ordered.
///
/// **There is no `price` member, and there must never be one.** This is
/// CLAUDE.md #15 and it is the decision about whether the marketplace
/// rewards quality or starts a price war. Making it an enum with no price
/// option means adding one is a visible, deliberate edit to this file
/// rather than a string someone passes through.
enum ProposalOrder {
  /// Newest first. The neutral default.
  newest,

  /// By the provider's completed work in the required skills.
  experience;

  String get label => switch (this) {
    ProposalOrder.newest => 'Most recent',
    ProposalOrder.experience => 'Most experience',
  };
}

/// A free question on the public board.
///
/// Screening puts a question into one of three states, and the third is
/// the reason this type exists rather than a bool: content flagged for
/// distress is held from public view, routed to the escalation queue, and
/// answered with the pack's real helpline numbers — **never** with "your
/// post was rejected" (CLAUDE.md #25).
enum QuestionState {
  published,
  heldForReview,
  distress,
  unknown;

  static QuestionState parse(String? raw) => switch (raw) {
    'published' => QuestionState.published,
    'held' || 'held_for_review' || 'under_review' => QuestionState.heldForReview,
    'distress' || 'escalated' || 'welfare' => QuestionState.distress,
    _ => QuestionState.unknown,
  };
}

class BoardQuestion {
  const BoardQuestion({
    required this.id,
    required this.body,
    required this.state,
    required this.domainCode,
    this.language = 'en',
    this.askedAt,
    this.answers = const <QuestionAnswer>[],
  });

  factory BoardQuestion.fromJson(Map<String, dynamic> json) => BoardQuestion(
    id: json.reqStr('id'),
    body: json.str('body', json.str('text')),
    state: QuestionState.parse(json.strOrNull('status')),
    domainCode: json.str('domainCode'),
    language: json.str('language', 'en'),
    askedAt: json.date('askedAt') ?? json.date('createdAt'),
    answers: <QuestionAnswer>[
      for (final Map<String, dynamic> a in json.objects('answers'))
        QuestionAnswer.fromJson(a),
    ],
  );

  final String id;
  final String body;
  final QuestionState state;
  final String domainCode;
  final String language;
  final DateTime? askedAt;
  final List<QuestionAnswer> answers;
}

class QuestionAnswer {
  const QuestionAnswer({
    required this.id,
    required this.body,
    this.providerName,
    this.answeredAt,
  });

  factory QuestionAnswer.fromJson(Map<String, dynamic> json) => QuestionAnswer(
    id: json.str('id'),
    body: json.str('body', json.str('text')),
    providerName: json.obj('provider') != null
        ? Party.fromJson(json.obj('provider')!).displayName
        : json.strOrNull('providerName'),
    answeredAt: json.date('answeredAt') ?? json.date('createdAt'),
  );

  final String id;
  final String body;
  final String? providerName;
  final DateTime? answeredAt;
}

/// A helpline the pack supplies.
///
/// Platform helplines are always present and a family may ADD to them —
/// it may never remove one, because distress does not respect a taxonomy
/// (CLAUDE.md #24–25).
class SupportResource {
  const SupportResource({required this.name, required this.value, this.hours});

  factory SupportResource.fromJson(Map<String, dynamic> json) =>
      SupportResource(
        name: json.str('label', json.str('name')),
        value: json.str('value', json.str('number')),
        hours: json.strOrNull('hours'),
      );

  final String name;
  final String value;
  final String? hours;
}
