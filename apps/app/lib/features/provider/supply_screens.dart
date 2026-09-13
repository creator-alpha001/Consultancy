import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/money.dart';
import '../../api/models/supply.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The training a provider must complete before taking paid work.
///
/// **Entirely pack data.** The modules, their sections, the wording, the
/// questions and the answers all come from the family manifest — core
/// knows none of it, and a family that verifies music grades trains its
/// people on different things with no code change. Nothing in this file
/// names a subject, and nothing switches on a module code.
///
/// The questions are not a quiz to be passed for its own sake: they are
/// about what a provider may and may not promise, which is a rule the
/// platform has to be able to show was communicated.
class ProviderTrainingScreen extends ConsumerWidget {
  const ProviderTrainingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Readiness> readiness = ref.watch(readinessProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Training')),
      // Training belongs to a family, and a provider may be in several —
      // each one's is shown, and none is assumed.
      body: AsyncBody<Readiness>(
        value: readiness,
        onRetry: () => ref.invalidate(readinessProvider),
        emptyWhen: (Readiness r) => r.families.isEmpty,
        emptyMessage:
            'Submit a credential first. Training depends on the field you '
            'work in, and there is none on your account yet.',
        builder: (Readiness r) => PageBody(
          onRefresh: () async {
            ref
              ..invalidate(readinessProvider)
              ..invalidate(trainingProvider);
          },
          children: <Widget>[
            for (final String family in r.families)
              ref
                  .watch(trainingProvider(family))
                  .when(
                    loading: () =>
                        const Panel(child: LinearProgressIndicator()),
                    error: (Object e, _) => Panel(
                      child: Note(
                        e is ApiException
                            ? e.message
                            : 'Could not load this training.',
                        tone: ChipTone.danger,
                      ),
                    ),
                    data: (TrainingState t) => t.modules.isEmpty
                        ? const Panel(
                            child: Note(
                              'This field asks for no training.',
                              icon: Icons.check_circle_outline,
                            ),
                          )
                        : Column(
                            children: <Widget>[
                              for (final TrainingModule m in t.modules)
                                _ModuleCard(
                                  module: m,
                                  familyCode: t.familyCode,
                                  lang: lang,
                                ),
                            ],
                          ),
                  ),
          ],
        ),
      ),
    );
  }
}

class _ModuleCard extends ConsumerWidget {
  const _ModuleCard({
    required this.module,
    required this.familyCode,
    required this.lang,
  });

  final TrainingModule module;
  final String familyCode;
  final String lang;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Panel(
    title: module.label(lang),
    trailing: module.isComplete
        ? const StatusChip('Done', tone: ChipTone.verified)
        : module.required_
        ? const StatusChip('Required', tone: ChipTone.caution)
        : const StatusChip('Optional'),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        for (final TrainingSection s in module.sections)
          Padding(
            padding: const EdgeInsets.only(bottom: Space.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                PackText(
                  s.heading(lang),
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: Space.xs),
                PackText(s.body(lang)),
              ],
            ),
          ),
        if (!module.isComplete && module.questions.isNotEmpty)
          OutlinedButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => _TrainingQuiz(
                  module: module,
                  familyCode: familyCode,
                  lang: lang,
                ),
              ),
            ),
            child: const PackText('Answer the questions'),
          ),
      ],
    ),
  );
}

class _TrainingQuiz extends ConsumerStatefulWidget {
  const _TrainingQuiz({
    required this.module,
    required this.familyCode,
    required this.lang,
  });

  final TrainingModule module;
  final String familyCode;
  final String lang;

  @override
  ConsumerState<_TrainingQuiz> createState() => _TrainingQuizState();
}

class _TrainingQuizState extends ConsumerState<_TrainingQuiz> {
  final Map<String, String> _answers = <String, String>{};
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final String lang = widget.lang;
    return Scaffold(
      appBar: AppBar(title: PackText(widget.module.label(lang))),
      body: PageBody(
        children: <Widget>[
          for (final TrainingQuestion q in widget.module.questions)
            Panel(
              title: q.prompt(lang),
              child: RadioGroup<String>(
                groupValue: _answers[q.code],
                onChanged: (String? v) =>
                    setState(() => _answers[q.code] = v ?? ''),
                child: Column(
                  children: <Widget>[
                    for (final TrainingOption o in q.options)
                      RadioListTile<String>(
                        value: o.code,
                        contentPadding: EdgeInsets.zero,
                        title: PackText(o.label(lang)),
                      ),
                  ],
                ),
              ),
            ),
          if (_error != null) Note(_error!, tone: ChipTone.danger),
          FilledButton(
            onPressed: _busy || _answers.length < widget.module.questions.length
                ? null
                : _submit,
            child: const PackText('Submit'),
          ),
          // The API marks the module complete or refuses. This screen
          // does not grade — a client that decided whether an answer was
          // right could be told to say yes.
          PackText(
            'Your answers are checked by the platform, not by this screen.',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
            textAlign: TextAlign.center,
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
      await ref
          .read(repositoryProvider)
          .completeTraining(
            widget.module.code,
            familyCode: widget.familyCode,
            answers: _answers,
          );
      ref
        ..invalidate(trainingProvider)
        ..invalidate(readinessProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// The languages a provider can work in, and which they can assess in.
///
/// Language is a first-class matching dimension (CLAUDE.md #19), not a
/// display preference — someone working in Hindi cannot be served by a
/// Hindi-incapable provider, so this screen decides who reaches them.
///
/// The two flags are deliberately separate: reading a language well
/// enough to talk is not the same as marking work in it, and conflating
/// them is how someone ends up assessing writing they cannot properly
/// judge.
class ProviderLanguagesScreen extends ConsumerStatefulWidget {
  const ProviderLanguagesScreen({super.key});

  @override
  ConsumerState<ProviderLanguagesScreen> createState() =>
      _ProviderLanguagesScreenState();
}

class _ProviderLanguagesScreenState
    extends ConsumerState<ProviderLanguagesScreen> {
  final Map<String, bool> _draft = <String, bool>{};
  bool _seeded = false;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final AsyncValue<List<WorkingLanguage>> mine = ref.watch(
      myLanguagesProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Working languages')),
      body: AsyncBody<List<WorkingLanguage>>(
        value: mine,
        onRetry: () => ref.invalidate(myLanguagesProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (List<WorkingLanguage> list) {
          if (!_seeded) {
            _seeded = true;
            for (final WorkingLanguage l in list) {
              _draft[l.code] = l.canEvaluate;
            }
          }
          return PageBody(
            children: <Widget>[
              const Note(
                'People are matched to you by language. Adding one widens who '
                'can reach you; removing one narrows it.',
                icon: Icons.translate,
              ),
              Panel(
                title: 'You work in',
                note:
                    'Tick the second box only where you could mark someone’s '
                    'work in that language, not merely talk in it.',
                child: Column(
                  children: <Widget>[
                    for (final MapEntry<String, bool> e in _draft.entries)
                      CheckboxListTile(
                        value: e.value,
                        contentPadding: EdgeInsets.zero,
                        controlAffinity: ListTileControlAffinity.leading,
                        title: PackText(e.key.toUpperCase()),
                        subtitle: const PackText('I can assess work in this'),
                        onChanged: (bool? v) =>
                            setState(() => _draft[e.key] = v ?? false),
                      ),
                  ],
                ),
              ),
              if (_error != null) Note(_error!, tone: ChipTone.danger),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: const PackText('Save'),
              ),
              // Adding a language means declaring a capability that
              // decides who is sent to you. That is a bigger claim than a
              // settings toggle, so it is not made from a chip here.
              const Note(
                'Adding a language you do not hold is not built here — it is '
                'a claim about what you can assess, and it goes through '
                'verification.',
                tone: ChipTone.caution,
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .setLanguages(<WorkingLanguage>[
            for (final MapEntry<String, bool> e in _draft.entries)
              WorkingLanguage(code: e.key, canEvaluate: e.value),
          ]);
      ref
        ..invalidate(myLanguagesProvider)
        ..invalidate(readinessProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Where a provider's money goes.
///
/// **The account number is typed once and never stored by us.** It goes
/// to the payment aggregator; we keep the last four digits and the IFSC
/// and nothing else (CLAUDE.md #31). That is why this screen shows
/// `•••• 5501` and offers no way to read a full number back — there is
/// nothing to read.
class ProviderPayoutScreen extends ConsumerStatefulWidget {
  const ProviderPayoutScreen({super.key});

  @override
  ConsumerState<ProviderPayoutScreen> createState() =>
      _ProviderPayoutScreenState();
}

class _ProviderPayoutScreenState extends ConsumerState<ProviderPayoutScreen> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _account = TextEditingController();
  final TextEditingController _ifsc = TextEditingController();
  bool _editing = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _account.dispose();
    _ifsc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<PayoutDestination> destination = ref.watch(
      payoutDestinationProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Where you get paid')),
      body: AsyncBody<PayoutDestination>(
        value: destination,
        onRetry: () => ref.invalidate(payoutDestinationProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (PayoutDestination d) => PageBody(
          children: <Widget>[
            if (d.isSet && !_editing) ...<Widget>[
              Panel(
                title: 'Current account',
                trailing: d.isVerified
                    ? const StatusChip('Verified', tone: ChipTone.verified)
                    : const StatusChip('Being checked', tone: ChipTone.caution),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    if (d.accountHolderName != null)
                      Field(
                        label: 'Account holder',
                        value: PackText(d.accountHolderName!),
                      ),
                    const SizedBox(height: Space.md),
                    Field(
                      label: 'Account',
                      value: Text(
                        '•••• ${d.bankAccountLast4}',
                        style: const TextStyle(
                          fontFeatures: <FontFeature>[
                            FontFeature.tabularFigures(),
                          ],
                        ),
                      ),
                    ),
                    if (d.bankIfsc != null) ...<Widget>[
                      const SizedBox(height: Space.md),
                      Field(label: 'IFSC', value: Text(d.bankIfsc!)),
                    ],
                    if (d.verificationNote != null) ...<Widget>[
                      const SizedBox(height: Space.md),
                      Note(d.verificationNote!),
                    ],
                  ],
                ),
              ),
              OutlinedButton(
                onPressed: () => setState(() => _editing = true),
                child: const PackText('Change the account'),
              ),
            ] else
              ..._formFields(context, d),
          ],
        ),
      ),
    );
  }

  List<Widget> _formFields(BuildContext context, PayoutDestination d) =>
      <Widget>[
        const Note(
          'These go straight to the licensed payment provider. We keep the '
          'last four digits and the IFSC, and never the full number.',
          icon: Icons.lock_outline,
        ),
        Form(
          key: _form,
          child: Panel(
            child: Column(
              children: <Widget>[
                TextFormField(
                  controller: _name,
                  decoration: const InputDecoration(
                    labelText: 'Name on the account',
                  ),
                  validator: (String? v) => (v == null || v.trim().isEmpty)
                      ? 'Enter the name exactly as the bank has it.'
                      : null,
                ),
                const SizedBox(height: Space.md),
                TextFormField(
                  controller: _account,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Account number',
                  ),
                  validator: (String? v) => (v == null || v.trim().length < 6)
                      ? 'Enter the full account number.'
                      : null,
                ),
                const SizedBox(height: Space.md),
                TextFormField(
                  controller: _ifsc,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(labelText: 'IFSC'),
                  validator: (String? v) => (v == null || v.trim().length != 11)
                      ? 'An IFSC is eleven characters.'
                      : null,
                ),
              ],
            ),
          ),
        ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const PackText('Save the account'),
        ),
        if (d.isSet)
          TextButton(
            onPressed: () => setState(() => _editing = false),
            child: const PackText('Cancel'),
          ),
        PackText(
          'A small deposit is used to check the account belongs to you. '
          'Money already earned is not lost while this happens — it waits.',
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
          textAlign: TextAlign.center,
        ),
      ];

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .setPayoutDestination(
            accountHolderName: _name.text.trim(),
            accountNumber: _account.text.trim(),
            ifsc: _ifsc.text.trim().toUpperCase(),
          );
      // Cleared from memory the moment it has been sent. It was never
      // ours to hold.
      _account.clear();
      ref
        ..invalidate(payoutDestinationProvider)
        ..invalidate(readinessProvider);
      if (mounted) setState(() => _editing = false);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
