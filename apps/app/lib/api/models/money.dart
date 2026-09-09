import '../../money/paise.dart';
import '../../pack/label.dart';
import '../json.dart';
import 'engagement.dart';

/// What a seeker has spent, is holding, and has had back.
///
/// Every figure is derived from the ledger by the API. There is no
/// `balance` column anywhere (CLAUDE.md #7), and this client does not
/// invent one either — it never sums lines locally to produce a total
/// the server did not send, because a client-side total that disagrees
/// with the ledger is worse than no total at all.
class MoneySummary {
  const MoneySummary({
    required this.wallet,
    required this.inEscrow,
    required this.spent,
    required this.refunded,
    this.currency = 'INR',
  });

  factory MoneySummary.fromJson(Map<String, dynamic> json) => MoneySummary(
    wallet: Paise.tryParse(json['walletPaise']) ?? Paise.zero,
    inEscrow: Paise.tryParse(json['inEscrowPaise']) ?? Paise.zero,
    spent: Paise.tryParse(json['spentPaise']) ?? Paise.zero,
    refunded: Paise.tryParse(json['refundedPaise']) ?? Paise.zero,
    currency: json.str('currency', 'INR'),
  );

  final Paise wallet;
  final Paise inEscrow;
  final Paise spent;
  final Paise refunded;
  final String currency;
}

class MoneyLine {
  const MoneyLine({
    required this.engagementId,
    required this.amount,
    required this.direction,
    this.type,
    this.escrowStatus,
    this.fundedFrom,
    this.createdAt,
    this.currency = 'INR',
  });

  factory MoneyLine.fromJson(Map<String, dynamic> json) => MoneyLine(
    engagementId: json.str('engagementId'),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    direction: json.str('direction', 'out'),
    type: EngagementType.tryParse(json.strOrNull('engagementType')),
    escrowStatus: json.strOrNull('escrowStatus'),
    fundedFrom: json.strOrNull('fundedFrom'),
    createdAt: json.date('createdAt'),
    currency: json.str('currency', 'INR'),
  );

  final String engagementId;
  final Paise amount;

  /// `in` or `out`, from the seeker's point of view.
  final String direction;
  final EngagementType? type;
  final String? escrowStatus;
  final String? fundedFrom;
  final DateTime? createdAt;
  final String currency;

  bool get isRefund => direction == 'in';

  /// Money that has left the seeker but not yet reached the provider.
  /// The rail says so on the screen, because "paid" and "held" feel the
  /// same to someone who has just seen their balance drop.
  bool get isHeld => escrowStatus == 'held';
}

class SeekerMoney {
  const SeekerMoney({required this.summary, required this.lines});

  factory SeekerMoney.fromJson(Map<String, dynamic> json) => SeekerMoney(
    summary: MoneySummary.fromJson(json.obj('summary') ?? const <String, dynamic>{}),
    lines: <MoneyLine>[
      for (final Map<String, dynamic> l in json.objects('lines'))
        MoneyLine.fromJson(l),
    ],
  );

  final MoneySummary summary;
  final List<MoneyLine> lines;
}

/// What a provider is owed, holding, and has been paid.
class EarningsSummary {
  const EarningsSummary({
    required this.inEscrow,
    required this.owed,
    required this.paidOut,
    required this.inTransit,
    required this.failed,
    required this.platformFee,
    this.currency = 'INR',
  });

  factory EarningsSummary.fromJson(Map<String, dynamic> json) =>
      EarningsSummary(
        inEscrow: Paise.tryParse(json['inEscrowPaise']) ?? Paise.zero,
        owed: Paise.tryParse(json['owedPaise']) ?? Paise.zero,
        paidOut: Paise.tryParse(json['paidOutPaise']) ?? Paise.zero,
        inTransit: Paise.tryParse(json['inTransitPaise']) ?? Paise.zero,
        failed: Paise.tryParse(json['failedPaise']) ?? Paise.zero,
        platformFee: Paise.tryParse(json['platformFeePaise']) ?? Paise.zero,
        currency: json.str('currency', 'INR'),
      );

  final Paise inEscrow;
  final Paise owed;
  final Paise paidOut;
  final Paise inTransit;

  /// A failed payout is shown, never hidden. It is the provider's money
  /// and they are the one who can fix the bank detail that bounced it.
  final Paise failed;

  /// Shown explicitly rather than netted off silently: a provider is
  /// entitled to see what the platform took.
  final Paise platformFee;
  final String currency;
}

class PayoutLine {
  const PayoutLine({
    required this.payoutId,
    required this.engagementId,
    required this.amount,
    required this.status,
    this.bankAccountLast4,
    this.createdAt,
  });

  factory PayoutLine.fromJson(Map<String, dynamic> json) => PayoutLine(
    payoutId: json.str('payoutId'),
    engagementId: json.str('engagementId'),
    amount: Paise.tryParse(json['amountPaise']) ?? Paise.zero,
    status: json.str('status'),
    bankAccountLast4: json.strOrNull('bankAccountLast4'),
    createdAt: json.date('createdAt'),
  );

  final String payoutId;
  final String engagementId;
  final Paise amount;
  final String status;

  /// Last four digits only. The full number lives with the payment
  /// aggregator and never with us (CLAUDE.md #31).
  final String? bankAccountLast4;
  final DateTime? createdAt;

  bool get hasFailed => status == 'failed';
}

class Earnings {
  const Earnings({required this.summary, required this.lines});

  factory Earnings.fromJson(Map<String, dynamic> json) => Earnings(
    summary: EarningsSummary.fromJson(
      json.obj('summary') ?? const <String, dynamic>{},
    ),
    lines: <PayoutLine>[
      for (final Map<String, dynamic> l in json.objects('lines'))
        PayoutLine.fromJson(l),
    ],
  );

  final EarningsSummary summary;
  final List<PayoutLine> lines;
}

/// Where a provider's money goes.
///
/// We store the last four digits and the IFSC. Nothing else — no account
/// number, no card (CLAUDE.md #31). The app therefore never offers a
/// field for one.
class PayoutDestination {
  const PayoutDestination({
    this.accountHolderName,
    this.bankAccountLast4,
    this.bankIfsc,
    this.verifiedAt,
    this.verificationNote,
  });

  factory PayoutDestination.fromJson(Map<String, dynamic> json) =>
      PayoutDestination(
        accountHolderName: json.strOrNull('accountHolderName'),
        bankAccountLast4: json.strOrNull('bankAccountLast4'),
        bankIfsc: json.strOrNull('bankIfsc'),
        verifiedAt: json.date('verifiedAt'),
        verificationNote: json.strOrNull('verificationNote'),
      );

  final String? accountHolderName;
  final String? bankAccountLast4;
  final String? bankIfsc;
  final DateTime? verifiedAt;
  final String? verificationNote;

  bool get isSet => bankAccountLast4 != null;
  bool get isVerified => verifiedAt != null;
}

/// One dimension of a seeker's own progress over time.
///
/// Note what is absent and must stay absent: any comparison to another
/// person. No percentile, no rank, no cohort average (CLAUDE.md #17).
/// `first` and `latest` compare a seeker to their own earlier work, which
/// is the only comparison this product makes.
class ProgressSeries {
  const ProgressSeries({
    required this.dimensionCode,
    required this.label,
    required this.points,
    this.first,
    this.latest,
    this.change,
  });

  factory ProgressSeries.fromJson(Map<String, dynamic> json) => ProgressSeries(
    dimensionCode: json.str('dimensionCode'),
    label: json.label('labels', json.str('dimensionCode')),
    points: <ProgressPoint>[
      for (final Map<String, dynamic> p in json.objects('points'))
        ProgressPoint.fromJson(p),
    ],
    first: json.intOrNull('first'),
    latest: json.intOrNull('latest'),
    change: json.intOrNull('change'),
  );

  final String dimensionCode;
  final Label label;
  final List<ProgressPoint> points;
  final int? first;
  final int? latest;
  final int? change;

  bool get hasEnoughToPlot => points.length >= 2;
}

class ProgressPoint {
  const ProgressPoint({required this.engagementId, required this.score, this.at});

  factory ProgressPoint.fromJson(Map<String, dynamic> json) => ProgressPoint(
    engagementId: json.str('engagementId'),
    score: json.intOr('score', 0),
    at: json.date('at'),
  );

  final String engagementId;
  final int score;
  final DateTime? at;
}
