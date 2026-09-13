import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models/board.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The board: open requests anyone verified can propose against.
///
/// This is how a seeker reaches someone they have never met. The listing
/// shows a budget range because a seeker has to say what they can afford
/// — but note what is *not* here and never will be: any way to order
/// proposals by price (CLAUDE.md #15).
class BoardScreen extends ConsumerWidget {
  const BoardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<BoardPost>> posts = ref.watch(boardPostsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const PackText('Open requests'),
        actions: <Widget>[
          // The free half of the board. Reachable from here rather than
          // buried, because the person who cannot pay is exactly the
          // person least likely to go looking.
          IconButton(
            icon: const Icon(Icons.help_outline),
            tooltip: 'Free questions',
            onPressed: () => context.push('/board/questions'),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _choose(context),
        icon: const Icon(Icons.add),
        label: const PackText('Ask for help'),
      ),
      body: AsyncBody<List<BoardPost>>(
        value: posts,
        onRetry: () => ref.invalidate(boardPostsProvider),
        emptyWhen: (List<BoardPost> l) => l.isEmpty,
        emptyMessage:
            'No open requests. Posting one lets people who are verified in '
            'what you need come to you.',
        builder: (List<BoardPost> list) => ListView.separated(
          padding: const EdgeInsets.all(Space.lg),
          itemCount: list.length,
          separatorBuilder: (_, _) => const SizedBox(height: Space.md),
          itemBuilder: (BuildContext context, int i) =>
              _PostCard(post: list[i]),
        ),
      ),
    );
  }
}

/// Two different things a person might mean by "ask for help", and they
/// are not variations of each other: one is free and answered by anyone
/// verified; the other holds money and produces a piece of work. Putting
/// them behind one button and guessing would get it wrong half the time.
Future<void> _choose(BuildContext context) async {
  final String? pick = await showModalBottomSheet<String>(
    context: context,
    builder: (BuildContext context) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          ListTile(
            leading: const Icon(Icons.help_outline),
            title: const PackText('Ask a question'),
            subtitle: const PackText(
              'Free. Anyone verified in the field can answer.',
            ),
            onTap: () => Navigator.of(context).pop('ask'),
          ),
          ListTile(
            leading: const Icon(Icons.work_outline),
            title: const PackText('Post a piece of work'),
            subtitle: const PackText(
              'People offer to do it. You choose one and agree the goals.',
            ),
            onTap: () => Navigator.of(context).pop('new'),
          ),
        ],
      ),
    ),
  );
  if (pick == null || !context.mounted) return;
  unawaited(context.push(pick == 'ask' ? '/board/ask' : '/board/new'));
}

class _PostCard extends StatelessWidget {
  const _PostCard({required this.post});

  final BoardPost post;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.lg),
        onTap: () => context.push('/board/${post.id}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Text(
                    post.reference,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: BaseColors.inkFaint,
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                  const Spacer(),
                  StatusChip(post.language.toUpperCase(), icon: Icons.translate),
                ],
              ),
              const SizedBox(height: Space.sm),
              PackText(
                post.description,
                style: theme.textTheme.bodyMedium,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: Space.md),
              Row(
                children: <Widget>[
                  Field(
                    label: 'Budget',
                    value: Text(
                      '${post.budgetMin.formatCompact()}–'
                      '${post.budgetMax.formatCompact()}',
                      style: const TextStyle(
                        fontFeatures: <FontFeature>[
                          FontFeature.tabularFigures(),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  StatusChip(
                    post.proposalCount == 1
                        ? '1 offer'
                        : '${post.proposalCount} offers',
                    tone: post.proposalCount > 0
                        ? ChipTone.brand
                        : ChipTone.neutral,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Asking a free question.
///
/// Three outcomes, and the third is the reason this screen exists in its
/// own right rather than as a text field on the board:
///
///   published        — it is up, providers can answer.
///   held for review  — a classifier flagged it; a person will look.
///   **distress**     — it is held, and the answer is the pack's real
///                      helpline numbers.
///
/// **There is no code path here that renders "your post was rejected"**
/// (CLAUDE.md #25). Someone reaching out at their worst moment and being
/// told their words were refused is the specific harm that rule exists to
/// prevent.
class AskScreen extends ConsumerStatefulWidget {
  const AskScreen({super.key});

  @override
  ConsumerState<AskScreen> createState() => _AskScreenState();
}

class _AskScreenState extends ConsumerState<AskScreen> {
  final TextEditingController _body = TextEditingController();
  String? _domainCode;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _result;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Map<String, dynamic>>> domains = ref.watch(
      myDomainsProvider,
    );

    if (_result != null) return _Outcome(result: _result!);

    return Scaffold(
      appBar: AppBar(title: const PackText('Ask a question')),
      body: PageBody(
        children: <Widget>[
          const Note(
            'Free, and answered by people verified in the field. Nothing is '
            'charged and nobody is obliged to answer.',
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
                _domainCode ??= list.isEmpty
                    ? null
                    : list.first['domainCode'] as String?;
                return Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: <Widget>[
                    for (final Map<String, dynamic> d in list)
                      ChoiceChip(
                        label: PackText(
                          ((d['labels'] as Map<String, dynamic>?)?[lang] ??
                                  (d['labels'] as Map<String, dynamic>?)?['en'] ??
                                  d['domainCode'])
                              .toString(),
                        ),
                        selected: _domainCode == d['domainCode'],
                        onSelected: (_) => setState(
                          () => _domainCode = d['domainCode'] as String?,
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
          Panel(
            title: 'What do you want to ask?',
            child: TextField(
              controller: _body,
              minLines: 4,
              maxLines: 10,
              decoration: const InputDecoration(
                hintText: 'Be specific — a precise question gets a precise '
                    'answer.',
              ),
            ),
          ),
          if (_error != null) Note(_error!, tone: ChipTone.danger),
          FilledButton(
            onPressed: _busy || _domainCode == null ? null : _submit,
            child: const PackText('Post the question'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Map<String, dynamic> res = await ref
          .read(repositoryProvider)
          .ask(
            domainCode: _domainCode!,
            body: _body.text.trim(),
            language: ref.read(langProvider),
          );
      ref.invalidate(questionsProvider);
      if (mounted) setState(() => _result = res);
    } catch (e) {
      if (mounted) {
        setState(
          () => _error = 'Could not post that just now. Please try again.',
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// What the person is told afterwards.
///
/// The distress branch is answered with help, never with a refusal, and
/// the helplines come from the pack — a family may ADD to the platform's
/// list but may never remove one, because distress does not respect a
/// taxonomy.
class _Outcome extends ConsumerWidget {
  const _Outcome({required this.result});

  final Map<String, dynamic> result;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final QuestionState state = QuestionState.parse(
      result['status'] as String?,
    );

    final List<SupportResource> helplines = <SupportResource>[
      for (final Object? r
          in (result['supportResources'] as List<Object?>? ??
              result['helplines'] as List<Object?>? ??
              const <Object?>[]))
        if (r is Map<String, dynamic>) SupportResource.fromJson(r),
    ];

    if (state == QuestionState.distress || helplines.isNotEmpty) {
      return Scaffold(
        appBar: AppBar(title: const PackText('We read what you wrote')),
        body: PageBody(
          children: <Widget>[
            Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  PackText(
                    'It sounds like this has been hard.',
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: Space.sm),
                  PackText(
                    'Your question has not been posted publicly. Someone here '
                    'will read it. In the meantime, these people are '
                    'available now and talking to them costs nothing.',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ),
            if (helplines.isEmpty)
              const Note(
                'If you need to talk to someone right now, please reach out '
                'to a local helpline or someone you trust.',
                tone: ChipTone.info,
              )
            else
              Panel(
                title: 'Someone to talk to',
                child: Column(
                  children: <Widget>[
                    for (final SupportResource h in helplines)
                      NavRow(
                        title: h.name,
                        subtitle: h.hours,
                        leading: const Icon(Icons.phone_outlined, size: 20),
                        trailing: SelectableText(
                          h.value,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            fontFeatures: const <FontFeature>[
                              FontFeature.tabularFigures(),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            OutlinedButton(
              onPressed: () => context.go('/home'),
              child: const PackText('Back'),
            ),
          ],
        ),
      );
    }

    final bool held = state == QuestionState.heldForReview;
    return Scaffold(
      appBar: AppBar(title: const PackText('Posted')),
      body: PageBody(
        children: <Widget>[
          Note(
            held
                ? 'Your question is with a person to look over before it goes '
                      'up. That usually takes a few hours.'
                : 'Your question is up. Anyone verified in this field can '
                      'answer it.',
            tone: held ? ChipTone.caution : ChipTone.verified,
            icon: held ? Icons.schedule : Icons.check_circle_outline,
          ),
          FilledButton(
            onPressed: () => context.go('/home'),
            child: const PackText('Done'),
          ),
        ],
      ),
    );
  }
}
