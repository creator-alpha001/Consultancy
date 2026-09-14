import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'api/models/user.dart';
import 'features/account/account_screen.dart';
import 'features/account/legal_and_report.dart';
import 'features/account/profile_screens.dart';
import 'features/auth/forgot_password_screen.dart';
import 'features/auth/mfa_enrol_screen.dart';
import 'features/auth/register_screen.dart';
import 'features/auth/sign_in_screen.dart';
import 'features/board/board_post_screen.dart';
import 'features/board/board_screen.dart';
import 'features/board/new_request_screen.dart';
import 'features/board/questions_screen.dart';
import 'features/discover/field_screen.dart';
import 'features/discover/find_screen.dart';
import 'features/discover/provider_screen.dart';
import 'features/engagement/agenda_screen.dart';
import 'features/engagement/assessment_screen.dart';
import 'features/engagement/engagement_screen.dart';
import 'features/engagement/work_screen.dart';
import 'features/home/home_screen.dart';
import 'features/money/money_screen.dart';
import 'features/progress/progress_screen.dart';
import 'features/provider/dashboard_screen.dart';
import 'features/provider/earnings_screen.dart';
import 'features/provider/evaluate_screen.dart';
import 'features/provider/services_screen.dart';
import 'features/provider/standing_screen.dart';
import 'features/provider/supply_screens.dart';
import 'features/session/room_screen.dart';
import 'features/session/sessions_screen.dart';
import 'features/trust/dispute_screen.dart';
import 'features/trust/review_screen.dart';
import 'pack/pack.dart';
import 'providers.dart';
import 'session/auth_controller.dart';
import 'shell/shell.dart';

/// Routing, and the one redirect that decides which product a person is
/// looking at.
///
/// Paths deliberately mirror the web app's so a link shared from a
/// browser — a provider profile, a piece of work — can open the app on
/// the same screen once App Links are configured. Two clients with
/// different URL shapes cannot share a link at all.
///
/// **The redirect grants nothing.** It decides what to *draw*; the API
/// re-checks the actor on every call it serves (CLAUDE.md #28). A bug
/// here shows someone the wrong navigation bar, never someone else's
/// data.
GoRouter buildRouter(WidgetRef ref) {
  final AuthController auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/home',
    refreshListenable: auth,
    redirect: (BuildContext context, GoRouterState state) {
      final String path = state.uri.path;
      final AuthState s = auth.state;

      // Still asking the API who the stored token belongs to. Hold on the
      // splash rather than flashing sign-in at someone who turns out to
      // be signed in.
      if (s is AuthUnknown) return path == '/' ? null : '/';

      if (s is AuthSignedOut) {
        return _signedOutPaths.contains(path) ? null : '/sign-in';
      }

      // An enrolment ticket authorises exactly one screen (#32).
      if (s is AuthEnrolling) {
        return path == '/mfa/enrol' ? null : '/mfa/enrol';
      }

      if (s is AuthSignedIn) {
        if (path == '/sign-in' || path == '/' || path == '/mfa/enrol') {
          return switch (s.user.role) {
            Role.seeker => '/home',
            Role.provider => '/provider',
            Role.admin => '/admin-elsewhere',
          };
        }
        final String? bounce = bounceFor(s.user.role, path);
        if (bounce != null) return bounce;
      }
      return null;
    },
    routes: <RouteBase>[
      GoRoute(path: '/', builder: (_, _) => const _Splash()),
      GoRoute(path: '/sign-in', builder: (_, _) => const SignInScreen()),
      GoRoute(
        path: '/register',
        builder: (_, GoRouterState s) => RegisterScreen(
          initialRole: s.uri.queryParameters['as'] == Role.provider.wire
              ? Role.provider
              : Role.seeker,
        ),
      ),
      GoRoute(
        path: '/forgot-password',
        builder: (_, _) => const ForgotPasswordScreen(),
      ),
      GoRoute(path: '/mfa/enrol', builder: (_, _) => const MfaEnrolScreen()),
      GoRoute(
        path: '/admin-elsewhere',
        builder: (_, _) => const AdminElsewhere(),
      ),

      // Full-screen routes: pushed over the shell rather than inside it,
      // because each is a task with its own way out.
      GoRoute(
        path: '/providers/:id',
        builder: (_, GoRouterState s) =>
            ProviderScreen(providerId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/sessions/:id',
        builder: (_, GoRouterState s) =>
            RoomScreen(sessionId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/board/ask', builder: (_, _) => const AskScreen()),
      // Declared BEFORE '/board/:id', which would otherwise swallow
      // '/board/questions' as a post id.
      GoRoute(
        path: '/board/questions',
        builder: (_, _) => const QuestionsScreen(),
      ),
      GoRoute(
        path: '/board/questions/:id',
        builder: (_, GoRouterState s) =>
            QuestionScreen(questionId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/board/new', builder: (_, _) => const NewRequestScreen()),
      GoRoute(
        path: '/board/:id',
        builder: (_, GoRouterState s) =>
            BoardPostScreen(postId: s.pathParameters['id']!),
      ),
      GoRoute(
        path: '/fields/:code',
        builder: (_, GoRouterState s) =>
            FieldScreen(domainCode: s.pathParameters['code']!),
      ),
      GoRoute(path: '/legal', builder: (_, _) => const LegalScreen()),
      GoRoute(
        path: '/report',
        builder: (_, GoRouterState s) => ReportScreen(
          subjectType: s.uri.queryParameters['subject'] ?? 'user',
          subjectId: s.uri.queryParameters['id'] ?? '',
          domainCode: s.uri.queryParameters['domain'],
        ),
      ),

      ShellRoute(
        builder: (BuildContext context, GoRouterState state, Widget child) {
          return Consumer(
            builder: (BuildContext context, WidgetRef ref, _) {
              final String lang = ref.watch(langProvider);
              final Role role = auth.user?.role ?? Role.seeker;
              // The platform's neutral vocabulary: the shell sits above
              // every record and belongs to no field.
              return AppShell(
                tabs: Shells.forRole(role, Vocab.platform),
                lang: lang,
                child: child,
              );
            },
          );
        },
        routes: <RouteBase>[
          GoRoute(path: '/home', builder: (_, _) => const HomeScreen()),
          GoRoute(path: '/find', builder: (_, _) => const FindScreen()),
          GoRoute(path: '/board', builder: (_, _) => const BoardScreen()),
          GoRoute(path: '/money', builder: (_, _) => const MoneyScreen()),
          GoRoute(path: '/progress', builder: (_, _) => const ProgressScreen()),
          GoRoute(
            path: '/work',
            builder: (_, _) => const WorkScreen(),
            routes: <RouteBase>[
              GoRoute(
                path: ':id',
                builder: (_, GoRouterState s) =>
                    EngagementScreen(engagementId: s.pathParameters['id']!),
                routes: <RouteBase>[
                  GoRoute(
                    path: 'agenda',
                    builder: (_, GoRouterState s) =>
                        AgendaScreen(engagementId: s.pathParameters['id']!),
                  ),
                  GoRoute(
                    path: 'assessment',
                    builder: (_, GoRouterState s) =>
                        AssessmentScreen(engagementId: s.pathParameters['id']!),
                  ),
                  GoRoute(
                    path: 'review',
                    builder: (_, GoRouterState s) =>
                        ReviewScreen(engagementId: s.pathParameters['id']!),
                  ),
                  GoRoute(
                    path: 'dispute',
                    builder: (_, GoRouterState s) =>
                        DisputeScreen(engagementId: s.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(path: '/sessions', builder: (_, _) => const SessionsScreen()),
          GoRoute(
            path: '/you',
            builder: (_, _) => const AccountScreen(),
            routes: <RouteBase>[
              GoRoute(
                path: 'profile',
                builder: (_, _) => const ProfileScreen(),
              ),
              GoRoute(
                path: 'password',
                builder: (_, _) => const ChangePasswordScreen(),
              ),
              GoRoute(path: 'fields', builder: (_, _) => const FieldsScreen()),
            ],
          ),

          // The provider's tabs are siblings of the dashboard, not its
          // children. Nested, going to a tab stacked the dashboard under it
          // and every tab drew a back arrow.
          GoRoute(
            path: '/provider/requests',
            builder: (_, _) => const BoardScreen(),
          ),
          GoRoute(
            path: '/provider/work',
            builder: (_, _) => const WorkScreen(),
            routes: <RouteBase>[
              GoRoute(
                path: ':id',
                builder: (_, GoRouterState s) =>
                    EngagementScreen(engagementId: s.pathParameters['id']!),
                routes: <RouteBase>[
                  GoRoute(
                    path: 'evaluate',
                    builder: (_, GoRouterState s) =>
                        EvaluateScreen(engagementId: s.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
          GoRoute(
            path: '/provider/earnings',
            builder: (_, _) => const ProviderEarningsScreen(),
          ),
          GoRoute(
            path: '/provider',
            builder: (_, _) => const ProviderDashboardScreen(),
            routes: <RouteBase>[
              GoRoute(
                path: 'standing',
                builder: (_, _) => const ProviderStandingScreen(),
              ),
              GoRoute(
                path: 'services',
                builder: (_, _) => const ProviderServicesScreen(),
              ),
              GoRoute(
                path: 'availability',
                builder: (_, _) => const ProviderAvailabilityScreen(),
              ),
              GoRoute(
                path: 'training',
                builder: (_, _) => const ProviderTrainingScreen(),
              ),
              GoRoute(
                path: 'languages',
                builder: (_, _) => const ProviderLanguagesScreen(),
              ),
              GoRoute(
                path: 'payout',
                builder: (_, _) => const ProviderPayoutScreen(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
}

/// The only screens reachable without a session.
const List<String> _signedOutPaths = <String>[
  '/sign-in',
  '/register',
  '/forgot-password',
];

/// Where a signed-in person is sent instead of [path], or `null` to stay.
///
/// Decides what to DRAW, never what is allowed — the API refuses the
/// wrong role regardless (#28).
///
/// A provider is kept out of the seeker-only screens, rather than let into
/// a short list of shared ones. The list version bounced providers off
/// every screen nobody had thought to add: opening a board request to make
/// an offer, the free questions, reporting a problem, the legal terms. A
/// provider could not propose from the app at all.
String? bounceFor(Role role, String path) {
  final bool providerPath =
      path == '/provider' || path.startsWith('/provider/');
  return switch (role) {
    Role.provider when !providerPath && _seekerOnly(path) => '/provider',
    Role.seeker || Role.admin when providerPath => '/home',
    _ => null,
  };
}

/// Screens that only mean something to a person seeking guidance.
bool _seekerOnly(String path) => const <String>{
  '/home',
  '/find',
  '/money',
  '/progress',
  '/board',
  '/board/new',
  '/board/ask',
}.contains(path);

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}
