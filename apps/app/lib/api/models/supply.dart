import '../../pack/label.dart';
import '../json.dart';

/// Whether a provider can be booked, and what is still in the way.
///
/// Two kinds of step: **blocking** ones that stop bookings, and advisory
/// ones that only make the provider harder to find. Keeping them apart
/// matters — telling someone their payout details are "missing" in the
/// same tone as "you are not verified" makes both easy to ignore.
class Readiness {
  const Readiness({
    required this.bookable,
    required this.steps,
    this.families = const <String>[],
  });

  factory Readiness.fromJson(Map<String, dynamic> json) => Readiness(
    bookable: json.boolOr('bookable'),
    families: <String>[
      for (final Object? f in (json['families'] as List<Object?>? ?? const <Object?>[]))
        if (f is String) f,
    ],
    steps: <ReadinessStep>[
      for (final Map<String, dynamic> s in json.objects('steps'))
        ReadinessStep.fromJson(s),
    ],
  );

  final bool bookable;
  final List<ReadinessStep> steps;

  /// The families this checklist covers — where the provider signed up,
  /// and everywhere their credentials reach. Training is per family.
  final List<String> families;

  List<ReadinessStep> get outstanding =>
      steps.where((ReadinessStep s) => !s.done).toList();

  List<ReadinessStep> get blockers =>
      outstanding.where((ReadinessStep s) => s.blocking).toList();
}

class ReadinessStep {
  const ReadinessStep({
    required this.code,
    required this.done,
    required this.blocking,
    this.detail = const <String, dynamic>{},
  });

  factory ReadinessStep.fromJson(Map<String, dynamic> json) => ReadinessStep(
    code: json.str('code'),
    done: json.boolOr('done'),
    blocking: json.boolOr('blocking'),
    detail: json.obj('detail') ?? const <String, dynamic>{},
  );

  final String code;
  final bool done;
  final bool blocking;
  final Map<String, dynamic> detail;

  /// The platform's neutral wording for each step.
  ///
  /// These are CORE concepts — every family has credentials, languages,
  /// services and training — so unlike a skill or a category they are the
  /// platform's words rather than a manifest's. They move to the ARB
  /// catalogue with the rest of the interface chrome.
  String get title => switch (code) {
    'email_verified' => 'Confirm your email address',
    'profile_complete' => 'Add your name and a short bio',
    'credential_submitted' => 'Submit a credential',
    'skill_verified_at_tier' => 'Get a skill verified',
    'working_language' => 'Declare a working language',
    'service_published' => 'Publish what you offer',
    'training_complete' => 'Finish the training',
    'availability_set' => 'Set your availability',
    'payout_destination' => 'Add where you get paid',
    _ => code.replaceAll('_', ' '),
  };

  String get why => switch (code) {
    'email_verified' =>
      'Payouts, disputes and verification decisions reach you there.',
    'profile_complete' =>
      'The first thing someone reads before trusting you with their work.',
    'credential_submitted' =>
      'Nothing is published until something has been checked.',
    'skill_verified_at_tier' =>
      'People are matched to you by skill, never by a general rating.',
    'working_language' =>
      'Someone working in a language you do not have cannot be matched to you.',
    'service_published' => 'A price and a turnaround, so there is nothing to negotiate.',
    'training_complete' => 'What you may and may not promise. It is short.',
    'availability_set' => 'Without it you can still be sent work, but not booked for a time.',
    'payout_destination' => 'Money is held until this exists. It is not lost, only waiting.',
    _ => '',
  };
}

/// A credential a provider has submitted.
///
/// The evidence — `verifierData`'s roll number, claimed name and document
/// reference — is deliberately NOT modelled for display. A profile shows
/// the conclusion, never the proof (CLAUDE.md #30), and a type that
/// carried the evidence would make leaking it a one-line mistake.
class CredentialSubmission {
  const CredentialSubmission({
    required this.id,
    required this.status,
    required this.domainCode,
    this.typeLabel,
    this.reviewedAt,
    this.decisionNote,
  });

  factory CredentialSubmission.fromJson(Map<String, dynamic> json) =>
      CredentialSubmission(
        id: json.reqStr('id'),
        status: CredentialStatus.parse(json.strOrNull('status')),
        domainCode: json.str('domainCode'),
        typeLabel: json.obj('credentialTypeLabels') != null
            ? json.label('credentialTypeLabels')
            : null,
        reviewedAt: json.date('reviewedAt'),
        decisionNote: json.strOrNull('decisionNote'),
      );

  final String id;
  final CredentialStatus status;
  final String domainCode;
  final Label? typeLabel;
  final DateTime? reviewedAt;

  /// Why it was rejected. Shown to the provider, because a rejection they
  /// cannot act on is a dead end.
  final String? decisionNote;
}

enum CredentialStatus {
  pending,
  verified,
  rejected,
  unknown;

  static CredentialStatus parse(String? raw) => switch (raw) {
    // 'under_review' is what migration 0015 actually names it.
    'pending' || 'submitted' || 'in_review' || 'under_review' =>
      CredentialStatus.pending,
    'verified' || 'approved' => CredentialStatus.verified,
    'rejected' => CredentialStatus.rejected,
    _ => CredentialStatus.unknown,
  };

  String get label => switch (this) {
    CredentialStatus.pending => 'Being checked',
    CredentialStatus.verified => 'Verified',
    CredentialStatus.rejected => 'Not accepted',
    CredentialStatus.unknown => 'Unknown',
  };
}

/// A training module from the family manifest.
///
/// Entirely pack data: the sections, the wording, the questions and the
/// answers are all published, and core knows none of them. A family that
/// verifies music grades trains its providers on different things with no
/// code change.
class TrainingModule {
  const TrainingModule({
    required this.code,
    required this.label,
    required this.required_,
    required this.sections,
    required this.questions,
    this.completedAt,
  });

  factory TrainingModule.fromJson(Map<String, dynamic> json) => TrainingModule(
    code: json.str('code'),
    label: json.label('labels', json.str('code')),
    required_: json.boolOr('required'),
    sections: <TrainingSection>[
      for (final Map<String, dynamic> s in json.objects('sections'))
        TrainingSection.fromJson(s),
    ],
    questions: <TrainingQuestion>[
      for (final Map<String, dynamic> q in json.objects('questions'))
        TrainingQuestion.fromJson(q),
    ],
    completedAt: json.date('completedAt'),
  );

  final String code;
  final Label label;
  final bool required_;
  final List<TrainingSection> sections;
  final List<TrainingQuestion> questions;
  final DateTime? completedAt;

  bool get isComplete => completedAt != null;
}

class TrainingSection {
  const TrainingSection({required this.heading, required this.body});

  factory TrainingSection.fromJson(Map<String, dynamic> json) =>
      TrainingSection(
        heading: json.label('heading'),
        body: json.label('body'),
      );

  final Label heading;
  final Label body;
}

class TrainingQuestion {
  const TrainingQuestion({
    required this.code,
    required this.prompt,
    required this.options,
  });

  factory TrainingQuestion.fromJson(Map<String, dynamic> json) =>
      TrainingQuestion(
        code: json.str('code'),
        prompt: json.label('prompt'),
        options: <TrainingOption>[
          for (final Map<String, dynamic> o in json.objects('options'))
            TrainingOption.fromJson(o),
        ],
      );

  final String code;
  final Label prompt;
  final List<TrainingOption> options;
}

class TrainingOption {
  const TrainingOption({required this.code, required this.label});

  factory TrainingOption.fromJson(Map<String, dynamic> json) => TrainingOption(
    code: json.str('code'),
    label: json.label('labels', json.str('code')),
  );

  final String code;
  final Label label;
}

class TrainingState {
  const TrainingState({required this.familyCode, required this.modules});

  factory TrainingState.fromJson(Map<String, dynamic> json) => TrainingState(
    familyCode: json.str('familyCode'),
    modules: <TrainingModule>[
      for (final Map<String, dynamic> m in json.objects('modules'))
        TrainingModule.fromJson(m),
    ],
  );

  final String familyCode;
  final List<TrainingModule> modules;
}

/// A weekly availability rule.
///
/// Times are minutes from midnight IN [timezone], which is an IANA name.
/// Never a fixed offset — "9am their time" has to survive a DST change,
/// and `+05:30` does not.
class AvailabilityRule {
  const AvailabilityRule({
    required this.id,
    required this.timezone,
    required this.rrule,
    required this.startMinute,
    required this.endMinute,
    this.effectiveFrom,
    this.effectiveTo,
  });

  factory AvailabilityRule.fromJson(Map<String, dynamic> json) =>
      AvailabilityRule(
        id: json.reqStr('id'),
        timezone: json.str('timezone', 'Asia/Kolkata'),
        rrule: json.str('rrule'),
        startMinute: json.intOr('startMinute', 0),
        endMinute: json.intOr('endMinute', 0),
        effectiveFrom: json.strOrNull('effectiveFrom'),
        effectiveTo: json.strOrNull('effectiveTo'),
      );

  final String id;
  final String timezone;
  final String rrule;
  final int startMinute;
  final int endMinute;
  final String? effectiveFrom;
  final String? effectiveTo;

  /// `MO,TU,WE` out of an RRULE, for display. Deliberately shallow: this
  /// app never EVALUATES an rrule — the server computes slots, because a
  /// client and a server disagreeing about which hours exist is how a
  /// booking lands at a time nobody is there.
  List<String> get days {
    final RegExpMatch? m = RegExp(r'BYDAY=([A-Z,]+)').firstMatch(rrule);
    return m == null ? const <String>[] : m.group(1)!.split(',');
  }
}

class AvailabilityPolicy {
  const AvailabilityPolicy({
    required this.minNoticeMinutes,
    required this.bufferMinutes,
    required this.maxAdvanceDays,
    required this.slotMinutes,
  });

  factory AvailabilityPolicy.fromJson(Map<String, dynamic> json) =>
      AvailabilityPolicy(
        minNoticeMinutes: json.intOr('minNoticeMinutes', 120),
        bufferMinutes: json.intOr('bufferMinutes', 15),
        maxAdvanceDays: json.intOr('maxAdvanceDays', 60),
        slotMinutes: json.intOr('slotMinutes', 60),
      );

  final int minNoticeMinutes;
  final int bufferMinutes;
  final int maxAdvanceDays;
  final int slotMinutes;
}

class Availability {
  const Availability({
    required this.rules,
    required this.policy,
    this.exceptions = const <Map<String, dynamic>>[],
  });

  factory Availability.fromJson(Map<String, dynamic> json) => Availability(
    rules: <AvailabilityRule>[
      for (final Map<String, dynamic> r in json.objects('rules'))
        AvailabilityRule.fromJson(r),
    ],
    policy: AvailabilityPolicy.fromJson(
      json.obj('policy') ?? const <String, dynamic>{},
    ),
    exceptions: json.objects('exceptions'),
  );

  final List<AvailabilityRule> rules;
  final AvailabilityPolicy policy;
  final List<Map<String, dynamic>> exceptions;
}

/// A language a provider can work in, and whether they can assess in it.
///
/// The two are different: reading a language well enough to talk is not
/// the same as marking work in it, and conflating them is how someone
/// ends up assessing writing they cannot properly judge.
class WorkingLanguage {
  const WorkingLanguage({required this.code, required this.canEvaluate});

  factory WorkingLanguage.fromJson(Map<String, dynamic> json) =>
      WorkingLanguage(
        code: json.str('langCode'),
        canEvaluate: json.boolOr('canEvaluate'),
      );

  final String code;
  final bool canEvaluate;
}

/// Whether this provider may take paid work at all.
///
/// A serving government officer may be legally barred from paid outside
/// work — a restriction on THEIR career, not a platform preference — so a
/// block is stated plainly and never worked around.
class PaidWorkStatus {
  const PaidWorkStatus({required this.blocked, this.reason});

  factory PaidWorkStatus.fromJson(Map<String, dynamic> json) => PaidWorkStatus(
    blocked: json.boolOr('blocked'),
    reason: json.strOrNull('reason'),
  );

  final bool blocked;
  final String? reason;
}
