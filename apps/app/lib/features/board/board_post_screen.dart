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
    final String? meId = ref.watch(authProvider).user?.id;
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
              // An offer already sent is the answer to "can I offer?",
              // so the form gives way to it. Showing an empty form to
              // someone who has already proposed invites a duplicate the
              // API would refuse.
              _MyOffer(
                post: p,
                proposals: proposals,
                meId: meId,
                whenNone: _ProposeButton(post: p),
              )
            else ...<Widget>[
              _Proposals(
                post: p,
                proposals: proposals,
                order: _order,
                onOrder: (ProposalOrder o) => setState(() => _order = o),
              ),
              // Only the person who asked can take it down, and only
              // while it is still open — the redirect decides what to
              // draw, never what is allowed (CLAUDE.md #28).
              if (p.isOpen && meId != null && p.seeker?.id == meId)
                _TakeItDown(post: p),
            ],
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

/// A provider looking at a request they have already offered on.
///
/// Withdrawing is allowed only while the offer is still `submitted`;
/// once the seeker has chosen it there is an engagement, and the way out
/// of an engagement is cancelling that, not un-sending the offer.
class _MyOffer extends ConsumerStatefulWidget {
  const _MyOffer({
    required this.post,
    required this.proposals,
    required this.meId,
    required this.whenNone,
  });

  final BoardPost post;
  final AsyncValue<List<Proposal>> proposals;
  final String? meId;

  /// What to show if there is no offer from this provider yet.
  final Widget whenNone;

  @override
  ConsumerState<_MyOffer> createState() => _MyOfferState();
}

class _MyOfferState extends ConsumerState<_MyOffer> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final List<Proposal> list =
        widget.proposals.valueOrNull ?? const <Proposal>[];
    final String? meId = widget.meId;

    Proposal? mine;
    for (final Proposal p in list) {
      if (meId != null && p.providerId == meId) mine = p;
    }
    if (mine == null) return widget.whenNone;

    return Panel(
      title: 'Your offer',
      trailing: StatusChip(
        mine.isOpen ? 'Waiting' : mine.status,
        tone: mine.isOpen ? ChipTone.brand : ChipTone.neutral,
      ),
      note: mine.isOpen
          ? 'Sent. They will see it alongside the others — never ordered '
                'by price.'
          : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if ((mine.message ?? '').isNotEmpty)
            PackText(mine.message!, style: theme.textTheme.bodyMedium),
          const SizedBox(height: Space.md),
          Row(
            children: <Widget>[
              if (mine.turnaroundHours != null)
                Field(
                  label: 'Turnaround',
                  value: PackText('${mine.turnaroundHours} hours'),
                ),
              const Spacer(),
              Money(mine.amount, style: theme.textTheme.titleMedium),
            ],
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: Space.md),
            Note(_error!, tone: ChipTone.danger),
          ],
          if (mine.isOpen) ...<Widget>[
            const SizedBox(height: Space.lg),
            OutlinedButton(
              onPressed: _busy ? null : () => _withdraw(mine!.id),
              child: const PackText('Withdraw the offer'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _withdraw(String proposalId) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).withdrawProposal(proposalId);
      ref.invalidate(proposalsProvider(widget.post.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// The seeker withdrawing their own request.
///
/// Offers already made are not a debt: nobody has been paid, nothing is
/// held, and closing the request simply stops more arriving. The copy
/// says how many people offered, because taking down a request four
/// people answered is a different act from taking down one nobody saw.
class _TakeItDown extends ConsumerStatefulWidget {
  const _TakeItDown({required this.post});

  final BoardPost post;

  @override
  ConsumerState<_TakeItDown> createState() => _TakeItDownState();
}

class _TakeItDownState extends ConsumerState<_TakeItDown> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'No longer needed?',
    note: widget.post.proposalCount == 0
        ? 'Closing it stops it being shown. Nothing has been charged.'
        : 'Closing it declines the offers you have. Nothing has been '
              'charged and nobody is owed anything.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (_error != null) ...<Widget>[
          Note(_error!, tone: ChipTone.danger),
          const SizedBox(height: Space.md),
        ],
        OutlinedButton(
          onPressed: _busy ? null : _cancel,
          child: const PackText('Close this request'),
        ),
      ],
    ),
  );

  Future<void> _cancel() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Close this request?'),
        content: const PackText(
          'It stops being shown and any offers are declined. You can post '
          'again whenever you want.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Leave it up'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Close it'),
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
      await ref.read(repositoryProvider).cancelBoardPost(widget.post.id);
      ref
        ..invalidate(boardPostProvider(widget.post.id))
        ..invalidate(boardPostsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
