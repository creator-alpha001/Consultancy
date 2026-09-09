import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/models/provider.dart';
import '../../api/models/supply.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// A provider's verification standing.
///
/// **Tier is per skill, never global** (CLAUDE.md, domain-neutrality #5).
/// A person can be experienced at one thing and unverified at another,
/// and matching intersects an engagement's required skills with what they
/// hold. A single badge for the person would erase exactly the
/// distinction the whole taxonomy exists to make.
class ProviderStandingScreen extends ConsumerWidget {
  const ProviderStandingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<VerifiedSkill>> skills = ref.watch(
      mySkillStatsProvider,
    );
    final AsyncValue<List<CredentialSubmission>> credentials = ref.watch(
      myCredentialsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Verification')),
      body: AsyncBody<List<VerifiedSkill>>(
        value: skills,
        onRetry: () => ref.invalidate(mySkillStatsProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (List<VerifiedSkill> list) => PageBody(
          onRefresh: () async {
            ref
              ..invalidate(mySkillStatsProvider)
              ..invalidate(myCredentialsProvider);
          },
          children: <Widget>[
            const Note(
              'You are verified skill by skill, not once overall. People are '
              'matched to you by what you hold, in the language they need.',
              icon: Icons.info_outline,
            ),
            if (list.isEmpty)
              const Panel(
                child: Note(
                  'Nothing verified yet. Submit a credential and it will '
                  'appear here once a person has checked it.',
                  tone: ChipTone.caution,
                ),
              )
            else
              Panel(
                title: 'Your skills',
                child: Column(
                  children: <Widget>[
                    for (final VerifiedSkill s in list)
                      Padding(
                        padding: const EdgeInsets.only(bottom: Space.md),
                        child: Row(
                          children: <Widget>[
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  PackText(s.label(lang)),
                                  if (s.hasRecord)
                                    PackText(
                                      '${s.completedEngagements} completed'
                                      '${s.avgRating != null ? ' · ${s.avgRating!.toStringAsFixed(1)}' : ''}',
                                      style: Theme.of(context)
                                          .textTheme
                                          .bodySmall
                                          ?.copyWith(
                                            color: BaseColors.inkMuted,
                                          ),
                                    ),
                                ],
                              ),
                            ),
                            if (s.tier != null)
                              StatusChip(
                                s.tier!.neutralLabel,
                                tone: ChipTone.verified,
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
            credentials.maybeWhen(
              data: (List<CredentialSubmission> c) => _Credentials(list: c),
              orElse: () => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }
}

class _Credentials extends StatelessWidget {
  const _Credentials({required this.list});

  final List<CredentialSubmission> list;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      title: 'What you submitted',
      // The evidence is not shown back, on purpose: a profile shows the
      // conclusion, never the proof (CLAUDE.md #30). What is useful here
      // is the DECISION and, if it went against them, the reason.
      note: 'The documents themselves are never shown again, to anyone.',
      child: Column(
        children: <Widget>[
          for (final CredentialSubmission c in list)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        PackText(c.typeLabel?.call('en') ?? c.domainCode),
                        if (c.reviewedAt != null)
                          PackText(
                            'Reviewed ${DateFormat('d MMM yyyy').format(c.reviewedAt!)}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: BaseColors.inkFaint,
                            ),
                          ),
                        // A rejection they cannot act on is a dead end,
                        // so the reason is surfaced rather than filed.
                        if (c.status == CredentialStatus.rejected &&
                            (c.decisionNote ?? '').isNotEmpty) ...<Widget>[
                          const SizedBox(height: Space.sm),
                          Note(c.decisionNote!, tone: ChipTone.danger),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  StatusChip(
                    c.status.label,
                    tone: switch (c.status) {
                      CredentialStatus.verified => ChipTone.verified,
                      CredentialStatus.rejected => ChipTone.danger,
                      CredentialStatus.pending => ChipTone.caution,
                      CredentialStatus.unknown => ChipTone.neutral,
                    },
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
