import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/provider.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import 'book_sheet.dart';

final FutureProviderFamily<ProviderProfile, String> providerProfileProvider =
    FutureProvider.family<ProviderProfile, String>(
      (Ref ref, String id) => ref.watch(repositoryProvider).provider(id),
    );

/// One person's profile.
///
/// Three things are on this screen and each is there for a reason:
/// **achievements**, published as conclusions and never as evidence
/// (#30); **a track record** computed from their own history, including
/// the refunds — a record that reports only successes is not a record;
/// and **what they offer**, at one published price, because there is
/// nothing to negotiate.
class ProviderScreen extends ConsumerWidget {
  const ProviderScreen({required this.providerId, super.key});

  final String providerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<ProviderProfile> profile = ref.watch(
      providerProfileProvider(providerId),
    );

    return Scaffold(
      appBar: AppBar(
        title: PackText(profile.valueOrNull?.summary.displayName ?? ''),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            tooltip: 'Report this profile',
            onPressed: () => context.push('/report?subject=user&id=$providerId'),
          ),
        ],
      ),
      body: AsyncBody<ProviderProfile>(
        value: profile,
        onRetry: () => ref.invalidate(providerProfileProvider(providerId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (ProviderProfile p) => PageBody(
          onRefresh: () async =>
              ref.invalidate(providerProfileProvider(providerId)),
          children: <Widget>[
            _Header(profile: p),
            if (p.achievements.isNotEmpty) _Achievements(profile: p, lang: lang),
            _Record(record: p.record),
            _Skills(profile: p, lang: lang),
            if (p.services.isNotEmpty) _Services(profile: p, lang: lang),
            if (p.packages.isNotEmpty) _Packages(profile: p),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.profile});

  final ProviderProfile profile;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          PackText(
            profile.summary.displayName,
            style: theme.textTheme.displaySmall,
          ),
          const SizedBox(height: Space.sm),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final String l in profile.summary.languages)
                StatusChip(l.toUpperCase(), icon: Icons.translate),
            ],
          ),
          if (profile.bio != null) ...<Widget>[
            const SizedBox(height: Space.md),
            PackText(profile.bio!, style: theme.textTheme.bodyMedium),
          ],
        ],
      ),
    );
  }
}

/// What has been verified about this person.
///
/// Each credential type declares an allow-list of publishable fields in
/// the family manifest, defaulting to **empty** — a type that says
/// nothing publishes only its own label. The roll number, the claimed
/// name and the document that proved it are never here and never
/// reachable from here.
class _Achievements extends StatelessWidget {
  const _Achievements({required this.profile, required this.lang});

  final ProviderProfile profile;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      title: 'Verified',
      note: 'Checked by us against the issuing source.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          for (final Achievement a in profile.achievements)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(
                    Icons.verified_outlined,
                    size: 18,
                    color: BaseColors.verified,
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        PackText(
                          a.label(lang),
                          style: theme.textTheme.bodyMedium,
                        ),
                        if (a.fields.isNotEmpty)
                          PackText(
                            a.fields.entries
                                .map((MapEntry<String, String> e) => e.value)
                                .join(' · '),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: BaseColors.inkMuted,
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Record extends StatelessWidget {
  const _Record({required this.record});

  final TrackRecord record;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Track record',
    note: 'Their own history. Never a comparison to anyone else.',
    child: Wrap(
      spacing: Space.xl,
      runSpacing: Space.lg,
      children: <Widget>[
        Field(label: 'Completed', value: Text('${record.completed}')),
        Field(label: 'People worked with', value: Text('${record.distinctSeekers}')),
        // The one number a provider cannot talk their way into.
        Field(label: 'Came back again', value: Text('${record.repeatSeekers}')),
        // Shown, not hidden. A record that reports only successes is not
        // a record.
        Field(
          label: 'Refunded',
          value: Text('${record.refunded}'),
          tone: record.refunded > 0 ? BaseColors.caution : null,
        ),
      ],
    ),
  );
}

class _Skills extends StatelessWidget {
  const _Skills({required this.profile, required this.lang});

  final ProviderProfile profile;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      title: 'Verified skills',
      note: 'Verification is per skill, never one badge for the person.',
      child: Column(
        children: <Widget>[
          for (final VerifiedSkill s in profile.summary.ranked)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.md),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        PackText(s.label(lang), style: theme.textTheme.bodyMedium),
                        if (s.hasRecord)
                          PackText(
                            '${s.completedEngagements} completed'
                            '${s.avgRating != null ? ' · ${s.avgRating!.toStringAsFixed(1)} average' : ''}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: BaseColors.inkMuted,
                            ),
                          )
                        else
                          // "New at this" rather than an empty star row:
                          // a provider with no reviews is new, not bad,
                          // and drawing zero stars says the wrong thing.
                          PackText(
                            'Verified, no completed work yet',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: BaseColors.inkFaint,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: Space.sm),
                  if (s.tier != null)
                    StatusChip(s.tier!.neutralLabel, tone: ChipTone.verified),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _Services extends StatelessWidget {
  const _Services({required this.profile, required this.lang});

  final ProviderProfile profile;
  final String lang;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'What they offer',
    // Not a band, and not an opening bid. A published price, for a stated
    // commitment.
    note: 'One price, for a stated duration or turnaround.',
    child: Column(
      children: <Widget>[
        for (final Service s in profile.services)
          NavRow(
            title: s.skillLabel?.call(lang) ??
                s.type?.neutralLabel ??
                'Service',
            subtitle: commitmentOf(s),
            trailing: Money(s.amount),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => BookSheet(
                  providerId: profile.summary.providerId,
                  service: s,
                ),
              ),
            ),
          ),
      ],
    ),
  );

}

class _Packages extends ConsumerStatefulWidget {
  const _Packages({required this.profile});

  final ProviderProfile profile;

  @override
  ConsumerState<_Packages> createState() => _PackagesState();
}

class _PackagesState extends ConsumerState<_Packages> {
  String? _busyId;
  String? _error;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Bought together',
    // Buying a bundle moves the whole amount at once, which is a bigger
    // commitment than a single piece of work — so the screen says so
    // before the button rather than after.
    note:
        'The full amount is held when you buy. You then start each piece of '
        'work from it, one at a time.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (_error != null) ...<Widget>[
          Note(_error!, tone: ChipTone.danger),
          const SizedBox(height: Space.md),
        ],
        for (final ServicePackage p in widget.profile.packages)
          NavRow(
            title: p.title,
            subtitle:
                '${p.sessionCount} sessions'
                '${p.perSession != null ? ' · ${p.perSession!.formatCompact()} each' : ''}',
            trailing: _busyId == p.id
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Money(p.amount),
            onTap: _busyId != null ? null : () => _confirm(p),
          ),
      ],
    ),
  );

  Future<void> _confirm(ServicePackage p) async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: PackText('Buy ${p.title}?'),
        content: PackText(
          '${p.amount.formatCompact()} is held now, covering '
          '${p.sessionCount} pieces of work. You agree the goals for each '
          'one separately, as you start it.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Not now'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Buy it'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() {
      _busyId = p.id;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .purchasePackage(
            p.id,
            // Minted from the package: a double tap must not hold the
            // money twice on a path that moves the whole bundle.
            idempotencyKey: 'buy-package-${p.id}',
          );
      ref
        ..invalidate(myPackagePurchasesProvider)
        ..invalidate(moneyProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: PackText('Bought. Start the first piece from Your work.'),
          ),
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }
}
