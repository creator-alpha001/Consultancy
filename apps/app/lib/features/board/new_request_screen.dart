import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/board.dart';
import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Posting a paid request.
///
/// This is how a seeker reaches someone they have never met: they say
/// what they need and people verified in it come to them, rather than
/// the seeker having to know who to look for.
///
/// **The budget is a range, and it is not an invitation to undercut.**
/// Proposals are never ordered by price at any layer (CLAUDE.md #15), so
/// a range here is a statement of what is affordable, not the opening
/// move in an auction. The screen says as much.
class NewRequestScreen extends ConsumerStatefulWidget {
  const NewRequestScreen({super.key});

  @override
  ConsumerState<NewRequestScreen> createState() => _NewRequestScreenState();
}

class _NewRequestScreenState extends ConsumerState<NewRequestScreen> {
  final TextEditingController _description = TextEditingController();
  final TextEditingController _min = TextEditingController();
  final TextEditingController _max = TextEditingController();
  String? _domainCode;
  String? _categoryId;
  String? _language;
  EngagementType _type = EngagementType.documentReview;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _description.dispose();
    _min.dispose();
    _max.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Map<String, dynamic>>> domains = ref.watch(
      myDomainsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Ask for help')),
      body: PageBody(
        children: <Widget>[
          const Note(
            'People verified in what you need will see this and can offer. '
            'Nothing is charged until you choose one and agree the goals.',
          ),

          Panel(
            title: 'Which field?',
            child: domains.when(
              loading: () => const LinearProgressIndicator(),
              error: (Object e, _) => const Note(
                'Could not load your fields.',
                tone: ChipTone.danger,
              ),
              data: (List<Map<String, dynamic>> list) {
                if (list.isEmpty) {
                  return const Note(
                    'You are not in any field yet.',
                    tone: ChipTone.caution,
                  );
                }
                _domainCode ??= list.first['domainCode'] as String?;
                _language ??= list.first['workingLanguage'] as String?;
                return Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: <Widget>[
                    for (final Map<String, dynamic> d in list)
                      ChoiceChip(
                        label: PackText(_label(d['labels'], lang, '${d['domainCode']}')),
                        selected: _domainCode == d['domainCode'],
                        onSelected: (_) => setState(() {
                          _domainCode = d['domainCode'] as String?;
                          _categoryId = null;
                          _language = d['workingLanguage'] as String?;
                        }),
                      ),
                  ],
                );
              },
            ),
          ),

          if (_domainCode != null) ...<Widget>[
            _Categories(
              domainCode: _domainCode!,
              lang: lang,
              selected: _categoryId,
              onPick: (String id) => setState(() => _categoryId = id),
            ),
            _Languages(
              domainCode: _domainCode!,
              selected: _language,
              onPick: (String l) => setState(() => _language = l),
            ),
          ],

          Panel(
            title: 'What kind of work?',
            child: Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              children: <Widget>[
                for (final EngagementType t in EngagementType.values)
                  ChoiceChip(
                    label: PackText(t.neutralLabel),
                    selected: _type == t,
                    onSelected: (_) => setState(() => _type = t),
                  ),
              ],
            ),
          ),

          Panel(
            title: 'What do you need?',
            note:
                'Specific gets better offers. "Review my last three answers '
                'for structure" beats "help with writing".',
            child: TextField(
              controller: _description,
              minLines: 4,
              maxLines: 10,
            ),
          ),

          Panel(
            title: 'What can you afford?',
            // The rule, said once and plainly. Someone typing a range is
            // entitled to know it will not be used to sort them a list
            // cheapest-first.
            note:
                'A range, so people know whether to offer. Offers are never '
                'shown to you cheapest-first — you will not be nudged '
                'towards the lowest one.',
            child: Row(
              children: <Widget>[
                Expanded(
                  child: TextField(
                    controller: _min,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'From',
                      prefixText: '₹ ',
                    ),
                  ),
                ),
                const SizedBox(width: Space.md),
                Expanded(
                  child: TextField(
                    controller: _max,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Up to',
                      prefixText: '₹ ',
                    ),
                  ),
                ),
              ],
            ),
          ),

          if (_error != null) Note(_error!, tone: ChipTone.danger),

          FilledButton(
            onPressed: _busy || !_ready ? null : _post,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const PackText('Post the request'),
          ),
        ],
      ),
    );
  }

  bool get _ready =>
      _domainCode != null &&
      _categoryId != null &&
      _language != null &&
      _description.text.trim().isNotEmpty;

  static String _label(Object? labels, String lang, String fallback) {
    if (labels is Map<String, dynamic>) {
      final Object? v = labels[lang] ?? labels['en'];
      if (v is String) return v;
    }
    return fallback;
  }

  Future<void> _post() async {
    final int? min = int.tryParse(_min.text.trim());
    final int? max = int.tryParse(_max.text.trim());
    if (min == null || max == null || min <= 0 || max < min) {
      setState(() => _error = 'Give a range, lowest first.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final BoardPost post = await ref
          .read(repositoryProvider)
          .createBoardPost(
            domainCode: _domainCode!,
            categoryId: _categoryId!,
            engagementType: _type.wire,
            language: _language!,
            description: _description.text.trim(),
            // Rupees in, paise out — converted once, at the edge.
            budgetMin: Paise(min * 100),
            budgetMax: Paise(max * 100),
          );
      ref.invalidate(boardPostsProvider);
      if (mounted) context.go('/board/${post.id}');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Categories extends ConsumerWidget {
  const _Categories({
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
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(categoriesProvider(domainCode)).maybeWhen(
        data: (List<Map<String, dynamic>> list) => Panel(
          title: 'Which part?',
          child: Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final Map<String, dynamic> c in list)
                ChoiceChip(
                  label: PackText(
                    _NewRequestScreenState._label(
                      c['labels'],
                      lang,
                      '${c['code']}',
                    ),
                  ),
                  selected: selected == c['id'],
                  onSelected: (_) => onPick(c['id'] as String),
                ),
            ],
          ),
        ),
        orElse: () => const SizedBox.shrink(),
      );
}

class _Languages extends ConsumerWidget {
  const _Languages({
    required this.domainCode,
    required this.selected,
    required this.onPick,
  });

  final String domainCode;
  final String? selected;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(workingLanguagesProvider(domainCode)).maybeWhen(
        data: (List<String> list) => Panel(
          title: 'In which language?',
          // A matching dimension, not a display preference: a provider
          // who cannot work in it cannot offer at all (CLAUDE.md #19).
          note: 'Only people who work in this will see your request.',
          child: Wrap(
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
        ),
        orElse: () => const SizedBox.shrink(),
      );
}
