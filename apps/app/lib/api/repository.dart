import '../money/paise.dart';
import 'api_client.dart';
import 'models/board.dart';
import 'models/engagement.dart';
import 'models/money.dart';
import 'models/provider.dart';
import 'models/session.dart';
import 'models/supply.dart';
import 'models/trust.dart';
import 'models/user.dart';

/// Every API call the app makes, in one typed place.
///
/// Screens do not build paths. That is not tidiness — it is what lets
/// `scripts/parity.mjs` measure coverage by scanning for route literals,
/// and what keeps a path that the API renamed from being spelled four
/// different ways across four features.
///
/// Note the shape of the money methods in particular: nothing here
/// accepts a `double`, and nothing computes an amount. The server owns
/// every figure; the client sends what the user chose and displays what
/// comes back.
class Repository {
  const Repository(this._api);

  final ApiClient _api;

  /// A list endpoint that may answer with nothing.
  ///
  /// Some routes return an EMPTY STRING rather than `[]` when there is
  /// nothing to list — `/engagements/:id/disputes` does. Treating that as
  /// an empty list is right: "no disputes" and "an empty list of
  /// disputes" are the same fact, and a screen should render its empty
  /// state rather than an error.
  Future<List<Map<String, dynamic>>> _objects(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    final List<dynamic>? raw = await _api.getOrNull<List<dynamic>>(
      path,
      query: query,
    );
    return <Map<String, dynamic>>[
      for (final Object? e in raw ?? const <Object?>[])
        if (e is Map<String, dynamic>) e,
    ];
  }

  // ── discovery ──────────────────────────────────────────────────────

  /// Providers, filtered by the dimensions that actually gate matching:
  /// skill, language and category.
  ///
  /// There is no `sort` parameter and there must never be a price one
  /// (CLAUDE.md #15).
  Future<List<ProviderSummary>> providers({
    String? domainCode,
    String? categoryId,
    String? language,
    String? skillId,
    String? query,
  }) async {
    final List<dynamic> raw = await _api.get<List<dynamic>>(
      '/providers',
      query: <String, dynamic>{
        'domainCode': ?domainCode,
        'categoryId': ?categoryId,
        'language': ?language,
        'skillId': ?skillId,
        if (query != null && query.isNotEmpty) 'q': query,
      },
    );
    return <ProviderSummary>[
      for (final Object? p in raw)
        if (p is Map<String, dynamic>) ProviderSummary.fromJson(p),
    ];
  }

  Future<ProviderProfile> provider(String id) async =>
      ProviderProfile.fromJson(
        await _api.get<Map<String, dynamic>>('/providers/$id'),
      );

  /// Bookable slots. Computed by the server, never by the client — see
  /// [AvailabilityRule.days] for why.
  Future<List<Slot>> slots(String providerId, {String? from, String? to}) async {
    final List<dynamic> raw = await _api.get<List<dynamic>>(
      '/providers/$providerId/slots',
      query: <String, dynamic>{
        'from': ?from,
        'to': ?to,
      },
    );
    return <Slot>[
      for (final Object? s in raw)
        if (s is Map<String, dynamic>) Slot.fromJson(s),
    ];
  }

  Future<List<Map<String, dynamic>>> categories(String domainCode) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/domains/$domainCode/categories');
    return <Map<String, dynamic>>[
      for (final Object? c in raw)
        if (c is Map<String, dynamic>) c,
    ];
  }

  Future<List<String>> workingLanguages(String domainCode) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/domains/$domainCode/working-languages');
    return <String>[
      for (final Object? l in raw)
        if (l is String)
          l
        else if (l is Map<String, dynamic> && l['langCode'] is String)
          l['langCode'] as String,
    ];
  }

  /// A seeker says which field they are in, and in which language (#6, #19).
  Future<void> declareDomain(
    String domainCode, {
    required String workingLanguage,
    bool? isPrimary,
  }) => _api.post<void>(
    '/me/domains',
    body: <String, dynamic>{
      'domainCode': domainCode,
      'workingLanguage': workingLanguage,
      'isPrimary': ?isPrimary,
    },
  );

  Future<void> removeDomain(String domainCode) =>
      _api.post<void>('/me/domains/$domainCode/remove');

  // ── account ────────────────────────────────────────────────────────

  Future<MyProfile> myProfile() async =>
      MyProfile.fromJson(await _api.get<Map<String, dynamic>>('/me/profile'));

  /// Only the fields passed are changed; an empty string clears one.
  Future<MyProfile> updateProfile({
    String? displayName,
    String? preferredLang,
    String? headline,
    String? bio,
    String? bioLang,
  }) async => MyProfile.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/me/profile',
      body: <String, dynamic>{
        'displayName': ?displayName,
        'preferredLang': ?preferredLang,
        'headline': ?headline,
        'bio': ?bio,
        'bioLang': ?bioLang,
      },
    ),
  );

  /// Always accepted, whether or not the address has an account — the
  /// screen says the same thing either way.
  Future<void> forgotPassword(String email) => _api.post<void>(
    '/auth/password/forgot',
    body: <String, dynamic>{'email': email},
  );

  Future<void> changePassword({
    required String currentPassword,
    required String newPassword,
  }) => _api.post<void>(
    '/auth/password/change',
    body: <String, dynamic>{
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    },
  );

  Future<void> resendEmailVerification() =>
      _api.post<void>('/auth/email/resend');

  /// The seeker's own active domains. A seeker has MANY (CLAUDE.md #6),
  /// so this is a list and every caller treats it as one.
  Future<List<Map<String, dynamic>>> myDomains() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/domains');
    return <Map<String, dynamic>>[
      for (final Object? d in raw)
        if (d is Map<String, dynamic>) d,
    ];
  }

  // ── engagements ────────────────────────────────────────────────────

  Future<List<Engagement>> engagements() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/engagements');
    return <Engagement>[
      for (final Object? e in raw)
        if (e is Map<String, dynamic>) Engagement.fromJson(e),
    ];
  }

  Future<Engagement> engagement(String id) async =>
      Engagement.fromJson(await _api.get<Map<String, dynamic>>('/engagements/$id'));

  Future<Engagement> createEngagement({
    required String providerId,
    required String domainCode,
    required String categoryId,
    required String engagementType,
    required String language,
    required Paise amount,
    String? serviceId,
    String currency = 'INR',
  }) async => Engagement.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/engagements',
      body: <String, dynamic>{
        'providerId': providerId,
        'domainCode': domainCode,
        'categoryId': categoryId,
        'engagementType': engagementType,
        'language': language,
        // Required by the API and by the column: an engagement without a
        // currency is an amount of nothing in particular.
        'currency': currency,
        'amountPaise': amount.value,
        'serviceId': ?serviceId,
      },
    ),
  );

  Future<void> agree(String engagementId) =>
      _api.post<void>('/engagements/$engagementId/agree');

  /// Funds the escrow.
  ///
  /// [idempotencyKey] is REQUIRED rather than optional, unlike every
  /// other mutation. A generated key protects against a double tap; only
  /// a key the caller minted and persisted protects against the app
  /// being killed mid-payment and the user retrying — which on a money
  /// path is the case that matters.
  Future<void> pay(String engagementId, {required String idempotencyKey}) =>
      _api.post<void>(
        '/engagements/$engagementId/payment',
        idempotencyKey: idempotencyKey,
      );

  Future<void> complete(String engagementId, {required String idempotencyKey}) =>
      _api.post<void>(
        '/engagements/$engagementId/complete',
        idempotencyKey: idempotencyKey,
      );

  Future<void> cancelEngagement(String engagementId, {String? reason}) =>
      _api.post<void>(
        '/engagements/$engagementId/cancel',
        body: <String, dynamic>{'reason': ?reason},
      );

  // ── agenda ─────────────────────────────────────────────────────────

  Future<Agenda?> agenda(String engagementId) async {
    final Map<String, dynamic>? raw = await _api
        .getOrNull<Map<String, dynamic>>('/engagements/$engagementId/agenda');
    return raw == null ? null : Agenda.fromJson(raw);
  }

  /// Saves the draft. Legal only while unlocked — the server refuses
  /// otherwise, and the client does not second-guess that (#11).
  ///
  /// Saving again replaces an unlocked draft. The words are sent in the
  /// language they were written in, which is the authoritative one (#20).
  Future<Agenda> saveAgenda(
    String engagementId, {
    required List<String> items,
    required String language,
    required String expectedDeliverable,
    required String successCriteria,
    String? outOfScope,
  }) async => Agenda.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/engagements/$engagementId/agenda',
      body: <String, dynamic>{
        'originalLang': language,
        'expectedDeliverable': expectedDeliverable,
        'successCriteria': successCriteria,
        'items': <Map<String, dynamic>>[
          for (final String text in items)
            <String, dynamic>{'labelLang': language, 'labelText': text},
        ],
        'outOfScope': ?outOfScope,
      },
    ),
  );

  /// Locks it. A separate, deliberate act with its own confirmation —
  /// after this there is no edit affordance anywhere, and a change is a
  /// change order producing a new version.
  Future<void> lockAgenda(String agendaId, {required String idempotencyKey}) =>
      _api.post<void>(
        '/agendas/$agendaId/lock',
        idempotencyKey: idempotencyKey,
      );

  /// The one mutation a locked agenda permits, during a live session.
  Future<void> tickAgendaItem(String itemId) =>
      _api.post<void>('/agenda-items/$itemId/tick');

  // ── assessment ─────────────────────────────────────────────────────

  /// The template bound to this engagement's category.
  ///
  /// Returns null when the category has none — objective categories do
  /// not, and that is a normal state rather than an error (#3).
  Future<AssessmentTemplate?> assessmentTemplate(String engagementId) async {
    final Map<String, dynamic>? raw = await _api
        .getOrNull<Map<String, dynamic>>(
          '/engagements/$engagementId/assessment-template',
        );
    return raw == null ? null : AssessmentTemplate.fromJson(raw);
  }

  Future<Map<String, dynamic>?> latestSubmission(String engagementId) =>
      _api.getOrNull<Map<String, dynamic>>(
        '/engagements/$engagementId/submissions/latest',
      );

  Future<Map<String, dynamic>?> latestEvaluation(String engagementId) =>
      _api.getOrNull<Map<String, dynamic>>(
        '/engagements/$engagementId/evaluations/latest',
      );

  /// One file, or none: the API takes a single `attachmentId`. A written
  /// piece of work can be the note itself.
  Future<Map<String, dynamic>> submit(
    String engagementId, {
    required String note,
    String? attachmentId,
  }) => _api.post<Map<String, dynamic>>(
    '/engagements/$engagementId/submissions',
    body: <String, dynamic>{'note': note, 'attachmentId': ?attachmentId},
  );

  Future<Map<String, dynamic>> startEvaluation(String engagementId) =>
      _api.post<Map<String, dynamic>>('/engagements/$engagementId/evaluations');

  /// Scores against the bound template's dimensions — never a set the
  /// provider invented (#16).
  ///
  /// The API takes one dimension per request, so a score is only ever
  /// half-saved if the connection drops between two — and the next save
  /// simply writes them again.
  Future<void> scoreEvaluation(
    String evaluationId, {
    required Map<String, int> scores,
    String? comment,
  }) async {
    for (final MapEntry<String, int> e in scores.entries) {
      await _api.post<void>(
        '/evaluations/$evaluationId/scores',
        body: <String, dynamic>{
          'dimensionCode': e.key,
          'score': e.value,
          'comment': ?comment,
        },
      );
    }
  }

  /// Ticks off something the seeker was told to do next. Private to
  /// them — it is not reported to the provider.
  Future<void> markActionItem(String annotationId) =>
      _api.post<void>('/me/action-items/$annotationId');

  /// A mark on the work, optionally tied to a dimension and a position.
  ///
  /// [body] is required and carries the whole meaning: an annotation is
  /// pinned to a scan of handwriting, and a coordinate alone is not
  /// something a screen reader user can act on.
  ///
  /// Every remark is something the seeker can act on — the API tracks
  /// that on the seeker's side (migration 0051), so there is no flag to
  /// send. The language is recorded because the original is authoritative.
  Future<void> annotate(
    String evaluationId, {
    required String body,
    required String lang,
    int? page,
    double? x,
    double? y,
  }) => _api.post<void>(
    '/evaluations/$evaluationId/annotations',
    body: <String, dynamic>{
      'bodyText': body,
      'bodyLang': lang,
      'page': ?page,
      'anchorX': ?x,
      'anchorY': ?y,
    },
  );

  Future<void> removeAnnotation(String annotationId) =>
      _api.delete<void>('/annotations/$annotationId');

  Future<void> returnEvaluation(String evaluationId) =>
      _api.post<void>('/evaluations/$evaluationId/return');

  Future<Map<String, dynamic>> evaluation(String id) =>
      _api.get<Map<String, dynamic>>('/evaluations/$id');

  /// Progress against the seeker's OWN past work. Nothing else.
  Future<List<ProgressSeries>> progress() async {
    final Object raw = await _api.get<Object>('/me/progress');
    final List<Map<String, dynamic>> series = switch (raw) {
      final List<dynamic> l => <Map<String, dynamic>>[
        for (final Object? e in l)
          if (e is Map<String, dynamic>) e,
      ],
      final Map<String, dynamic> m => <Map<String, dynamic>>[
        for (final Object? e in (m['dimensions'] as List<dynamic>? ?? const <dynamic>[]))
          if (e is Map<String, dynamic>) e,
      ],
      _ => const <Map<String, dynamic>>[],
    };
    return <ProgressSeries>[
      for (final Map<String, dynamic> s in series) ProgressSeries.fromJson(s),
    ];
  }

  // ── sessions ───────────────────────────────────────────────────────

  Future<List<MeetingSession>> sessions() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/sessions');
    return <MeetingSession>[
      for (final Object? s in raw)
        if (s is Map<String, dynamic>) MeetingSession.fromJson(s),
    ];
  }

  Future<MeetingSession> session(String id) async =>
      MeetingSession.fromJson(await _api.get<Map<String, dynamic>>('/sessions/$id'));

  Future<MeetingSession> book(
    String engagementId, {
    required DateTime start,
    required int durationMinutes,
    required String timezone,
  }) async => MeetingSession.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/engagements/$engagementId/sessions',
      body: <String, dynamic>{
        'scheduledStart': start.toUtc().toIso8601String(),
        // The API books a window, not a length: the end is sent.
        'scheduledEnd': start
            .add(Duration(minutes: durationMinutes))
            .toUtc()
            .toIso8601String(),
        'timezone': timezone,
      },
    ),
  );

  /// Records this party's answer about recording.
  ///
  /// A refusal is sent, not merely "not granted" — it is its own row and
  /// its own audit entry, and it shifts the evidentiary burden in a
  /// dispute (CLAUDE.md #21).
  Future<void> consent(String sessionId, {required bool granted}) =>
      _api.post<void>(
        '/sessions/$sessionId/consent',
        body: <String, dynamic>{'consentGiven': granted},
      );

  Future<void> setRecording(String sessionId, {required bool active}) =>
      _api.post<void>(
        '/sessions/$sessionId/recording',
        body: <String, dynamic>{'active': active},
      );

  Future<Map<String, dynamic>> room(String sessionId) =>
      _api.post<Map<String, dynamic>>('/sessions/$sessionId/room');

  Future<void> startSession(String sessionId) =>
      _api.post<void>('/sessions/$sessionId/start');

  Future<void> endSession(String sessionId) =>
      _api.post<void>('/sessions/$sessionId/end');

  Future<void> cancelSession(String sessionId, {String? reason}) =>
      _api.post<void>(
        '/sessions/$sessionId/cancel',
        body: <String, dynamic>{'reason': ?reason},
      );

  /// Drops to audio. A deliberate choice as well as a fallback (#22).
  Future<void> audioOnly(String sessionId) =>
      _api.post<void>('/sessions/$sessionId/audio-only');

  Future<void> tickSessionItem(String sessionId, String itemId) =>
      _api.post<void>('/sessions/$sessionId/agenda-items/$itemId/tick');

  Future<List<SessionMessage>> sessionMessages(String sessionId) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/sessions/$sessionId/messages');
    return <SessionMessage>[
      for (final Object? m in raw)
        if (m is Map<String, dynamic>) SessionMessage.fromJson(m),
    ];
  }

  /// Append-only: a session's chat is dispute evidence.
  Future<void> sendSessionMessage(String sessionId, String body) =>
      _api.post<void>(
        '/sessions/$sessionId/messages',
        body: <String, dynamic>{'body': body},
      );

  Future<List<Map<String, dynamic>>> sessionFiles(String sessionId) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/sessions/$sessionId/files');
    return <Map<String, dynamic>>[
      for (final Object? f in raw)
        if (f is Map<String, dynamic>) f,
    ];
  }

  /// Sharing an uploaded file into a session. The API grants every other
  /// participant access in the same transaction — sharing IS the grant.
  Future<void> shareSessionFile(String sessionId, String attachmentId) =>
      _api.post<void>(
        '/sessions/$sessionId/files',
        body: <String, dynamic>{'attachmentId': attachmentId},
      );

  Future<SessionTimer> timer(String sessionId) async =>
      SessionTimer.fromJson(
        await _api.get<Map<String, dynamic>>('/sessions/$sessionId/timer'),
      );

  /// Reports the link going or coming back. The server times the gap
  /// itself and merges both parties' reports, so a shared outage counts
  /// once and a platform-side failure never penalises the provider (#23).
  /// Repeating a report is harmless: the route is idempotent.
  Future<void> reportConnection(String sessionId, {required bool connected}) =>
      _api.post<void>(
        '/sessions/$sessionId/connection',
        body: <String, dynamic>{
          'state': connected ? 'reconnected' : 'disconnected',
        },
      );

  // ── board ──────────────────────────────────────────────────────────

  Future<List<BoardPost>> boardPosts({String? domainCode}) async {
    final List<dynamic> raw = await _api.get<List<dynamic>>(
      '/board/posts',
      query: <String, dynamic>{'domainCode': ?domainCode},
    );
    return <BoardPost>[
      for (final Object? p in raw)
        if (p is Map<String, dynamic>) BoardPost.fromJson(p),
    ];
  }

  Future<BoardPost> boardPost(String id) async =>
      BoardPost.fromJson(await _api.get<Map<String, dynamic>>('/board/posts/$id'));

  Future<BoardPost> createBoardPost({
    required String domainCode,
    required String categoryId,
    required String engagementType,
    required String language,
    required String description,
    required Paise budgetMin,
    required Paise budgetMax,
  }) async => BoardPost.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/board/posts',
      body: <String, dynamic>{
        'domainCode': domainCode,
        'categoryId': categoryId,
        'engagementType': engagementType,
        'language': language,
        'description': description,
        'currency': 'INR',
        'budgetMinPaise': budgetMin.value,
        'budgetMaxPaise': budgetMax.value,
      },
    ),
  );

  Future<void> cancelBoardPost(String id) =>
      _api.post<void>('/board/posts/$id/cancel');

  Future<List<Proposal>> proposals(String postId) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/board/posts/$postId/proposals');
    return <Proposal>[
      for (final Object? p in raw)
        if (p is Map<String, dynamic>) Proposal.fromJson(p),
    ];
  }

  ///
  /// The message carries any turnaround promise: the API stores an offer
  /// as an amount and words, nothing else.
  Future<void> propose(
    String postId, {
    required Paise amount,
    required String message,
  }) => _api.post<void>(
    '/board/posts/$postId/proposals',
    body: <String, dynamic>{
      'proposedAmountPaise': amount.value,
      'message': message,
    },
  );

  /// Accepting one automatically rejects its siblings, server-side.
  ///
  /// Returns the id of the engagement the acceptance created. The API
  /// answers with the proposal, which names it.
  Future<String?> acceptProposal(
    String proposalId, {
    required String idempotencyKey,
  }) async {
    final Map<String, dynamic> proposal = await _api.post<Map<String, dynamic>>(
      '/board/proposals/$proposalId/accept',
      idempotencyKey: idempotencyKey,
    );
    return proposal['resultingEngagementId'] as String?;
  }

  Future<void> withdrawProposal(String proposalId) =>
      _api.post<void>('/board/proposals/$proposalId/withdraw');

  Future<List<BoardQuestion>> questions({String? domainCode}) async {
    final List<dynamic> raw = await _api.get<List<dynamic>>(
      '/board/questions',
      query: <String, dynamic>{'domainCode': ?domainCode},
    );
    return <BoardQuestion>[
      for (final Object? q in raw)
        if (q is Map<String, dynamic>) BoardQuestion.fromJson(q),
    ];
  }

  Future<BoardQuestion> question(String id) async => BoardQuestion.fromJson(
    await _api.get<Map<String, dynamic>>('/board/questions/$id'),
  );

  /// Asks a free question.
  ///
  /// The response carries the screening outcome, and the DISTRESS case is
  /// the one that matters: the post is held and the answer is the pack's
  /// real helpline numbers. There is no path here that renders a
  /// rejection (CLAUDE.md #25).
  Future<Map<String, dynamic>> ask({
    required String domainCode,
    required String body,
    required String language,
    String? categoryId,
  }) => _api.post<Map<String, dynamic>>(
    '/board/questions',
    body: <String, dynamic>{
      'domainCode': domainCode,
      'categoryId': ?categoryId,
      'bodyOriginal': body,
      'bodyLang': language,
    },
  );

  Future<void> answerQuestion(String questionId, String body) =>
      _api.post<void>(
        '/board/questions/$questionId/answers',
        body: <String, dynamic>{'body': body},
      );

  // ── money ──────────────────────────────────────────────────────────

  Future<SeekerMoney> money() async =>
      SeekerMoney.fromJson(await _api.get<Map<String, dynamic>>('/me/money'));

  Future<Earnings> earnings() async =>
      Earnings.fromJson(await _api.get<Map<String, dynamic>>('/me/earnings'));

  Future<PayoutDestination> payoutDestination() async =>
      PayoutDestination.fromJson(
        await _api.get<Map<String, dynamic>>('/me/payout-destination'),
      );

  /// Only the holder's name, the IFSC and the account number reach the
  /// aggregator; we keep the last four and the IFSC and nothing else
  /// (#31).
  Future<void> setPayoutDestination({
    required String accountHolderName,
    required String accountNumber,
    required String ifsc,
  }) => _api.post<void>(
    '/me/payout-destination',
    body: <String, dynamic>{
      'accountHolderName': accountHolderName,
      'accountNumber': accountNumber,
      'ifsc': ifsc,
    },
  );

  Future<List<ServicePackage>> myPackages() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/packages');
    return <ServicePackage>[
      for (final Object? p in raw)
        if (p is Map<String, dynamic>) ServicePackage.fromJson(p),
    ];
  }

  Future<List<Map<String, dynamic>>> myPackagePurchases() async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/me/package-purchases');
    return <Map<String, dynamic>>[
      for (final Object? p in raw)
        if (p is Map<String, dynamic>) p,
    ];
  }

  // ── provider supply ────────────────────────────────────────────────

  Future<Readiness> readiness() async =>
      Readiness.fromJson(await _api.get<Map<String, dynamic>>('/me/readiness'));

  Future<List<Service>> myRates() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/rates');
    return <Service>[
      for (final Object? r in raw)
        if (r is Map<String, dynamic>) Service.fromJson(r),
    ];
  }

  Future<void> addRate({
    required String engagementType,
    required Paise amount,
    String? skillId,
    int? durationMinutes,
    int? turnaroundHours,
  }) => _api.post<void>(
    '/me/rates',
    body: <String, dynamic>{
      'engagementType': engagementType,
      'amountPaise': amount.value,
      'skillId': ?skillId,
      'durationMinutes': ?durationMinutes,
      'turnaroundHours': ?turnaroundHours,
    },
  );

  Future<void> removeRate(String rateId) =>
      _api.post<void>('/me/rates/$rateId/remove');

  Future<List<CredentialSubmission>> myCredentials() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/credentials');
    return <CredentialSubmission>[
      for (final Object? c in raw)
        if (c is Map<String, dynamic>) CredentialSubmission.fromJson(c),
    ];
  }

  Future<List<Map<String, dynamic>>> credentialTypes(String domainCode) async {
    final List<dynamic> raw =
        await _api.get<List<dynamic>>('/domains/$domainCode/credential-types');
    return <Map<String, dynamic>>[
      for (final Object? c in raw)
        if (c is Map<String, dynamic>) c,
    ];
  }

  /// A credential names the skills it is evidence for — verification is
  /// per skill, never per person (#5) — and its type by code.
  Future<void> submitCredential({
    required String credentialTypeCode,
    required String domainCode,
    required List<String> skillCodes,
    required Map<String, dynamic> verifierData,
  }) => _api.post<void>(
    '/me/credentials',
    body: <String, dynamic>{
      'credentialTypeCode': credentialTypeCode,
      'domainCode': domainCode,
      'skillCodes': skillCodes,
      'verifierData': verifierData,
    },
  );

  /// Training for one family. Named, because a provider may work in more
  /// than one and the server will not guess which.
  Future<TrainingState> training(String familyCode) async =>
      TrainingState.fromJson(
        await _api.get<Map<String, dynamic>>(
          '/me/training',
          query: <String, dynamic>{'family': familyCode},
        ),
      );

  Future<void> completeTraining(
    String moduleCode, {
    required String familyCode,
    required Map<String, String> answers,
  }) => _api.post<void>(
    '/me/training/$moduleCode',
    body: <String, dynamic>{'familyCode': familyCode, 'answers': answers},
  );

  Future<List<WorkingLanguage>> myLanguages() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/languages');
    return <WorkingLanguage>[
      for (final Object? l in raw)
        if (l is Map<String, dynamic>) WorkingLanguage.fromJson(l),
    ];
  }

  Future<void> setLanguages(List<WorkingLanguage> languages) => _api.post<void>(
    '/me/languages',
    body: <String, dynamic>{
      'languages': <Map<String, dynamic>>[
        for (final WorkingLanguage l in languages)
          <String, dynamic>{'langCode': l.code, 'canEvaluate': l.canEvaluate},
      ],
    },
  );

  Future<Availability> availability() async => Availability.fromJson(
    await _api.get<Map<String, dynamic>>('/me/availability'),
  );

  Future<void> addAvailabilityRule({
    required String timezone,
    required String rrule,
    required int startMinute,
    required int endMinute,
    String? effectiveFrom,
  }) => _api.post<void>(
    '/me/availability/rules',
    body: <String, dynamic>{
      'timezone': timezone,
      'rrule': rrule,
      'startMinute': startMinute,
      'endMinute': endMinute,
      'effectiveFrom': ?effectiveFrom,
    },
  );

  Future<void> removeAvailabilityRule(String ruleId) =>
      _api.post<void>('/me/availability/rules/$ruleId/remove');

  Future<void> setAvailabilityPolicy(AvailabilityPolicy policy) =>
      _api.post<void>(
        '/me/availability/policy',
        body: <String, dynamic>{
          'minNoticeMinutes': policy.minNoticeMinutes,
          'bufferMinutes': policy.bufferMinutes,
          'maxAdvanceDays': policy.maxAdvanceDays,
          'slotMinutes': policy.slotMinutes,
        },
      );

  Future<PaidWorkStatus> paidWorkStatus() async => PaidWorkStatus.fromJson(
    await _api.get<Map<String, dynamic>>('/me/paid-work-status'),
  );

  Future<List<VerifiedSkill>> mySkillStats() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/me/skill-stats');
    return <VerifiedSkill>[
      for (final Object? s in raw)
        if (s is Map<String, dynamic>) VerifiedSkill.fromJson(s),
    ];
  }

  // ── trust and safety ───────────────────────────────────────────────

  /// Leaves a review.
  ///
  /// The wire names are `bodyOriginal` and `bodyLang`, not `body` — the
  /// original wording and the language it was written in are kept
  /// together, because a translation never replaces the original
  /// (CLAUDE.md #20). `direction` says which way the review points; the
  /// SUBJECT is derived from the engagement by the API, so a client
  /// cannot nominate who its review is about (#28).
  Future<void> review(
    String engagementId, {
    required int rating,
    required String body,
    required String lang,
    required ReviewDirection direction,
    Map<String, int> dimensions = const <String, int>{},
  }) => _api.post<void>(
    '/engagements/$engagementId/reviews',
    body: <String, dynamic>{
      'direction': direction.wire,
      'rating': rating,
      'bodyOriginal': body,
      'bodyLang': lang,
      if (dimensions.isNotEmpty)
        'dimensionScores': <Map<String, dynamic>>[
          for (final MapEntry<String, int> e in dimensions.entries)
            <String, dynamic>{'dimensionCode': e.key, 'score': e.value},
        ],
    },
  );

  /// One reply, by the subject only, append-only. A review the reviewed
  /// party cannot answer is a weapon; one they could rewrite is worthless.
  Future<void> replyToReview(
    String reviewId, {
    required String body,
    required String lang,
  }) => _api.post<void>(
    '/reviews/$reviewId/reply',
    body: <String, dynamic>{'bodyOriginal': body, 'bodyLang': lang},
  );

  Future<List<Map<String, dynamic>>> reviewsFor(String userId) =>
      _objects('/users/$userId/reviews');

  Future<List<Map<String, dynamic>>> reviewsForEngagement(String engagementId) =>
      _objects('/engagements/$engagementId/reviews');

  /// Raises a dispute.
  ///
  /// [body] carries the substance and is what a ruling is actually made
  /// against, together with the locked agenda. [reasonCode] is a free
  /// string as far as core is concerned — there is no declared taxonomy
  /// for it anywhere, which is recorded as owed in TRACKER.md.
  Future<Map<String, dynamic>> raiseDispute(
    String engagementId, {
    required String reasonCode,
    required String body,
    required String lang,
  }) => _api.post<Map<String, dynamic>>(
    '/engagements/$engagementId/disputes',
    body: <String, dynamic>{
      'reasonCode': reasonCode,
      'bodyOriginal': body,
      'bodyLang': lang,
    },
  );

  /// The dispute on an engagement, or null.
  ///
  /// Singular, despite the plural path: the API returns one row or
  /// nothing, because an engagement has at most one live dispute. An
  /// earlier version of this client read it as a list and would have
  /// thrown the moment a dispute actually existed — the endpoint only
  /// looked list-shaped while it was empty.
  Future<Map<String, dynamic>?> disputeFor(String engagementId) =>
      _api.getOrNull<Map<String, dynamic>>(
        '/engagements/$engagementId/disputes',
      );

  Future<Map<String, dynamic>> dispute(String id) =>
      _api.get<Map<String, dynamic>>('/disputes/$id');

  Future<List<Map<String, dynamic>>> disputeRulings(String id) =>
      _objects('/disputes/$id/rulings');

  Future<List<Map<String, dynamic>>> disputeEvidence(String id) =>
      _objects('/disputes/$id/evidence');

  Future<void> appealDispute(
    String id, {
    required String body,
    required String lang,
  }) => _api.post<void>(
    '/disputes/$id/appeal',
    body: <String, dynamic>{'bodyOriginal': body, 'bodyLang': lang},
  );

  Future<void> withdrawDispute(String id) =>
      _api.post<void>('/disputes/$id/withdraw');

  /// The resolved family: its review dimensions, its dispute ladder, its
  /// helplines and its agreement wording. All of it manifest data.
  Future<Map<String, dynamic>> family(String code) =>
      _api.get<Map<String, dynamic>>('/families/$code');

  /// The reasons a person may report something. Family data — core names
  /// none of them.
  Future<List<Map<String, dynamic>>> reportReasons(String domainCode) async {
    final List<dynamic> raw = await _api.get<List<dynamic>>(
      '/report-reasons',
      query: <String, dynamic>{'domainCode': domainCode},
    );
    return <Map<String, dynamic>>[
      for (final Object? r in raw)
        if (r is Map<String, dynamic>) r,
    ];
  }

  Future<void> report({
    required String subjectType,
    required String subjectId,
    required String reasonCode,
    required String lang,
    String? detail,
  }) => _api.post<void>(
    '/reports',
    body: <String, dynamic>{
      'subjectType': subjectType,
      'subjectId': subjectId,
      'reasonCode': reasonCode,
      'detailOriginal': ?detail,
      if (detail != null) 'detailLang': lang,
    },
  );

  // ── account ────────────────────────────────────────────────────────

  Future<List<Map<String, dynamic>>> activeSessions() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/auth/sessions');
    return <Map<String, dynamic>>[
      for (final Object? s in raw)
        if (s is Map<String, dynamic>) s,
    ];
  }

  /// The first move after a suspected compromise.
  Future<void> signOutOtherDevices() => _api.post<void>('/auth/logout-others');

  Future<List<Map<String, dynamic>>> myAgreements() =>
      _objects('/me/agreements');

  Future<List<Map<String, dynamic>>> myReports() => _objects('/reports/mine');

  Future<Map<String, dynamic>> agreementDocument({
    required String code,
    required String familyCode,
  }) => _api.get<Map<String, dynamic>>(
    '/agreements/document',
    query: <String, dynamic>{'code': code, 'familyCode': familyCode},
  );

  /// A signed URL, valid for five minutes, watermarked with the viewer's
  /// identity. Never a public link (CLAUDE.md #29).
  Future<Map<String, dynamic>> attachmentLink(String attachmentId) =>
      _api.get<Map<String, dynamic>>('/attachments/$attachmentId/link');

  /// The download path a minted link points at. Built here rather than
  /// taken from the response so that no screen ever holds a URL it did
  /// not derive from an id it was already allowed to see.
  String attachmentDownloadPath(String attachmentId) =>
      '/attachments/$attachmentId/download';

  /// One domain, resolved. Its categories, languages, price bands and
  /// season note — everything a field's own page shows.
  Future<Map<String, dynamic>> domain(String code) =>
      _api.get<Map<String, dynamic>>('/domains/$code');

  /// Fresh recovery codes, invalidating the old set. Shown once.
  Future<List<String>> regenerateRecoveryCodes() async {
    final Map<String, dynamic> res = await _api
        .post<Map<String, dynamic>>('/auth/mfa/recovery-codes');
    return <String>[
      for (final Object? c in (res['codes'] as List<Object?>? ?? const <Object?>[]))
        if (c is String) c,
    ];
  }

  // ── sessions: running over ─────────────────────────────────────────

  /// Asks for more time. A paid extension is its own escrow with its own
  /// agreement — never a silent addition to the original (CLAUDE.md #12
  /// applies to it too).
  Future<Map<String, dynamic>> requestExtension(
    String sessionId, {
    required int minutes,
    required Paise amount,
  }) => _api.post<Map<String, dynamic>>(
    '/sessions/$sessionId/extensions',
    body: <String, dynamic>{'minutes': minutes, 'amountPaise': amount.value},
  );

  Future<List<Map<String, dynamic>>> extensions(String sessionId) =>
      _objects('/sessions/$sessionId/extensions');

  Future<void> acceptExtension(
    String extensionId, {
    required String idempotencyKey,
  }) => _api.post<void>(
    '/extensions/$extensionId/accept',
    idempotencyKey: idempotencyKey,
  );

  Future<void> declineExtension(String extensionId) =>
      _api.post<void>('/extensions/$extensionId/decline');

  // ── packages ───────────────────────────────────────────────────────

  Future<Map<String, dynamic>> purchasePackage(
    String packageId, {
    required String idempotencyKey,
  }) => _api.post<Map<String, dynamic>>(
    '/packages/$packageId/purchase',
    idempotencyKey: idempotencyKey,
  );

  /// Starts one engagement out of a bought bundle. The money moved when
  /// the bundle was bought, so this draws down rather than charging.
  ///
  /// The category is chosen HERE rather than at purchase: a bundle of
  /// five reviews can be spent on five different papers, and fixing the
  /// category up front would make a bundle less useful than buying
  /// singly. All three are REQUIRED — the API refuses the call without
  /// them.
  Future<Engagement> engagementFromPackage(
    String purchaseId, {
    required String domainCode,
    required String categoryId,
    required String language,
    required String idempotencyKey,
  }) async => Engagement.fromJson(
    await _api.post<Map<String, dynamic>>(
      '/engagements/from-package/$purchaseId',
      idempotencyKey: idempotencyKey,
      body: <String, dynamic>{
        'domainCode': domainCode,
        'categoryId': categoryId,
        'language': language,
      },
    ),
  );

  /// Publishing a bundle: a number of sessions sold together at one
  /// price. The server refuses fewer than two — one session is a rate,
  /// and two ways to sell the same thing would be two prices for it.
  Future<void> publishPackage({
    required String engagementType,
    required String title,
    required int sessionCount,
    required Paise amount,
    String? skillId,
    int? commitment,
  }) => _api.post<void>(
    '/me/packages',
    body: <String, dynamic>{
      'engagementType': engagementType,
      'title': title,
      'sessionCount': sessionCount,
      'amountPaise': amount.value,
      'skillId': ?skillId,
      'commitment': ?commitment,
    },
  );

  Future<void> withdrawPackage(String packageId) =>
      _api.post<void>('/me/packages/$packageId/withdraw');

  // ── availability exceptions ────────────────────────────────────────

  /// A day off, or an extra window. Exceptions beat the weekly rules,
  /// which is why they exist: a rule that had to be edited for one
  /// Tuesday would be edited back and forgotten.
  ///
  /// An exception only ever REMOVES time: a day, or part of one, off.
  Future<void> addAvailabilityException({
    required String date,
    int? startMinute,
    int? endMinute,
    String? reason,
  }) => _api.post<void>(
    '/me/availability/exceptions',
    body: <String, dynamic>{
      'onDate': date,
      'startMinute': ?startMinute,
      'endMinute': ?endMinute,
      'reason': ?reason,
    },
  );

  Future<void> removeAvailabilityException(String exceptionId) =>
      _api.post<void>('/me/availability/exceptions/$exceptionId/remove');

  /// A provider charging LESS than agreed, after the work has started.
  ///
  /// One-directional on purpose: the price may come down once work is
  /// under way and may never go up, because a price that can rise
  /// mid-engagement is a negotiation the seeker has already lost.
  Future<void> discount(
    String engagementId, {
    required Paise amount,
    required String reason,
  }) => _api.post<void>(
    '/engagements/$engagementId/discount',
    body: <String, dynamic>{
      // A string on the wire, like every paise amount the API reads as
      // a bigint.
      'discountPaise': amount.value.toString(),
      'reason': reason,
    },
  );
}
