import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/session.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../room/agora_room_client.dart';
import '../../room/room_client.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
import 'book_session.dart';
import 'room_extras.dart';
import 'session_chat.dart';

/// The live session room.
///
/// Four of CLAUDE.md's rules meet on this one screen, and each is visible
/// in the code below rather than assumed:
///
///   **#21** Recording needs explicit opt-in from BOTH parties, in this
///   session, every session. Not blanket consent in the Terms, not a
///   remembered preference, not a "don't ask again". A refusal is a
///   recorded outcome that shifts the evidentiary burden — so it is sent
///   to the server as a refusal rather than as silence.
///
///   **#22** Sessions are voice-first: the camera is off at join and
///   turning it on is a choice. Audio-only has its own deliberate entry
///   point, and a connection that stays weak is dropped to audio for the
///   person rather than left to stutter.
///
///   **#23** A platform-side failure never penalises the provider. When
///   the link drops and returns, both moments are reported as they happen
///   so the lost time is credited — nobody has to remember to say so.
///
///   **#11** The agenda is locked, and ticking an item is the single
///   mutation that remains legal on it.
class RoomScreen extends ConsumerStatefulWidget {
  const RoomScreen({required this.sessionId, super.key});

  final String sessionId;

  @override
  ConsumerState<RoomScreen> createState() => _RoomScreenState();
}

class _RoomScreenState extends ConsumerState<RoomScreen> {
  /// Consecutive weak-quality readings before dropping to audio. The SDK
  /// reports every two seconds, so this is about six seconds of a bad
  /// link — long enough not to react to one blip.
  static const int _weakReadingsBeforeFallback = 3;

  RoomConnection? _connection;
  RoomState? _last;
  StreamSubscription<void>? _expirySub;
  String? _error;
  String? _notice;
  bool _busy = false;
  bool _dropReported = false;
  int _weakReadings = 0;

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  void _detach() {
    _connection?.state.removeListener(_onRoomState);
    _expirySub?.cancel();
    _expirySub = null;
    _connection?.leave();
  }

  @override
  Widget build(BuildContext context) {
    final AsyncValue<MeetingSession> session = ref.watch(
      sessionProvider(widget.sessionId),
    );

    return Scaffold(
      appBar: AppBar(
        title: const PackText('Session'),
        actions: <Widget>[
          IconButton(
            icon: const Icon(Icons.flag_outlined),
            tooltip: 'Report a problem',
            onPressed: () => Navigator.of(context).pushNamed(
              '/report?subject=session&id=${widget.sessionId}',
            ),
          ),
        ],
      ),
      body: AsyncBody<MeetingSession>(
        value: session,
        onRetry: () => ref.invalidate(sessionProvider(widget.sessionId)),
        emptyWhen: (_) => false,
        emptyMessage: '',
        builder: (MeetingSession s) => PageBody(
          onRefresh: () async => ref.invalidate(sessionProvider(widget.sessionId)),
          children: <Widget>[
            _Stage(session: s, connection: _connection),
            if (_notice != null) Note(_notice!, icon: Icons.headphones_outlined),
            if (s.isLive) SessionTimerPanel(sessionId: s.id),
            _Consent(session: s),
            _LiveAgenda(engagementId: s.engagementId, sessionId: s.id),
            SessionChat(sessionId: s.id),
            if (s.isLive) ExtensionSheet(sessionId: s.id),
            _Controls(
              session: s,
              connection: _connection,
              busy: _busy,
              onJoin: () => _join(s),
              onToggleMic: _toggleMic,
              onToggleCamera: _toggleCamera,
              onAudioOnly: () => _audioOnly(automatic: false),
              onEnd: _end,
            ),
            if (_error != null) Note(_error!, tone: ChipTone.danger),
            SessionTroubleFooter(session: s),
          ],
        ),
      ),
    );
  }

  Future<void> _join(MeetingSession s) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Map<String, dynamic> response = await ref
          .read(repositoryProvider)
          .room(widget.sessionId);
      final RoomConnection c = await ref
          .read(roomClientProvider)
          .join(RoomCredentials.fromRoomResponse(response));
      if (!mounted) {
        await c.leave();
        return;
      }
      c.state.addListener(_onRoomState);
      _expirySub = c.tokenExpiring.listen((_) => _renewToken());
      setState(() {
        _connection = c;
        _last = c.state.value;
      });
      // The second person to arrive finds the session already running.
      if (!s.isLive) {
        await ref.read(repositoryProvider).startSession(widget.sessionId);
      }
      ref.invalidate(sessionProvider(widget.sessionId));
    } on RoomJoinRefused catch (e) {
      if (mounted) setState(() => _error = e.message);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Everything the vendor reports lands here once.
  void _onRoomState() {
    final RoomConnection? c = _connection;
    if (c == null || !mounted) return;
    final RoomState next = c.state.value;
    final RoomState? prev = _last;
    _last = next;

    // #23 — the link went, or came back. Reported the moment it happens;
    // the server times the gap. A drop before the first connection is a
    // failed join, not lost session time, so it is not reported.
    final bool down =
        next.link == RoomLink.reconnecting || next.link == RoomLink.failed;
    if (down && next.connectedOnce && !_dropReported) {
      _dropReported = true;
      _report(connected: false);
    } else if (next.link == RoomLink.connected && _dropReported) {
      _dropReported = false;
      _report(connected: true);
    }

    // #22 — a link that stays weak is dropped to audio for the person.
    if (next.quality == LinkQuality.poor) {
      _weakReadings += 1;
      final MeetingSession? s = ref
          .read(sessionProvider(widget.sessionId))
          .valueOrNull;
      if (_weakReadings == _weakReadingsBeforeFallback &&
          s != null &&
          !s.isAudioOnly) {
        _audioOnly(automatic: true);
      }
    } else if (next.quality == LinkQuality.good) {
      _weakReadings = 0;
    }

    if (prev == null ||
        prev.link != next.link ||
        prev.cameraOn != next.cameraOn ||
        prev.micOn != next.micOn ||
        prev.otherUid != next.otherUid ||
        prev.quality != next.quality) {
      setState(() {});
    }
  }

  Future<void> _report({required bool connected}) async {
    try {
      await ref
          .read(repositoryProvider)
          .reportConnection(widget.sessionId, connected: connected);
    } on ApiException {
      // Best effort: the link may still be down. The server closes any
      // open gap when the session ends, so nothing is lost for good.
    }
  }

  Future<void> _renewToken() async {
    try {
      final Map<String, dynamic> response = await ref
          .read(repositoryProvider)
          .room(widget.sessionId);
      final String? token = RoomCredentials.fromRoomResponse(response).token;
      if (token != null) await _connection?.renewToken(token);
    } on ApiException {
      // The SDK warns ahead of expiry; the next warning retries.
    }
  }

  Future<void> _toggleMic() async {
    final RoomConnection? c = _connection;
    if (c == null) return;
    await c.setMicEnabled(enabled: !c.state.value.micOn);
  }

  Future<void> _toggleCamera() async {
    final RoomConnection? c = _connection;
    if (c == null) return;
    setState(() => _error = null);
    try {
      await c.setVideoEnabled(enabled: !c.state.value.cameraOn);
    } on RoomJoinRefused catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _audioOnly({required bool automatic}) async {
    try {
      await _connection?.setVideoEnabled(enabled: false);
      await _connection?.setIncomingVideoEnabled(enabled: false);
      // Recorded server-side as the fallback event it is.
      await ref.read(repositoryProvider).audioOnly(widget.sessionId);
      if (automatic && mounted) {
        setState(
          () => _notice =
              'Your connection is weak, so the call switched to voice only. '
              'The session carries on as normal.',
        );
      }
      ref.invalidate(sessionProvider(widget.sessionId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _end() async {
    try {
      _detach();
      await ref.read(repositoryProvider).endSession(widget.sessionId);
      ref
        ..invalidate(sessionProvider(widget.sessionId))
        ..invalidate(sessionsProvider);
      if (mounted) setState(() => _connection = null);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }
}

class _Stage extends StatelessWidget {
  const _Stage({required this.session, required this.connection});

  final MeetingSession session;
  final RoomConnection? connection;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final RoomState? state = connection?.state.value;
    final Widget? remote = session.isAudioOnly ? null : connection?.remoteView();
    final Widget? local = connection?.localView();

    final String label = switch (state?.link) {
      null => 'Not joined',
      RoomLink.connecting => 'Connecting',
      RoomLink.reconnecting => 'Reconnecting — your time is being kept',
      RoomLink.failed => 'Connection lost',
      RoomLink.left => 'Left the call',
      RoomLink.connected when state != null && !state.otherPresent =>
        'Waiting for the other person',
      RoomLink.connected => session.isAudioOnly ? 'Voice only' : 'Connected',
    };

    return Container(
      height: 240,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: DarkScopeColors.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      child: Stack(
        children: <Widget>[
          if (remote != null) Positioned.fill(child: remote),
          Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                if (remote == null)
                  Icon(
                    state?.cameraOn ?? false
                        ? Icons.videocam_outlined
                        : Icons.headphones_outlined,
                    size: 32,
                    color: DarkScopeColors.inkMuted,
                  ),
                const SizedBox(height: Space.sm),
                // Announced, so a screen-reader user hears the link change.
                Semantics(
                  liveRegion: true,
                  child: PackText(
                    label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: DarkScopeColors.ink,
                    ),
                  ),
                ),
                if (state?.quality == LinkQuality.poor &&
                    state?.link == RoomLink.connected) ...<Widget>[
                  const SizedBox(height: Space.sm),
                  const StatusChip(
                    'Weak connection',
                    tone: ChipTone.caution,
                    icon: Icons.network_check,
                  ),
                ],
                if (session.recordingActive) ...<Widget>[
                  const SizedBox(height: Space.sm),
                  const StatusChip(
                    'Recording audio',
                    tone: ChipTone.danger,
                    icon: Icons.fiber_manual_record,
                  ),
                ],
              ],
            ),
          ),
          if (local != null)
            Positioned(
              right: Space.sm,
              bottom: Space.sm,
              width: 96,
              height: 128,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(Radii.md),
                child: local,
              ),
            ),
        ],
      ),
    );
  }
}

/// Consent, asked here and nowhere else.
///
/// Both parties, in this session, every session. The three states are
/// kept distinct — not asked, granted, refused — because a refusal is a
/// fact the platform records, not an absence.
class _Consent extends ConsumerStatefulWidget {
  const _Consent({required this.session});

  final MeetingSession session;

  @override
  ConsumerState<_Consent> createState() => _ConsentState();
}

class _ConsentState extends ConsumerState<_Consent> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) {
    final MeetingSession s = widget.session;

    if (s.bothConsented) {
      return Panel(
        title: 'Recording',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            const Note(
              'You both agreed to record this session. Only the audio is '
              'recorded. It is kept '
              'for 90 days and either of you can use it if something is '
              'disputed.',
              tone: ChipTone.verified,
              icon: Icons.check_circle_outline,
            ),
            const SizedBox(height: Space.md),
            // Agreeing is not the same as running. Either of them can
            // start or stop it at any point, which is why this is a
            // control rather than a status line.
            RecordingControl(session: s),
          ],
        ),
      );
    }

    if (s.anyoneRefused) {
      return const Panel(
        title: 'Recording',
        child: Note(
          'Not recording — one of you declined, which is entirely allowed. '
          'The session goes ahead as normal.',
          icon: Icons.info_outline,
        ),
      );
    }

    return Panel(
      title: 'Record this session?',
      note:
          'Both of you have to agree, every time. Saying no is fine and the '
          'session continues either way.',
      child: Row(
        children: <Widget>[
          Expanded(
            child: OutlinedButton(
              onPressed: _busy ? null : () => _answer(granted: false),
              child: const PackText('No'),
            ),
          ),
          const SizedBox(width: Space.md),
          Expanded(
            child: FilledButton(
              onPressed: _busy ? null : () => _answer(granted: true),
              child: const PackText('Yes, record'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _answer({required bool granted}) async {
    setState(() => _busy = true);
    try {
      // A refusal is SENT, not merely withheld. It becomes its own row
      // and its own audit entry, and that is what shifts the evidentiary
      // burden if the session is later disputed.
      await ref
          .read(repositoryProvider)
          .consent(widget.session.id, granted: granted);
      ref.invalidate(sessionProvider(widget.session.id));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// The agreed goals, ticked live.
///
/// The agenda is locked and immutable; `checked_at` is the one field that
/// may still change, and this is where it changes.
class _LiveAgenda extends ConsumerWidget {
  const _LiveAgenda({required this.engagementId, required this.sessionId});

  final String engagementId;
  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final AsyncValue<Engagement> engagement = ref.watch(
      engagementProvider(engagementId),
    );

    return engagement.when(
      loading: () => const Panel(child: LinearProgressIndicator()),
      error: (Object e, _) => const SizedBox.shrink(),
      data: (Engagement e) {
        final Agenda? a = e.agenda;
        if (a == null || a.items.isEmpty) return const SizedBox.shrink();
        return Panel(
          title: 'The goals',
          note: 'Tick them off as you cover them.',
          trailing: StatusChip('${a.addressedCount}/${a.items.length}'),
          child: Column(
            children: <Widget>[
              for (final AgendaItem i in a.items)
                CheckboxListTile(
                  value: i.addressed,
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: PackText(i.textIn(lang)),
                  // Ticking is one-way here: unticking a goal that was
                  // covered would be rewriting the record of a session.
                  onChanged: i.addressed
                      ? null
                      : (bool? _) async {
                          await ref
                              .read(repositoryProvider)
                              .tickSessionItem(sessionId, i.id);
                          ref.invalidate(engagementProvider(engagementId));
                        },
                ),
            ],
          ),
        );
      },
    );
  }
}

class _Controls extends StatelessWidget {
  const _Controls({
    required this.session,
    required this.connection,
    required this.busy,
    required this.onJoin,
    required this.onToggleMic,
    required this.onToggleCamera,
    required this.onAudioOnly,
    required this.onEnd,
  });

  final MeetingSession session;
  final RoomConnection? connection;
  final bool busy;
  final Future<void> Function() onJoin;
  final Future<void> Function() onToggleMic;
  final Future<void> Function() onToggleCamera;
  final Future<void> Function() onAudioOnly;
  final Future<void> Function() onEnd;

  @override
  Widget build(BuildContext context) {
    final RoomConnection? c = connection;
    final RoomState? state = c?.state.value;

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          if (c == null || state == null) ...<Widget>[
            FilledButton.icon(
              icon: const Icon(Icons.call_outlined),
              label: const PackText('Join'),
              onPressed: busy || !session.isJoinable ? null : () => onJoin(),
            ),
            const SizedBox(height: Space.sm),
            const PackText(
              'You join with your microphone on and your camera off. You can '
              'turn the camera on once you are in.',
            ),
          ] else ...<Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: OutlinedButton.icon(
                    icon: Icon(state.micOn ? Icons.mic : Icons.mic_off),
                    label: PackText(state.micOn ? 'Mute' : 'Unmute'),
                    onPressed: busy ? null : () => onToggleMic(),
                  ),
                ),
                const SizedBox(width: Space.md),
                // Once the session has dropped to voice only it stays
                // there: the server has no route back, and a connection
                // that just failed video is the wrong one to retry it on.
                if (!session.isAudioOnly)
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: Icon(
                        state.cameraOn
                            ? Icons.videocam_off_outlined
                            : Icons.videocam_outlined,
                      ),
                      label: PackText(
                        state.cameraOn ? 'Camera off' : 'Camera on',
                      ),
                      onPressed: busy ? null : () => onToggleCamera(),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: Space.sm),
            FilledButton.icon(
              icon: const Icon(Icons.call_end),
              label: const PackText('End the session'),
              style: FilledButton.styleFrom(
                backgroundColor: BaseColors.danger,
              ),
              onPressed: busy ? null : () => onEnd(),
            ),
          ],
          const SizedBox(height: Space.sm),
          // Audio-only is offered up front, as a choice — not hidden behind
          // a failure. Users on a patchy connection often know before the
          // video does.
          if (!session.isAudioOnly)
            TextButton.icon(
              icon: const Icon(Icons.headphones_outlined),
              label: const PackText('Voice only for this session'),
              onPressed: busy ? null : () => onAudioOnly(),
            ),
        ],
      ),
    );
  }
}
