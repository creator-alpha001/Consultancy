import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../api/api_error.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Setting up a second factor.
///
/// **Mandatory for providers and admins** (CLAUDE.md #32), and a database
/// trigger enforces it — an account of either kind cannot hold a session
/// without one. So this screen is not a settings page a person can leave:
/// it is reached with an ENROLMENT TICKET, which authorises this and
/// nothing else, and the router lets it go nowhere until the factor is
/// confirmed.
///
/// **The recovery codes are shown exactly once.** Only their hashes are
/// stored, so there is no "show them again" — offering one would be a
/// promise the server cannot keep.
class MfaEnrolScreen extends ConsumerStatefulWidget {
  const MfaEnrolScreen({super.key});

  @override
  ConsumerState<MfaEnrolScreen> createState() => _MfaEnrolScreenState();
}

class _MfaEnrolScreenState extends ConsumerState<MfaEnrolScreen> {
  final TextEditingController _code = TextEditingController();
  String? _secret;
  String? _provisioningUri;
  List<String>? _recoveryCodes;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _begin());
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);

    if (_recoveryCodes != null) return _RecoveryCodes(codes: _recoveryCodes!);

    return Scaffold(
      appBar: AppBar(
        title: const PackText('Set up your second factor'),
        automaticallyImplyLeading: false,
      ),
      body: PageBody(
        children: <Widget>[
          const Note(
            'Accounts that give guidance need a second factor. It is what '
            'stops someone who has your password from moving your money.',
            icon: Icons.shield_outlined,
          ),

          Panel(
            title: 'Add it to your authenticator',
            note:
                'Any authenticator app works. Scan the code with it — or, on '
                'this same phone, copy the key in — then type the six digits '
                'it gives you.',
            child: _busy && _secret == null
                ? const Center(child: CircularProgressIndicator())
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      if (_provisioningUri != null) ...<Widget>[
                        Center(
                          child: Semantics(
                            label:
                                'QR code for your authenticator app. The same '
                                'key is written out below.',
                            child: Container(
                              color: BaseColors.surface,
                              padding: const EdgeInsets.all(Space.sm),
                              child: QrImageView(
                                data: _provisioningUri!,
                                size: 196,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: Space.md),
                      ],
                      if (_secret != null) ...<Widget>[
                        Container(
                          padding: const EdgeInsets.all(Space.md),
                          decoration: BoxDecoration(
                            color: BaseColors.surfaceSunk,
                            borderRadius: BorderRadius.circular(Radii.md),
                          ),
                          child: SelectableText(
                            _secret!,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontFeatures: const <FontFeature>[
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(height: Space.sm),
                        OutlinedButton.icon(
                          icon: const Icon(Icons.copy, size: 18),
                          label: const PackText('Copy the key'),
                          onPressed: () async {
                            await Clipboard.setData(
                              ClipboardData(text: _secret!),
                            );
                            if (context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: PackText('Key copied')),
                              );
                            }
                          },
                        ),
                      ],
                    ],
                  ),
          ),

          Panel(
            title: 'Then confirm it works',
            child: TextField(
              controller: _code,
              onChanged: (_) => setState(() {}),
              keyboardType: TextInputType.number,
              maxLength: 6,
              decoration: const InputDecoration(
                labelText: 'Six-digit code',
                counterText: '',
              ),
              onSubmitted: (_) => _confirm(),
            ),
          ),

          if (_error != null) Note(_error!, tone: ChipTone.danger),

          FilledButton(
            onPressed: _busy || _code.text.trim().length < 6 ? null : _confirm,
            child: const PackText('Confirm'),
          ),
          OutlinedButton(
            onPressed: () => ref.read(authProvider).signOut(),
            child: const PackText('Sign out instead'),
          ),
        ],
      ),
    );
  }

  Future<void> _begin() async {
    setState(() => _busy = true);
    try {
      // Reached with the enrolment ticket, not a session — the API
      // accepts it here and on nothing else.
      final Map<String, dynamic> res = await ref
          .read(apiClientProvider)
          .post<Map<String, dynamic>>('/auth/mfa/enrol', asEnrolling: true);
      if (!mounted) return;
      // The otpauth:// URI becomes a QR code for an authenticator on
      // another device; the raw key stays for one on this phone, which
      // cannot scan its own screen.
      setState(() {
        _secret = res['secret'] as String?;
        _provisioningUri = res['provisioningUri'] as String?;
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final List<String> codes = await ref
          .read(authProvider)
          .confirmEnrolment(_code.text.trim());
      if (mounted) setState(() => _recoveryCodes = codes);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// The recovery codes, shown once and never again.
class _RecoveryCodes extends ConsumerStatefulWidget {
  const _RecoveryCodes({required this.codes});

  final List<String> codes;

  @override
  ConsumerState<_RecoveryCodes> createState() => _RecoveryCodesState();
}

class _RecoveryCodesState extends ConsumerState<_RecoveryCodes> {
  bool _saved = false;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const PackText('Save these'),
        automaticallyImplyLeading: false,
      ),
      body: PageBody(
        children: <Widget>[
          const Note(
            'These are shown once and cannot be shown again — only their '
            'hashes are kept. Each works a single time, if you lose your '
            'authenticator.',
            tone: ChipTone.caution,
            icon: Icons.warning_amber_outlined,
          ),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                for (final String c in widget.codes)
                  Padding(
                    padding: const EdgeInsets.only(bottom: Space.sm),
                    child: SelectableText(
                      c,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontFeatures: const <FontFeature>[
                          FontFeature.tabularFigures(),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          OutlinedButton.icon(
            icon: const Icon(Icons.copy, size: 18),
            label: const PackText('Copy them all'),
            onPressed: () async {
              await Clipboard.setData(
                ClipboardData(text: widget.codes.join('\n')),
              );
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: PackText('Codes copied')),
                );
              }
            },
          ),
          CheckboxListTile(
            value: _saved,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            title: const PackText('I have saved these somewhere safe'),
            onChanged: (bool? v) => setState(() => _saved = v ?? false),
          ),
          FilledButton(
            // Deliberately gated. Someone who taps past this screen and
            // loses their phone has no way back into an account that can
            // move money.
            onPressed: _saved ? () => ref.read(authProvider).restore() : null,
            child: const PackText('Done'),
          ),
        ],
      ),
    );
  }
}
