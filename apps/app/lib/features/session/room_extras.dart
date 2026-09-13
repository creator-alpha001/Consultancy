import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../api/models/session.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// How long is left.
///
/// The five-minute warning is stamped ONCE, server-side, and this
/// renders the fact rather than deciding it — a client that decided
/// would warn again on every reconnect.
class SessionTimerPanel extends ConsumerWidget {
  const SessionTimerPanel({required this.sessionId, super.key});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) =>
      ref.watch(sessionTimerProvider(sessionId)).maybeWhen(
        data: (SessionTimer t) {
          final int minutes = t.remaining.inMinutes;
          return Panel(
            child: Row(
              children: <Widget>[
                const Icon(Icons.timer_outlined, size: 18),
                const SizedBox(width: Space.sm),
                Expanded(
                  child: PackText(
                    t.overrun
                        ? 'Running over'
                        : minutes <= 0
                        ? 'Time is up'
                        : '$minutes minutes left',
                  ),
                ),
                if (t.warned)
                  const StatusChip('Nearly done', tone: ChipTone.caution),
              ],
            ),
          );
        },
        orElse: () => const SizedBox.shrink(),
      );
}

/// Reporting that the call broke, and leaving the session.
///
/// **A platform-side failure never costs the provider** (CLAUDE.md #23):
/// the lost time is credited and the provider is still paid. So this is
/// offered plainly rather than buried, and it does not ask whose fault
/// it was — the platform merges both sides, so a shared outage counts
/// once and neither party has to argue about it.
class SessionTroubleFooter extends ConsumerStatefulWidget {
  const SessionTroubleFooter({required this.session, super.key});

  final MeetingSession session;

  @override
  ConsumerState<SessionTroubleFooter> createState() =>
      _SessionTroubleFooterState();
}

class _SessionTroubleFooterState extends ConsumerState<SessionTroubleFooter> {
  bool _busy = false;

  /// True between "it dropped" and "it's back". The server times the gap
  /// between the two reports, so both are needed for the credit.
  bool _down = false;

  @override
  Widget build(BuildContext context) => Panel(
    title: 'Something went wrong?',
    note:
        'A dropped call is noticed and credited on its own. If it was not — '
        'or the call failed outside the app — say so here. Nobody is '
        'penalised for a connection failure.',
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        if (_down) ...<Widget>[
          const Note(
            'Noted. Tap below when you are back, and the time in between is '
            'credited.',
            tone: ChipTone.verified,
          ),
          const SizedBox(height: Space.sm),
          FilledButton.icon(
            icon: const Icon(Icons.wifi),
            label: const PackText('We are back'),
            onPressed: _busy ? null : () => _report(connected: true),
          ),
        ] else
          OutlinedButton.icon(
            icon: const Icon(Icons.wifi_off_outlined),
            label: const PackText('The call dropped'),
            onPressed: _busy ? null : () => _report(connected: false),
          ),
        if (widget.session.isJoinable) ...<Widget>[
          const SizedBox(height: Space.sm),
          TextButton(
            onPressed: _busy ? null : _cancel,
            child: const PackText('Cancel this session'),
          ),
        ],
      ],
    ),
  );

  Future<void> _report({required bool connected}) async {
    setState(() => _busy = true);
    try {
      // No duration is sent: the server times the gap between the two
      // reports and merges both parties', so a shared outage counts once.
      await ref
          .read(repositoryProvider)
          .reportConnection(widget.session.id, connected: connected);
      if (mounted) setState(() => _down = !connected);
      ref.invalidate(sessionProvider(widget.session.id));
    } on ApiException {
      // Nothing to correct locally; the session refreshes either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _cancel() async {
    final bool? ok = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        title: const PackText('Cancel this session?'),
        content: const PackText(
          'The booking is released. Depending on how close it is, a '
          'cancellation fee may apply — the terms you accepted say which.',
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const PackText('Keep it'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const PackText('Cancel it'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    setState(() => _busy = true);
    try {
      await ref.read(repositoryProvider).cancelSession(widget.session.id);
      ref
        ..invalidate(sessionProvider(widget.session.id))
        ..invalidate(sessionsProvider);
      if (mounted) Navigator.of(context).pop();
    } on ApiException {
      // As above.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

/// Starting and stopping the recording, once both parties have agreed.
///
/// Consent is not the same as running: both said it MAY be recorded, and
/// starting is still a deliberate act either of them can reverse at any
/// point (CLAUDE.md #21).
class RecordingControl extends ConsumerStatefulWidget {
  const RecordingControl({required this.session, super.key});

  final MeetingSession session;

  @override
  ConsumerState<RecordingControl> createState() => _RecordingControlState();
}

class _RecordingControlState extends ConsumerState<RecordingControl> {
  bool _busy = false;

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
    icon: Icon(
      widget.session.recordingActive
          ? Icons.stop_circle_outlined
          : Icons.fiber_manual_record,
    ),
    label: PackText(
      widget.session.recordingActive ? 'Stop recording' : 'Start recording',
    ),
    onPressed: _busy ? null : _toggle,
  );

  Future<void> _toggle() async {
    setState(() => _busy = true);
    try {
      await ref
          .read(repositoryProvider)
          .setRecording(
            widget.session.id,
            active: !widget.session.recordingActive,
          );
      ref.invalidate(sessionProvider(widget.session.id));
    } on ApiException {
      // The session refreshes from the server either way.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
