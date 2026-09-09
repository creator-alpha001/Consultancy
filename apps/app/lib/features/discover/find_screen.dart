import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models/provider.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The filters that actually gate matching.
///
/// Skill, language and category — the same three the API intersects when
/// it decides who may be shown. There is deliberately **no sort control**
/// of any kind here, and above all no price sort (CLAUDE.md #15): that
/// single decision is what makes this a marketplace for quality rather
/// than a reverse auction.
class ProviderQuery {
  const ProviderQuery({this.domainCode, this.language, this.text});

  final String? domainCode;
  final String? language;
  final String? text;

  ProviderQuery copyWith({
    String? domainCode,
    String? language,
    String? text,
    bool clearDomain = false,
    bool clearLanguage = false,
  }) => ProviderQuery(
    domainCode: clearDomain ? null : (domainCode ?? this.domainCode),
    language: clearLanguage ? null : (language ?? this.language),
    text: text ?? this.text,
  );
}

final StateProvider<ProviderQuery> providerQueryProvider =
    StateProvider<ProviderQuery>((Ref ref) => const ProviderQuery());

final FutureProvider<List<ProviderSummary>> providerResultsProvider =
    FutureProvider<List<ProviderSummary>>((Ref ref) {
      final ProviderQuery q = ref.watch(providerQueryProvider);
      return ref
          .watch(repositoryProvider)
          .providers(
            domainCode: q.domainCode,
            language: q.language,
            query: q.text,
          );
    });

class FindScreen extends ConsumerWidget {
  const FindScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final ProviderQuery query = ref.watch(providerQueryProvider);
    final AsyncValue<List<ProviderSummary>> results = ref.watch(
      providerResultsProvider,
    );
    final AsyncValue<Catalogue> catalogue = ref.watch(catalogueProvider);

    // The vocabulary is the platform's here, not a family's: results can
    // span several fields at once, and dressing the screen in one
    // family's word would be a claim about what is on it.
    final String providerWord = Vocab.platform.provider(lang).toLowerCase();

    return Scaffold(
      appBar: AppBar(title: PackText('Find a $providerWord')),
      body: Column(
        children: <Widget>[
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.lg, 0, Space.lg, Space.md),
            child: Column(
              children: <Widget>[
                TextField(
                  decoration: InputDecoration(
                    hintText: 'Search by name or skill',
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                    suffixIcon: (query.text ?? '').isEmpty
                        ? null
                        : IconButton(
                            icon: const Icon(Icons.close),
                            tooltip: 'Clear the search',
                            onPressed: () => ref
                                .read(providerQueryProvider.notifier)
                                .state = query.copyWith(text: ''),
                          ),
                  ),
                  onSubmitted: (String v) => ref
                      .read(providerQueryProvider.notifier)
                      .state = query.copyWith(text: v),
                ),
                const SizedBox(height: Space.sm),
                catalogue.maybeWhen(
                  data: (Catalogue c) => _Filters(catalogue: c, lang: lang),
                  orElse: () => const SizedBox.shrink(),
                ),
              ],
            ),
          ),
          Expanded(
            child: AsyncBody<List<ProviderSummary>>(
              value: results,
              onRetry: () => ref.invalidate(providerResultsProvider),
              emptyWhen: (List<ProviderSummary> l) => l.isEmpty,
              emptyMessage:
                  'Nobody matches those filters yet. Widening the language '
                  'or the field is usually what helps — a person is only '
                  'listed where they have been verified.',
              builder: (List<ProviderSummary> list) => ListView.separated(
                padding: const EdgeInsets.fromLTRB(
                  Space.lg,
                  0,
                  Space.lg,
                  Space.xxl,
                ),
                itemCount: list.length,
                separatorBuilder: (_, _) => const SizedBox(height: Space.md),
                itemBuilder: (BuildContext context, int i) =>
                    ProviderCard(summary: list[i], lang: lang),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Filters extends ConsumerWidget {
  const _Filters({required this.catalogue, required this.lang});

  final Catalogue catalogue;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ProviderQuery q = ref.watch(providerQueryProvider);
    final List<DomainListing> domains = catalogue.allDomains;

    // Every language any listed domain can be worked in. Language is a
    // first-class matching dimension everywhere (CLAUDE.md #19), so it
    // is a filter here rather than a detail on a profile.
    final Set<String> languages = <String>{
      for (final DomainListing d in domains) ...d.languages,
    };

    return SizedBox(
      height: kTouchTarget,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: <Widget>[
          for (final DomainListing d in domains)
            Padding(
              padding: const EdgeInsets.only(right: Space.sm),
              child: FilterChip(
                label: PackText(d.label(lang)),
                selected: q.domainCode == d.code,
                onSelected: (bool on) =>
                    ref.read(providerQueryProvider.notifier).state = on
                    ? q.copyWith(domainCode: d.code)
                    : q.copyWith(clearDomain: true),
              ),
            ),
          const SizedBox(width: Space.sm),
          for (final String l in languages)
            Padding(
              padding: const EdgeInsets.only(right: Space.sm),
              child: FilterChip(
                label: Text(l.toUpperCase()),
                selected: q.language == l,
                onSelected: (bool on) =>
                    ref.read(providerQueryProvider.notifier).state = on
                    ? q.copyWith(language: l)
                    : q.copyWith(clearLanguage: true),
              ),
            ),
        ],
      ),
    );
  }
}

/// One person in a list.
///
/// **What this card deliberately does not do.** The web app's version
/// repeated "No reviews yet / 0 completed" under all fourteen verified
/// skills, which buried the person under their own metadata. So: the
/// skills with a real track record come first, at most three are shown,
/// and a count stands in for the rest.
class ProviderCard extends StatelessWidget {
  const ProviderCard({required this.summary, required this.lang, super.key});

  final ProviderSummary summary;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<VerifiedSkill> top = summary.ranked.take(3).toList();
    final int more = summary.skills.length - top.length;

    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.lg),
        onTap: () => context.push('/providers/${summary.providerId}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: PackText(
                      summary.displayName,
                      style: theme.textTheme.titleLarge,
                    ),
                  ),
                  if (summary.completedTotal > 0)
                    StatusChip(
                      '${summary.completedTotal} completed',
                      tone: ChipTone.verified,
                      icon: Icons.check_circle_outline,
                    ),
                ],
              ),
              const SizedBox(height: Space.sm),
              Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: <Widget>[
                  for (final String l in summary.languages)
                    StatusChip(l.toUpperCase(), icon: Icons.translate),
                ],
              ),
              const SizedBox(height: Space.md),
              for (final VerifiedSkill s in top)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.xs),
                  child: Row(
                    children: <Widget>[
                      Expanded(
                        child: PackText(
                          s.label(lang),
                          style: theme.textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: Space.sm),
                      // Tier is PER SKILL, never global. A person can be
                      // experienced at one thing and unverified at
                      // another, and a single badge would erase that.
                      if (s.tier != null)
                        PackText(
                          s.tier!.neutralLabel,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: BaseColors.inkMuted,
                          ),
                        ),
                    ],
                  ),
                ),
              if (more > 0)
                PackText(
                  '+ $more more verified',
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: BaseColors.inkFaint,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
