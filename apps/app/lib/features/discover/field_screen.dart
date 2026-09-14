import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// One field, as the manifest defines it.
///
/// **Every word on this screen comes from the pack.** The kinds of work,
/// the languages, the parts of the syllabus, the price bands, the
/// calendar — none of it is written here, and adding a new field puts a
/// full page like this on screen without a line of code changing
/// (CLAUDE.md #1, #4). If you find yourself wanting to special-case a
/// field here, the abstraction has failed and that is worth saying out
/// loud rather than patching.
///
/// The price bands are shown as guidance and nothing more. There is no
/// ordering here, no cheapest-first, no "best value" — the bands say
/// what this kind of work usually costs so that a number is not a
/// surprise, which is a different job from ranking people by it
/// (CLAUDE.md #15).
class FieldScreen extends ConsumerWidget {
  const FieldScreen({required this.domainCode, super.key});

  final String domainCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Map<String, dynamic>> domain = ref.watch(
      domainProvider(domainCode),
    );

    return Scaffold(
      appBar: AppBar(
        title: PackText(
          _label(
            (domain.valueOrNull?['labels'] as Map<String, dynamic>?)?['domain'],
            lang,
            domainCode,
          ),
        ),
      ),
      body: AsyncBody<Map<String, dynamic>>(
        value: domain,
        onRetry: () => ref.invalidate(domainProvider(domainCode)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Map<String, dynamic> d) => PageBody(
          onRefresh: () async => ref.invalidate(domainProvider(domainCode)),
          children: <Widget>[
            _Kinds(domain: d, lang: lang),
            _Languages(domain: d),
            _Categories(domainCode: domainCode, lang: lang),
            _Bands(domain: d),
            _Calendar(domain: d, lang: lang),
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

/// A kind of work by its name, not its wire code ("written qa").
String _workLabel(String code) =>
    EngagementType.tryParse(code)?.neutralLabel ?? _humanize(code);

/// A code a pack gave no label for, made readable rather than shown raw.
String _humanize(String code) {
  final String spaced = code.replaceAll('_', ' ').trim();
  return spaced.isEmpty ? spaced : spaced[0].toUpperCase() + spaced.substring(1);
}

const List<String> _months = <String>[
  'January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December',
];

/// "Mains — usually around September". A month hint is a hint, and is
/// worded as one (#26: no implied intensity).
String _phaseLine(Map<String, dynamic> p, String lang) {
  final String name = FieldScreen._label(
    p['labels'],
    lang,
    _humanize((p['code'] ?? p['phase'] ?? '').toString()),
  );
  final Object? month = p['monthHint'];
  return month is int && month >= 1 && month <= 12
      ? '$name — usually around ${_months[month - 1]}'
      : name;
}

class _Kinds extends StatelessWidget {
  const _Kinds({required this.domain, required this.lang});

  final Map<String, dynamic> domain;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final List<String> types = <String>[
      for (final Object? t in (domain['engagementTypes'] as List<Object?>? ??
          const <Object?>[]))
        if (t is String) t,
    ];
    if (types.isEmpty) return const SizedBox.shrink();

    return Panel(
      title: 'What people do here',
      // No type is privileged. `document_review` is not the flagship of
      // anything unless a manifest says so, and this list simply renders
      // whatever the manifest declared, in its order.
      note: 'The kinds of work this field supports.',
      child: Wrap(
        spacing: Space.sm,
        runSpacing: Space.sm,
        children: <Widget>[
          for (final String t in types)
            StatusChip(_workLabel(t), tone: ChipTone.neutral),
        ],
      ),
    );
  }
}

class _Languages extends StatelessWidget {
  const _Languages({required this.domain});

  final Map<String, dynamic> domain;

  @override
  Widget build(BuildContext context) {
    final List<String> languages = <String>[
      for (final Object? l in (domain['languages'] as List<Object?>? ??
          const <Object?>[]))
        if (l is String) l,
    ];
    if (languages.isEmpty) return const SizedBox.shrink();

    return Panel(
      title: 'Languages',
      // Not a display setting. Someone working in Hindi cannot be served
      // by a provider who does not work in Hindi, at any price
      // (CLAUDE.md #19).
      note:
          'The languages work actually happens in here. It is part of who '
          'can be matched with you, not just what the screen says.',
      child: Wrap(
        spacing: Space.sm,
        runSpacing: Space.sm,
        children: <Widget>[
          for (final String l in languages) StatusChip(l.toUpperCase()),
        ],
      ),
    );
  }
}

class _Categories extends ConsumerWidget {
  const _Categories({required this.domainCode, required this.lang});

  final String domainCode;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(categoriesProvider(domainCode)).maybeWhen(
        data: (List<Map<String, dynamic>> list) => list.isEmpty
            ? const SizedBox.shrink()
            : Panel(
                title: 'The parts',
                note: 'What a piece of work can be about.',
                child: Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: <Widget>[
                    for (final Map<String, dynamic> c in list)
                      StatusChip(
                        FieldScreen._label(c['labels'], lang, '${c['code']}'),
                      ),
                  ],
                ),
              ),
        orElse: () => const SizedBox.shrink(),
      );
}

class _Bands extends StatelessWidget {
  const _Bands({required this.domain});

  final Map<String, dynamic> domain;

  @override
  Widget build(BuildContext context) {
    final Object? raw = domain['priceBands'];
    if (raw is! Map<String, dynamic> || raw.isEmpty) {
      return const SizedBox.shrink();
    }

    return Panel(
      title: 'What this usually costs',
      note:
          'A guide, so a price is not a surprise. Providers set their own '
          'and you are never shown them cheapest-first.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final MapEntry<String, dynamic> e in raw.entries)
            if (e.value case final List<Object?> pair when pair.length >= 2)
              Padding(
                padding: const EdgeInsets.only(bottom: Space.sm),
                child: Row(
                  children: <Widget>[
                    Expanded(
                      child: PackText(_workLabel(e.key)),
                    ),
                    // Bands arrive as integer paise like everything else
                    // on the wire (CLAUDE.md #5); nothing here does
                    // arithmetic on them.
                    Text(
                      '${(Paise.tryParse(pair[0]) ?? Paise.zero).formatCompact()}'
                      '–'
                      '${(Paise.tryParse(pair[1]) ?? Paise.zero).formatCompact()}',
                      style: const TextStyle(
                        fontFeatures: <FontFeature>[
                          FontFeature.tabularFigures(),
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

class _Calendar extends StatelessWidget {
  const _Calendar({required this.domain, required this.lang});

  final Map<String, dynamic> domain;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> phases = <Map<String, dynamic>>[
      for (final Object? p in (domain['calendar'] as List<Object?>? ??
          const <Object?>[]))
        if (p is Map<String, dynamic>) p,
    ];
    if (phases.isEmpty) return const SizedBox.shrink();

    return Panel(
      title: 'The year here',
      // Stated flatly, with no urgency attached. Copy that implies a
      // required intensity is exactly what CLAUDE.md #26 forbids, and a
      // calendar is the easiest place to slip into it.
      note: 'When things typically happen. It is not a schedule for you.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final Map<String, dynamic> p in phases)
            Padding(
              padding: const EdgeInsets.only(bottom: Space.sm),
              child: Row(
                children: <Widget>[
                  const Icon(
                    Icons.circle,
                    size: 6,
                    color: BaseColors.inkFaint,
                  ),
                  const SizedBox(width: Space.sm),
                  Expanded(
                    child: PackText(
                      _phaseLine(p, lang),
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
