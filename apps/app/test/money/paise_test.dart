import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/money/paise.dart';

/// CLAUDE.md #5 and #6, held down in the client.
///
/// The API's own invariants are enforced by the database, which is where
/// they belong. These tests are about the client not *sending* something
/// the database will rightly refuse, and not *displaying* an amount that
/// disagrees with the ledger.
void main() {
  group('parsing the wire shape', () {
    test('reads amountPaise as an integer', () {
      final Paise p = Paise.fromJson(<String, dynamic>{
        'amountPaise': 95000,
        'currency': 'INR',
      });
      expect(p.value, 95000);
    });

    test('reads amountPaise as a STRING, which is how it really arrives', () {
      // Paise are bigint in Postgres and node-postgres returns bigint as
      // a string, because JavaScript's number cannot hold one safely.
      // Every money field on every endpoint looks like this.
      final Paise p = Paise.fromJson(<String, dynamic>{
        'amountPaise': '95000',
        'currency': 'INR',
      });
      expect(p.value, 95000);
    });

    test('reads a bare paise field, which is the common shape', () {
      // heldPaise, platformFeePaise, walletPaise, budgetMinPaise... most
      // of the API's money is not wrapped in {amountPaise, currency}.
      expect(Paise.parse('718000').value, 718000);
      expect(Paise.parse(0).value, 0);
    });

    test('holds a bigint larger than JavaScript could carry safely', () {
      // 2^53 + 1 paise. The reason the wire format is a string at all.
      const String big = '9007199254740993';
      expect(Paise.parse(big).value.toString(), big);
    });

    test('tryParse tells absent apart from zero', () {
      // A payout that has not happened and a payout of nothing are
      // different facts, and a screen says different things about them.
      expect(Paise.tryParse(null), isNull);
      expect(Paise.tryParse('0'), Paise.zero);
      expect(Paise.tryParse('nonsense'), isNull);
    });

    test('refuses a double rather than rounding it', () {
      // If an amount ever arrives as 950.5, that is a contract bug.
      // Rounding it here would bury the bug inside a money path, which is
      // the one place a silent correction is least acceptable.
      expect(
        () => Paise.fromJson(<String, dynamic>{'amountPaise': 950.5}),
        throwsA(isA<FormatException>()),
      );
    });

    test('refuses a string that is not a number', () {
      expect(
        () => Paise.fromJson(<String, dynamic>{'amountPaise': '95,000.00'}),
        throwsA(isA<FormatException>()),
      );
    });

    test('refuses a stringified double, which is still a double', () {
      expect(
        () => Paise.parse('950.5'),
        throwsA(isA<FormatException>()),
      );
    });

    test('refuses a missing amount', () {
      expect(
        () => Paise.fromJson(<String, dynamic>{'currency': 'INR'}),
        throwsA(isA<FormatException>()),
      );
    });

    test('round-trips', () {
      const Paise p = Paise(12345);
      expect(Paise.fromJson(p.toJson()).value, 12345);
    });
  });

  group('arithmetic stays integral', () {
    test('adds and subtracts', () {
      expect((const Paise(100) + const Paise(250)).value, 350);
      expect((const Paise(100) - const Paise(250)).value, -150);
    });

    test('sums an empty list to zero, not null', () {
      expect(sumPaise(const <Paise>[]), Paise.zero);
    });

    test('sums a list', () {
      expect(
        sumPaise(const <Paise>[Paise(100), Paise(250), Paise(3)]).value,
        353,
      );
    });

    test('percentage in basis points truncates toward zero', () {
      // 2.5% of ₹950.00 is ₹23.75 exactly.
      expect(const Paise(95000).percentage(250).value, 2375);
      // 2.5% of ₹9.99 is 24.975 paise — truncated, never rounded up into
      // money that does not exist.
      expect(const Paise(999).percentage(250).value, 24);
    });
  });

  group('allocate', () {
    test('splits exactly when it divides', () {
      final List<Paise> parts = const Paise(300).allocate(3);
      expect(parts.map((Paise p) => p.value), <int>[100, 100, 100]);
    });

    test('distributes the remainder rather than losing it', () {
      final List<Paise> parts = const Paise(100).allocate(3);
      expect(parts.map((Paise p) => p.value), <int>[34, 33, 33]);
    });

    test('always sums back to the original — the whole point', () {
      // The naive implementation (divide, round each share) fails this,
      // and a double-entry ledger refuses the result.
      for (int amount = 0; amount < 500; amount++) {
        for (int parts = 1; parts <= 7; parts++) {
          expect(
            sumPaise(Paise(amount).allocate(parts)).value,
            amount,
            reason: 'allocating $amount across $parts parts',
          );
        }
      }
    });

    test('works for a refund, which is negative', () {
      final List<Paise> parts = const Paise(-100).allocate(3);
      expect(sumPaise(parts).value, -100);
    });

    test('refuses a non-positive number of parts', () {
      expect(() => const Paise(100).allocate(0), throwsArgumentError);
      expect(() => const Paise(100).allocate(-1), throwsArgumentError);
    });
  });

  group('formatting', () {
    test('formats whole rupees without noise', () {
      expect(const Paise(950000).formatCompact(), '₹9,500');
    });

    test('keeps real paise', () {
      expect(const Paise(95050).formatCompact(), contains('.50'));
    });

    test('formats zero', () {
      expect(Paise.zero.formatCompact(), contains('0'));
    });

    test('formats a negative amount', () {
      expect(const Paise(-950000).formatCompact(), '-₹9,500');
    });
  });
}
