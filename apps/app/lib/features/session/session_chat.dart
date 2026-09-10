import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../api/models/session.dart';
import '../../data.dart';
import '../../providers.dart';
import '../../theme/app_theme.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Chat inside a session, and the files shared in it.
///
/// **Append-only, and the absence of an edit is the feature.** A
/// session's messages are evidence in a dispute — the locked agenda says
/// what was agreed, and this says what was actually discussed. A message
/// someone could edit afterwards would be worth nothing to an
/// adjudicator, so there is no edit control here and no delete.
///
/// **It is also why the platform asks people to stay on it.** Off
/// platform, the escrow, the agenda and the dispute cover all disappear
/// — so the panel says that once, plainly, rather than policing it.
class SessionChat extends ConsumerStatefulWidget {
  const SessionChat({required this.sessionId, super.key});

  final String sessionId;

  @override
  ConsumerState<SessionChat> createState() => _SessionChatState();
}

class _SessionChatState extends ConsumerState<SessionChat> {
  final TextEditingController _body = TextEditingController();
  final ScrollController _scroll = ScrollController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _body.dispose();
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final String? meId = ref.watch(authProvider).user?.id;
    final AsyncValue<List<SessionMessage>> messages = ref.watch(
      sessionMessagesProvider(widget.sessionId),
    );

    return Panel(
      title: 'Messages',
      note: 'Kept with the session. Nothing here can be edited or removed.',
      trailing: IconButton(
        icon: const Icon(Icons.refresh, size: 20),
        tooltip: 'Refresh messages',
        onPressed: () =>
            ref.invalidate(sessionMessagesProvider(widget.sessionId)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          messages.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: Space.lg),
              child: LinearProgressIndicator(),
            ),
            error: (Object e, _) => Note(
              e is ApiException ? e.message : 'Could not load the messages.',
              tone: ChipTone.danger,
            ),
            data: (List<SessionMessage> list) => list.isEmpty
                ? Padding(
                    padding: const EdgeInsets.symmetric(vertical: Space.md),
                    child: PackText(
                      'Nothing said yet.',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: BaseColors.inkMuted,
                      ),
                    ),
                  )
                : ConstrainedBox(
                    constraints: const BoxConstraints(maxHeight: 280),
                    child: ListView.builder(
                      controller: _scroll,
                      shrinkWrap: true,
                      itemCount: list.length,
                      itemBuilder: (BuildContext context, int i) => _Bubble(
                        message: list[i],
                        mine: list[i].senderId == meId,
                      ),
                    ),
                  ),
          ),

          if (_error != null) ...<Widget>[
            const SizedBox(height: Space.md),
            Note(_error!, tone: ChipTone.danger),
          ],

          const SizedBox(height: Space.md),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: <Widget>[
              Expanded(
                child: TextField(
                  controller: _body,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  decoration: const InputDecoration(
                    hintText: 'Say something',
                    isDense: true,
                  ),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: Space.sm),
              IconButton.filled(
                onPressed: _busy ? null : _send,
                tooltip: 'Send',
                icon: const Icon(Icons.arrow_upward),
                constraints: const BoxConstraints(
                  minWidth: kTouchTarget,
                  minHeight: kTouchTarget,
                ),
              ),
            ],
          ),

          const SizedBox(height: Space.sm),
          // Said once, without nagging. The reason is concrete — what a
          // person loses — rather than a rule they are being told to obey.
          PackText(
            'Keep it here and the escrow, the goals and the dispute cover all '
            'still apply. They do not follow you to another app.',
            style: theme.textTheme.bodySmall?.copyWith(
              color: BaseColors.inkFaint,
            ),
          ),

          _SharedFiles(sessionId: widget.sessionId),
        ],
      ),
    );
  }

  Future<void> _send() async {
    final String text = _body.text.trim();
    if (text.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .sendSessionMessage(widget.sessionId, text);
      _body.clear();
      ref.invalidate(sessionMessagesProvider(widget.sessionId));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message, required this.mine});

  final SessionMessage message;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final BrandTokens brand = BrandTokens.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: Space.sm),
      child: Align(
        alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 260),
          child: Container(
            padding: const EdgeInsets.symmetric(
              horizontal: Space.md,
              vertical: Space.sm,
            ),
            decoration: BoxDecoration(
              color: mine ? brand.brandSoft : BaseColors.surfaceSunk,
              border: Border.all(
                color: mine ? brand.brandLine : BaseColors.line,
              ),
              borderRadius: BorderRadius.circular(Radii.md),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                // The sender is in the accessible name too — a bubble's
                // side is a visual cue and nothing else.
                PackText(
                  message.body,
                  semanticsLabel: '${mine ? 'You' : 'They'} said: ${message.body}',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: mine ? brand.brandSoftInk : BaseColors.ink,
                  ),
                ),
                if (message.sentAt != null) ...<Widget>[
                  const SizedBox(height: 2),
                  PackText(
                    DateFormat('HH:mm').format(message.sentAt!),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: BaseColors.inkFaint,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Files shared during the session.
///
/// Sharing one creates the grant — that is the whole access model
/// (CLAUDE.md #29): there is no public link, and a viewer reaches the
/// file through a signed URL with a short expiry, watermarked with their
/// identity. Uploading is not built on either client yet, so this lists
/// what is there and says so rather than offering a button that does
/// nothing.
class _SharedFiles extends ConsumerWidget {
  const _SharedFiles({required this.sessionId});

  final String sessionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Map<String, dynamic>>> files = ref.watch(
      sessionFilesProvider(sessionId),
    );

    return files.maybeWhen(
      data: (List<Map<String, dynamic>> list) {
        if (list.isEmpty) return const SizedBox.shrink();
        return Padding(
          padding: const EdgeInsets.only(top: Space.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Divider(height: Space.lg),
              PackText(
                'Shared in this session',
                style: Theme.of(
                  context,
                ).textTheme.labelMedium?.copyWith(color: BaseColors.inkMuted),
              ),
              const SizedBox(height: Space.sm),
              for (final Map<String, dynamic> f in list)
                Row(
                  children: <Widget>[
                    const Icon(
                      Icons.attach_file,
                      size: 16,
                      color: BaseColors.inkMuted,
                    ),
                    const SizedBox(width: Space.sm),
                    Expanded(
                      child: PackText(
                        (f['filename'] ?? f['name'] ?? 'A file').toString(),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}
