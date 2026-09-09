import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/models/user.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../session/auth_controller.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The account surface.
///
/// Also where the two security affordances live that matter after a
/// suspected compromise: seeing which devices hold a live session, and
/// ending all of them at once.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final AuthController auth = ref.watch(authProvider);
    final User? user = auth.user;
    final String lang = ref.watch(langProvider);
    final AsyncValue<List<Map<String, dynamic>>> domains = ref.watch(
      myDomainsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('You')),
      body: PageBody(
        children: <Widget>[
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                PackText(
                  user?.email ?? '',
                  style: theme.textTheme.titleMedium,
                ),
                const SizedBox(height: Space.xs),
                StatusChip(
                  switch (user?.role) {
                    Role.provider => 'Giving guidance',
                    Role.seeker => 'Seeking guidance',
                    Role.admin => 'Operations',
                    null => '—',
                  },
                ),
              ],
            ),
          ),

          // A seeker has many active fields. Shown as a list, never as
          // "your field" (CLAUDE.md #6).
          if (user?.role == Role.seeker)
            domains.maybeWhen(
              data: (List<Map<String, dynamic>> list) => Panel(
                title: 'Your fields',
                note: 'You can be working in several at once.',
                child: Column(
                  children: <Widget>[
                    for (final Map<String, dynamic> d in list)
                      NavRow(
                        title:
                            ((d['labels'] as Map<String, dynamic>?)?[lang] ??
                                    (d['labels']
                                        as Map<String, dynamic>?)?['en'] ??
                                    d['domainCode'])
                                .toString(),
                        subtitle:
                            'Working in ${(d['workingLanguage'] ?? 'en').toString().toUpperCase()}'
                            '${d['isPrimary'] == true ? ' · main' : ''}',
                        leading: const Icon(Icons.folder_outlined, size: 20),
                      ),
                  ],
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),

          Panel(
            title: 'Language',
            note: 'Changes the words on screen. It does not change the '
                'language your work happens in — that is agreed per piece '
                'of work.',
            child: Wrap(
              spacing: Space.sm,
              runSpacing: Space.sm,
              children: <Widget>[
                for (final String l in <String>['en', 'hi'])
                  ChoiceChip(
                    label: Text(l.toUpperCase()),
                    selected: lang == l,
                    onSelected: (_) =>
                        ref.read(langProvider.notifier).state = l,
                  ),
              ],
            ),
          ),

          if (user?.role == Role.provider)
            Panel(
              title: 'Your setup',
              child: Column(
                children: <Widget>[
                  NavRow(
                    title: 'Verification',
                    leading: const Icon(Icons.verified_outlined, size: 20),
                    onTap: () => context.push('/provider/standing'),
                  ),
                  NavRow(
                    title: 'What you offer',
                    leading: const Icon(Icons.sell_outlined, size: 20),
                    onTap: () => context.push('/provider/services'),
                  ),
                  NavRow(
                    title: 'Availability',
                    leading: const Icon(Icons.schedule, size: 20),
                    onTap: () => context.push('/provider/availability'),
                  ),
                ],
              ),
            ),

          const _Devices(),

          Panel(
            title: 'Legal',
            child: Column(
              children: <Widget>[
                NavRow(
                  title: 'Terms, privacy and refunds',
                  subtitle: 'The wording you accepted, as you accepted it',
                  leading: const Icon(Icons.description_outlined, size: 20),
                  onTap: () => context.push('/legal'),
                ),
              ],
            ),
          ),

          OutlinedButton(
            onPressed: () => ref.read(authProvider).signOut(),
            child: const PackText('Sign out'),
          ),
        ],
      ),
    );
  }
}

/// Live sessions on other devices.
///
/// "Sign out everywhere else" is the first move after a suspected
/// compromise, so it is one tap from here rather than buried in a
/// settings tree.
class _Devices extends ConsumerStatefulWidget {
  const _Devices();

  @override
  ConsumerState<_Devices> createState() => _DevicesState();
}

class _DevicesState extends ConsumerState<_Devices> {
  bool _busy = false;
  String? _done;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Signed in',
    note: 'If you do not recognise something here, end the others now.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (_done != null) ...<Widget>[
          Note(_done!, tone: ChipTone.verified),
          const SizedBox(height: Space.md),
        ],
        OutlinedButton(
          onPressed: _busy ? null : _signOutOthers,
          child: const PackText('Sign out everywhere else'),
        ),
      ],
    ),
  );

  Future<void> _signOutOthers() async {
    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).signOutOtherDevices();
      if (mounted) {
        setState(() => _done = 'Every other device has been signed out.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
