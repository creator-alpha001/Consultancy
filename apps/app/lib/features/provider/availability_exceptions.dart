import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Days off, and extra hours.
///
/// **Exceptions beat the weekly rules, which is the whole reason they
/// exist.** A rule edited for one Tuesday is a rule someone edits back
/// and forgets, and the forgetting is what produces a booking at a time
/// nobody is there. So a single date is a separate record with its own
/// lifetime.
///
/// A date blocked here removes slots the server would otherwise offer —
/// the client still computes nothing.
class AvailabilityExceptions extends ConsumerStatefulWidget {
  const AvailabilityExceptions({required this.exceptions, super.key});

  final List<Map<String, dynamic>> exceptions;

  @override
  ConsumerState<AvailabilityExceptions> createState() =>
      _AvailabilityExceptionsState();
}

class _AvailabilityExceptionsState
    extends ConsumerState<AvailabilityExceptions> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Days off',
    note:
        'A date here overrides your weekly hours. Nobody can book you on a '
        'blocked day, whatever the rules say.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (widget.exceptions.isEmpty)
          PackText(
            'None set.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
          )
        else
          for (final Map<String, dynamic> e in widget.exceptions)
            _ExceptionRow(
              exception: e,
              busy: _busy,
              onRemove: () => _remove((e['id'] ?? '').toString()),
            ),

        if (_error != null) ...<Widget>[
          const SizedBox(height: Space.md),
          Note(_error!, tone: ChipTone.danger),
        ],

        const SizedBox(height: Space.md),
        OutlinedButton.icon(
          icon: const Icon(Icons.event_busy_outlined),
          label: const PackText('Block a date'),
          onPressed: _busy ? null : _block,
        ),
      ],
    ),
  );

  Future<void> _block() async {
    final DateTime now = DateTime.now();
    final DateTime? picked = await showDatePicker(
      context: context,
      firstDate: now,
      // The booking horizon is the provider's own policy; offering dates
      // beyond it would let someone block a day nobody could have booked.
      lastDate: now.add(const Duration(days: 365)),
      initialDate: now.add(const Duration(days: 1)),
    );
    if (picked == null) return;

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .addAvailabilityException(
            // A plain calendar date, not an instant: "the 14th" is a day
            // in the provider's own zone, and turning it into a UTC
            // timestamp is how a day off lands on the wrong day.
            date: DateFormat('yyyy-MM-dd').format(picked),
          );
      ref.invalidate(availabilityProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(String id) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).removeAvailabilityException(id);
      ref.invalidate(availabilityProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _ExceptionRow extends StatelessWidget {
  const _ExceptionRow({
    required this.exception,
    required this.busy,
    required this.onRemove,
  });

  final Map<String, dynamic> exception;
  final bool busy;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final String date = (exception['date'] ?? '').toString();
    final bool available = exception['available'] == true;
    final DateTime? parsed = DateTime.tryParse(date);

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.sm),
      child: Row(
        children: <Widget>[
          Icon(
            available ? Icons.event_available_outlined : Icons.event_busy_outlined,
            size: 18,
            color: available ? BaseColors.verified : BaseColors.caution,
          ),
          const SizedBox(width: Space.sm),
          Expanded(
            child: PackText(
              parsed == null
                  ? date
                  : DateFormat('EEEE d MMMM yyyy').format(parsed),
            ),
          ),
          StatusChip(
            available ? 'Extra hours' : 'Blocked',
            tone: available ? ChipTone.verified : ChipTone.caution,
          ),
          IconButton(
            icon: const Icon(Icons.close),
            tooltip: 'Remove this exception',
            onPressed: busy ? null : onRemove,
          ),
        ],
      ),
    );
  }
}

/// A provider charging less than agreed, after the work has started.
///
/// **One-directional, deliberately.** The price may come down once work
/// is under way and may never go up: a price that can rise mid-engagement
/// is a negotiation the seeker has already lost, having already paid.
/// The field below therefore accepts only a lower figure, and says why.
class DiscountSheet extends ConsumerStatefulWidget {
  const DiscountSheet({
    required this.engagementId,
    required this.currentPaise,
    super.key,
  });

  final String engagementId;
  final int currentPaise;

  @override
  ConsumerState<DiscountSheet> createState() => _DiscountSheetState();
}

class _DiscountSheetState extends ConsumerState<DiscountSheet> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _reason.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Charge less')),
    body: PageBody(
      children: <Widget>[
        const Note(
          'You can lower what you charge after the work has started. You '
          'cannot raise it — that would be a negotiation they have already '
          'paid into.',
          icon: Icons.trending_down,
        ),
        Panel(
          child: Column(
            children: <Widget>[
              Field(
                label: 'Agreed now',
                value: Text(
                  '₹${(widget.currentPaise / 100).round()}',
                  style: const TextStyle(
                    fontFeatures: <FontFeature>[FontFeature.tabularFigures()],
                  ),
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'New amount',
                  prefixText: '₹ ',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _reason,
                minLines: 2,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Why',
                  helperText: 'They see this, and so would an adjudicator.',
                ),
              ),
            ],
          ),
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy ? null : _apply,
          child: const PackText('Lower the price'),
        ),
      ],
    ),
  );

  Future<void> _apply() async {
    final int? rupees = int.tryParse(_amount.text.trim());
    if (rupees == null || rupees <= 0) {
      setState(() => _error = 'Enter the new amount in rupees.');
      return;
    }
    final int paise = rupees * 100;
    if (paise >= widget.currentPaise) {
      // Checked here as well as on the server, so the refusal arrives
      // instantly and says what the rule is rather than quoting an error.
      setState(
        () => _error =
            'That is not lower than what you already agreed. A price can '
            'only come down after work has started.',
      );
      return;
    }
    if (_reason.text.trim().isEmpty) {
      setState(() => _error = 'Say why. They see this.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .discount(
            widget.engagementId,
            amount: Paise(paise),
            reason: _reason.text.trim(),
          );
      ref
        ..invalidate(engagementProvider(widget.engagementId))
        ..invalidate(engagementsProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
