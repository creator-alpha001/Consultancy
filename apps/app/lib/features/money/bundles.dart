import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Bundles bought and not yet spent.
///
/// Buying a bundle moves money once, into the seeker's wallet; escrow is
/// still held per session, when each is drawn. That is why a bundle sits
/// here rather than under "held": nothing is held against agreed goals
/// yet, because the goals for session four do not exist.
///
/// Drawing one asks for the field, the part and the language, because
/// the category is chosen per session — five reviews can be spent on
/// five different papers, and fixing it at purchase would make a bundle
/// less useful than buying singly.
class Bundles extends ConsumerWidget {
  const Bundles({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(myPackagePurchasesProvider).maybeWhen(
        data: (List<Map<String, dynamic>> list) {
          final List<Map<String, dynamic>> live = <Map<String, dynamic>>[
            for (final Map<String, dynamic> p in list)
              if (((p['sessionsLeft'] as num?) ?? 0) > 0) p,
          ];
          if (live.isEmpty) return const SizedBox.shrink();

          return Panel(
            title: live.length == 1 ? 'Your bundle' : 'Your bundles',
            note:
                'Already paid for. Each one you start holds its own escrow '
                'against its own goals.',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                for (final Map<String, dynamic> p in live)
                  _BundleRow(purchase: p),
              ],
            ),
          );
        },
        orElse: () => const SizedBox.shrink(),
      );
}

class _BundleRow extends ConsumerStatefulWidget {
  const _BundleRow({required this.purchase});

  final Map<String, dynamic> purchase;

  @override
  ConsumerState<_BundleRow> createState() => _BundleRowState();
}

class _BundleRowState extends ConsumerState<_BundleRow> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Map<String, dynamic> p = widget.purchase;
    final int left = ((p['sessionsLeft'] as num?) ?? 0).toInt();
    final int total = ((p['sessionsTotal'] as num?) ?? 0).toInt();

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: PackText(
                  (p['title'] ?? 'Bundle').toString(),
                  style: theme.textTheme.titleSmall,
                ),
              ),
              StatusChip(
                '$left of $total left',
                tone: ChipTone.brand,
              ),
            ],
          ),
          const SizedBox(height: Space.xs),
          Row(
            children: <Widget>[
              PackText(
                'Each one already paid',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: BaseColors.inkMuted,
                ),
              ),
              const Spacer(),
              Money(
                Paise.tryParse(p['perSessionPaise']) ?? Paise.zero,
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: Space.sm),
            Note(_error!, tone: ChipTone.danger),
          ],
          const SizedBox(height: Space.sm),
          OutlinedButton(
            onPressed: _busy ? null : _draw,
            child: const PackText('Start one of these'),
          ),
        ],
      ),
    );
  }

  Future<void> _draw() async {
    final _DrawChoice? choice = await showModalBottomSheet<_DrawChoice>(
      context: context,
      isScrollControlled: true,
      builder: (BuildContext context) => const _DrawSheet(),
    );
    if (choice == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Engagement e = await ref
          .read(repositoryProvider)
          .engagementFromPackage(
            widget.purchase['id'].toString(),
            domainCode: choice.domainCode,
            categoryId: choice.categoryId,
            language: choice.language,
            // Minted from the purchase and the count already drawn: a
            // retry after the app is killed must not spend two sessions
            // out of the bundle (CLAUDE.md #10).
            idempotencyKey:
                'draw-${widget.purchase['id']}-${widget.purchase['sessionsUsed']}',
          );
      ref
        ..invalidate(myPackagePurchasesProvider)
        ..invalidate(engagementsProvider);
      if (mounted) unawaited(context.push('/work/${e.id}/agenda'));
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _DrawChoice {
  const _DrawChoice({
    required this.domainCode,
    required this.categoryId,
    required this.language,
  });

  final String domainCode;
  final String categoryId;
  final String language;
}

/// Which field, which part, which language — asked once, per session.
class _DrawSheet extends ConsumerStatefulWidget {
  const _DrawSheet();

  @override
  ConsumerState<_DrawSheet> createState() => _DrawSheetState();
}

class _DrawSheetState extends ConsumerState<_DrawSheet> {
  String? _domainCode;
  String? _categoryId;
  String? _language;

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final List<Map<String, dynamic>> domains =
        ref.watch(myDomainsProvider).valueOrNull ??
        const <Map<String, dynamic>>[];
    if (_domainCode == null && domains.isNotEmpty) {
      _domainCode = domains.first['domainCode'] as String?;
      _language = domains.first['workingLanguage'] as String?;
    }

    final List<Map<String, dynamic>> categories = _domainCode == null
        ? const <Map<String, dynamic>>[]
        : ref.watch(categoriesProvider(_domainCode!)).valueOrNull ??
              const <Map<String, dynamic>>[];
    final List<String> languages = _domainCode == null
        ? const <String>[]
        : ref.watch(workingLanguagesProvider(_domainCode!)).valueOrNull ??
              const <String>[];

    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(Space.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Panel(
              title: 'Which field?',
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: <Widget>[
                  for (final Map<String, dynamic> d in domains)
                    ChoiceChip(
                      label: PackText(
                        _label(d['labels'], lang, '${d['domainCode']}'),
                      ),
                      selected: _domainCode == d['domainCode'],
                      onSelected: (_) => setState(() {
                        _domainCode = d['domainCode'] as String?;
                        _categoryId = null;
                        _language = d['workingLanguage'] as String?;
                      }),
                    ),
                ],
              ),
            ),
            Panel(
              title: 'Which part?',
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: <Widget>[
                  for (final Map<String, dynamic> c in categories)
                    ChoiceChip(
                      label: PackText(_label(c['labels'], lang, '${c['code']}')),
                      selected: _categoryId == c['id'],
                      onSelected: (_) =>
                          setState(() => _categoryId = c['id'] as String?),
                    ),
                ],
              ),
            ),
            Panel(
              title: 'In which language?',
              // A matching dimension, not a display preference
              // (CLAUDE.md #19).
              note: 'The language the work itself happens in.',
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: <Widget>[
                  for (final String l in languages)
                    ChoiceChip(
                      label: Text(l.toUpperCase()),
                      selected: _language == l,
                      onSelected: (_) => setState(() => _language = l),
                    ),
                ],
              ),
            ),
            FilledButton(
              onPressed:
                  _domainCode == null ||
                      _categoryId == null ||
                      _language == null
                  ? null
                  : () => Navigator.of(context).pop(
                      _DrawChoice(
                        domainCode: _domainCode!,
                        categoryId: _categoryId!,
                        language: _language!,
                      ),
                    ),
              child: const PackText('Use one session'),
            ),
          ],
        ),
      ),
    );
  }

  static String _label(Object? labels, String lang, String fallback) {
    if (labels is Map<String, dynamic>) {
      final Object? v = labels[lang] ?? labels['en'];
      if (v is String) return v;
    }
    return fallback;
  }
}
