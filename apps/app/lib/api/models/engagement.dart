import '../../money/paise.dart';
import '../../pack/label.dart';
import '../json.dart';

/// The five engagement types the platform supports.
///
/// Core names them; a family supplies the word it calls each one. Note
/// that `document_review` is NOT privileged here — CLAUDE.md is explicit
/// that assuming it is the flagship is a bug, and which type a family
/// leads with is manifest data.
enum EngagementType {
  documentReview('document_review'),
  liveSession('live_session'),
  reviewWithLive('review_with_live'),
  writtenQa('written_qa'),
  asyncTask('async_task');

  const EngagementType(this.wire);
  final String wire;

  static EngagementType? tryParse(String? raw) {
    for (final EngagementType t in values) {
      if (t.wire == raw) return t;
    }
    return null;
  }

  /// The platform's neutral fallback wording. A family's own word comes
  /// from the pack and wins wherever one is published.
  String get neutralLabel => switch (this) {
    EngagementType.documentReview => 'Work review',
    EngagementType.liveSession => 'Live session',
    EngagementType.reviewWithLive => 'Review with a live session',
    EngagementType.writtenQa => 'Written questions',
    EngagementType.asyncTask => 'Task',
  };
}

/// Where an engagement is in its lifecycle.
///
/// Parsed permissively: a status this build has not heard of becomes
/// [unknown] and renders as its raw string rather than crashing a list.
/// The API's transition table is the authority on what may follow what,
/// and the client never decides a transition is legal — it offers an
/// action and lets the server refuse.
enum EngagementStatus {
  draft,
  agreed,
  awaitingPayment,
  inProgress,
  delivered,
  inReview,
  revision,
  completed,
  disputed,
  cancelled,
  refunded,
  unknown;

  static EngagementStatus parse(String? raw) => switch (raw) {
    'draft' => EngagementStatus.draft,
    'agreed' => EngagementStatus.agreed,
    'awaiting_payment' => EngagementStatus.awaitingPayment,
    'in_progress' => EngagementStatus.inProgress,
    'delivered' => EngagementStatus.delivered,
    'in_review' || 'review' => EngagementStatus.inReview,
    'revision' => EngagementStatus.revision,
    'completed' => EngagementStatus.completed,
    'disputed' => EngagementStatus.disputed,
    'cancelled' => EngagementStatus.cancelled,
    'refunded' => EngagementStatus.refunded,
    _ => EngagementStatus.unknown,
  };

  bool get isFinished =>
      this == completed || this == cancelled || this == refunded;
}

/// One goal on an agenda.
///
/// [text] keeps the ORIGINAL wording and its language alongside any
/// translations, and the original is what a dispute is judged against
/// (CLAUDE.md #20). Translations are a convenience and are never allowed
/// to replace it, which is why this holds both rather than a single
/// resolved string.
class AgendaItem {
  const AgendaItem({
    required this.id,
    required this.ordinal,
    required this.original,
    required this.originalLanguage,
    required this.translations,
    required this.addressed,
    this.addressedAt,
  });

  factory AgendaItem.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> text =
        json.obj('text') ?? const <String, dynamic>{};
    final Map<String, dynamic> translations =
        (text['translations'] as Map<String, dynamic>?) ??
        const <String, dynamic>{};
    return AgendaItem(
      id: json.reqStr('id'),
      ordinal: json.intOr('ordinal', 0),
      original: text['original'] as String? ?? '',
      originalLanguage: text['originalLanguage'] as String? ?? 'en',
      translations: <String, String>{
        for (final MapEntry<String, dynamic> e in translations.entries)
          if (e.value is String) e.key: e.value as String,
      },
      addressed: json.boolOr('addressed'),
      addressedAt: json.date('addressedAt'),
    );
  }

  final String id;
  final int ordinal;
  final String original;
  final String originalLanguage;
  final Map<String, String> translations;

  /// Ticked during a live session. The one mutation a locked agenda
  /// permits — `agenda_items` allows `checked_at` to change and nothing
  /// else.
  final bool addressed;
  final DateTime? addressedAt;

  /// The wording to show in [lang].
  ///
  /// Falls back to the original, always. A missing translation shows the
  /// authoritative text rather than an empty line.
  String textIn(String lang) =>
      lang == originalLanguage ? original : (translations[lang] ?? original);

  /// True when what is on screen is a translation rather than the text a
  /// dispute would actually be judged against — so a screen can say so.
  bool isTranslated(String lang) =>
      lang != originalLanguage && translations.containsKey(lang);
}

class Agenda {
  const Agenda({
    required this.id,
    required this.version,
    required this.state,
    required this.language,
    required this.items,
    this.outOfScope,
    this.expectedDeliverable,
    this.successCriteria,
    this.lockedAt,
    this.contentHash,
  });

  factory Agenda.fromJson(Map<String, dynamic> json) => Agenda(
    id: json.reqStr('id'),
    version: json.intOr('version', 1),
    state: json.str('state', 'draft'),
    language: json.str('language', 'en'),
    items: <AgendaItem>[
      for (final Map<String, dynamic> i in json.objects('items'))
        AgendaItem.fromJson(i),
    ]..sort((AgendaItem a, AgendaItem b) => a.ordinal.compareTo(b.ordinal)),
    outOfScope: json.strOrNull('outOfScope'),
    expectedDeliverable: json.strOrNull('expectedDeliverable'),
    successCriteria: json.strOrNull('successCriteria'),
    lockedAt: json.date('lockedAt'),
    contentHash: json.strOrNull('contentHash'),
  );

  final String id;
  final int version;
  final String state;
  final String language;
  final List<AgendaItem> items;
  final String? outOfScope;
  final String? expectedDeliverable;
  final String? successCriteria;
  final DateTime? lockedAt;

  /// The hash of the locked content. What makes "this is what we agreed"
  /// checkable rather than assertable.
  final String? contentHash;

  /// Once locked, immutable (CLAUDE.md #11). A change is a change order
  /// producing a NEW version, never an overwrite — so a locked agenda
  /// must offer no edit affordance anywhere.
  bool get isLocked => state == 'locked' || lockedAt != null;

  int get addressedCount => items.where((AgendaItem i) => i.addressed).length;
}

/// The money held for an engagement.
///
/// Every figure derives from the ledger; nothing here is a stored
/// balance (CLAUDE.md #7). The client only displays it.
class Escrow {
  const Escrow({
    required this.stage,
    required this.status,
    required this.held,
    this.platformFee,
    this.providerNet,
    this.currency = 'INR',
    this.releasedOn,
  });

  factory Escrow.fromJson(Map<String, dynamic> json) => Escrow(
    stage: json.str('stage'),
    status: json.str('status'),
    held: Paise.tryParse(json['heldPaise']) ?? Paise.zero,
    platformFee: Paise.tryParse(json['platformFeePaise']),
    providerNet: Paise.tryParse(json['providerNetPaise']),
    currency: json.str('currency', 'INR'),
    releasedOn: json.date('releasedOn'),
  );

  final String stage;
  final String status;
  final Paise held;
  final Paise? platformFee;
  final Paise? providerNet;
  final String currency;
  final DateTime? releasedOn;

  bool get isHeld => status == 'held';
  bool get isReleased => status == 'released';
  bool get isRefunded => status == 'refunded';
}

class Party {
  const Party({required this.id, required this.displayName});

  factory Party.fromJson(Map<String, dynamic> json) =>
      Party(id: json.str('id'), displayName: json.str('displayName'));

  final String id;
  final String displayName;
}

class Engagement {
  const Engagement({
    required this.id,
    required this.reference,
    required this.domainCode,
    required this.familyCode,
    required this.status,
    required this.amount,
    required this.language,
    this.type,
    this.categoryId,
    this.currency = 'INR',
    this.createdAt,
    this.seeker,
    this.provider,
    this.agenda,
    this.escrow,
  });

  factory Engagement.fromJson(Map<String, dynamic> json) => Engagement(
    id: json.reqStr('id'),
    reference: json.str('reference'),
    domainCode: json.str('domainCode'),
    familyCode: json.str('familyCode'),
    status: EngagementStatus.parse(json.strOrNull('status')),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    language: json.str('language', 'en'),
    type: EngagementType.tryParse(json.strOrNull('engagementType')),
    categoryId: json.strOrNull('categoryId'),
    currency: json.str('currency', 'INR'),
    createdAt: json.date('createdAt'),
    seeker: json.obj('seeker') != null ? Party.fromJson(json.obj('seeker')!) : null,
    provider:
        json.obj('provider') != null ? Party.fromJson(json.obj('provider')!) : null,
    agenda: json.obj('agenda') != null ? Agenda.fromJson(json.obj('agenda')!) : null,
    escrow: json.obj('escrow') != null ? Escrow.fromJson(json.obj('escrow')!) : null,
  );

  final String id;

  /// `ENG-99495B`. What a person quotes in a support message, so it is
  /// shown in tabular figures and never truncated.
  final String reference;
  final String domainCode;
  final String familyCode;
  final EngagementStatus status;
  final Paise amount;
  final String language;
  final EngagementType? type;
  final String? categoryId;
  final String currency;
  final DateTime? createdAt;
  final Party? seeker;
  final Party? provider;
  final Agenda? agenda;
  final Escrow? escrow;

  /// No engagement enters a working state without escrow held AND agenda
  /// locked (CLAUDE.md #12). Both halves are shown to the seeker as
  /// separate steps, because being told "not ready" without being told
  /// which half is missing is a dead end.
  bool get agendaReady => agenda?.isLocked ?? false;
  bool get escrowReady => escrow?.isHeld ?? escrow?.isReleased ?? false;
  bool get canStart => agendaReady && escrowReady;
}

/// One dimension of an assessment template.
///
/// Never assume six, never assume any particular set, and never assume a
/// template exists at all — objective categories have none (CLAUDE.md
/// #3). The dimensions are platform-defined per category and a provider
/// may not add to them (#16).
class AssessmentDimension {
  const AssessmentDimension({
    required this.code,
    required this.label,
    this.weight,
    this.descriptor,
  });

  factory AssessmentDimension.fromJson(Map<String, dynamic> json) =>
      AssessmentDimension(
        code: json.str('code', json.str('dimensionCode')),
        label: json.label('labels', json.str('code')),
        weight: json.intOrNull('weight'),
        descriptor: json.strOrNull('descriptor'),
      );

  final String code;
  final Label label;
  final int? weight;
  final String? descriptor;
}

class AssessmentTemplate {
  const AssessmentTemplate({required this.dimensions, this.code, this.label});

  factory AssessmentTemplate.fromJson(Map<String, dynamic> json) =>
      AssessmentTemplate(
        code: json.strOrNull('code'),
        label: json.obj('labels') != null ? json.label('labels') : null,
        dimensions: <AssessmentDimension>[
          for (final Map<String, dynamic> d in json.objects('dimensions'))
            AssessmentDimension.fromJson(d),
        ],
      );

  final String? code;
  final Label? label;
  final List<AssessmentDimension> dimensions;

  bool get isEmpty => dimensions.isEmpty;
}
