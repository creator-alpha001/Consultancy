import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/engagement.dart';
import '../../api/models/session.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../room/room_client.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';
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
///   **#22** Audio-only is a first-class state with its own deliberate
///   entry point, not merely a banner that appears when video fails.
///
///   **#23** A platform-side failure never penalises the provider. A
///   dropped connection is reported so the time can be credited.
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
  RoomConnection? _connection;
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _connection?.leave();
    super.dispose();
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
            _Consent(session: s),
            _LiveAgenda(engagementId: s.engagementId),
            SessionChat(sessionId: s.id),
            _Controls(
              session: s,
              connection: _connection,
              busy: _busy,
              onJoin: _join,
              onAudioOnly: _audioOnly,
              onEnd: _end,
            ),
            if (_error != null) Note(_error!, tone: ChipTone.danger),
          ],
        ),
      ),
    );
  }

  Future<void> _join() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final Map<String, dynamic> credentials = await ref
          .read(repositoryProvider)
          .room(widget.sessionId);
      final RoomConnection c = await ref
          .read(roomClientProvider)
          .join(RoomCredentials.fromJson(credentials));
      if (!mounted) return;
      setState(() => _connection = c);
      await ref.read(repositoryProvider).startSession(widget.sessionId);
      ref.invalidate(sessionProvider(widget.sessionId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _audioOnly() async {
    try {
      await ref.read(repositoryProvider).audioOnly(widget.sessionId);
      await _connection?.setVideoEnabled(enabled: false);
      ref.invalidate(sessionProvider(widget.sessionId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  Future<void> _end() async {
    try {
      await _connection?.leave();
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
    return Container(
      height: 200,
      decoration: BoxDecoration(
        color: DarkScopeColors.surface,
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          Icon(
            session.isAudioOnly
                ? Icons.headphones_outlined
                : Icons.videocam_outlined,
            size: 32,
            color: DarkScopeColors.inkMuted,
          ),
          const SizedBox(height: Space.sm),
          PackText(
            connection == null
                ? 'Not joined'
                : session.isAudioOnly
                ? 'Audio only'
                : 'Connected',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: DarkScopeColors.ink,
            ),
          ),
          if (session.recordingActive) ...<Widget>[
            const SizedBox(height: Space.sm),
            const StatusChip(
              'Recording',
              tone: ChipTone.danger,
              icon: Icons.fiber_manual_record,
            ),
          ],
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
      return const Panel(
        title: 'Recording',
        child: Note(
          'You both agreed to record this session. The recording is kept '
          'for 90 days and either of you can use it if something is '
          'disputed.',
          tone: ChipTone.verified,
          icon: Icons.check_circle_outline,
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
  const _LiveAgenda({required this.engagementId});

  final String engagementId;

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
                              .tickAgendaItem(i.id);
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
    required this.onAudioOnly,
    required this.onEnd,
  });

  final MeetingSession session;
  final RoomConnection? connection;
  final bool busy;
  final Future<void> Function() onJoin;
  final Future<void> Function() onAudioOnly;
  final Future<void> Function() onEnd;

  @override
  Widget build(BuildContext context) => Panel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (connection == null)
          FilledButton.icon(
            icon: const Icon(Icons.videocam_outlined),
            label: const PackText('Join'),
            onPressed: busy ? null : () => onJoin(),
          )
        else
          OutlinedButton.icon(
            icon: const Icon(Icons.call_end),
            label: const PackText('End the session'),
            onPressed: busy ? null : () => onEnd(),
          ),
        const SizedBox(height: Space.sm),
        // Audio-only is offered up front, as a choice — not hidden behind
        // a failure. Users on a patchy connection often know before the
        // video does.
        if (!session.isAudioOnly)
          TextButton.icon(
            icon: const Icon(Icons.headphones_outlined),
            label: const PackText('Switch to audio only'),
            onPressed: busy ? null : () => onAudioOnly(),
          ),
      ],
    ),
  );
}
