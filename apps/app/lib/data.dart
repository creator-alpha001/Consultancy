import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/models/board.dart';
import 'api/models/engagement.dart';
import 'api/models/money.dart';
import 'api/models/provider.dart';
import 'api/models/session.dart';
import 'api/models/supply.dart';
import 'providers.dart';

/// The fetches every screen shares.
///
/// Kept in one file rather than beside each feature so that two screens
/// asking for the same thing get the same provider — and therefore the
/// same cached answer — instead of two round trips on a 3G connection.
///
/// Nothing here holds state. Each is a read; mutations go straight to the
/// [Repository] and then invalidate whichever of these is now stale, so
/// there is exactly one copy of any fact and it is the server's.

// ── seeker ───────────────────────────────────────────────────────────

final FutureProvider<List<Engagement>> engagementsProvider =
    FutureProvider<List<Engagement>>(
      (Ref ref) => ref.watch(repositoryProvider).engagements(),
    );

final FutureProviderFamily<Engagement, String> engagementProvider =
    FutureProvider.family<Engagement, String>(
      (Ref ref, String id) => ref.watch(repositoryProvider).engagement(id),
    );

/// A seeker's active fields. Always a list — never "the" domain
/// (CLAUDE.md #6).
final FutureProvider<List<Map<String, dynamic>>> myDomainsProvider =
    FutureProvider<List<Map<String, dynamic>>>(
      (Ref ref) => ref.watch(repositoryProvider).myDomains(),
    );

final FutureProviderFamily<List<Map<String, dynamic>>, String>
categoriesProvider = FutureProvider.family<List<Map<String, dynamic>>, String>(
  (Ref ref, String domainCode) =>
      ref.watch(repositoryProvider).categories(domainCode),
);

final FutureProviderFamily<List<String>, String> workingLanguagesProvider =
    FutureProvider.family<List<String>, String>(
      (Ref ref, String domainCode) =>
          ref.watch(repositoryProvider).workingLanguages(domainCode),
    );

final FutureProvider<SeekerMoney> moneyProvider = FutureProvider<SeekerMoney>(
  (Ref ref) => ref.watch(repositoryProvider).money(),
);

final FutureProvider<List<ProgressSeries>> progressProvider =
    FutureProvider<List<ProgressSeries>>(
      (Ref ref) => ref.watch(repositoryProvider).progress(),
    );

// ── sessions ─────────────────────────────────────────────────────────

final FutureProvider<List<MeetingSession>> sessionsProvider =
    FutureProvider<List<MeetingSession>>(
      (Ref ref) => ref.watch(repositoryProvider).sessions(),
    );

final FutureProviderFamily<MeetingSession, String> sessionProvider =
    FutureProvider.family<MeetingSession, String>(
      (Ref ref, String id) => ref.watch(repositoryProvider).session(id),
    );

final FutureProviderFamily<List<SessionMessage>, String>
sessionMessagesProvider = FutureProvider.family<List<SessionMessage>, String>(
  (Ref ref, String id) => ref.watch(repositoryProvider).sessionMessages(id),
);

// ── board ────────────────────────────────────────────────────────────

final FutureProvider<List<BoardPost>> boardPostsProvider =
    FutureProvider<List<BoardPost>>(
      (Ref ref) => ref.watch(repositoryProvider).boardPosts(),
    );

final FutureProviderFamily<BoardPost, String> boardPostProvider =
    FutureProvider.family<BoardPost, String>(
      (Ref ref, String id) => ref.watch(repositoryProvider).boardPost(id),
    );

final FutureProviderFamily<List<Proposal>, String> proposalsProvider =
    FutureProvider.family<List<Proposal>, String>(
      (Ref ref, String postId) =>
          ref.watch(repositoryProvider).proposals(postId),
    );

final FutureProvider<List<BoardQuestion>> questionsProvider =
    FutureProvider<List<BoardQuestion>>(
      (Ref ref) => ref.watch(repositoryProvider).questions(),
    );

// ── assessment ───────────────────────────────────────────────────────

/// The template bound to this engagement's category.
///
/// **Null is a normal answer**, not an error: objective categories have
/// no rubric, and every screen that shows scores has to render that state
/// rather than assume a set of dimensions (CLAUDE.md #3).
final FutureProviderFamily<AssessmentTemplate?, String>
assessmentTemplateProvider = FutureProvider.family<AssessmentTemplate?, String>(
  (Ref ref, String engagementId) =>
      ref.watch(repositoryProvider).assessmentTemplate(engagementId),
);

final FutureProviderFamily<Map<String, dynamic>?, String> latestEvaluationProvider =
    FutureProvider.family<Map<String, dynamic>?, String>(
      (Ref ref, String engagementId) =>
          ref.watch(repositoryProvider).latestEvaluation(engagementId),
    );

final FutureProviderFamily<Map<String, dynamic>?, String> latestSubmissionProvider =
    FutureProvider.family<Map<String, dynamic>?, String>(
      (Ref ref, String engagementId) =>
          ref.watch(repositoryProvider).latestSubmission(engagementId),
    );

// ── provider ─────────────────────────────────────────────────────────

final FutureProvider<Earnings> earningsProvider = FutureProvider<Earnings>(
  (Ref ref) => ref.watch(repositoryProvider).earnings(),
);

final FutureProvider<PayoutDestination> payoutDestinationProvider =
    FutureProvider<PayoutDestination>(
      (Ref ref) => ref.watch(repositoryProvider).payoutDestination(),
    );

final FutureProvider<Readiness> readinessProvider = FutureProvider<Readiness>(
  (Ref ref) => ref.watch(repositoryProvider).readiness(),
);

final FutureProvider<List<Service>> myRatesProvider =
    FutureProvider<List<Service>>(
      (Ref ref) => ref.watch(repositoryProvider).myRates(),
    );

final FutureProvider<List<CredentialSubmission>> myCredentialsProvider =
    FutureProvider<List<CredentialSubmission>>(
      (Ref ref) => ref.watch(repositoryProvider).myCredentials(),
    );

final FutureProvider<TrainingState> trainingProvider =
    FutureProvider<TrainingState>(
      (Ref ref) => ref.watch(repositoryProvider).training(),
    );

final FutureProvider<Availability> availabilityProvider =
    FutureProvider<Availability>(
      (Ref ref) => ref.watch(repositoryProvider).availability(),
    );

final FutureProvider<List<WorkingLanguage>> myLanguagesProvider =
    FutureProvider<List<WorkingLanguage>>(
      (Ref ref) => ref.watch(repositoryProvider).myLanguages(),
    );

final FutureProvider<List<VerifiedSkill>> mySkillStatsProvider =
    FutureProvider<List<VerifiedSkill>>(
      (Ref ref) => ref.watch(repositoryProvider).mySkillStats(),
    );

/// Whether this provider may take paid work at all.
///
/// A serving government officer may be legally barred — a restriction on
/// THEIR career, not a platform preference — so this is checked before
/// any screen offers paid work, and a block is stated rather than
/// worked around.
final FutureProvider<PaidWorkStatus> paidWorkStatusProvider =
    FutureProvider<PaidWorkStatus>(
      (Ref ref) => ref.watch(repositoryProvider).paidWorkStatus(),
    );

final FutureProvider<List<ServicePackage>> myPackagesProvider =
    FutureProvider<List<ServicePackage>>(
      (Ref ref) => ref.watch(repositoryProvider).myPackages(),
    );
