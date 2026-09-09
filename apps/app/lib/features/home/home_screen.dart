import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../pack/label.dart';
import '../../pack/pack.dart';
import '../../pack/plural.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The seeker's home.
///
/// Renders the published catalogue: every family, and the domains under
/// it. Note what it does not do — pick a family and dress the whole
/// screen in it. A person may be preparing for an exam, applying to a
/// university and sorting out a tax question at the same time
/// (CLAUDE.md #6), so a screen showing several families renders the
/// platform's own neutral vocabulary and accent, and each CARD carries
/// its family's colour inside a [FamilyScope].
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Catalogue> catalogue = ref.watch(catalogueProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Sankalp')),
      body: AsyncBody<Catalogue>(
        value: catalogue,
        onRetry: () => ref.invalidate(catalogueProvider),
        emptyWhen: (Catalogue c) => c.families.isEmpty,
        emptyMessage:
            'No fields are open yet. A field appears here once it has '
            'people verified to give guidance in it.',
        builder: (Catalogue c) => ListView(
          padding: const EdgeInsets.all(Space.lg),
          children: <Widget>[
            const _QuickLinks(),
            const SizedBox(height: Space.lg),
            PackText(
              'Fields open on Sankalp',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: Space.md),
            for (int i = 0; i < c.families.length; i++) ...<Widget>[
              if (i > 0) const SizedBox(height: Space.md),
              _FamilyCard(family: c.families[i], lang: lang),
            ],
            const SizedBox(height: Space.xxl),
          ],
        ),
      ),
    );
  }
}

class _FamilyCard extends StatelessWidget {
  const _FamilyCard({required this.family, required this.lang});

  final CatalogueFamily family;
  final String lang;

  @override
  Widget build(BuildContext context) {
    // The card is the subtree that belongs to ONE family, so this is
    // exactly where its accent applies — and no further.
    return FamilyScope(
      family: family.theme,
      child: Builder(
        builder: (BuildContext context) {
          final BrandTokens brand = BrandTokens.of(context);
          final ThemeData theme = Theme.of(context);

          return Card(
            child: Padding(
              padding: const EdgeInsets.all(Space.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Container(
                        width: Space.sm,
                        height: Space.xl,
                        decoration: BoxDecoration(
                          color: brand.brand,
                          borderRadius: BorderRadius.circular(Radii.xs),
                        ),
                      ),
                      const SizedBox(width: Space.md),
                      Expanded(
                        child: PackText(
                          family.label(lang),
                          style: theme.textTheme.titleLarge,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.sm),
                  PackText(
                    // The count and the noun both come from the pack, and
                    // the plural rule follows the noun's script — never
                    // `${word}s`. See pack/plural.dart.
                    Plural.count(family.domains.length, _fieldWord, lang),
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: BaseColors.inkMuted,
                    ),
                  ),
                  const SizedBox(height: Space.md),
                  Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: <Widget>[
                      for (final DomainListing d in family.domains)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: Space.md,
                            vertical: Space.sm,
                          ),
                          decoration: BoxDecoration(
                            color: brand.brandSoft,
                            border: Border.all(color: brand.brandLine),
                            borderRadius: BorderRadius.circular(Radii.pill),
                          ),
                          child: PackText(
                            d.label(lang),
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: brand.brandSoftInk,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// "Field" is the platform's own word for a domain — core vocabulary,
/// not a family's — so it is a literal here rather than something read
/// from a manifest. It moves to the ARB catalogue with the rest of the
/// interface chrome.
const Label _fieldWord = Label(<String, String>{'en': 'field'});

/// The three places that are not tabs but are asked for often enough to
/// need one tap: the open board, the money, and a person's own progress.
class _QuickLinks extends StatelessWidget {
  const _QuickLinks();

  @override
  Widget build(BuildContext context) => Panel(
    padding: const EdgeInsets.symmetric(vertical: Space.sm, horizontal: Space.md),
    child: Column(
      children: <Widget>[
        NavRow(
          title: 'Ask for help',
          subtitle: 'Post what you need and let people come to you',
          leading: const Icon(Icons.forum_outlined, size: 20),
          onTap: () => context.push('/board'),
        ),
        NavRow(
          title: 'Your progress',
          subtitle: 'Your work compared with your own earlier work',
          leading: const Icon(Icons.trending_up, size: 20),
          onTap: () => context.push('/progress'),
        ),
        NavRow(
          title: 'Money',
          subtitle: 'What is held, spent and refunded',
          leading: const Icon(Icons.account_balance_wallet_outlined, size: 20),
          onTap: () => context.push('/money'),
        ),
      ],
    ),
  );
}
