import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../api/models/user.dart';
import '../../providers.dart';
import '../../session/auth_controller.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/messenger.dart';
import '../../widgets/text.dart';

/// One sign-in for everyone.
///
/// A person getting guidance and a person giving it sign in on the same
/// screen with the same email and password. The choice at the top changes
/// the wording and where "create an account" leads; it grants nothing.
/// Which app they land in comes from the account the API returns (#28),
/// so choosing "Give guidance" on a seeker's account cannot make it one —
/// and the person is told so rather than left wondering.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final TextEditingController _email = TextEditingController();
  final TextEditingController _password = TextEditingController();
  final TextEditingController _code = TextEditingController();
  final GlobalKey<FormState> _form = GlobalKey<FormState>();

  /// Set once the API has said this account holds a second factor. The
  /// code field is not shown before that, because most seekers do not
  /// have one and an empty box they cannot fill is noise.
  bool _needsCode = false;
  bool _busy = false;
  bool _showPassword = false;

  /// Which kind of account the person says they are signing in to.
  Role _as = Role.seeker;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      final LoginOutcome outcome = await ref
          .read(authProvider)
          .signIn(
            email: _email.text.trim(),
            password: _password.text,
            totpCode: _needsCode && _code.text.trim().isNotEmpty
                ? _code.text.trim()
                : null,
          );
      if (!mounted) return;

      switch (outcome) {
        case LoginNeedsCode():
          setState(() {
            _needsCode = true;
            // Not an error — the account is fine and is being asked for
            // its second factor, which is what #32 requires of every
            // provider and admin.
            _error = _code.text.isEmpty
                ? null
                : 'That code was not accepted. Try the current one.';
          });
        case LoginSession():
          _explainIfNotWhatTheyChose();
        case LoginNeedsEnrolment():
          // The router redirects on the auth state; nothing to do here.
          break;
      }
    } on ApiException catch (e) {
      // `message` is shown exactly as the API localised it, and is never
      // parsed or matched against.
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// The account decides the role. If it is not the one they picked,
  /// say which it is, once, on the screen they land on.
  void _explainIfNotWhatTheyChose() {
    final Role? actual = ref.read(authProvider).user?.role;
    if (actual == null || actual == _as || actual == Role.admin) return;
    rootMessenger.currentState?.showSnackBar(
      SnackBar(
        duration: const Duration(seconds: 8),
        content: PackText(
          actual == Role.provider
              ? 'This account is for giving guidance, so you are in that '
                    'side of the app. Getting guidance needs its own account.'
              : 'This account is for getting guidance, so you are in that '
                    'side of the app. Giving guidance needs its own account, '
                    'with a different email.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final AuthState state = ref.watch(authProvider).state;
    final String? ended = state is AuthSignedOut ? state.because : null;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(Space.xl),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    PackText('Sankalp', style: theme.textTheme.displaySmall),
                    const SizedBox(height: Space.xs),
                    PackText(
                      'Guidance from someone who has been verified to give it.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: BaseColors.inkMuted,
                      ),
                    ),
                    const SizedBox(height: Space.xl),

                    _RoleChoice(
                      value: _as,
                      enabled: !_busy,
                      onChanged: (Role r) => setState(() => _as = r),
                    ),
                    const SizedBox(height: Space.lg),

                    if (ended != null) ...<Widget>[
                      _Notice(text: ended, tone: _Tone.info),
                      const SizedBox(height: Space.lg),
                    ],
                    if (_error != null) ...<Widget>[
                      _Notice(text: _error!, tone: _Tone.danger),
                      const SizedBox(height: Space.lg),
                    ],

                    TextFormField(
                      controller: _email,
                      autofillHints: const <String>[AutofillHints.email],
                      keyboardType: TextInputType.emailAddress,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(labelText: 'Email'),
                      validator: (String? v) => (v == null || v.trim().isEmpty)
                          ? 'Enter your email address.'
                          : null,
                    ),
                    const SizedBox(height: Space.md),
                    TextFormField(
                      controller: _password,
                      autofillHints: const <String>[AutofillHints.password],
                      obscureText: !_showPassword,
                      textInputAction: _needsCode
                          ? TextInputAction.next
                          : TextInputAction.done,
                      decoration: InputDecoration(
                        labelText: 'Password',
                        // Typing a long password on a phone keyboard with
                        // no way to check it is how people get locked out.
                        suffixIcon: IconButton(
                          tooltip: _showPassword
                              ? 'Hide password'
                              : 'Show password',
                          icon: Icon(
                            _showPassword
                                ? Icons.visibility_off_outlined
                                : Icons.visibility_outlined,
                          ),
                          onPressed: () =>
                              setState(() => _showPassword = !_showPassword),
                        ),
                      ),
                      validator: (String? v) => (v == null || v.isEmpty)
                          ? 'Enter your password.'
                          : null,
                      onFieldSubmitted: (_) {
                        if (!_needsCode) _submit();
                      },
                    ),

                    if (_needsCode) ...<Widget>[
                      const SizedBox(height: Space.md),
                      TextFormField(
                        controller: _code,
                        autofocus: true,
                        keyboardType: TextInputType.number,
                        textInputAction: TextInputAction.done,
                        decoration: const InputDecoration(
                          labelText: 'Six-digit code',
                          helperText:
                              'From your authenticator app. Required for '
                              'accounts that give guidance.',
                        ),
                        validator: (String? v) =>
                            (v == null || v.trim().length < 6)
                            ? 'Enter the six-digit code.'
                            : null,
                        onFieldSubmitted: (_) => _submit(),
                      ),
                    ],

                    const SizedBox(height: Space.xl),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      child: _busy
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const PackText('Sign in'),
                    ),
                    const SizedBox(height: Space.sm),
                    TextButton(
                      onPressed: _busy
                          ? null
                          : () => context.go('/forgot-password'),
                      child: const PackText('Forgot your password?'),
                    ),
                    const SizedBox(height: Space.lg),
                    Row(
                      children: <Widget>[
                        const Expanded(child: Divider()),
                        Padding(
                          padding: const EdgeInsets.symmetric(
                            horizontal: Space.md,
                          ),
                          child: PackText(
                            'New to Sankalp?',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: BaseColors.inkMuted,
                            ),
                          ),
                        ),
                        const Expanded(child: Divider()),
                      ],
                    ),
                    const SizedBox(height: Space.md),
                    OutlinedButton(
                      onPressed: _busy
                          ? null
                          : () => context.go('/register?as=${_as.wire}'),
                      child: PackText(
                        _as == Role.provider
                            ? 'Join to give guidance'
                            : 'Create an account',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Get guidance" or "Give guidance", with a line saying what signing in
/// as each involves.
class _RoleChoice extends StatelessWidget {
  const _RoleChoice({
    required this.value,
    required this.enabled,
    required this.onChanged,
  });

  final Role value;
  final bool enabled;
  final ValueChanged<Role> onChanged;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        SegmentedButton<Role>(
          showSelectedIcon: false,
          segments: const <ButtonSegment<Role>>[
            ButtonSegment<Role>(
              value: Role.seeker,
              icon: Icon(Icons.search, size: 18),
              label: PackText('Get guidance'),
            ),
            ButtonSegment<Role>(
              value: Role.provider,
              icon: Icon(Icons.school_outlined, size: 18),
              label: PackText('Give guidance'),
            ),
          ],
          selected: <Role>{value},
          onSelectionChanged: enabled
              ? (Set<Role> s) => onChanged(s.first)
              : null,
        ),
        const SizedBox(height: Space.sm),
        PackText(
          value == Role.provider
              ? 'For everyone who gives guidance on Sankalp. After your '
                    'password you will be asked for your second-factor code.'
              : 'Find someone verified in what you need, and keep track of '
                    'your work and money.',
          style: theme.textTheme.bodySmall?.copyWith(
            color: BaseColors.inkMuted,
          ),
        ),
      ],
    );
  }
}

enum _Tone { info, danger }

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.tone});

  final String text;
  final _Tone tone;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color line, Color ink) = switch (tone) {
      _Tone.info => (
        BaseColors.infoSoft,
        BaseColors.infoLine,
        BaseColors.info,
      ),
      _Tone.danger => (
        BaseColors.dangerSoft,
        BaseColors.dangerLine,
        BaseColors.danger,
      ),
    };
    return Container(
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      // Announced to a screen reader when it appears, rather than only
      // being visible.
      child: Semantics(
        liveRegion: true,
        child: PackText(
          text,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: ink),
        ),
      ),
    );
  }
}
