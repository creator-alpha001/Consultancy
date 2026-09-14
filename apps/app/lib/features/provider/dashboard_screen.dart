import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models/engagement.dart';
import '../../api/models/money.dart';
import '../../api/models/supply.dart';
import '../../data.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The provider's dashboard.
///
/// Three questions, in the order a provider actually asks them: can I be
/// booked, what needs me today, and what am I owed.
class ProviderDashboardScreen extends ConsumerWidget {
  const ProviderDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Readiness> readiness = ref.watch(readinessProvider);
    final AsyncValue<List<Engagement>> work = ref.watch(engagementsProvider);
    final AsyncValue<Earnings> earnings = ref.watch(earningsProvider);
    final AsyncValue<PaidWorkStatus> paidWork = ref.watch(
      paidWorkStatusProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Dashboard')),
      body: PageBody(
        onRefresh: () async {
          ref
            ..invalidate(readinessProvider)
            ..invalidate(engagementsProvider)
            ..invalidate(earningsProvider);
        },
        children: <Widget>[
          // Checked first and stated plainly. A serving officer may be
          // legally barred from paid outside work — a restriction on
          // THEIR career, not a platform preference — so it is never
          // worked around or softened.
          paidWork.maybeWhen(
            data: (PaidWorkStatus s) => s.blocked
                ? Note(
                    s.reason ??
                        'Paid work is not available on your account. Free '
                            'answers on the board still are.',
                    tone: ChipTone.caution,
                    icon: Icons.gavel_outlined,
                  )
                : const SizedBox.shrink(),
            orElse: () => const SizedBox.shrink(),
          ),

          readiness.when(
            loading: () => const Panel(child: LinearProgressIndicator()),
            error: (Object e, _) => const SizedBox.shrink(),
            data: (Readiness r) => _Readiness(readiness: r),
          ),

          work.maybeWhen(
            data: (List<Engagement> list) {
              final List<Engagement> needsMe = list
                  .where(
                    (Engagement e) =>
                        // Work sent and waiting to be assessed, or under
                        // way with nothing yet sent.
                        e.status == EngagementStatus.delivered ||
                        e.status == EngagementStatus.working,
                  )
                  .toList()
                // Work that has been sent and is waiting on them first:
                // that is the one they can act on now.
                ..sort(
                  (Engagement a, Engagement b) =>
                      (a.status == EngagementStatus.delivered ? 0 : 1)
                          .compareTo(
                            b.status == EngagementStatus.delivered ? 0 : 1,
                          ),
                );
              return Panel(
                title: 'Needs you',
                note: needsMe.isEmpty
                    ? 'Nothing waiting. New requests appear under Requests.'
                    : null,
                child: Column(
                  children: <Widget>[
                    for (final Engagement e in needsMe.take(5))
                      NavRow(
                        title: e.seeker?.displayName ?? e.reference,
                        subtitle: <String>[
                          if (e.status == EngagementStatus.delivered)
                            'Work sent — assess it'
                          else
                            'Under way',
                          ?e.type?.neutralLabel,
                        ].join(' · '),
                        trailing: Money(e.amount),
                        onTap: () => context.push('/provider/work/${e.id}'),
                      ),
                  ],
                ),
              );
            },
            orElse: () => const SizedBox.shrink(),
          ),

          earnings.maybeWhen(
            data: (Earnings e) => Panel(
              title: 'Money',
              trailing: TextButton(
                onPressed: () => context.push('/provider/earnings'),
                child: const PackText('Details'),
              ),
              child: Wrap(
                spacing: Space.xl,
                runSpacing: Space.lg,
                children: <Widget>[
                  Field(
                    label: 'Held for work in progress',
                    value: Money(e.summary.inEscrow),
                  ),
                  Field(label: 'Owed to you', value: Money(e.summary.owed)),
                  Field(label: 'Paid out', value: Money(e.summary.paidOut)),
                  if (!e.summary.failed.isZero)
                    Field(
                      label: 'Failed to send',
                      value: Money(e.summary.failed),
                      tone: BaseColors.danger,
                    ),
                ],
              ),
            ),
            orElse: () => const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }
}

/// What is still in the way of being booked.
///
/// Blocking steps and advisory ones are shown apart. Telling someone
/// their payout details are "missing" in the same tone as "you are not
/// verified" makes both easy to ignore.
class _Readiness extends StatelessWidget {
  const _Readiness({required this.readiness});

  final Readiness readiness;

  @override
  Widget build(BuildContext context) {
    if (readiness.bookable && readiness.outstanding.isEmpty) {
      return const Panel(
        child: Note(
          'You are bookable and listed in matching.',
          tone: ChipTone.verified,
          icon: Icons.check_circle_outline,
        ),
      );
    }

    final List<ReadinessStep> blockers = readiness.blockers;
    final List<ReadinessStep> advisory = readiness.outstanding
        .where((ReadinessStep s) => !s.blocking)
        .toList();

    return Panel(
      title: readiness.bookable
          ? 'Worth finishing'
          : 'Before you can be booked',
      note: readiness.bookable
          ? 'You can be booked. These would make you easier to find.'
          : null,
      child: Column(
        children: <Widget>[
          for (final ReadinessStep s in blockers)
            NavRow(
              title: s.title,
              subtitle: s.why,
              leading: const Icon(
                Icons.radio_button_unchecked,
                size: 20,
                color: BaseColors.caution,
              ),
              onTap: () => context.push(_routeFor(s.code)),
            ),
          for (final ReadinessStep s in advisory)
            NavRow(
              title: s.title,
              subtitle: s.why,
              leading: const Icon(
                Icons.radio_button_unchecked,
                size: 20,
                color: BaseColors.inkFaint,
              ),
              onTap: () => context.push(_routeFor(s.code)),
            ),
        ],
      ),
    );
  }

  static String _routeFor(String code) => switch (code) {
    'email_verified' || 'profile_complete' => '/you/profile',
    'credential_submitted' || 'skill_verified_at_tier' => '/provider/standing',
    'working_language' => '/provider/languages',
    'service_published' => '/provider/services',
    'training_complete' => '/provider/training',
    'availability_set' => '/provider/availability',
    'payout_destination' => '/provider/payout',
    _ => '/provider',
  };
}
