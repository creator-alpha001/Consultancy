import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/trust.dart';
import '../../api/models/user.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Leaving a review, and reading the ones already left.
///
/// **The dimensions are family data**, and they are not an assessment
/// template. A template grades the *work* against a category rubric
/// (CLAUDE.md #16); these describe what the person was like to work
/// with — "told me the hard truth", "on time". A family that declares
/// none gets a single overall rating and this screen shows exactly that,
/// with no invented scale.
///
/// **There is a right of reply.** One, by the person the review is
/// about, append-only. A review the reviewed party cannot answer is a
/// weapon; one they could rewrite would be worth nothing.
class ReviewScreen extends ConsumerStatefulWidget {
  const ReviewScreen({required this.engagementId, super.key});

  final String engagementId;

  @override
  ConsumerState<ReviewScreen> createState() => _ReviewScreenState();
}

class _ReviewScreenState extends ConsumerState<ReviewScreen> {
  final TextEditingController _body = TextEditingController();
  final Map<String, int> _dimensions = <String, int>{};
  int _rating = 0;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(widget.engagementId),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Review')),
      body: AsyncBody<Engagement>(
        value: engagement,
        onRetry: () => ref.invalidate(engagementProvider(widget.engagementId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Engagement e) {
          final AsyncValue<List<ReviewDimension>> dimensions = ref.watch(
            reviewDimensionsProvider(e.familyCode),
          );
          final AsyncValue<List<Review>> existing = ref.watch(
            engagementReviewsProvider(e.id),
          );
          final User? me = ref.watch(authProvider).user;

          // Already reviewed by this person? Then this screen is a record,
          // not a form — a review cannot be rewritten.
          final Review? mine = existing.valueOrNull
              ?.where((Review r) => r.reviewerId == me?.id)
              .firstOrNull;

          return FamilyScope(
            family:
                ref
                    .watch(catalogueProvider)
                    .valueOrNull
                    ?.family(e.familyCode)
                    ?.theme ??
                FamilyTheme.none,
            child: PageBody(
              onRefresh: () async =>
                  ref.invalidate(engagementReviewsProvider(e.id)),
              children: <Widget>[
                if (mine == null)
                  ..._form(context, e, dimensions, lang)
                else
                  Panel(
                    title: 'You reviewed this',
                    note: 'A review cannot be edited once left.',
                    child: _ReviewBody(review: mine, dimensions: dimensions, lang: lang),
                  ),

                existing.when(
                  loading: () => const Panel(child: LinearProgressIndicator()),
                  error: (Object err, _) => const SizedBox.shrink(),
                  data: (List<Review> all) {
                    final List<Review> others = all
                        .where((Review r) => r.reviewerId != me?.id)
                        .toList();
                    if (others.isEmpty) return const SizedBox.shrink();
                    return Panel(
                      title: 'What they said about you',
                      child: Column(
                        children: <Widget>[
                          for (final Review r in others)
                            _TheirReview(
                              review: r,
                              dimensions: dimensions,
                              lang: lang,
                            ),
                        ],
                      ),
                    );
                  },
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  List<Widget> _form(
    BuildContext context,
    Engagement e,
    AsyncValue<List<ReviewDimension>> dimensions,
    String lang,
  ) => <Widget>[
    Panel(
      title: 'How was it?',
      note: 'Honest is more useful than kind. The next person reads this.',
      child: _Stars(
        rating: _rating,
        onChanged: (int v) => setState(() => _rating = v),
      ),
    ),

    dimensions.when(
      loading: () => const Panel(child: LinearProgressIndicator()),
      // A family that declares no dimensions gets the overall rating and
      // nothing else. No invented scale, and no empty panel either.
      error: (Object err, _) => const SizedBox.shrink(),
      data: (List<ReviewDimension> list) => list.isEmpty
          ? const SizedBox.shrink()
          : Panel(
              title: 'In particular',
              note: 'Optional. Skip any that do not apply.',
              child: Column(
                children: <Widget>[
                  for (final ReviewDimension d in list)
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          PackText(d.label(lang)),
                          _Stars(
                            rating: _dimensions[d.code] ?? 0,
                            small: true,
                            label: d.label(lang),
                            onChanged: (int v) =>
                                setState(() => _dimensions[d.code] = v),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
    ),

    Panel(
      title: 'In your words',
      child: TextField(
        controller: _body,
        minLines: 4,
        maxLines: 10,
        decoration: const InputDecoration(
          hintText: 'What was useful, and what you would have wanted more of.',
        ),
      ),
    ),

    if (_error != null) Note(_error!, tone: ChipTone.danger),

    FilledButton(
      onPressed: _busy || _rating == 0 ? null : () => _submit(e),
      child: _busy
          ? const SizedBox(
              height: 18,
              width: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            )
          : const PackText('Leave the review'),
    ),
    PackText(
      'This cannot be edited afterwards, and they can reply to it once.',
      style: Theme.of(
        context,
      ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
      textAlign: TextAlign.center,
    ),
  ];

  Future<void> _submit(Engagement e) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final bool iAmProvider =
          ref.read(authProvider).user?.isProvider ?? false;
      await ref
          .read(repositoryProvider)
          .review(
            e.id,
            rating: _rating,
            body: _body.text.trim(),
            // The language the review was WRITTEN in, which is not
            // necessarily the interface language — the original text and
            // its language travel together.
            lang: ref.read(langProvider),
            direction: iAmProvider
                ? ReviewDirection.providerOnSeeker
                : ReviewDirection.seekerOnProvider,
            dimensions: _dimensions,
          );
      ref
        ..invalidate(engagementReviewsProvider(e.id))
        ..invalidate(engagementProvider(e.id));
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// A rating, as stars that are also a real radio group.
///
/// The stars are decoration; the semantics are what a screen reader gets,
/// which is why each is a labelled button rather than an icon in a row.
class _Stars extends StatelessWidget {
  const _Stars({
    required this.rating,
    required this.onChanged,
    this.small = false,
    this.label,
  });

  final int rating;
  final void Function(int) onChanged;
  final bool small;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final BrandTokens brand = BrandTokens.of(context);
    return Row(
      children: <Widget>[
        for (int i = 1; i <= 5; i++)
          IconButton(
            iconSize: small ? 22 : 32,
            constraints: BoxConstraints(
              minWidth: small ? 36 : kTouchTarget,
              minHeight: small ? 36 : kTouchTarget,
            ),
            tooltip: label == null
                ? '$i out of 5'
                : '${label!}: $i out of 5',
            icon: Icon(
              i <= rating ? Icons.star : Icons.star_border,
              color: i <= rating ? brand.brand : BaseColors.inkFaint,
            ),
            onPressed: () => onChanged(i),
          ),
      ],
    );
  }
}

class _ReviewBody extends StatelessWidget {
  const _ReviewBody({
    required this.review,
    required this.dimensions,
    required this.lang,
  });

  final Review review;
  final AsyncValue<List<ReviewDimension>> dimensions;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<ReviewDimension> dims =
        dimensions.valueOrNull ?? const <ReviewDimension>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        Semantics(
          label: '${review.rating} out of 5',
          child: ExcludeSemantics(
            child: Row(
              children: <Widget>[
                for (int i = 1; i <= 5; i++)
                  Icon(
                    i <= review.rating ? Icons.star : Icons.star_border,
                    size: 18,
                    color: i <= review.rating
                        ? BrandTokens.of(context).brand
                        : BaseColors.inkFaint,
                  ),
              ],
            ),
          ),
        ),
        if (review.body.isNotEmpty) ...<Widget>[
          const SizedBox(height: Space.sm),
          PackText(review.body, style: theme.textTheme.bodyMedium),
        ],
        if (review.dimensionScores.isNotEmpty && dims.isNotEmpty) ...<Widget>[
          const SizedBox(height: Space.md),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final ReviewDimension d in dims)
                if (review.dimensionScores[d.code] != null)
                  StatusChip(
                    '${d.label(lang)} · ${review.dimensionScores[d.code]}/5',
                  ),
            ],
          ),
        ],
        if (review.createdAt != null) ...<Widget>[
          const SizedBox(height: Space.sm),
          PackText(
            DateFormat('d MMM yyyy').format(review.createdAt!),
            style: theme.textTheme.labelMedium?.copyWith(
              color: BaseColors.inkFaint,
            ),
          ),
        ],
      ],
    );
  }
}

/// A review about you, and the one reply you are allowed.
class _TheirReview extends ConsumerStatefulWidget {
  const _TheirReview({
    required this.review,
    required this.dimensions,
    required this.lang,
  });

  final Review review;
  final AsyncValue<List<ReviewDimension>> dimensions;
  final String lang;

  @override
  ConsumerState<_TheirReview> createState() => _TheirReviewState();
}

class _TheirReviewState extends ConsumerState<_TheirReview> {
  final TextEditingController _reply = TextEditingController();
  bool _replying = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reply.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Review r = widget.review;

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          _ReviewBody(
            review: r,
            dimensions: widget.dimensions,
            lang: widget.lang,
          ),

          if (r.hasReply) ...<Widget>[
            const SizedBox(height: Space.md),
            Container(
              padding: const EdgeInsets.all(Space.md),
              decoration: BoxDecoration(
                color: BaseColors.surfaceSunk,
                borderRadius: BorderRadius.circular(Radii.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  PackText(
                    'Your reply',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: BaseColors.inkMuted,
                    ),
                  ),
                  const SizedBox(height: 2),
                  PackText(r.reply!.body),
                ],
              ),
            ),
          ] else if (_replying) ...<Widget>[
            const SizedBox(height: Space.md),
            TextField(
              controller: _reply,
              minLines: 2,
              maxLines: 6,
              autofocus: true,
              decoration: const InputDecoration(
                hintText: 'Your side of it, once.',
              ),
            ),
            if (_error != null) ...<Widget>[
              const SizedBox(height: Space.sm),
              Note(_error!, tone: ChipTone.danger),
            ],
            const SizedBox(height: Space.sm),
            Row(
              children: <Widget>[
                TextButton(
                  onPressed: _busy
                      ? null
                      : () => setState(() => _replying = false),
                  child: const PackText('Cancel'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _busy || _reply.text.trim().isEmpty
                      ? null
                      : _send,
                  child: const PackText('Post the reply'),
                ),
              ],
            ),
            PackText(
              'One reply, and it cannot be edited afterwards.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: BaseColors.inkMuted,
              ),
            ),
          ] else ...<Widget>[
            const SizedBox(height: Space.sm),
            OutlinedButton(
              onPressed: () => setState(() => _replying = true),
              child: const PackText('Reply once'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _send() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .replyToReview(
            widget.review.id,
            body: _reply.text.trim(),
            lang: ref.read(langProvider),
          );
      ref.invalidate(engagementReviewsProvider(widget.review.id));
      if (mounted) setState(() => _replying = false);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
