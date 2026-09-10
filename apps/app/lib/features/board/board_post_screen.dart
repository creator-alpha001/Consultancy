import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/board.dart';
import '../../api/models/engagement.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// One open request, and the offers against it.
///
/// **This screen is where CLAUDE.md #15 actually bites.** There is no
/// price sort, and the ordering control below offers only "most recent"
/// and "most experience" — the enum has no price member, so adding one is
/// a visible edit to `ProposalOrder` rather than a string someone passes
/// through. That single decision is what makes this a marketplace for
/// quality rather than a reverse auction.
///
/// The offers are also not ranked by amount implicitly: the default is
/// recency, and every card shows the same fields in the same order so a
/// cheaper offer gets no visual advantage.
class BoardPostScreen extends ConsumerStatefulWidget {
  const BoardPostScreen({required this.postId, super.key});

  final String postId;

  @override
  ConsumerState<BoardPostScreen> createState() => _BoardPostScreenState();
}

class _BoardPostScreenState extends ConsumerState<BoardPostScreen> {
  ProposalOrder _order = ProposalOrder.newest;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<BoardPost> post = ref.watch(
      boardPostProvider(widget.postId),
    );
    final AsyncValue<List<Proposal>> proposals = ref.watch(
      proposalsProvider(widget.postId),
    );
    final bool isProvider = ref.watch(authProvider).user?.isProvider ?? false;

    return Scaffold(
      appBar: AppBar(title: const PackText('Request')),
      body: AsyncBody<BoardPost>(
        value: post,
        onRetry: () => ref.invalidate(boardPostProvider(widget.postId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (BoardPost p) => PageBody(
          onRefresh: () async {
            ref
              ..invalidate(boardPostProvider(widget.postId))
              ..invalidate(proposalsProvider(widget.postId));
          },
          children: <Widget>[
            _PostDetail(post: p),

            if (isProvider && p.isOpen)
              _ProposeButton(post: p)
            else
              _Proposals(
                post: p,
                proposals: proposals,
                order: _order,
                onOrder: (ProposalOrder o) => setState(() => _order = o),
              ),
          ],
        ),
      ),
    );
  }
}

class _PostDetail extends StatelessWidget {
  const _PostDetail({required this.post});

  final BoardPost post;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Panel(
      title: post.type?.neutralLabel ?? 'Request',
      trailing: StatusChip(
        post.isOpen ? 'Open' : post.status,
        tone: post.isOpen ? ChipTone.brand : ChipTone.neutral,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          PackText(post.description, style: theme.textTheme.bodyMedium),
          const SizedBox(height: Space.lg),
          Wrap(
            spacing: Space.xl,
            runSpacing: Space.lg,
            children: <Widget>[
              Field(
                label: 'Budget',
                value: Text(
                  '${post.budgetMin.formatCompact()}–${post.budgetMax.formatCompact()}',
                  style: const TextStyle(
                    fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
                  ),
                ),
              ),
              // A matching dimension, not a preference: a provider who
              // cannot work in this language cannot propose at all.
              Field(
                label: 'Language',
                value: PackText(post.language.toUpperCase()),
              ),
              if (post.postedAt != null)
                Field(
                  label: 'Posted',
                  value: PackText(DateFormat('d MMM').format(post.postedAt!)),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Proposals extends ConsumerWidget {
  const _Proposals({
    required this.post,
    required this.proposals,
    required this.order,
    required this.onOrder,
  });

  final BoardPost post;
  final AsyncValue<List<Proposal>> proposals;
  final ProposalOrder order;
  final void Function(ProposalOrder) onOrder;

  @override
  Widget build(BuildContext context, WidgetRef ref) => proposals.when(
    loading: () => const Panel(child: LinearProgressIndicator()),
    error: (Object e, _) => Panel(
      child: Note(
        e is ApiException ? e.message : 'Could not load the offers.',
        tone: ChipTone.danger,
      ),
    ),
    data: (List<Proposal> list) {
      if (list.isEmpty) {
        return const Panel(
          title: 'Offers',
          child: Note(
            'No offers yet. People verified in what you asked for will see '
            'this and can propose.',
          ),
        );
      }

      final List<Proposal> ordered = _ordered(list);

      return Panel(
        title: list.length == 1 ? '1 offer' : '${list.length} offers',
        // Said plainly, because a seeker looking at a list of prices will
        // otherwise assume the cheapest is the point.
        note:
            'Ordered by ${order.label.toLowerCase()}. There is no way to sort '
            'these by price — the cheapest offer is not the question.',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Wrap(
              spacing: Space.sm,
              children: <Widget>[
                // Every member of ProposalOrder, and there is no price
                // one. See the enum.
                for (final ProposalOrder o in ProposalOrder.values)
                  ChoiceChip(
                    label: PackText(o.label),
                    selected: order == o,
                    onSelected: (_) => onOrder(o),
                  ),
              ],
            ),
            const SizedBox(height: Space.lg),
            for (final Proposal p in ordered)
              _ProposalCard(proposal: p, postId: post.id),
          ],
        ),
      );
    },
  );

  List<Proposal> _ordered(List<Proposal> list) {
    final List<Proposal> out = List<Proposal>.of(list);
    switch (order) {
      case ProposalOrder.newest:
        out.sort(
          (Proposal a, Proposal b) => (b.createdAt ?? DateTime(0)).compareTo(
            a.createdAt ?? DateTime(0),
          ),
        );
      case ProposalOrder.experience:
        // By verified tier, which is the closest thing to "who has done
        // most of this" the proposal itself carries.
        out.sort(
          (Proposal a, Proposal b) =>
              (b.tier?.index ?? -1).compareTo(a.tier?.index ?? -1),
        );
    }
    return out;
  }
}

class _ProposalCard extends ConsumerStatefulWidget {
  const _ProposalCard({required this.proposal, required this.postId});

  final Proposal proposal;
  final String postId;

  @override
  ConsumerState<_ProposalCard> createState() => _ProposalCardState();
}

class _ProposalCardState extends ConsumerState<_ProposalCard> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Proposal p = widget.proposal;

    return Container(
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
                  p.providerName ?? 'A provider',
                  style: theme.textTheme.titleMedium,
                ),
              ),
              if (p.tier != null)
                StatusChip(p.tier!.neutralLabel, tone: ChipTone.verified),
            ],
          ),
          const SizedBox(height: Space.sm),
          if ((p.message ?? '').isNotEmpty)
            PackText(p.message!, style: theme.textTheme.bodyMedium),
          const SizedBox(height: Space.md),
          Row(
            children: <Widget>[
              if (p.turnaroundHours != null)
                Field(
                  label: 'Turnaround',
                  value: PackText('${p.turnaroundHours} hours'),
                )
              else if (p.durationMinutes != null)
                Field(
                  label: 'Length',
                  value: PackText('${p.durationMinutes} minutes'),
                ),
              const Spacer(),
              Money(p.amount, style: theme.textTheme.titleMedium),
            ],
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: Space.md),
            Note(_error!, tone: ChipTone.danger),
          ],
          if (p.isOpen) ...<Widget>[
            const SizedBox(height: Space.md),
            FilledButton(
              onPressed: _busy ? null : _accept,
              child: const PackText('Choose this one'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _accept() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Choose this offer?'),
        content: const PackText(
          'The other offers are declined automatically, and this becomes a '
          'piece of work. You will agree the goals next — nothing is '
          'charged until then.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Not yet'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Choose'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Engagement e = await ref
          .read(repositoryProvider)
          .acceptProposal(
            widget.proposal.id,
            // Minted from the proposal: accepting twice must be one
            // acceptance, even across an app restart, because it creates
            // an engagement and declines the siblings.
            idempotencyKey: 'accept-${widget.proposal.id}',
          );
      ref
        ..invalidate(proposalsProvider(widget.postId))
        ..invalidate(boardPostProvider(widget.postId))
        ..invalidate(engagementsProvider);
      if (mounted) context.go('/work/${e.id}/agenda');
    } on ApiException catch (err) {
      if (mounted) setState(() => _error = err.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// A provider's own offer against a request.
class _ProposeButton extends ConsumerStatefulWidget {
  const _ProposeButton({required this.post});

  final BoardPost post;

  @override
  ConsumerState<_ProposeButton> createState() => _ProposeButtonState();
}

class _ProposeButtonState extends ConsumerState<_ProposeButton> {
  final TextEditingController _message = TextEditingController();
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _turnaround = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    _amount.dispose();
    _turnaround.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Your offer',
    note:
        'Say what you would actually do. The amount is what you charge, not '
        'an opening position — there is no haggling after this.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        TextField(
          controller: _message,
          minLines: 3,
          maxLines: 8,
          decoration: const InputDecoration(
            hintText: 'What you would do, and what they would get back.',
          ),
        ),
        const SizedBox(height: Space.md),
        Row(
          children: <Widget>[
            Expanded(
              child: TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Your price',
                  prefixText: '₹ ',
                ),
              ),
            ),
            const SizedBox(width: Space.md),
            Expanded(
              child: TextField(
                controller: _turnaround,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Hours'),
              ),
            ),
          ],
        ),
        if (_error != null) ...<Widget>[
          const SizedBox(height: Space.md),
          Note(_error!, tone: ChipTone.danger),
        ],
        const SizedBox(height: Space.lg),
        FilledButton(
          onPressed: _busy ? null : _propose,
          child: const PackText('Send the offer'),
        ),
      ],
    ),
  );

  Future<void> _propose() async {
    final int? rupees = int.tryParse(_amount.text.trim());
    if (rupees == null || rupees <= 0) {
      setState(() => _error = 'Enter what you charge, in rupees.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .propose(
            widget.post.id,
            // Rupees in, paise out — the conversion happens once, here,
            // at the edge, and everything downstream is integer paise.
            amount: Paise(rupees * 100),
            message: _message.text.trim(),
            turnaroundHours: int.tryParse(_turnaround.text.trim()),
          );
      ref.invalidate(proposalsProvider(widget.post.id));
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
