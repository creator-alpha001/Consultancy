import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/supply.dart';
import '../../api/uploads.dart';
import '../../data.dart';
import '../../money/paise.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Submitting a credential for verification.
///
/// **The types come from the family manifest**, per domain — core names
/// none of them, and each declares which fields it needs. A family
/// verifying music grades asks for different things than one verifying a
/// civil-service rank, with no code change.
///
/// **What is typed here is evidence, and evidence is never published.** A
/// profile shows the conclusion — "verified" — and never the roll number
/// or the document that proved it (CLAUDE.md #30). The screen says so,
/// because someone typing a roll number deserves to know where it goes.
class SubmitCredentialSheet extends ConsumerStatefulWidget {
  const SubmitCredentialSheet({required this.domainCode, super.key});

  final String domainCode;

  @override
  ConsumerState<SubmitCredentialSheet> createState() =>
      _SubmitCredentialSheetState();
}

class _SubmitCredentialSheetState
    extends ConsumerState<SubmitCredentialSheet> {
  final Map<String, TextEditingController> _fields =
      <String, TextEditingController>{};
  String? _typeId;
  PickedUpload? _document;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    for (final TextEditingController c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Map<String, dynamic>>> types = ref.watch(
      credentialTypesProvider(widget.domainCode),
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Submit a credential')),
      body: PageBody(
        children: <Widget>[
          const Note(
            'What you enter here is checked by a person and then never '
            'shown again — not on your profile, not to anyone you work '
            'with. They see that you were verified, not how.',
            icon: Icons.lock_outline,
          ),

          types.when(
            loading: () => const Panel(child: LinearProgressIndicator()),
            error: (Object e, _) => Panel(
              child: Note(
                e is ApiException ? e.message : 'Could not load the types.',
                tone: ChipTone.danger,
              ),
            ),
            data: (List<Map<String, dynamic>> list) => Panel(
              title: 'What are you submitting?',
              child: Wrap(
                spacing: Space.sm,
                runSpacing: Space.sm,
                children: <Widget>[
                  for (final Map<String, dynamic> t in list)
                    ChoiceChip(
                      label: PackText(_label(t, lang)),
                      selected: _typeId == t['id'],
                      onSelected: (_) =>
                          setState(() => _typeId = t['id'] as String?),
                    ),
                ],
              ),
            ),
          ),

          if (_typeId != null) ...<Widget>[
            Panel(
              title: 'The details',
              note: 'Enough for someone to check it against the source.',
              child: Column(
                children: <Widget>[
                  for (final String field in _fieldsFor(types.valueOrNull))
                    Padding(
                      padding: const EdgeInsets.only(bottom: Space.md),
                      child: TextField(
                        controller: _fields.putIfAbsent(
                          field,
                          TextEditingController.new,
                        ),
                        decoration: InputDecoration(
                          labelText: field.replaceAll('_', ' '),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            Panel(
              title: 'The document',
              child: _document == null
                  ? OutlinedButton.icon(
                      icon: const Icon(Icons.attach_file),
                      label: const PackText('Attach it'),
                      onPressed: _busy ? null : _pick,
                    )
                  : Row(
                      children: <Widget>[
                        const Icon(
                          Icons.check_circle_outline,
                          size: 18,
                          color: BaseColors.verified,
                        ),
                        const SizedBox(width: Space.sm),
                        Expanded(child: PackText(_document!.filename)),
                        IconButton(
                          icon: const Icon(Icons.close),
                          tooltip: 'Remove',
                          onPressed: () => setState(() => _document = null),
                        ),
                      ],
                    ),
            ),
          ],

          if (_error != null) Note(_error!, tone: ChipTone.danger),

          FilledButton(
            onPressed: _busy || _typeId == null ? null : _submit,
            child: const PackText('Send it for checking'),
          ),
        ],
      ),
    );
  }

  static String _label(Map<String, dynamic> t, String lang) {
    final Object? labels = t['labels'];
    if (labels is Map<String, dynamic>) {
      final Object? v = labels[lang] ?? labels['en'];
      if (v is String) return v;
    }
    return (t['code'] ?? '').toString().replaceAll('_', ' ');
  }

  /// Which fields this credential type asks for.
  ///
  /// Declared by the type itself. A type that names none still submits —
  /// the document alone can be enough, and inventing a field here would
  /// be core deciding what a family needs to know.
  List<String> _fieldsFor(List<Map<String, dynamic>>? types) {
    final Map<String, dynamic>? t = types
        ?.where((Map<String, dynamic> x) => x['id'] == _typeId)
        .firstOrNull;
    final Object? fields = t?['verifierFields'] ?? t?['requiredFields'];
    if (fields is List) {
      return <String>[
        for (final Object? f in fields)
          if (f is String) f,
      ];
    }
    return const <String>['reference'];
  }

  Future<void> _pick() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final PickedUpload? picked = await ref
          .read(uploadsProvider)
          .pickAndUpload();
      if (picked != null && mounted) setState(() => _document = picked);
    } on UploadRefused catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .submitCredential(
            credentialTypeId: _typeId!,
            domainCode: widget.domainCode,
            verifierData: <String, dynamic>{
              for (final MapEntry<String, TextEditingController> e
                  in _fields.entries)
                if (e.value.text.trim().isNotEmpty) e.key: e.value.text.trim(),
              if (_document != null) 'attachmentId': _document!.attachmentId,
            },
          );
      ref
        ..invalidate(myCredentialsProvider)
        ..invalidate(readinessProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Publishing a price.
///
/// One price, for one commitment. **Not a band and not an opening
/// position** (CLAUDE.md #15) — which is why there is one amount field
/// here and no "from" or "up to".
class AddRateSheet extends ConsumerStatefulWidget {
  const AddRateSheet({super.key});

  @override
  ConsumerState<AddRateSheet> createState() => _AddRateSheetState();
}

class _AddRateSheetState extends ConsumerState<AddRateSheet> {
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _commitment = TextEditingController();
  EngagementType _type = EngagementType.documentReview;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _commitment.dispose();
    super.dispose();
  }

  /// A live type is priced per DURATION; an async one per TURNAROUND.
  /// Which one is being asked for follows from the type, so the field
  /// relabels rather than offering both and letting one go unfilled.
  bool get _isLive =>
      _type == EngagementType.liveSession ||
      _type == EngagementType.reviewWithLive;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Publish a price')),
    body: PageBody(
      children: <Widget>[
        Panel(
          title: 'What kind of work?',
          child: Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              // Every type core knows, none privileged. A family's own
              // word for each comes from the pack where it publishes one.
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
          child: Column(
            children: <Widget>[
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Your price',
                  prefixText: '₹ ',
                  helperText: 'What you charge. People see exactly this.',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _commitment,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: _isLive ? 'Minutes' : 'Turnaround in hours',
                  helperText: _isLive
                      ? 'How long the session runs.'
                      : 'How long before you send it back.',
                ),
              ),
            ],
          ),
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: const PackText('Publish it'),
        ),
      ],
    ),
  );

  Future<void> _save() async {
    final int? rupees = int.tryParse(_amount.text.trim());
    final int? commitment = int.tryParse(_commitment.text.trim());
    if (rupees == null || rupees <= 0) {
      setState(() => _error = 'Enter what you charge, in rupees.');
      return;
    }
    if (commitment == null || commitment <= 0) {
      setState(
        () => _error = _isLive
            ? 'Say how long the session runs.'
            : 'Say how long before you send it back.',
      );
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .addRate(
            engagementType: _type.wire,
            // Rupees in, paise out, converted once at the edge.
            amount: Paise(rupees * 100),
            durationMinutes: _isLive ? commitment : null,
            turnaroundHours: _isLive ? null : commitment,
          );
      ref
        ..invalidate(myRatesProvider)
        ..invalidate(readinessProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Publishing a bundle — several sessions of one kind at one price.
///
/// Same rule as a rate: one amount, no band (CLAUDE.md #15). The client
/// asks for at least two sessions because the server refuses fewer; the
/// server stays the authority and its message is shown if it disagrees.
class AddPackageSheet extends ConsumerStatefulWidget {
  const AddPackageSheet({super.key});

  @override
  ConsumerState<AddPackageSheet> createState() => _AddPackageSheetState();
}

class _AddPackageSheetState extends ConsumerState<AddPackageSheet> {
  final TextEditingController _title = TextEditingController();
  final TextEditingController _count = TextEditingController();
  final TextEditingController _amount = TextEditingController();
  final TextEditingController _commitment = TextEditingController();
  EngagementType _type = EngagementType.liveSession;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _count.dispose();
    _amount.dispose();
    _commitment.dispose();
    super.dispose();
  }

  /// The package API takes one commitment and reads it by type: minutes
  /// for a live session, turnaround hours for anything else.
  bool get _isLive => _type == EngagementType.liveSession;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Offer a bundle')),
    body: PageBody(
      children: <Widget>[
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
          child: Column(
            children: <Widget>[
              TextField(
                controller: _title,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Name',
                  helperText: 'What people see this bundle called.',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _count,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'How many sessions',
                  helperText: 'Two or more. One is a price, not a bundle.',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _amount,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                  labelText: 'Price for the whole bundle',
                  prefixText: '₹ ',
                  helperText: 'People see exactly this.',
                ),
              ),
              const SizedBox(height: Space.md),
              TextField(
                controller: _commitment,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: _isLive ? 'Minutes each' : 'Turnaround in hours',
                  helperText: _isLive
                      ? 'How long each session runs.'
                      : 'How long before you send each one back.',
                ),
              ),
            ],
          ),
        ),
        const Note(
          'Withdrawing a bundle later stops new purchases only. Anyone who '
          'has bought one keeps every session they paid for.',
          icon: Icons.info_outline,
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: const PackText('Publish it'),
        ),
      ],
    ),
  );

  Future<void> _save() async {
    final String title = _title.text.trim();
    final int? count = int.tryParse(_count.text.trim());
    final int? rupees = int.tryParse(_amount.text.trim());
    final int? commitment = int.tryParse(_commitment.text.trim());
    if (title.isEmpty) {
      setState(() => _error = 'Give the bundle a name.');
      return;
    }
    if (count == null || count < 2) {
      setState(() => _error = 'A bundle is two or more sessions.');
      return;
    }
    if (rupees == null || rupees <= 0) {
      setState(() => _error = 'Enter the price for the whole bundle, in rupees.');
      return;
    }
    if (commitment == null || commitment <= 0) {
      setState(
        () => _error = _isLive
            ? 'Say how long each session runs.'
            : 'Say how long before you send each one back.',
      );
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .publishPackage(
            engagementType: _type.wire,
            title: title,
            sessionCount: count,
            // Rupees in, paise out, converted once at the edge.
            amount: Paise(rupees * 100),
            commitment: commitment,
          );
      ref.invalidate(myPackagesProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Setting weekly hours, and the rules around them.
class EditAvailabilitySheet extends ConsumerStatefulWidget {
  const EditAvailabilitySheet({required this.policy, super.key});

  final AvailabilityPolicy policy;

  @override
  ConsumerState<EditAvailabilitySheet> createState() =>
      _EditAvailabilitySheetState();
}

class _EditAvailabilitySheetState
    extends ConsumerState<EditAvailabilitySheet> {
  static const Map<String, String> _days = <String, String>{
    'MO': 'Mon',
    'TU': 'Tue',
    'WE': 'Wed',
    'TH': 'Thu',
    'FR': 'Fri',
    'SA': 'Sat',
    'SU': 'Sun',
  };

  final Set<String> _chosen = <String>{'MO', 'TU', 'WE', 'TH', 'FR'};
  TimeOfDay _from = const TimeOfDay(hour: 9, minute: 0);
  TimeOfDay _to = const TimeOfDay(hour: 18, minute: 0);
  late int _notice = widget.policy.minNoticeMinutes;
  late int _buffer = widget.policy.bufferMinutes;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Your hours')),
    body: PageBody(
      children: <Widget>[
        Panel(
          title: 'Which days?',
          child: Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final MapEntry<String, String> d in _days.entries)
                FilterChip(
                  label: PackText(d.value),
                  selected: _chosen.contains(d.key),
                  onSelected: (bool on) => setState(() {
                    if (on) {
                      _chosen.add(d.key);
                    } else {
                      _chosen.remove(d.key);
                    }
                  }),
                ),
            ],
          ),
        ),
        Panel(
          title: 'Between',
          note:
              'In your own time zone. Someone in another one sees their '
              'equivalent, never a raw offset.',
          child: Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _pickTime(from: true),
                  child: PackText(_from.format(context)),
                ),
              ),
              const SizedBox(width: Space.md),
              Expanded(
                child: OutlinedButton(
                  onPressed: () => _pickTime(from: false),
                  child: PackText(_to.format(context)),
                ),
              ),
            ],
          ),
        ),
        Panel(
          title: 'Rules that protect your time',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              PackText('Shortest notice: ${_hours(_notice)}'),
              Slider(
                value: _notice.toDouble(),
                max: 2880,
                divisions: 48,
                label: _hours(_notice),
                onChanged: (double v) =>
                    setState(() => _notice = (v / 60).round() * 60),
              ),
              PackText('Gap between sessions: $_buffer min'),
              Slider(
                value: _buffer.toDouble(),
                max: 60,
                divisions: 12,
                label: '$_buffer min',
                onChanged: (double v) =>
                    setState(() => _buffer = (v / 5).round() * 5),
              ),
            ],
          ),
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy || _chosen.isEmpty ? null : _save,
          child: const PackText('Save these hours'),
        ),
      ],
    ),
  );

  static String _hours(int minutes) =>
      minutes % 60 == 0 ? '${minutes ~/ 60} hours' : '$minutes min';

  Future<void> _pickTime({required bool from}) async {
    final TimeOfDay? picked = await showTimePicker(
      context: context,
      initialTime: from ? _from : _to,
    );
    if (picked == null) return;
    setState(() {
      if (from) {
        _from = picked;
      } else {
        _to = picked;
      }
    });
  }

  Future<void> _save() async {
    final int start = _from.hour * 60 + _from.minute;
    final int end = _to.hour * 60 + _to.minute;
    if (end <= start) {
      setState(() => _error = 'The end has to be after the start.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .addAvailabilityRule(
            // The device's zone is the provider's own, which is the one
            // the hours are expressed in. An IANA name, never an offset.
            timezone: DateTime.now().timeZoneName,
            rrule: 'FREQ=WEEKLY;BYDAY=${_chosen.join(',')}',
            startMinute: start,
            endMinute: end,
          );
      await ref
          .read(repositoryProvider)
          .setAvailabilityPolicy(
            AvailabilityPolicy(
              minNoticeMinutes: _notice,
              bufferMinutes: _buffer,
              maxAdvanceDays: widget.policy.maxAdvanceDays,
              slotMinutes: widget.policy.slotMinutes,
            ),
          );
      ref
        ..invalidate(availabilityProvider)
        ..invalidate(readinessProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
