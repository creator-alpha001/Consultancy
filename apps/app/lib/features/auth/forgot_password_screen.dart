import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_error.dart';
import '../../providers.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Asking for a password-reset link.
///
/// **The screen says the same thing whether or not the address has an
/// account.** Anything else turns this form into a way to find out who is
/// registered — which on this platform means who is preparing for what.
///
/// The link opens the web app, on any device. That is deliberate: the
/// reset page needs no session and no install, and a person who has lost
/// their password may well have lost the phone too.
class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() =>
      _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final TextEditingController _email = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const PackText('Forgot your password'),
      leading: BackButton(onPressed: () => context.go('/sign-in')),
    ),
    body: PageBody(
      children: <Widget>[
        if (_sent)
          const Panel(
            child: Note(
              'If an account uses that address, a link to set a new password '
              'is on its way. It works for 30 minutes and can be opened on '
              'any device. Nothing arrived? Check spam, then ask again.',
              tone: ChipTone.verified,
              icon: Icons.mark_email_read_outlined,
            ),
          )
        else
          Panel(
            note:
                'Enter the email address you signed up with. We will send a '
                'link to set a new password.',
            child: TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const <String>[AutofillHints.email],
              decoration: const InputDecoration(labelText: 'Email'),
              onSubmitted: (_) => _send(),
            ),
          ),
        if (_error != null) Note(_error!, tone: ChipTone.danger),
        if (!_sent)
          FilledButton(
            onPressed: _busy ? null : _send,
            child: const PackText('Send the link'),
          ),
        TextButton(
          onPressed: () => context.go('/sign-in'),
          child: const PackText('Back to sign in'),
        ),
      ],
    ),
  );

  Future<void> _send() async {
    final String email = _email.text.trim();
    if (!email.contains('@')) {
      setState(() => _error = 'Enter the email address you signed up with.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(repositoryProvider).forgotPassword(email);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
