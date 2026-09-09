import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/models/money.dart';
import '../../data.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// What a provider is owed, holding, and has been paid.
///
/// Two things here are deliberate. The **platform fee is stated**, not
/// netted off in silence — a provider is entitled to see what was taken.
/// And a **failed payout is shown**, not hidden: it is their money and
/// they are the only person who can fix the bank detail that bounced it.
class ProviderEarningsScreen extends ConsumerWidget {
  const ProviderEarningsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Earnings> earnings = ref.watch(earningsProvider);
    final AsyncValue<PayoutDestination> destination = ref.watch(
      payoutDestinationProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Earnings')),
      body: AsyncBody<Earnings>(
        value: earnings,
        onRetry: () => ref.invalidate(earningsProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Earnings e) => PageBody(
          onRefresh: () async {
            ref
              ..invalidate(earningsProvider)
              ..invalidate(payoutDestinationProvider);
          },
          children: <Widget>[
            _Summary(summary: e.summary),
            destination.maybeWhen(
              data: (PayoutDestination d) => _Destination(destination: d),
              orElse: () => const SizedBox.shrink(),
            ),
            if (e.lines.isEmpty)
              const Panel(
                child: Note(
                  'No payouts yet. Money appears here once a piece of work '
                  'is confirmed and released.',
                ),
              )
            else
              Panel(
                title: 'Payouts',
                child: Column(
                  children: <Widget>[
                    for (final PayoutLine l in e.lines) _PayoutRow(line: l),
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

  final EarningsSummary summary;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Field(
            label: 'Owed to you',
            value: Money(summary.owed, style: theme.textTheme.displaySmall),
          ),
          const SizedBox(height: Space.sm),
          PackText(
            'Released and on its way to your bank.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: BaseColors.inkMuted,
            ),
          ),
          const Divider(height: Space.xl),
          Wrap(
            spacing: Space.xl,
            runSpacing: Space.lg,
            children: <Widget>[
              Field(
                label: 'Held for work in progress',
                value: Money(summary.inEscrow),
              ),
              Field(label: 'Paid out', value: Money(summary.paidOut)),
              // Stated, never netted off silently.
              Field(
                label: 'Platform fee so far',
                value: Money(summary.platformFee),
              ),
              if (!summary.failed.isZero)
                Field(
                  label: 'Failed to send',
                  value: Money(summary.failed),
                  tone: BaseColors.danger,
                ),
            ],
          ),
          if (!summary.failed.isZero) ...<Widget>[
            const SizedBox(height: Space.lg),
            const Note(
              'A payout bounced. It is still your money — check the account '
              'details below and it will be retried.',
              tone: ChipTone.danger,
              icon: Icons.error_outline,
            ),
          ],
        ],
      ),
    );
  }
}

class _Destination extends StatelessWidget {
  const _Destination({required this.destination});

  final PayoutDestination destination;

  @override
  Widget build(BuildContext context) {
    if (!destination.isSet) {
      return const Panel(
        title: 'Where you get paid',
        child: Note(
          'No bank account yet. Money is not lost while this is missing — it '
          'waits.',
          tone: ChipTone.caution,
        ),
      );
    }
    return Panel(
      title: 'Where you get paid',
      trailing: destination.isVerified
          ? const StatusChip('Verified', tone: ChipTone.verified)
          : const StatusChip('Being checked', tone: ChipTone.caution),
      child: Wrap(
        spacing: Space.xl,
        runSpacing: Space.lg,
        children: <Widget>[
          if (destination.accountHolderName != null)
            Field(
              label: 'Account holder',
              value: PackText(destination.accountHolderName!),
            ),
          // Last four and the IFSC. The full number lives with the
          // payment aggregator and never with us (CLAUDE.md #31), which
          // is why there is nothing else to show here.
          Field(
            label: 'Account',
            value: Text(
              '•••• ${destination.bankAccountLast4}',
              style: const TextStyle(
                fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
              ),
            ),
          ),
          if (destination.bankIfsc != null)
            Field(label: 'IFSC', value: Text(destination.bankIfsc!)),
        ],
      ),
    );
  }
}

class _PayoutRow extends StatelessWidget {
  const _PayoutRow({required this.line});

  final PayoutLine line;

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
                Row(
                  children: <Widget>[
                    StatusChip(
                      switch (line.status) {
                        'initiated' => 'On its way',
                        'paid' || 'settled' => 'Paid',
                        'failed' => 'Failed',
                        _ => line.status,
                      },
                      tone: switch (line.status) {
                        'paid' || 'settled' => ChipTone.verified,
                        'failed' => ChipTone.danger,
                        _ => ChipTone.info,
                      },
                    ),
                    if (line.bankAccountLast4 != null) ...<Widget>[
                      const SizedBox(width: Space.sm),
                      Text(
                        '•••• ${line.bankAccountLast4}',
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: BaseColors.inkFaint,
                          fontFeatures: const <FontFeature>[
                            FontFeature.tabularFigures(),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
                if (line.createdAt != null) ...<Widget>[
                  const SizedBox(height: 2),
                  PackText(
                    DateFormat('d MMM yyyy').format(line.createdAt!),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: BaseColors.inkFaint,
                    ),
                  ),
                ],
              ],
            ),
          ),
          Money(line.amount, style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}
