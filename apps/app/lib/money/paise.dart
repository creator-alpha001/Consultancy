import 'package:intl/intl.dart';

/// Money.
///
/// CLAUDE.md #5: all amounts are integer paise. Never float, never rupees,
/// never arithmetic that can silently become a double.
///
/// Dart makes that easy to get wrong. `int` and `double` share the
/// `num` supertype, `/` on two `int`s returns a **double**, and the
/// analyzer will not say a word about it — so `total / 3` compiles, runs,
/// and quietly introduces a fraction of a paisa into a ledger that the
/// database requires to sum to zero.
///
/// So money is this type and never a bare number. It exposes no `/`, no
/// `toDouble()`, and no way to construct one from a double. Splitting is
/// [allocate], which is exact by construction: it distributes the
/// remainder rather than rounding each share and hoping the sum survives.
///
/// The API's wire shape is `{ amountPaise, currency }` and [fromJson]
/// reads exactly that.
extension type const Paise._(int value) implements Object {
  /// Paise, as an integer. The only way in.
  const Paise(this.value);

  static const Paise zero = Paise(0);

  /// Parses `{ "amountPaise": "95000", "currency": "INR" }`.
  ///
  /// **The amount arrives as a STRING**, and that is correct rather than
  /// sloppy: paise are `bigint` in Postgres, and `node-postgres` returns
  /// bigint as a string precisely because JavaScript's `number` cannot
  /// hold one safely. Parsing it to Dart's 64-bit `int` is the first
  /// point in the whole chain where the value is a real integer again.
  ///
  /// An `int` is accepted too, because a few endpoints compute rather
  /// than select. A **double is refused**: an amount that arrived as
  /// `950.5` is a contract bug, and rounding it here would bury that bug
  /// inside a money path — the one place a silent correction is least
  /// acceptable.
  factory Paise.fromJson(Map<String, dynamic> json) =>
      Paise.parse(json['amountPaise']);

  /// A single paise value from a JSON field, wherever it appears.
  ///
  /// Most of the API's money is not wrapped in `{amountPaise, currency}`
  /// — `heldPaise`, `platformFeePaise`, `walletPaise`, `budgetMinPaise`
  /// and the rest are bare fields on a larger object — so this is the
  /// form that actually gets used.
  factory Paise.parse(Object? raw) {
    if (raw is int) return Paise(raw);
    if (raw is String) {
      final int? n = int.tryParse(raw);
      if (n != null) return Paise(n);
      throw FormatException('not an integer number of paise: "$raw"');
    }
    throw FormatException(
      'paise must be an integer or a numeric string, got '
      '${raw.runtimeType}: $raw',
    );
  }

  /// The same, but `null` and absent are allowed and mean "no amount".
  ///
  /// Distinct from zero on purpose: a payout that has not happened and a
  /// payout of nothing are different facts, and a screen says different
  /// things about them.
  static Paise? tryParse(Object? raw) {
    if (raw == null) return null;
    try {
      return Paise.parse(raw);
    } on FormatException {
      return null;
    }
  }

  Map<String, dynamic> toJson({String currency = 'INR'}) => <String, dynamic>{
    'amountPaise': value,
    'currency': currency,
  };

  Paise operator +(Paise other) => Paise(value + other.value);
  Paise operator -(Paise other) => Paise(value - other.value);

  /// Whole multiples only. There is no `*` by a double, deliberately:
  /// a percentage of an amount is [percentage], which stays exact.
  Paise operator *(int times) => Paise(value * times);

  Paise operator -() => Paise(-value);

  bool operator <(Paise other) => value < other.value;
  bool operator <=(Paise other) => value <= other.value;
  bool operator >(Paise other) => value > other.value;
  bool operator >=(Paise other) => value >= other.value;

  bool get isZero => value == 0;
  bool get isNegative => value < 0;
  Paise get abs => Paise(value.abs());

  /// `basisPoints` of this amount, truncated toward zero.
  ///
  /// Basis points rather than a percentage double, because a fee of
  /// "2.5%" expressed as `0.025` is a binary fraction that is not exactly
  /// 2.5% — and fee rates come from `fee_schedule_at(ts)` as integers for
  /// that reason (CLAUDE.md #8). Truncation is explicit and the caller
  /// decides who gets the remainder.
  Paise percentage(int basisPoints) => Paise(value * basisPoints ~/ 10000);

  /// Splits into `parts` shares that sum EXACTLY back to this amount.
  ///
  /// The first `remainder` shares are one paisa larger. This is the
  /// standard allocation algorithm and it exists because the obvious
  /// implementation — divide and round each share — does not sum back to
  /// the original, which a double-entry ledger refuses to accept.
  List<Paise> allocate(int parts) {
    if (parts <= 0) {
      throw ArgumentError.value(parts, 'parts', 'must be positive');
    }
    final int base = value ~/ parts;
    final int remainder = value.remainder(parts);
    return List<Paise>.generate(
      parts,
      (int i) => Paise(base + (i < remainder.abs() ? remainder.sign : 0)),
    );
  }

  /// For display only. Never parse this back.
  String format({String locale = 'en_IN', String symbol = '₹'}) {
    final NumberFormat f = NumberFormat.currency(
      locale: locale,
      symbol: symbol,
      decimalDigits: 2,
    );
    // The one place a division happens, at the very edge, for a string
    // that never returns to a calculation.
    return f.format(value / 100);
  }

  /// `₹950` when the amount is whole rupees, `₹950.50` when it is not.
  ///
  /// Screens are dense and a column of `.00` is noise, but dropping real
  /// paise would be a lie about an amount.
  String formatCompact({String locale = 'en_IN', String symbol = '₹'}) {
    if (value.remainder(100) == 0) {
      return NumberFormat.currency(
        locale: locale,
        symbol: symbol,
        decimalDigits: 0,
      ).format(value ~/ 100);
    }
    return format(locale: locale, symbol: symbol);
  }
}

/// Sums an iterable of amounts. `fold` with a `+` that only accepts
/// [Paise], so a stray `int` cannot join the sum.
Paise sumPaise(Iterable<Paise> amounts) =>
    amounts.fold(Paise.zero, (Paise a, Paise b) => a + b);
