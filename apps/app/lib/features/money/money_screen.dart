import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/models/money.dart';
import '../../data.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import 'bundles.dart';

/// Where a seeker's money is.
///
/// Every figure on this screen comes from the API, which derives it from
/// the ledger. **Nothing is summed locally.** There is no `balance`
/// column anywhere in the system (CLAUDE.md #7), and a client-side total
/// that quietly disagreed with the ledger would be worse than no total —
/// it would be a number someone trusts and nobody can reconcile.
class MoneyScreen extends ConsumerWidget {
  const MoneyScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<SeekerMoney> money = ref.watch(moneyProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Money')),
      body: AsyncBody<SeekerMoney>(
        value: money,
        onRetry: () => ref.invalidate(moneyProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (SeekerMoney m) => PageBody(
          onRefresh: () async => ref.invalidate(moneyProvider),
          children: <Widget>[
            _Summary(summary: m.summary),
            const Bundles(),
            if (m.lines.isEmpty)
              const Panel(
                child: Note(
                  'Nothing has moved yet. Money appears here the moment it '
                  'is held for a piece of work.',
                ),
              )
            else
              Panel(
                title: 'Every movement',
                note: 'Newest first. Nothing is ever removed from this list.',
                child: Column(
                  children: <Widget>[
                    for (final MoneyLine l in m.lines) _Line(line: l),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Summary extends StatelessWidget {
  const _Summary({required this.summary});

  final MoneySummary summary;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Field(
            label: 'Held for work in progress',
            value: Money(
              summary.inEscrow,
              style: theme.textTheme.displaySmall,
            ),
          ),
          const SizedBox(height: Space.sm),
          // The sentence that matters most on this screen. "Paid" and
          // "held" feel identical to someone who has just watched their
          // balance drop, so the difference is spelled out rather than
          // implied by a colour.
          PackText(
            'This has left your account but has NOT reached anyone. It '
            'moves only when you confirm the agreed goals were met.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: BaseColors.inkMuted,
            ),
          ),
          const Divider(height: Space.xl),
          Wrap(
            spacing: Space.xl,
            runSpacing: Space.lg,
            children: <Widget>[
              Field(label: 'Spent in total', value: Money(summary.spent)),
              Field(label: 'Refunded to you', value: Money(summary.refunded)),
              if (!summary.wallet.isZero)
                Field(label: 'Credit', value: Money(summary.wallet)),
            ],
          ),
        ],
      ),
    );
  }
}

class _Line extends StatelessWidget {
  const _Line({required this.line});

  final MoneyLine line;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: Row(
        children: <Widget>[
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                PackText(
                  line.type?.neutralLabel ?? 'Engagement',
                  style: theme.textTheme.bodyMedium,
                ),
                const SizedBox(height: 2),
                Row(
                  children: <Widget>[
                    if (line.createdAt != null)
                      PackText(
                        DateFormat('d MMM yyyy').format(line.createdAt!),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: BaseColors.inkFaint,
                        ),
                      ),
                    const SizedBox(width: Space.sm),
                    StatusChip(
                      switch (line.escrowStatus) {
                        'held' => 'Held',
                        'released' => 'Released',
                        'refunded' => 'Refunded',
                        _ => line.escrowStatus ?? '—',
                      },
                      tone: switch (line.escrowStatus) {
                        'held' => ChipTone.caution,
                        'released' => ChipTone.verified,
                        'refunded' => ChipTone.info,
                        _ => ChipTone.neutral,
                      },
                    ),
                  ],
                ),
              ],
            ),
          ),
          Money(
            line.amount,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: line.isRefund ? BaseColors.verified : null,
            ),
          ),
        ],
      ),
    );
  }
}
