import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/provider.dart';
import '../../api/models/supply.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import 'availability_exceptions.dart';
import 'setup_screens.dart';

/// What a provider offers, and for how much.
///
/// One price per thing, for a stated duration or turnaround. **Not a
/// band, and not an opening position.** The negotiable-price model is
/// gone: a provider publishes what they charge and a seeker takes it or
/// does not, which is what keeps a first interaction from being a
/// haggle and a marketplace from competing on price (CLAUDE.md #15).
class ProviderServicesScreen extends ConsumerWidget {
  const ProviderServicesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Service>> rates = ref.watch(myRatesProvider);
    final AsyncValue<List<ServicePackage>> packages = ref.watch(
      myPackagesProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('What you offer')),
      body: AsyncBody<List<Service>>(
        value: rates,
        onRetry: () => ref.invalidate(myRatesProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (List<Service> list) => PageBody(
          onRefresh: () async {
            ref
              ..invalidate(myRatesProvider)
              ..invalidate(myPackagesProvider);
          },
          children: <Widget>[
            const Note(
              'One price each, for a stated turnaround or length. People see '
              'exactly this — there is nothing to negotiate afterwards.',
              icon: Icons.sell_outlined,
            ),
            if (list.isEmpty)
              const Panel(
                child: Note(
                  'Nothing published yet. Until something is here you cannot '
                  'be booked.',
                  tone: ChipTone.caution,
                ),
              )
            else
              Panel(
                title: 'Your prices',
                child: Column(
                  children: <Widget>[
                    for (final Service s in list)
                      NavRow(
                        title:
                            s.skillLabel?.call(lang) ??
                            s.type?.neutralLabel ??
                            'Service',
                        subtitle: _commitment(s),
                        trailing: _RemoveRate(rateId: s.id, amount: s.amount),
                      ),
                  ],
                ),
              ),
            OutlinedButton.icon(
              icon: const Icon(Icons.add),
              label: const PackText('Publish a price'),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const AddRateSheet(),
                ),
              ),
            ),
            packages.maybeWhen(
              data: (List<ServicePackage> p) => p.isEmpty
                  ? const SizedBox.shrink()
                  : Panel(
                      title: 'Bundles',
                      child: Column(
                        children: <Widget>[
                          for (final ServicePackage x in p)
                            NavRow(
                              title: x.title,
                              subtitle:
                                  '${x.sessionCount} sessions'
                                  '${x.perSession != null ? ' · ${x.perSession!.formatCompact()} each' : ''}',
                              trailing: _WithdrawPackage(
                                packageId: x.id,
                                amount: x.amount,
                              ),
                            ),
                        ],
                      ),
                    ),
              orElse: () => const SizedBox.shrink(),
            ),
            OutlinedButton.icon(
              icon: const Icon(Icons.inventory_2_outlined),
              label: const PackText('Offer a bundle'),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => const AddPackageSheet(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _commitment(Service s) {
    if (s.durationMinutes != null) return '${s.durationMinutes} minutes, live';
    if (s.turnaroundHours != null) return 'Back within ${s.turnaroundHours} hours';
    return s.type?.neutralLabel ?? '';
  }
}

/// When a provider is available, and the rules around booking them.
///
/// The rules are displayed but never *evaluated* here: the server
/// computes which slots exist. A client and a server disagreeing about
/// which hours are bookable is how a session lands at a time nobody is
/// there — so there is exactly one implementation of that, and it is not
/// this one.
class ProviderAvailabilityScreen extends ConsumerWidget {
  const ProviderAvailabilityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Availability> availability = ref.watch(
      availabilityProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Availability')),
      body: AsyncBody<Availability>(
        value: availability,
        onRetry: () => ref.invalidate(availabilityProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (Availability a) => PageBody(
          onRefresh: () async => ref.invalidate(availabilityProvider),
          children: <Widget>[
            if (a.rules.isEmpty)
              const Panel(
                child: Note(
                  'No hours set. You can still be sent work to do in your own '
                  'time — you just cannot be booked for a live session.',
                  tone: ChipTone.caution,
                ),
              )
            else
              Panel(
                title: 'Your week',
                child: Column(
                  children: <Widget>[
                    for (final AvailabilityRule r in a.rules)
                      NavRow(
                        title: _days(r),
                        subtitle:
                            '${_hhmm(r.startMinute)} – ${_hhmm(r.endMinute)}'
                            ' · ${r.timezone}',
                        leading: const Icon(Icons.schedule, size: 20),
                        trailing: _RemoveRule(ruleId: r.id),
                      ),
                  ],
                ),
              ),
            OutlinedButton.icon(
              icon: const Icon(Icons.schedule),
              label: PackText(
                a.rules.isEmpty ? 'Set your hours' : 'Add hours',
              ),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute<void>(
                  builder: (_) => EditAvailabilitySheet(policy: a.policy),
                ),
              ),
            ),
            AvailabilityExceptions(exceptions: a.exceptions),
            Panel(
              title: 'Booking rules',
              note:
                  'These protect your time. Nobody can book inside the '
                  'notice period, and there is always a gap between sessions.',
              child: Wrap(
                spacing: Space.xl,
                runSpacing: Space.lg,
                children: <Widget>[
                  Field(
                    label: 'Shortest notice',
                    value: Text(_hours(a.policy.minNoticeMinutes)),
                  ),
                  Field(
                    label: 'Gap between',
                    value: Text('${a.policy.bufferMinutes} min'),
                  ),
                  Field(
                    label: 'Booked up to',
                    value: Text('${a.policy.maxAdvanceDays} days ahead'),
                  ),
                  Field(
                    label: 'Slot length',
                    value: Text('${a.policy.slotMinutes} min'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _days(AvailabilityRule r) {
    const Map<String, String> names = <String, String>{
      'MO': 'Mon',
      'TU': 'Tue',
      'WE': 'Wed',
      'TH': 'Thu',
      'FR': 'Fri',
      'SA': 'Sat',
      'SU': 'Sun',
    };
    final List<String> d = r.days;
    if (d.length == 7) return 'Every day';
    return d.map((String x) => names[x] ?? x).join(', ');
  }

  static String _hhmm(int minutes) {
    final int h = minutes ~/ 60;
    final int m = minutes % 60;
    final String suffix = h >= 12 ? 'pm' : 'am';
    final int h12 = h % 12 == 0 ? 12 : h % 12;
    return m == 0 ? '$h12$suffix' : '$h12:${m.toString().padLeft(2, '0')}$suffix';
  }

  static String _hours(int minutes) =>
      minutes % 60 == 0 ? '${minutes ~/ 60} hours' : '$minutes min';
}


/// Removing a published price.
///
/// Withdrawing a price does not touch work already agreed at it — an
/// engagement carries its own amount, snapshotted when it was created.
/// Taking a bundle off sale.
///
/// It stops new purchases and nothing else: bundles people have already
/// bought keep every session they paid for. Withdrawing an offer is not
/// a way to cancel work already owed.
class _WithdrawPackage extends ConsumerStatefulWidget {
  const _WithdrawPackage({required this.packageId, required this.amount});

  final String packageId;
  final Paise amount;

  @override
  ConsumerState<_WithdrawPackage> createState() => _WithdrawPackageState();
}

class _WithdrawPackageState extends ConsumerState<_WithdrawPackage> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: <Widget>[
      Money(widget.amount),
      IconButton(
        icon: const Icon(Icons.close, size: 18),
        tooltip: 'Stop offering this bundle',
        onPressed: _busy ? null : _withdraw,
      ),
    ],
  );

  Future<void> _withdraw() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Stop offering this bundle?'),
        content: const PackText(
          'Nobody new can buy it. Anyone who already has one keeps every '
          'session they paid for.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Withdraw it'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).withdrawPackage(widget.packageId);
      ref.invalidate(myPackagesProvider);
    } on ApiException {
      // The list refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _RemoveRate extends ConsumerStatefulWidget {
  const _RemoveRate({required this.rateId, required this.amount});

  final String rateId;
  final Paise amount;

  @override
  ConsumerState<_RemoveRate> createState() => _RemoveRateState();
}

class _RemoveRateState extends ConsumerState<_RemoveRate> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: <Widget>[
      Money(widget.amount),
      IconButton(
        icon: const Icon(Icons.close, size: 18),
        tooltip: 'Stop offering this',
        onPressed: _busy ? null : _remove,
      ),
    ],
  );

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).removeRate(widget.rateId);
      ref
        ..invalidate(myRatesProvider)
        ..invalidate(readinessProvider);
    } on ApiException {
      // The list refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _RemoveRule extends ConsumerStatefulWidget {
  const _RemoveRule({required this.ruleId});

  final String ruleId;

  @override
  ConsumerState<_RemoveRule> createState() => _RemoveRuleState();
}

class _RemoveRuleState extends ConsumerState<_RemoveRule> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => IconButton(
    icon: const Icon(Icons.close, size: 18),
    tooltip: 'Remove these hours',
    onPressed: _busy ? null : _remove,
  );

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).removeAvailabilityRule(widget.ruleId);
      ref.invalidate(availabilityProvider);
    } on ApiException {
      // As above.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
