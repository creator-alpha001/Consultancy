import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/models/session.dart';
import '../../data.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

class SessionsScreen extends ConsumerWidget {
  const SessionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<MeetingSession>> sessions = ref.watch(
      sessionsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Sessions')),
      body: AsyncBody<List<MeetingSession>>(
        value: sessions,
        onRetry: () => ref.invalidate(sessionsProvider),
        emptyWhen: (List<MeetingSession> l) => l.isEmpty,
        emptyMessage:
            'No sessions booked. A live session is arranged from inside a '
            'piece of work, once the goals are agreed.',
        builder: (List<MeetingSession> list) {
          final List<MeetingSession> sorted = List<MeetingSession>.of(list)
            ..sort(
              (MeetingSession a, MeetingSession b) =>
                  (a.scheduledStart ?? DateTime(0)).compareTo(
                    b.scheduledStart ?? DateTime(0),
                  ),
            );
          return ListView.separated(
            padding: const EdgeInsets.all(Space.lg),
            itemCount: sorted.length,
            separatorBuilder: (_, _) => const SizedBox(height: Space.md),
            itemBuilder: (BuildContext context, int i) =>
                _SessionRow(session: sorted[i]),
          );
        },
      ),
    );
  }
}

class _SessionRow extends StatelessWidget {
  const _SessionRow({required this.session});

  final MeetingSession session;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final MeetingSession s = session;
    final DateTime? start = s.scheduledStart;

    return Panel(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(Radii.lg),
        onTap: s.isJoinable ? () => context.push('/sessions/${s.id}') : null,
        child: Padding(
          padding: const EdgeInsets.all(Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  Expanded(
                    child: PackText(
                      s.counterpart ?? 'Session',
                      style: theme.textTheme.titleMedium,
                    ),
                  ),
                  StatusChip(
                    switch (s.status) {
                      SessionStatus.scheduled => 'Booked',
                      SessionStatus.inProgress => 'Live now',
                      SessionStatus.ended => 'Finished',
                      SessionStatus.cancelled => 'Cancelled',
                      SessionStatus.noShow => 'Nobody came',
                      SessionStatus.unknown => '—',
                    },
                    tone: switch (s.status) {
                      SessionStatus.inProgress => ChipTone.brand,
                      SessionStatus.ended => ChipTone.verified,
                      SessionStatus.cancelled ||
                      SessionStatus.noShow => ChipTone.neutral,
                      _ => ChipTone.info,
                    },
                  ),
                ],
              ),
              const SizedBox(height: Space.sm),
              if (start != null)
                PackText(
                  // The provider's own timezone travels with the time, so
                  // "3pm" is never ambiguous across a border.
                  '${DateFormat('EEE d MMM, h:mm a').format(start)}'
                  '${s.durationMinutes != null ? ' · ${s.durationMinutes} min' : ''}'
                  ' · ${s.timezone}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: BaseColors.inkMuted,
                  ),
                ),
              if (s.isAudioOnly) ...<Widget>[
                const SizedBox(height: Space.sm),
                // A state, not a failure (CLAUDE.md #22).
                const StatusChip(
                  'Audio only',
                  icon: Icons.headphones_outlined,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
