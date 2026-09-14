import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../api/models/user.dart';
import '../pack/label.dart';
import '../pack/pack.dart';
import '../theme/generated_tokens.dart';
import '../widgets/text.dart';

/// One destination in a shell's bottom bar.
class ShellTab {
  const ShellTab({
    required this.path,
    required this.label,
    required this.icon,
    required this.selectedIcon,
  });

  final String path;

  /// A [Label], not a String — the tab that says "Mentor" in one family
  /// says something else in another, and neither word belongs in code.
  final Label label;
  final IconData icon;
  final IconData selectedIcon;
}

/// The two shells.
///
/// A user row holds exactly one role, so the shell is chosen once, from
/// what `/auth/me` returned, and never switched inside the app.
///
/// The nouns come from the pack. Only the *structural* words — "Home",
/// "Sessions" — are the app's own, and those live in the ARB catalogue
/// rather than here once i18n lands.
abstract final class Shells {
  static List<ShellTab> forRole(Role role, Vocab vocab) => switch (role) {
    Role.seeker => seeker(vocab),
    Role.provider => provider(vocab),
    // Admin is a web surface. The app signs an admin in and says so
    // rather than building a second, worse ops console on a phone.
    Role.admin => const <ShellTab>[],
  };

  static List<ShellTab> seeker(Vocab vocab) => <ShellTab>[
    const ShellTab(
      path: '/home',
      label: Label(<String, String>{'en': 'Home'}),
      icon: Icons.home_outlined,
      selectedIcon: Icons.home,
    ),
    // Structural words, not nouns. The shell sits above every field at
    // once (a seeker may be in three), so no family's word for a provider
    // fits it — and the platform's own words, "Provider" and
    // "Engagement", read as internal jargon on a tab.
    const ShellTab(
      path: '/find',
      label: Label(<String, String>{'en': 'Find', 'hi': 'खोजें'}),
      icon: Icons.search_outlined,
      selectedIcon: Icons.search,
    ),
    const ShellTab(
      path: '/work',
      label: Label(<String, String>{'en': 'Work', 'hi': 'काम'}),
      icon: Icons.folder_outlined,
      selectedIcon: Icons.folder,
    ),
    const ShellTab(
      path: '/sessions',
      label: Label(<String, String>{'en': 'Sessions'}),
      icon: Icons.videocam_outlined,
      selectedIcon: Icons.videocam,
    ),
    const ShellTab(
      path: '/you',
      label: Label(<String, String>{'en': 'You'}),
      icon: Icons.person_outline,
      selectedIcon: Icons.person,
    ),
  ];

  static List<ShellTab> provider(Vocab vocab) => <ShellTab>[
    const ShellTab(
      path: '/provider',
      label: Label(<String, String>{'en': 'Dashboard'}),
      icon: Icons.dashboard_outlined,
      selectedIcon: Icons.dashboard,
    ),
    const ShellTab(
      path: '/provider/requests',
      label: Label(<String, String>{'en': 'Requests'}),
      icon: Icons.inbox_outlined,
      selectedIcon: Icons.inbox,
    ),
    const ShellTab(
      path: '/provider/work',
      label: Label(<String, String>{'en': 'Work', 'hi': 'काम'}),
      icon: Icons.folder_outlined,
      selectedIcon: Icons.folder,
    ),
    const ShellTab(
      path: '/provider/earnings',
      label: Label(<String, String>{'en': 'Earnings'}),
      icon: Icons.account_balance_wallet_outlined,
      selectedIcon: Icons.account_balance_wallet,
    ),
    const ShellTab(
      path: '/you',
      label: Label(<String, String>{'en': 'You'}),
      icon: Icons.person_outline,
      selectedIcon: Icons.person,
    ),
  ];
}

/// The scaffold every signed-in screen sits inside.
class AppShell extends StatelessWidget {
  const AppShell({
    required this.tabs,
    required this.lang,
    required this.child,
    super.key,
  });

  final List<ShellTab> tabs;
  final String lang;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final String location = GoRouterState.of(context).uri.path;
    final int index = _indexFor(location);

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (int i) => context.go(tabs[i].path),
        backgroundColor: BaseColors.surface,
        surfaceTintColor: Colors.transparent,
        // The 48px floor applies to a tab as much as to a button; the
        // default height already clears it and this stops a future
        // density change from quietly dropping below.
        height: kTouchTarget + Space.lg,
        destinations: <NavigationDestination>[
          for (final ShellTab t in tabs)
            NavigationDestination(
              icon: Icon(t.icon),
              selectedIcon: Icon(t.selectedIcon),
              // The accessible name and the visible one are the same
              // string, so a screen reader says what the eye reads.
              label: t.label(lang),
              tooltip: t.label(lang),
            ),
        ],
      ),
    );
  }

  /// The longest matching tab path wins, so `/provider/work` selects the
  /// work tab rather than the dashboard whose path is its prefix.
  int _indexFor(String location) {
    int best = 0;
    int bestLength = -1;
    for (int i = 0; i < tabs.length; i++) {
      final String p = tabs[i].path;
      if ((location == p || location.startsWith('$p/')) && p.length > bestLength) {
        best = i;
        bestLength = p.length;
      }
    }
    return best;
  }
}

/// What an admin sees. Deliberately a dead end rather than a half-built
/// ops console: verification queues, dispute adjudication, moderation,
/// reconciliation and the pack editor are web surfaces.
class AdminElsewhere extends StatelessWidget {
  const AdminElsewhere({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.desktop_windows_outlined, size: 40),
            const SizedBox(height: Space.lg),
            PackText(
              'Operations runs on the web',
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: Space.sm),
            PackText(
              'Verification, disputes, moderation and configuration are '
              'reviewed on a full screen, not a phone. Sign in to the web '
              'console to pick up your queues.',
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(color: BaseColors.inkMuted),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    ),
  );
}
