import '../../money/paise.dart';
import '../../pack/label.dart';
import '../json.dart';
import 'engagement.dart';

/// A verification tier, per skill.
///
/// **Never global** (CLAUDE.md #5 under Domain neutrality): a person can
/// be t3 at one skill and unverified at another, and matching intersects
/// the engagement's required skills with the provider's verified ones.
/// A type that held one tier per person would make that impossible to
/// express, which is why this only ever appears inside [VerifiedSkill].
enum Tier {
  t0,
  t1,
  t2,
  t3,
  t4;

  static Tier? tryParse(String? raw) {
    for (final Tier t in values) {
      if (t.name == raw) return t;
    }
    return null;
  }

  /// The platform's neutral fallback. A family names its own tiers in the
  /// manifest and those win — "Verified", "Senior", "Examiner" and so on
  /// are family words, never core's.
  String get neutralLabel => switch (this) {
    Tier.t0 => 'Unverified',
    Tier.t1 => 'Identity checked',
    Tier.t2 => 'Credential verified',
    Tier.t3 => 'Experienced',
    Tier.t4 => 'Senior',
  };
}

class VerifiedSkill {
  const VerifiedSkill({
    required this.skillId,
    required this.skillCode,
    required this.label,
    this.tier,
    this.completedEngagements = 0,
    this.reviewCount = 0,
    this.avgRating,
  });

  factory VerifiedSkill.fromJson(Map<String, dynamic> json) => VerifiedSkill(
    skillId: json.str('skillId'),
    skillCode: json.str('skillCode'),
    label: json.label('labels', json.str('skillCode')),
    tier: Tier.tryParse(json.strOrNull('tier')),
    completedEngagements: json.intOr('completedEngagements', 0),
    reviewCount: json.intOr('reviewCount', 0),
    avgRating: json.doubleOrNull('avgRating'),
  );

  final String skillId;
  final String skillCode;
  final Label label;
  final Tier? tier;
  final int completedEngagements;
  final int reviewCount;

  /// Null when nobody has reviewed this skill yet — which is different
  /// from zero, and must not be drawn as an empty star row. A provider
  /// with no reviews is new, not bad.
  final double? avgRating;

  bool get hasRecord => completedEngagements > 0 || reviewCount > 0;
}

class ProviderSummary {
  const ProviderSummary({
    required this.providerId,
    required this.displayName,
    required this.languages,
    required this.skills,
  });

  factory ProviderSummary.fromJson(Map<String, dynamic> json) =>
      ProviderSummary(
        providerId: json.reqStr('providerId'),
        displayName: json.str('displayName'),
        languages: json.strings('languages'),
        skills: <VerifiedSkill>[
          for (final Map<String, dynamic> s in json.objects('skills'))
            VerifiedSkill.fromJson(s),
        ],
      );

  final String providerId;
  final String displayName;

  /// A matching dimension, not a preference (CLAUDE.md #19). A seeker
  /// working in Hindi cannot be served by a Hindi-incapable provider, so
  /// this is shown on the card rather than buried in a profile.
  final List<String> languages;
  final List<VerifiedSkill> skills;

  /// The skills worth putting on a card.
  ///
  /// The web app's cards once repeated "No reviews yet / 0 completed"
  /// under all fourteen verified skills and buried the person under their
  /// own metadata. So: the ones with a track record first, then the rest,
  /// and a card shows only the top few.
  List<VerifiedSkill> get ranked {
    final List<VerifiedSkill> out = List<VerifiedSkill>.of(skills);
    out.sort((VerifiedSkill a, VerifiedSkill b) {
      if (a.hasRecord != b.hasRecord) return a.hasRecord ? -1 : 1;
      return b.completedEngagements.compareTo(a.completedEngagements);
    });
    return out;
  }

  int get completedTotal =>
      skills.fold(0, (int n, VerifiedSkill s) => n + s.completedEngagements);
}

/// A credential, published as a CONCLUSION.
///
/// `verifier_data` holds the roll number, the claimed name and the
/// document reference that proved it. None of that is public: a profile
/// shows what was established, never the evidence (CLAUDE.md #30). Each
/// credential type declares an allow-list of publishable fields in the
/// family manifest, defaulting to empty.
class Achievement {
  const Achievement({required this.label, this.fields = const <String, String>{}});

  factory Achievement.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> public =
        json.obj('publicFields') ?? const <String, dynamic>{};
    return Achievement(
      label: json.label('labels', json.str('credentialType')),
      fields: <String, String>{
        for (final MapEntry<String, dynamic> e in public.entries)
          e.key: '${e.value}',
      },
    );
  }

  final Label label;
  final Map<String, String> fields;
}

/// A provider's own history — never a comparison to anyone else.
///
/// `repeatSeekers` is the one number a provider cannot talk their way
/// into, and refunded engagements are shown rather than hidden: a record
/// that reports only successes is not a record.
class TrackRecord {
  const TrackRecord({
    this.completed = 0,
    this.distinctSeekers = 0,
    this.repeatSeekers = 0,
    this.refunded = 0,
  });

  factory TrackRecord.fromJson(Map<String, dynamic> json) => TrackRecord(
    // The API's names are completedEngagements / refundedEngagements;
    // reading 'completed' showed "Completed 0" beside a card saying 18.
    completed: json.intOr('completedEngagements', json.intOr('completed', 0)),
    distinctSeekers: json.intOr('distinctSeekers', 0),
    repeatSeekers: json.intOr('repeatSeekers', 0),
    refunded: json.intOr('refundedEngagements', json.intOr('refunded', 0)),
  );

  final int completed;
  final int distinctSeekers;
  final int repeatSeekers;
  final int refunded;
}

/// What a provider sells: one price, for a stated duration or turnaround.
///
/// Not a band. The negotiable-price model is gone — a provider publishes
/// a price and a seeker takes it or does not, which is what keeps
/// proposals from becoming a price auction (CLAUDE.md #15).
class Service {
  const Service({
    required this.id,
    required this.type,
    required this.amount,
    this.skillId,
    this.skillLabel,
    this.durationMinutes,
    this.turnaroundHours,
    this.currency = 'INR',
  });

  factory Service.fromJson(Map<String, dynamic> json) => Service(
    id: json.str('id'),
    type: EngagementType.tryParse(json.strOrNull('engagementType')),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    skillId: json.strOrNull('skillId'),
    skillLabel: json.obj('skillLabels') != null ? json.label('skillLabels') : null,
    durationMinutes: json.intOrNull('durationMinutes'),
    turnaroundHours: json.intOrNull('turnaroundHours'),
    currency: json.str('currency', 'INR'),
  );

  final String id;
  final EngagementType? type;
  final Paise amount;
  final String? skillId;
  final Label? skillLabel;

  /// A live session is priced per duration; an async review per
  /// turnaround. Exactly one of these is set, and which one tells you
  /// what kind of commitment is being sold.
  final int? durationMinutes;
  final int? turnaroundHours;
  final String currency;
}

/// Several sessions bought together.
class ServicePackage {
  const ServicePackage({
    required this.id,
    required this.title,
    required this.sessionCount,
    required this.amount,
    this.perSession,
    this.type,
    this.durationMinutes,
    this.turnaroundHours,
  });

  factory ServicePackage.fromJson(Map<String, dynamic> json) => ServicePackage(
    id: json.reqStr('id'),
    title: json.str('title'),
    sessionCount: json.intOr('sessionCount', 0),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    perSession: Paise.tryParse(json['perSessionPaise']),
    type: EngagementType.tryParse(json.strOrNull('engagementType')),
    durationMinutes: json.intOrNull('durationMinutes'),
    turnaroundHours: json.intOrNull('turnaroundHours'),
  );

  final String id;
  final String title;
  final int sessionCount;
  final Paise amount;
  final Paise? perSession;
  final EngagementType? type;
  final int? durationMinutes;
  final int? turnaroundHours;
}

class ProviderProfile {
  const ProviderProfile({
    required this.summary,
    this.bio,
    this.achievements = const <Achievement>[],
    this.services = const <Service>[],
    this.packages = const <ServicePackage>[],
    this.record = const TrackRecord(),
  });

  factory ProviderProfile.fromJson(Map<String, dynamic> json) =>
      ProviderProfile(
        summary: ProviderSummary.fromJson(json),
        bio: json.strOrNull('bio'),
        achievements: <Achievement>[
          for (final Map<String, dynamic> a in json.objects('achievements'))
            Achievement.fromJson(a),
        ],
        services: <Service>[
          for (final Map<String, dynamic> s in json.objects('services'))
            Service.fromJson(s),
        ],
        packages: <ServicePackage>[
          for (final Map<String, dynamic> p in json.objects('packages'))
            ServicePackage.fromJson(p),
        ],
        record: json.obj('trackRecord') != null
            ? TrackRecord.fromJson(json.obj('trackRecord')!)
            : const TrackRecord(),
      );

  final ProviderSummary summary;
  final String? bio;
  final List<Achievement> achievements;
  final List<Service> services;
  final List<ServicePackage> packages;
  final TrackRecord record;
}

/// A bookable slot.
class Slot {
  const Slot({required this.start, required this.end, this.timezone});

  factory Slot.fromJson(Map<String, dynamic> json) => Slot(
    start: json.date('start') ?? json.date('startsAt') ?? DateTime.now(),
    end: json.date('end') ?? json.date('endsAt'),
    timezone: json.strOrNull('timezone'),
  );

  final DateTime start;
  final DateTime? end;

  /// The provider's own timezone, carried alongside the instant. A fixed
  /// offset is never stored — the API sends an IANA name because "9am
  /// their time" survives a DST change and "+05:30" does not.
  final String? timezone;
}
