import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/user.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The languages a person can choose for the platform to speak to them in.
///
/// The interface's own languages — not the language work happens in,
/// which is agreed per piece of work (#19) and per field.
const List<String> _interfaceLanguages = <String>['en', 'hi'];

/// Name, language, email confirmation, and — for a provider — the
/// headline and bio a seeker reads before booking.
///
/// What is deliberately not asked: a photo (uploads are private by rule
/// #29, and a public one is its own decision), and any contact detail —
/// the API refuses those in a bio, because they route people around
/// escrow and the dispute process that protects them.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _headline = TextEditingController();
  final TextEditingController _bio = TextEditingController();
  String _lang = 'en';
  String? _bioLang;
  bool _loaded = false;
  bool _busy = false;
  bool _resending = false;
  String? _message;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _headline.dispose();
    _bio.dispose();
    super.dispose();
  }

  void _fill(MyProfile p) {
    if (_loaded) return;
    _loaded = true;
    _name.text = p.displayName ?? '';
    _headline.text = p.headline ?? '';
    _bio.text = p.bio ?? '';
    _lang = p.preferredLang;
    _bioLang = p.bioLang ?? p.preferredLang;
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<MyProfile> profile = ref.watch(myProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Your profile')),
      body: AsyncBody<MyProfile>(
        value: profile,
        onRetry: () => ref.invalidate(myProfileProvider),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (MyProfile p) {
          _fill(p);
          return PageBody(
            children: <Widget>[
              _EmailPanel(
                profile: p,
                resending: _resending,
                onResend: _resend,
              ),
              Panel(
                title: 'What people see',
                child: Column(
                  children: <Widget>[
                    TextField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      autofillHints: const <String>[AutofillHints.name],
                      decoration: const InputDecoration(
                        labelText: 'Your name',
                        helperText:
                            'Shown to the people you work with. Never your email.',
                      ),
                    ),
                    if (p.isProvider) ...<Widget>[
                      const SizedBox(height: Space.md),
                      TextField(
                        controller: _headline,
                        maxLength: 120,
                        decoration: const InputDecoration(
                          labelText: 'Headline',
                          helperText: 'One line about what you help with.',
                        ),
                      ),
                      TextField(
                        controller: _bio,
                        maxLength: 2000,
                        minLines: 4,
                        maxLines: 10,
                        decoration: const InputDecoration(
                          labelText: 'About you',
                          helperText:
                              'Your experience, in your own words. No phone '
                              'numbers or email addresses — they are refused.',
                          alignLabelWithHint: true,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (p.isProvider)
                Panel(
                  title: 'The language you wrote that in',
                  note:
                      'Kept with the text. What you wrote is what counts; '
                      'a translation is only ever a convenience.',
                  child: _LangChips(
                    selected: _bioLang ?? 'en',
                    onSelected: (String l) => setState(() => _bioLang = l),
                  ),
                ),
              Panel(
                title: 'Language for emails and the app',
                child: _LangChips(
                  selected: _lang,
                  onSelected: (String l) => setState(() => _lang = l),
                ),
              ),
              if (_message != null) Note(_message!, tone: ChipTone.verified),
              if (_error != null) Note(_error!, tone: ChipTone.danger),
              FilledButton(
                onPressed: _busy ? null : () => _save(p),
                child: const PackText('Save'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _save(MyProfile p) async {
    setState(() {
      _busy = true;
      _error = null;
      _message = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .updateProfile(
            displayName: _name.text.trim(),
            preferredLang: _lang,
            headline: p.isProvider ? _headline.text.trim() : null,
            bio: p.isProvider ? _bio.text.trim() : null,
            bioLang: p.isProvider ? _bioLang : null,
          );
      ref.read(langProvider.notifier).state = _lang;
      ref
        ..invalidate(myProfileProvider)
        ..invalidate(readinessProvider);
      // The signed-in user carries the name the shell shows.
      await ref.read(authProvider).restore();
      if (mounted) setState(() => _message = 'Saved.');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _resend() async {
    setState(() {
      _resending = true;
      _error = null;
      _message = null;
    });
    try {
      await ref.read(repositoryProvider).resendEmailVerification();
      if (mounted) {
        setState(
          () => _message =
              'Sent. Open the link in that email, on any device. It works '
              'for 48 hours.',
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }
}

class _EmailPanel extends StatelessWidget {
  const _EmailPanel({
    required this.profile,
    required this.resending,
    required this.onResend,
  });

  final MyProfile profile;
  final bool resending;
  final Future<void> Function() onResend;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Email',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        PackText(profile.email, style: Theme.of(context).textTheme.titleSmall),
        const SizedBox(height: Space.sm),
        if (profile.emailVerified)
          const Note(
            'Confirmed.',
            tone: ChipTone.verified,
            icon: Icons.check_circle_outline,
          )
        else ...<Widget>[
          Note(
            profile.isProvider
                ? 'Not confirmed yet. People cannot book you until it is — '
                      'payouts and decisions about your work are sent here.'
                : 'Not confirmed yet. We sent a link when you signed up.',
            tone: ChipTone.caution,
            icon: Icons.mark_email_unread_outlined,
          ),
          const SizedBox(height: Space.sm),
          OutlinedButton(
            onPressed: resending ? null : () => onResend(),
            child: const PackText('Send the link again'),
          ),
        ],
      ],
    ),
  );
}

class _LangChips extends StatelessWidget {
  const _LangChips({required this.selected, required this.onSelected});

  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) => Wrap(
    spacing: Space.sm,
    runSpacing: Space.sm,
    children: <Widget>[
      for (final String l in _interfaceLanguages)
        ChoiceChip(
          label: Text(l.toUpperCase()),
          selected: selected == l,
          onSelected: (_) => onSelected(l),
        ),
    ],
  );
}

/// Changing a password while signed in.
///
/// Every OTHER device is signed out when it succeeds, and the screen says
/// so first — someone changing a password because they suspect a
/// compromise wants exactly that, and someone who did not expect it
/// should not be surprised by it.
class ChangePasswordScreen extends ConsumerStatefulWidget {
  const ChangePasswordScreen({super.key});

  @override
  ConsumerState<ChangePasswordScreen> createState() =>
      _ChangePasswordScreenState();
}

class _ChangePasswordScreenState extends ConsumerState<ChangePasswordScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  bool _busy = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Change your password')),
    body: PageBody(
      children: <Widget>[
        if (_done)
          const Panel(
            child: Note(
              'Changed. Every other device has been signed out.',
              tone: ChipTone.verified,
            ),
          )
        else ...<Widget>[
          const Note(
            'Changing it signs you out everywhere except here.',
            icon: Icons.info_outline,
          ),
          Panel(
            child: Column(
              children: <Widget>[
                TextField(
                  controller: _current,
                  obscureText: true,
                  autofillHints: const <String>[AutofillHints.password],
                  decoration: const InputDecoration(
                    labelText: 'Current password',
                  ),
                ),
                const SizedBox(height: Space.md),
                TextField(
                  controller: _next,
                  obscureText: true,
                  autofillHints: const <String>[AutofillHints.newPassword],
                  decoration: const InputDecoration(
                    labelText: 'New password',
                    helperText: 'At least twelve characters.',
                  ),
                ),
              ],
            ),
          ),
          if (_error != null) Note(_error!, tone: ChipTone.danger),
          FilledButton(
            onPressed: _busy ? null : _save,
            child: const PackText('Change it'),
          ),
        ],
      ],
    ),
  );

  Future<void> _save() async {
    if (_next.text.length < 12) {
      setState(() => _error = 'Use at least twelve characters.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .changePassword(
            currentPassword: _current.text,
            newPassword: _next.text,
          );
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) {
        setState(
          () => _error = e.code == 'INVALID_CREDENTIALS'
              ? 'That is not your current password.'
              : e.message,
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// A seeker's fields: which ones, in which language, and which is main.
///
/// Many at once is the normal case (#6) — most people preparing for one
/// exam are preparing for another alongside it — so this adds without
/// replacing. The working language is chosen per field (#19), from the
/// languages that field actually offers.
class FieldsScreen extends ConsumerWidget {
  const FieldsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Map<String, dynamic>>> mine = ref.watch(
      myDomainsProvider,
    );
    final AsyncValue<Catalogue> catalogue = ref.watch(catalogueProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Your fields')),
      body: AsyncBody<Catalogue>(
        value: catalogue,
        onRetry: () => ref.invalidate(catalogueProvider),
        emptyWhen: (Catalogue c) => c.allDomains.isEmpty,
        emptyMessage: 'Nothing is open yet.',
        builder: (Catalogue c) {
          final List<Map<String, dynamic>> declared =
              mine.valueOrNull ?? const <Map<String, dynamic>>[];
          final Set<String> declaredCodes = <String>{
            for (final Map<String, dynamic> d in declared)
              (d['domainCode'] ?? '').toString(),
          };
          return PageBody(
            onRefresh: () async => ref.invalidate(myDomainsProvider),
            children: <Widget>[
              const Note(
                'Choose every field you are preparing for. What you see — '
                'people, questions, calendars — follows these.',
                icon: Icons.info_outline,
              ),
              for (final CatalogueFamily f in c.families)
                if (f.domains.isNotEmpty)
                  Panel(
                    title: f.label(lang),
                    child: Column(
                      children: <Widget>[
                        for (final DomainListing d in f.domains)
                          _FieldRow(
                            domain: d,
                            lang: lang,
                            declared: declared.firstWhere(
                              (Map<String, dynamic> m) =>
                                  m['domainCode'] == d.code,
                              orElse: () => const <String, dynamic>{},
                            ),
                            isDeclared: declaredCodes.contains(d.code),
                          ),
                      ],
                    ),
                  ),
            ],
          );
        },
      ),
    );
  }
}

class _FieldRow extends ConsumerStatefulWidget {
  const _FieldRow({
    required this.domain,
    required this.lang,
    required this.declared,
    required this.isDeclared,
  });

  final DomainListing domain;
  final String lang;
  final Map<String, dynamic> declared;
  final bool isDeclared;

  @override
  ConsumerState<_FieldRow> createState() => _FieldRowState();
}

class _FieldRowState extends ConsumerState<_FieldRow> {
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final DomainListing d = widget.domain;
    final String? working = widget.declared['workingLanguage'] as String?;
    final bool primary = widget.declared['isPrimary'] == true;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Expanded(
                child: PackText(
                  d.label(widget.lang),
                  style: Theme.of(context).textTheme.titleSmall,
                ),
              ),
              if (primary) const StatusChip('Main', tone: ChipTone.verified),
              if (widget.isDeclared)
                IconButton(
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: 'Remove this field',
                  onPressed: _busy ? null : _remove,
                ),
            ],
          ),
          const SizedBox(height: Space.xs),
          PackText(
            widget.isDeclared ? 'Working in' : 'Add, working in',
            style: Theme.of(
              context,
            ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
          ),
          const SizedBox(height: Space.xs),
          Wrap(
            spacing: Space.sm,
            runSpacing: Space.sm,
            children: <Widget>[
              for (final String l in d.languages)
                ChoiceChip(
                  label: Text(l.toUpperCase()),
                  selected: working == l,
                  onSelected: _busy ? null : (_) => _declare(l, primary),
                ),
              if (widget.isDeclared && !primary)
                ActionChip(
                  label: const PackText('Make main'),
                  onPressed: _busy
                      ? null
                      : () => _declare(working ?? d.defaultLanguage, true),
                ),
            ],
          ),
          if (_error != null) Note(_error!, tone: ChipTone.danger),
        ],
      ),
    );
  }

  Future<void> _declare(String language, bool primary) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .declareDomain(
            widget.domain.code,
            workingLanguage: language,
            isPrimary: primary ? true : null,
          );
      ref.invalidate(myDomainsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).removeDomain(widget.domain.code);
      ref.invalidate(myDomainsProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
