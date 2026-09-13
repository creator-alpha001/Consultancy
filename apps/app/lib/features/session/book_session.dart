import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/provider.dart';
import '../../api/models/session.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Picking a time for a live session.
///
/// **The slots come from the server and are never computed here.** A
/// client and a server disagreeing about which hours exist is how a
/// booking lands at a time nobody is there, so the weekly rules, the
/// buffers, the notice period and the advance horizon are all applied on
/// one side only — and it is not this one. This screen renders what
/// `/providers/:id/slots` returned and nothing else.
///
/// **Times are shown in the viewer's own zone, with the provider's named
/// beside it.** An IANA name travels with each slot precisely so "3pm"
/// is never ambiguous across a border, and hiding that would reintroduce
/// the ambiguity the API went to trouble to avoid.
class BookSessionScreen extends ConsumerStatefulWidget {
  const BookSessionScreen({
    required this.engagementId,
    required this.providerId,
    super.key,
  });

  final String engagementId;
  final String providerId;

  @override
  ConsumerState<BookSessionScreen> createState() => _BookSessionScreenState();
}

class _BookSessionScreenState extends ConsumerState<BookSessionScreen> {
  Slot? _chosen;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Slot>> slots = ref.watch(
      slotsProvider(widget.providerId),
    );
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(widget.engagementId),
    );
    final int minutes =
        engagement.valueOrNull?.type == EngagementType.liveSession ? 60 : 45;

    return Scaffold(
      appBar: AppBar(title: const PackText('Pick a time')),
      body: AsyncBody<List<Slot>>(
        value: slots,
        onRetry: () => ref.invalidate(slotsProvider(widget.providerId)),
        emptyWhen: (List<Slot> l) => l.isEmpty,
        emptyMessage:
            'No times are open. They may not have set their hours yet, or '
            'everything within their booking window is taken.',
        builder: (List<Slot> list) {
          final Map<String, List<Slot>> byDay = _groupByDay(list);
          return PageBody(
            onRefresh: () async => ref.invalidate(slotsProvider(widget.providerId)),
            children: <Widget>[
              for (final MapEntry<String, List<Slot>> day in byDay.entries)
                Panel(
                  title: day.key,
                  child: Wrap(
                    spacing: Space.sm,
                    runSpacing: Space.sm,
                    children: <Widget>[
                      for (final Slot s in day.value)
                        ChoiceChip(
                          label: PackText(DateFormat('h:mm a').format(s.start)),
                          selected: _chosen?.start == s.start,
                          onSelected: (_) => setState(() => _chosen = s),
                        ),
                    ],
                  ),
                ),

              if (_chosen != null)
                Panel(
                  title: 'You are booking',
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Field(
                        label: 'Your time',
                        value: PackText(
                          DateFormat(
                            'EEEE d MMMM, h:mm a',
                          ).format(_chosen!.start),
                        ),
                      ),
                      if (_chosen!.timezone != null) ...<Widget>[
                        const SizedBox(height: Space.md),
                        // Said out loud rather than assumed: the two are
                        // often the same, and when they are not, being
                        // told is the whole point.
                        Field(
                          label: 'Their time zone',
                          value: PackText(_chosen!.timezone!),
                        ),
                      ],
                      const SizedBox(height: Space.md),
                      Field(
                        label: 'Length',
                        value: PackText('$minutes minutes'),
                      ),
                    ],
                  ),
                ),

              if (_error != null) Note(_error!, tone: ChipTone.danger),

              FilledButton(
                onPressed: _busy || _chosen == null
                    ? null
                    : () => _book(minutes),
                child: _busy
                    ? const SizedBox(
                        height: 18,
                        width: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const PackText('Book this time'),
              ),
            ],
          );
        },
      ),
    );
  }

  /// Grouped by the DAY IN THE VIEWER'S ZONE, because that is the day
  /// they are choosing from. Sorting on the underlying instant keeps the
  /// order right even where a day boundary falls awkwardly.
  Map<String, List<Slot>> _groupByDay(List<Slot> slots) {
    final List<Slot> sorted = List<Slot>.of(slots)
      ..sort((Slot a, Slot b) => a.start.compareTo(b.start));
    final Map<String, List<Slot>> out = <String, List<Slot>>{};
    for (final Slot s in sorted) {
      final String key = DateFormat('EEEE d MMMM').format(s.start);
      out.putIfAbsent(key, () => <Slot>[]).add(s);
    }
    return out;
  }

  Future<void> _book(int minutes) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final MeetingSession booked = await ref
          .read(repositoryProvider)
          .book(
            widget.engagementId,
            start: _chosen!.start,
            durationMinutes: minutes,
            // The provider's zone, not the device's: the server stores an
            // instant plus the zone the local meaning belongs to.
            timezone: _chosen!.timezone ?? 'Asia/Kolkata',
          );
      ref
        ..invalidate(sessionsProvider)
        ..invalidate(engagementProvider(widget.engagementId));
      if (mounted) Navigator.of(context).pop(booked);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Asking for more time, mid-session.
///
/// **A paid extension is its own escrow with its own agreement.** It is
/// never a silent addition to the original amount — the other party
/// accepts or declines, and the money for it is held separately. That is
/// why this is a request rather than a button that just adds minutes.
class ExtensionSheet extends ConsumerStatefulWidget {
  const ExtensionSheet({required this.sessionId, super.key});

  final String sessionId;

  @override
  ConsumerState<ExtensionSheet> createState() => _ExtensionSheetState();
}

class _ExtensionSheetState extends ConsumerState<ExtensionSheet> {
  int _minutes = 15;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<Map<String, dynamic>>> existing = ref.watch(
      extensionsProvider(widget.sessionId),
    );

    return Panel(
      title: 'Need more time?',
      note:
          'An extension is agreed and paid for separately. Nothing is added '
          'to what you already agreed.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          existing.maybeWhen(
            data: (List<Map<String, dynamic>> list) => list.isEmpty
                ? const SizedBox.shrink()
                : Column(
                    children: <Widget>[
                      for (final Map<String, dynamic> x in list)
                        _ExtensionRow(
                          extension: x,
                          sessionId: widget.sessionId,
                        ),
                      const Divider(height: Space.xl),
                    ],
                  ),
            orElse: () => const SizedBox.shrink(),
          ),

          Wrap(
            spacing: Space.sm,
            children: <Widget>[
              for (final int m in <int>[15, 30, 45])
                ChoiceChip(
                  label: PackText('$m min'),
                  selected: _minutes == m,
                  onSelected: (_) => setState(() => _minutes = m),
                ),
            ],
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: Space.md),
            Note(_error!, tone: ChipTone.danger),
          ],
          const SizedBox(height: Space.md),
          OutlinedButton(
            onPressed: _busy ? null : _request,
            child: PackText('Ask for $_minutes more minutes'),
          ),
        ],
      ),
    );
  }

  Future<void> _request() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .requestExtension(widget.sessionId, minutes: _minutes);
      ref.invalidate(extensionsProvider(widget.sessionId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _ExtensionRow extends ConsumerStatefulWidget {
  const _ExtensionRow({required this.extension, required this.sessionId});

  final Map<String, dynamic> extension;
  final String sessionId;

  @override
  ConsumerState<_ExtensionRow> createState() => _ExtensionRowState();
}

class _ExtensionRowState extends ConsumerState<_ExtensionRow> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> x = widget.extension;
    final String id = (x['id'] ?? '').toString();
    final String status = (x['status'] ?? 'pending').toString();
    final int minutes = x['minutes'] is int ? x['minutes'] as int : 0;
    final bool pending = status == 'pending' || status == 'requested';

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.sm),
      child: Row(
        children: <Widget>[
          Expanded(child: PackText('$minutes more minutes')),
          if (!pending)
            StatusChip(
              status,
              tone: status == 'accepted' ? ChipTone.verified : ChipTone.neutral,
            )
          else ...<Widget>[
            TextButton(
              onPressed: _busy ? null : () => _decline(id),
              child: const PackText('No'),
            ),
            const SizedBox(width: Space.sm),
            FilledButton(
              onPressed: _busy ? null : () => _accept(id),
              child: const PackText('Accept'),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _accept(String id) async {
    setState(() => _busy = true);
    try {
      // Its own escrow, so the key is minted from the extension: a
      // double tap must not hold the money twice.
      await ref
          .read(repositoryProvider)
          .acceptExtension(id, idempotencyKey: 'extension-accept-$id');
      _refresh();
    } on ApiException {
      // The list refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).declineExtension(id);
      _refresh();
    } on ApiException {
      // As above.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _refresh() {
    ref
      ..invalidate(extensionsProvider(widget.sessionId))
      ..invalidate(sessionProvider(widget.sessionId));
  }
}
