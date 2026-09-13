import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/board.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The free questions, and the people answering them.
///
/// This half of the board carries no money at all: someone asks, anyone
/// verified in that field may answer, and nothing is charged either way.
/// It exists so that a person who cannot afford an engagement is not
/// simply turned away — which is also why nothing here nudges towards
/// paying.
class QuestionsScreen extends ConsumerWidget {
  const QuestionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<BoardQuestion>> questions = ref.watch(
      questionsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Questions')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/board/ask'),
        icon: const Icon(Icons.help_outline),
        label: const PackText('Ask'),
      ),
      body: AsyncBody<List<BoardQuestion>>(
        value: questions,
        onRetry: () => ref.invalidate(questionsProvider),
        emptyWhen: (List<BoardQuestion> l) => l.isEmpty,
        emptyMessage:
            'No questions yet. Asking one costs nothing and anyone verified '
            'in the field can answer.',
        builder: (List<BoardQuestion> list) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(questionsProvider),
          child: ListView.separated(
            padding: const EdgeInsets.all(Space.lg),
            itemCount: list.length,
            separatorBuilder: (_, _) => const SizedBox(height: Space.md),
            itemBuilder: (BuildContext context, int i) =>
                _QuestionCard(question: list[i]),
          ),
        ),
      ),
    );
  }
}

class _QuestionCard extends StatelessWidget {
  const _QuestionCard({required this.question});

  final BoardQuestion question;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.lg),
        onTap: () => context.push('/board/questions/${question.id}'),
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              PackText(
                question.body,
                style: theme.textTheme.bodyMedium,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: Space.md),
              Row(
                children: <Widget>[
                  StatusChip(
                    question.language.toUpperCase(),
                    icon: Icons.translate,
                  ),
                  const Spacer(),
                  StatusChip(
                    question.answers.length == 1
                        ? '1 answer'
                        : '${question.answers.length} answers',
                    tone: question.answers.isEmpty
                        ? ChipTone.neutral
                        : ChipTone.brand,
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

/// One question, its answers, and — for a provider — the box to answer it.
class QuestionScreen extends ConsumerWidget {
  const QuestionScreen({required this.questionId, super.key});

  final String questionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<BoardQuestion> question = ref.watch(
      questionProvider(questionId),
    );
    final bool isProvider = ref.watch(authProvider).user?.isProvider ?? false;

    return Scaffold(
      appBar: AppBar(
        title: const PackText('Question'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            tooltip: 'Report a problem',
            onPressed: () =>
                context.push('/report?subject=question&id=$questionId'),
          ),
        ],
      ),
      body: AsyncBody<BoardQuestion>(
        value: question,
        onRetry: () => ref.invalidate(questionProvider(questionId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (BoardQuestion q) => PageBody(
          onRefresh: () async => ref.invalidate(questionProvider(questionId)),
          children: <Widget>[
            _Asked(question: q),
            _Answers(question: q),
            // A provider answers; a seeker reads. Held and escalated
            // questions take no answers at all — a question routed to
            // the welfare queue is being handled by a person, and a
            // stranger's advice arriving underneath it is the last thing
            // it needs (CLAUDE.md #25).
            if (isProvider && q.state == QuestionState.published)
              _AnswerBox(questionId: q.id),
          ],
        ),
      ),
    );
  }
}

class _Asked extends StatelessWidget {
  const _Asked({required this.question});

  final BoardQuestion question;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      trailing: question.askedAt == null
          ? null
          : StatusChip(DateFormat('d MMM').format(question.askedAt!)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          PackText(question.body, style: theme.textTheme.bodyLarge),
          if (question.state == QuestionState.heldForReview) ...<Widget>[
            const SizedBox(height: Space.md),
            const Note(
              'This is with a person to look over before it goes up.',
              tone: ChipTone.caution,
              icon: Icons.schedule,
            ),
          ],
        ],
      ),
    );
  }
}

class _Answers extends StatelessWidget {
  const _Answers({required this.question});

  final BoardQuestion question;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    if (question.answers.isEmpty) {
      return const Panel(
        title: 'Answers',
        child: Note(
          'Nobody has answered yet. Verified people in this field see it and '
          'can — none of them is obliged to.',
        ),
      );
    }

    return Panel(
      title: question.answers.length == 1
          ? '1 answer'
          : '${question.answers.length} answers',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          for (final QuestionAnswer a in question.answers)
            Container(
              margin: const EdgeInsets.only(bottom: Space.md),
              padding: const EdgeInsets.all(Space.md),
              decoration: BoxDecoration(
                color: BaseColors.surfaceSunk,
                borderRadius: BorderRadius.circular(Radii.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: PackText(
                          a.providerName ?? 'A verified provider',
                          style: theme.textTheme.titleSmall,
                        ),
                      ),
                      if (a.answeredAt != null)
                        PackText(
                          DateFormat('d MMM').format(a.answeredAt!),
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: BaseColors.inkFaint,
                          ),
                        ),
                    ],
                  ),
                  const SizedBox(height: Space.sm),
                  PackText(a.body, style: theme.textTheme.bodyMedium),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _AnswerBox extends ConsumerStatefulWidget {
  const _AnswerBox({required this.questionId});

  final String questionId;

  @override
  ConsumerState<_AnswerBox> createState() => _AnswerBoxState();
}

class _AnswerBoxState extends ConsumerState<_AnswerBox> {
  final TextEditingController _body = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Answer this',
    // Answering is unpaid and stays unpaid. Saying so removes the
    // question of whether this is a sales channel.
    note:
        'Free, and it stays free. Answering well is how people come to '
        'know your name here.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextField(
          controller: _body,
          minLines: 3,
          maxLines: 10,
          decoration: const InputDecoration(
            hintText: 'Answer the question that was asked.',
          ),
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: Space.md),
          Note(_error!, tone: ChipTone.danger),
        ],
        const SizedBox(height: Space.lg),
        FilledButton(
          onPressed: _busy ? null : _send,
          child: const PackText('Post the answer'),
        ),
      ],
    ),
  );

  Future<void> _send() async {
    final String body = _body.text.trim();
    if (body.isEmpty) {
      setState(() => _error = 'Write an answer first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).answerQuestion(widget.questionId, body);
      _body.clear();
      ref
        ..invalidate(questionProvider(widget.questionId))
        ..invalidate(questionsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
