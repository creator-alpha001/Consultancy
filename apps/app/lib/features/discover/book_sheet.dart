import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/provider.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Booking, which is deliberately not a negotiation.
///
/// The price is the one the provider published. There is no field to
/// offer less and no counter-offer, because a marketplace where the first
/// interaction is haggling is a marketplace that competes on price
/// (CLAUDE.md #15).
///
/// What the seeker actually chooses here are the three things the API
/// will check when it decides whether this pairing is allowed at all: the
/// field, the part of it, and the language the work happens in.
class BookSheet extends ConsumerStatefulWidget {
  const BookSheet({required this.providerId, required this.service, super.key});

  final String providerId;
  final Service service;

  @override
  ConsumerState<BookSheet> createState() => _BookSheetState();
}

class _BookSheetState extends ConsumerState<BookSheet> {
  String? _domainCode;
  String? _categoryId;
  String? _language;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String lang = ref.watch(langProvider);
    final Service s = widget.service;
    final AsyncValue<List<Map<String, dynamic>>> domains = ref.watch(
      myDomainsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Book')),
      body: PageBody(
        children: <Widget>[
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Field(
                  label: 'Price',
                  value: Money(s.amount, style: theme.textTheme.displaySmall),
                ),
                const SizedBox(height: Space.md),
                Field(label: 'What you get', value: PackText(commitmentOf(s))),
              ],
            ),
          ),

          const Note(
            'Nothing is taken yet. You agree the goals in writing first, and '
            'your money is then held until you confirm they were met.',
            icon: Icons.lock_outline,
          ),

          Panel(
            title: 'Where does this belong?',
            note:
                'A person is verified per field and per skill, so this '
                'decides who is allowed to work on it.',
            child: domains.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (Object e, _) => const Note(
                'Could not load your fields.',
                tone: ChipTone.danger,
              ),
              data: (List<Map<String, dynamic>> list) {
                if (list.isEmpty) {
                  return const Note(
                    'You are not in any field yet. Add one from Home and this '
                    'will fill in.',
                    tone: ChipTone.caution,
                  );
                }
                // A seeker has MANY active domains (CLAUDE.md #6). The
                // primary one is a default, never an assumption that it
                // is the only one.
                _domainCode ??=
                    list.firstWhere(
                          (Map<String, dynamic> d) => d['isPrimary'] == true,
                          orElse: () => list.first,
                        )['domainCode']
                        as String?;

                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Wrap(
                      spacing: Space.sm,
                      runSpacing: Space.sm,
                      children: <Widget>[
                        for (final Map<String, dynamic> d in list)
                          ChoiceChip(
                            label: PackText(_labelOf(d['labels'], lang, '${d['domainCode']}')),
                            selected: _domainCode == d['domainCode'],
                            onSelected: (_) => setState(() {
                              _domainCode = d['domainCode'] as String?;
                              _categoryId = null;
                              _language = d['workingLanguage'] as String?;
                            }),
                          ),
                      ],
                    ),
                    if (_domainCode != null) ...<Widget>[
                      const SizedBox(height: Space.lg),
                      _CategoryPicker(
                        domainCode: _domainCode!,
                        lang: lang,
                        selected: _categoryId,
                        onPick: (String id) => setState(() => _categoryId = id),
                      ),
                      const SizedBox(height: Space.lg),
                      _LanguagePicker(
                        domainCode: _domainCode!,
                        selected: _language,
                        onPick: (String l) => setState(() => _language = l),
                      ),
                    ],
                  ],
                );
              },
            ),
          ),

          if (_error != null) Note(_error!, tone: ChipTone.danger),

          FilledButton(
            onPressed: _canSubmit && !_busy ? _create : null,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const PackText('Continue to the goals'),
          ),
          PackText(
            'Next you write what you want out of this. Nothing is charged '
            'until that is agreed and locked.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: BaseColors.inkMuted,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  bool get _canSubmit =>
      _domainCode != null && _categoryId != null && _language != null;

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Engagement e = await ref
          .read(repositoryProvider)
          .createEngagement(
            providerId: widget.providerId,
            domainCode: _domainCode!,
            categoryId: _categoryId!,
            engagementType:
                widget.service.type?.wire ?? EngagementType.documentReview.wire,
            language: _language!,
            amount: widget.service.amount,
            serviceId: widget.service.id.isEmpty ? null : widget.service.id,
          );
      if (!mounted) return;
      ref.invalidate(engagementsProvider);
      // Straight to the agenda. An engagement sitting in draft with no
      // goals is a dead end, and a dead end is what makes people abandon.
      context.go('/work/${e.id}/agenda');
    } on ApiException catch (err) {
      // Shown exactly as the API localised it, never parsed.
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

String commitmentOf(Service s) {
  if (s.durationMinutes != null) return '${s.durationMinutes} minutes, live';
  if (s.turnaroundHours != null) return 'Back within ${s.turnaroundHours} hours';
  return s.type?.neutralLabel ?? '';
}

String _labelOf(Object? labels, String lang, String fallback) {
  if (labels is Map<String, dynamic>) {
    final Object? v = labels[lang] ?? labels['en'];
    if (v is String) return v;
  }
  return fallback;
}

class _CategoryPicker extends ConsumerWidget {
  const _CategoryPicker({
    required this.domainCode,
    required this.lang,
    required this.selected,
    required this.onPick,
  });

  final String domainCode;
  final String lang;
  final String? selected;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Map<String, dynamic>>> cats = ref.watch(
      categoriesProvider(domainCode),
    );
    return cats.when(
      loading: () => const LinearProgressIndicator(),
      error: (Object e, _) => const Note(
        'Could not load the parts of this field.',
        tone: ChipTone.danger,
      ),
      data: (List<Map<String, dynamic>> list) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          PackText(
            'Which part?',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: BaseColors.inkMuted),
          ),
          const SizedBox(height: Space.sm),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final Map<String, dynamic> c in list)
                ChoiceChip(
                  label: PackText(_labelOf(c['labels'], lang, '${c['code']}')),
                  selected: selected == c['id'],
                  onSelected: (_) => onPick(c['id'] as String),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LanguagePicker extends ConsumerWidget {
  const _LanguagePicker({
    required this.domainCode,
    required this.selected,
    required this.onPick,
  });

  final String domainCode;
  final String? selected;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<String>> langs = ref.watch(
      workingLanguagesProvider(domainCode),
    );
    return langs.when(
      loading: () => const LinearProgressIndicator(),
      error: (Object e, _) => const SizedBox.shrink(),
      data: (List<String> list) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          PackText(
            'In which language?',
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: BaseColors.inkMuted),
          ),
          const SizedBox(height: 2),
          // Not a display preference — a matching dimension. Someone
          // working in Hindi cannot be served by a Hindi-incapable
          // provider (CLAUDE.md #19), so it is chosen here and enforced
          // by the API.
          PackText(
            'This is matched, not translated.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: BaseColors.inkFaint),
          ),
          const SizedBox(height: Space.sm),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final String l in list)
                ChoiceChip(
                  label: Text(l.toUpperCase()),
                  selected: selected == l,
                  onSelected: (_) => onPick(l),
                ),
            ],
          ),
        ],
      ),
    );
  }
}
