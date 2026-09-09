import '../json.dart';

/// A booked session.
///
/// Parsed with [EitherCase] because `/sessions` returns raw database rows
/// in snake_case while every other endpoint returns camelCase. That is an
/// API inconsistency, recorded in TRACKER.md; reading both here keeps it
/// from spreading into every call site while it is fixed on the server.
class MeetingSession {
  const MeetingSession({
    required this.id,
    required this.engagementId,
    required this.status,
    required this.mode,
    required this.timezone,
    this.scheduledStart,
    this.scheduledEnd,
    this.startedAt,
    this.endedAt,
    this.counterpart,
    this.durationMinutes,
    this.recordingActive = false,
    this.seekerConsent,
    this.providerConsent,
    this.recordingAvailable = false,
    this.transcriptAvailable = false,
    this.creditedSeconds = 0,
    this.warningRaisedAt,
  });

  factory MeetingSession.fromJson(Map<String, dynamic> json) {
    final Map<String, dynamic> consent =
        json.obj('consent') ?? const <String, dynamic>{};
    return MeetingSession(
      id: json.reqStr('id'),
      engagementId: json.eitherStr('engagementId', 'engagement_id'),
      status: SessionStatus.parse(json.strOrNull('status')),
      mode: json.str('mode', 'video'),
      timezone: json.str('timezone', 'Asia/Kolkata'),
      scheduledStart: json.eitherDate('scheduledStart', 'scheduled_start'),
      scheduledEnd: json.eitherDate('scheduledEnd', 'scheduled_end'),
      startedAt: json.eitherDate('startedAt', 'started_at'),
      endedAt: json.eitherDate('endedAt', 'ended_at'),
      counterpart: json.strOrNull('counterpart'),
      durationMinutes: json.intOrNull('durationMinutes'),
      recordingActive: json.eitherBool('recordingActive', 'recording_active'),
      seekerConsent: _consent(consent['seeker']),
      providerConsent: _consent(consent['provider']),
      recordingAvailable: json.boolOr('recordingAvailable'),
      transcriptAvailable: json.boolOr('transcriptAvailable'),
      creditedSeconds: json.intOr('creditedSeconds', json.intOr('credited_seconds', 0)),
      warningRaisedAt: json.eitherDate('warningRaisedAt', 'warning_raised_at'),
    );
  }

  final String id;
  final String engagementId;
  final SessionStatus status;

  /// `video` or `audio`. Audio-only is a STATE, not a failure
  /// (CLAUDE.md #22) — it has its own entry point a user can choose
  /// deliberately, and is not only a fallback banner.
  final String mode;

  /// An IANA name, never a fixed offset.
  final String timezone;
  final DateTime? scheduledStart;
  final DateTime? scheduledEnd;
  final DateTime? startedAt;
  final DateTime? endedAt;
  final String? counterpart;
  final int? durationMinutes;
  final bool recordingActive;

  /// Consent is per party, per session, and given IN the session
  /// (CLAUDE.md #21). Null means "not yet asked"; false means REFUSED,
  /// which is a recorded outcome that shifts the evidentiary burden — so
  /// the three states are kept distinct rather than collapsed to a bool.
  final ConsentState? seekerConsent;
  final ConsentState? providerConsent;

  final bool recordingAvailable;
  final bool transcriptAvailable;

  /// Time credited back for a connection failure. Merged across parties,
  /// so a shared outage counts once.
  final int creditedSeconds;
  final DateTime? warningRaisedAt;

  bool get isAudioOnly => mode == 'audio';

  /// Recording may only run when BOTH parties have said yes. No blanket
  /// consent in the Terms, no remembered preference, no "don't ask
  /// again".
  bool get bothConsented =>
      seekerConsent == ConsentState.granted &&
      providerConsent == ConsentState.granted;

  bool get anyoneRefused =>
      seekerConsent == ConsentState.refused ||
      providerConsent == ConsentState.refused;

  bool get isLive => status == SessionStatus.inProgress;

  bool get isJoinable =>
      status == SessionStatus.scheduled || status == SessionStatus.inProgress;

  static ConsentState? _consent(Object? raw) {
    if (raw == null) return null;
    if (raw is bool) return raw ? ConsentState.granted : ConsentState.refused;
    if (raw is Map && raw['granted'] is bool) {
      return raw['granted'] == true
          ? ConsentState.granted
          : ConsentState.refused;
    }
    return null;
  }
}

enum ConsentState { granted, refused }

enum SessionStatus {
  scheduled,
  inProgress,
  ended,
  cancelled,
  noShow,
  unknown;

  static SessionStatus parse(String? raw) => switch (raw) {
    'scheduled' => SessionStatus.scheduled,
    'in_progress' => SessionStatus.inProgress,
    'ended' || 'completed' => SessionStatus.ended,
    'cancelled' => SessionStatus.cancelled,
    'no_show' => SessionStatus.noShow,
    _ => SessionStatus.unknown,
  };
}

/// A message sent inside a session.
///
/// Append-only, because a session's chat is evidence in a dispute. There
/// is no edit and no delete, and the absence of those affordances is the
/// feature.
class SessionMessage {
  const SessionMessage({
    required this.id,
    required this.body,
    required this.senderId,
    this.sentAt,
  });

  factory SessionMessage.fromJson(Map<String, dynamic> json) => SessionMessage(
    id: json.str('id'),
    body: json.str('body', json.str('text')),
    senderId: json.eitherStr('senderId', 'sender_id'),
    sentAt: json.eitherDate('sentAt', 'sent_at') ?? json.eitherDate('createdAt', 'created_at'),
  );

  final String id;
  final String body;
  final String senderId;
  final DateTime? sentAt;
}

/// How long is left, and whether the five-minute warning has been given.
class SessionTimer {
  const SessionTimer({
    required this.remainingSeconds,
    this.warned = false,
    this.overrun = false,
  });

  factory SessionTimer.fromJson(Map<String, dynamic> json) => SessionTimer(
    remainingSeconds: json.intOr('remainingSeconds', 0),
    warned: json.boolOr('warningRaised'),
    overrun: json.boolOr('overrun'),
  );

  final int remainingSeconds;

  /// Stamped exactly once per session, server-side. The client renders
  /// the fact rather than deciding it, so a reconnect cannot produce a
  /// second warning.
  final bool warned;
  final bool overrun;

  Duration get remaining => Duration(seconds: remainingSeconds);
}
