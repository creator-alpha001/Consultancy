import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_client.dart';
import '../../api/api_error.dart';
import '../../api/models/user.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Creating an account.
///
/// Two things here are requirements rather than form fields.
///
/// **The platform is 18+** (CLAUDE.md #27). Registration is refused
/// without an explicit confirmation, and there is deliberately no flow
/// anywhere in this app that accommodates a minor — no age picker, no
/// guardian path, no "under 18" branch. The checkbox is unticked by
/// default and the button stays disabled until it is ticked, because a
/// pre-ticked consent is not a consent.
///
/// **Which family's wording was on screen** is sent with the
/// registration, so the acceptance records what was actually shown rather
/// than only a timestamp. A registration with no family recorded is the
/// weaker state the API's own comment says it wants to move away from.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();

  Role _role = Role.seeker;
  String? _familyCode;
  bool _confirmsAdult = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String lang = ref.watch(langProvider);
    final AsyncValue<Catalogue> catalogue = ref.watch(catalogueProvider);

    return Scaffold(
      appBar: AppBar(title: const PackText('Create an account')),
      body: Form(
        key: _form,
        child: PageBody(
          children: <Widget>[
            Panel(
              title: 'What brings you here?',
              child: RadioGroup<Role>(
                groupValue: _role,
                onChanged: (Role? r) => setState(() => _role = r ?? _role),
                child: const Column(
                  children: <Widget>[
                    RadioListTile<Role>(
                      value: Role.seeker,
                      contentPadding: EdgeInsets.zero,
                      title: PackText('I want guidance'),
                      subtitle: PackText(
                        'Find someone verified, agree what you need, pay only '
                        'when it is done.',
                      ),
                    ),
                    RadioListTile<Role>(
                      value: Role.provider,
                      contentPadding: EdgeInsets.zero,
                      title: PackText('I want to give guidance'),
                      subtitle: PackText(
                        'You will be verified skill by skill before anyone can '
                        'book you, and will need a second factor to sign in.',
                      ),
                    ),
                  ],
                ),
              ),
            ),

            catalogue.maybeWhen(
              data: (Catalogue c) => Panel(
                title: 'Which field?',
                note:
                    'It decides the wording you are agreeing to. You can work '
                    'in more than one later.',
                child: Wrap(
                  spacing: Space.sm,
                  runSpacing: Space.sm,
                  children: <Widget>[
                    for (final CatalogueFamily f in c.families)
                      ChoiceChip(
                        label: PackText(f.label(lang)),
                        selected: _familyCode == f.code,
                        onSelected: (_) =>
                            setState(() => _familyCode = f.code),
                      ),
                  ],
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),

            Panel(
              child: Column(
                children: <Widget>[
                  TextFormField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const <String>[AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'Email'),
                    validator: (String? v) => (v == null || v.trim().isEmpty)
                        ? 'Enter an email address.'
                        : null,
                  ),
                  const SizedBox(height: Space.md),
                  TextFormField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const <String>[AutofillHints.newPassword],
                    decoration: const InputDecoration(
                      labelText: 'Password',
                      helperText: 'At least twelve characters.',
                    ),
                    validator: (String? v) => (v == null || v.length < 12)
                        ? 'Use at least twelve characters.'
                        : null,
                  ),
                ],
              ),
            ),

            Panel(
              child: CheckboxListTile(
                value: _confirmsAdult,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                title: const PackText('I am 18 or older'),
                subtitle: const PackText(
                  'Sankalp is for adults only. We cannot create an account '
                  'without this.',
                ),
                onChanged: (bool? v) =>
                    setState(() => _confirmsAdult = v ?? false),
              ),
            ),

            if (_error != null) Note(_error!, tone: ChipTone.danger),

            FilledButton(
              // Disabled until the confirmation is given — never
              // pre-ticked, and never inferred from anything else.
              onPressed: _confirmsAdult && !_busy ? _submit : null,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const PackText('Create the account'),
            ),
            TextButton(
              onPressed: () => context.go('/sign-in'),
              child: const PackText('I already have an account'),
            ),
            PackText(
              'Creating an account means accepting the terms and the privacy '
              'notice for the field you chose.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: BaseColors.inkMuted,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final ApiClient api = ref.read(apiClientProvider);
      await api.post<Map<String, dynamic>>(
        '/auth/register',
        body: <String, dynamic>{
          'email': _email.text.trim(),
          'password': _password.text,
          'role': _role.wire,
          'confirmsAdult': _confirmsAdult,
          'familyCode': ?_familyCode,
          'lang': ref.read(langProvider),
        },
      );
      // Straight in: an account that exists but leaves you on a form is
      // a dead end, and a provider needs to reach second-factor
      // enrolment anyway.
      await ref
          .read(authProvider)
          .signIn(email: _email.text.trim(), password: _password.text);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
