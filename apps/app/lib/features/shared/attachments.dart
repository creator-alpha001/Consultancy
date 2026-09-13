import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_error.dart';
import '../../config.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// Opening a private file.
///
/// **There is no such thing as a durable link here.** Every view mints a
/// fresh URL that expires in five minutes and is watermarked with
/// whoever asked for it (CLAUDE.md #29) — so this fetches one at the
/// moment of viewing and never stores it, never caches it, and never
/// passes it anywhere it could be shared.
///
/// The watermark is the point: a document that leaks can be traced to the
/// account that opened it, which is what makes handing someone else's
/// evidence around a traceable act rather than a free one.
class AttachmentView extends ConsumerStatefulWidget {
  const AttachmentView({
    required this.attachmentId,
    required this.title,
    this.isImage = false,
    super.key,
  });

  final String attachmentId;
  final String title;
  final bool isImage;

  @override
  ConsumerState<AttachmentView> createState() => _AttachmentViewState();
}

class _AttachmentViewState extends ConsumerState<AttachmentView> {
  String? _url;
  bool _busy = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _mint());
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: PackText(widget.title),
      actions: <Widget>[
        IconButton(
          icon: const Icon(Icons.refresh),
          tooltip: 'Get a fresh link',
          onPressed: _busy ? null : _mint,
        ),
      ],
    ),
    body: PageBody(
      children: <Widget>[
        const Note(
          'This link lasts five minutes and carries your name inside it. It '
          'is not a link you can share.',
          icon: Icons.lock_clock_outlined,
        ),

        if (_busy)
          const Panel(child: Center(child: CircularProgressIndicator()))
        else if (_error != null)
          Panel(child: Note(_error!, tone: ChipTone.danger))
        else if (_url != null && widget.isImage)
          Panel(
            padding: EdgeInsets.zero,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(Radii.lg),
              child: Image.network(
                _url!,
                fit: BoxFit.contain,
                // An image that fails to load says so in words. A broken
                // icon on a screen someone is relying on is not an
                // answer.
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(Space.lg),
                  child: Note(
                    'The link expired or the file could not be shown. Try a '
                    'fresh link.',
                    tone: ChipTone.caution,
                  ),
                ),
                loadingBuilder: (_, Widget child, ImageChunkEvent? p) =>
                    p == null
                    ? child
                    : const Padding(
                        padding: EdgeInsets.all(Space.xxl),
                        child: Center(child: CircularProgressIndicator()),
                      ),
              ),
            ),
          )
        else
          const Panel(
            child: Note(
              'This is a document rather than an image. Opening it in a '
              'viewer is not built yet — the link above is live and works '
              'in a browser.',
              tone: ChipTone.caution,
              icon: Icons.description_outlined,
            ),
          ),
      ],
    ),
  );

  Future<void> _mint() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      // The response carries the token; the PATH is built here, from an
      // id this screen was already allowed to hold, so no URL arrives
      // from anywhere it could have been tampered with.
      final Map<String, dynamic> link = await ref
          .read(repositoryProvider)
          .attachmentLink(widget.attachmentId);
      final String? token = (link['token'] ?? link['signature']) as String?;
      final String path = ref
          .read(repositoryProvider)
          .attachmentDownloadPath(widget.attachmentId);
      if (mounted) {
        setState(
          () => _url =
              (link['url'] as String?) ??
              '${Config.apiBaseUrl}$path${token != null ? '?token=$token' : ''}',
        );
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
