import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../api/api_error.dart';
import '../../data.dart';
import '../../pack/pack.dart';
import '../../providers.dart';
import '../../theme/generated_tokens.dart';
import '../../widgets/async.dart';
import '../../widgets/kit.dart';
import '../../widgets/text.dart';

/// The agreements a person has accepted.
///
/// **The wording is family data and is versioned**, so what is shown here
/// is the text as it stood when it was accepted — not today's version.
/// An agreement screen that quietly showed the current wording would be
/// misrepresenting what someone agreed to, which matters most in exactly
/// the situation the document is for.
class LegalScreen extends ConsumerWidget {
  const LegalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Map<String, dynamic>>> agreements = ref.watch(
      myAgreementsProvider,
    );

    return Scaffold(
      appBar: AppBar(title: const PackText('Legal')),
      body: AsyncBody<List<Map<String, dynamic>>>(
        value: agreements,
        onRetry: () => ref.invalidate(myAgreementsProvider),
        emptyWhen: (List<Map<String, dynamic>> l) => l.isEmpty,
        emptyMessage:
            'Nothing recorded yet. What you accept when you register or take '
            'on work appears here, in the wording you saw at the time.',
        builder: (List<Map<String, dynamic>> list) => PageBody(
          onRefresh: () async => ref.invalidate(myAgreementsProvider),
          children: <Widget>[
            const Note(
              'Each of these is the wording as it stood when you accepted it, '
              'not the current version.',
              icon: Icons.history_edu_outlined,
            ),
            Panel(
              title: 'What you have accepted',
              child: Column(
                children: <Widget>[
                  for (final Map<String, dynamic> a in list)
                    NavRow(
                      title: (a['code'] ?? a['documentCode'] ?? 'Agreement')
                          .toString()
                          .replaceAll('_', ' '),
                      subtitle: _acceptedAt(a),
                      leading: const Icon(
                        Icons.description_outlined,
                        size: 20,
                      ),
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => _AgreementText(agreement: a),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String? _acceptedAt(Map<String, dynamic> a) {
    final Object? raw = a['acceptedAt'] ?? a['createdAt'];
    if (raw is! String) return null;
    final DateTime? at = DateTime.tryParse(raw);
    if (at == null) return null;
    final Object? version = a['version'];
    return 'Accepted ${DateFormat('d MMM yyyy').format(at.toLocal())}'
        '${version != null ? ' · version $version' : ''}';
  }
}

class _AgreementText extends ConsumerWidget {
  const _AgreementText({required this.agreement});

  final Map<String, dynamic> agreement;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final String lang = ref.watch(langProvider);
    final String code = (agreement['code'] ?? agreement['documentCode'] ?? '')
        .toString();
    final String familyCode = (agreement['familyCode'] ?? '').toString();

    return Scaffold(
      appBar: AppBar(title: PackText(code.replaceAll('_', ' '))),
      body: FutureBuilder<Map<String, dynamic>>(
        future: ref
            .read(repositoryProvider)
            .agreementDocument(code: code, familyCode: familyCode),
        builder:
            (
              BuildContext context,
              AsyncSnapshot<Map<String, dynamic>> snap,
            ) {
              if (snap.connectionState != ConnectionState.done) {
                return const Center(child: CircularProgressIndicator());
              }
              if (snap.hasError) {
                return PageBody(
                  children: <Widget>[
                    Note(
                      snap.error is ApiException
                          ? (snap.error! as ApiException).message
                          : 'Could not load the wording.',
                      tone: ChipTone.danger,
                    ),
                  ],
                );
              }
              final Map<String, dynamic> doc =
                  snap.data ?? const <String, dynamic>{};
              final Object? body = doc['body'];
              final String text = body is Map<String, dynamic>
                  ? (body[lang] ?? body['en'] ?? '').toString()
                  : (body ?? '').toString();

              return PageBody(
                children: <Widget>[
                  Panel(child: PackText(text.isEmpty ? 'No text.' : text)),
                ],
              );
            },
      ),
    );
  }
}

/// Reporting something.
///
/// **The reasons come from the family manifest** — core names none of
/// them, because a music-instruction family's list of things worth
/// reporting is not an exam family's, and putting them in an enum would
/// mean a migration to open a field.
///
/// **A welfare concern is not a moderation case.** Where the pack marks a
/// reason as one, this screen answers with the family's real helplines
/// and holds nothing back behind a queue — that is CLAUDE.md #25, and it
/// is the reason this screen is not a simple form.
class ReportScreen extends ConsumerStatefulWidget {
  const ReportScreen({
    required this.subjectType,
    required this.subjectId,
    this.domainCode,
    super.key,
  });

  final String subjectType;
  final String subjectId;
  final String? domainCode;

  @override
  ConsumerState<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends ConsumerState<ReportScreen> {
  final TextEditingController _detail = TextEditingController();
  String? _reasonCode;
  bool _busy = false;
  String? _error;
  bool _done = false;

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final String lang = ref.watch(langProvider);

    if (_done) return const _ReportReceived();

    // Reasons are per DOMAIN, resolved through its family. Without one
    // there is nothing to offer, so the screen says so rather than
    // inventing a list.
    final AsyncValue<List<Map<String, dynamic>>> domains = ref.watch(
      myDomainsProvider,
    );
    final String? domainCode =
        widget.domainCode ??
        domains.valueOrNull?.firstOrNull?['domainCode'] as String?;

    return Scaffold(
      appBar: AppBar(title: const PackText('Report')),
      body: domainCode == null
          ? const PageBody(
              children: <Widget>[
                Note(
                  'Reporting needs a field to read its reasons from, and you '
                  'are not in one yet.',
                  tone: ChipTone.caution,
                ),
              ],
            )
          : _Form(
              domainCode: domainCode,
              lang: lang,
              reasonCode: _reasonCode,
              detail: _detail,
              error: _error,
              busy: _busy,
              onReason: (String c) => setState(() => _reasonCode = c),
              onSubmit: () => _submit(domainCode),
            ),
    );
  }

  Future<void> _submit(String domainCode) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref
          .read(repositoryProvider)
          .report(
            subjectType: widget.subjectType,
            subjectId: widget.subjectId,
            reasonCode: _reasonCode!,
            lang: ref.read(langProvider),
            detail: _detail.text.trim().isEmpty ? null : _detail.text.trim(),
          );
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}

class _Form extends ConsumerWidget {
  const _Form({
    required this.domainCode,
    required this.lang,
    required this.reasonCode,
    required this.detail,
    required this.error,
    required this.busy,
    required this.onReason,
    required this.onSubmit,
  });

  final String domainCode;
  final String lang;
  final String? reasonCode;
  final TextEditingController detail;
  final String? error;
  final bool busy;
  final void Function(String) onReason;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Map<String, dynamic>>> reasons = ref.watch(
      reportReasonsProvider(domainCode),
    );

    return AsyncBody<List<Map<String, dynamic>>>(
      value: reasons,
      onRetry: () => ref.invalidate(reportReasonsProvider(domainCode)),
      emptyWhen: (List<Map<String, dynamic>> l) => l.isEmpty,
      emptyMessage: 'This field declares no reporting reasons.',
      builder: (List<Map<String, dynamic>> list) {
        final Map<String, dynamic>? chosen = list
            .where((Map<String, dynamic> r) => r['code'] == reasonCode)
            .firstOrNull;
        // A reason the pack marks as a welfare concern is answered with
        // help, not with a moderation queue.
        final bool isWelfare =
            chosen?['isWelfare'] == true || chosen?['welfare'] == true;

        return PageBody(
          children: <Widget>[
            Panel(
              title: 'What is wrong?',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  for (final Map<String, dynamic> r in list)
                    RadioGroup<String>(
                      groupValue: reasonCode,
                      onChanged: (String? v) => onReason(v ?? ''),
                      child: RadioListTile<String>(
                        value: (r['code'] ?? '').toString(),
                        contentPadding: EdgeInsets.zero,
                        title: PackText(_label(r, lang)),
                      ),
                    ),
                ],
              ),
            ),

            if (isWelfare)
              _Helplines(domainCode: domainCode)
            else ...<Widget>[
              Panel(
                title: 'Anything to add?',
                note: 'Optional. It goes only to the people who review this.',
                child: TextField(
                  controller: detail,
                  minLines: 3,
                  maxLines: 8,
                ),
              ),
              if (error != null) Note(error!, tone: ChipTone.danger),
              FilledButton(
                onPressed: busy || reasonCode == null ? null : onSubmit,
                child: const PackText('Send the report'),
              ),
              PackText(
                'You will be told it was received, and again when it has been '
                'reviewed. You will not be told the outcome.',
                style: Theme.of(
                  context,
                ).textTheme.bodySmall?.copyWith(color: BaseColors.inkMuted),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        );
      },
    );
  }

  static String _label(Map<String, dynamic> r, String lang) {
    final Object? labels = r['labels'];
    if (labels is Map<String, dynamic>) {
      final Object? v = labels[lang] ?? labels['en'];
      if (v is String) return v;
    }
    return (r['code'] ?? '').toString().replaceAll('_', ' ');
  }
}

/// The family's real helplines, offered instead of a queue.
class _Helplines extends ConsumerWidget {
  const _Helplines({required this.domainCode});

  final String domainCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ThemeData theme = Theme.of(context);
    final AsyncValue<Catalogue> catalogue = ref.watch(catalogueProvider);
    final String? familyCode = catalogue.valueOrNull
        ?.familyOfDomain(domainCode)
        ?.code;

    return Column(
      children: <Widget>[
        Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              PackText(
                'That sounds hard.',
                style: theme.textTheme.headlineSmall,
              ),
              const SizedBox(height: Space.sm),
              PackText(
                'If this is about someone being at risk — including you — '
                'these people are available now, and talking to them costs '
                'nothing. You can still send a report as well.',
                style: theme.textTheme.bodyMedium,
              ),
            ],
          ),
        ),
        if (familyCode != null) _HelplineList(familyCode: familyCode),
      ],
    );
  }
}

class _HelplineList extends ConsumerWidget {
  const _HelplineList({required this.familyCode});

  final String familyCode;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<Map<String, dynamic>> family = ref.watch(
      familyProvider(familyCode),
    );

    return family.maybeWhen(
      data: (Map<String, dynamic> f) {
        final List<Map<String, dynamic>> resources = <Map<String, dynamic>>[
          for (final Object? r
              in (f['supportResources'] as List<Object?>? ?? const <Object?>[]))
            if (r is Map<String, dynamic>) r,
        ];
        if (resources.isEmpty) {
          return const Note(
            'If you need to talk to someone right now, please reach a local '
            'helpline or someone you trust.',
          );
        }
        return Panel(
          title: 'Someone to talk to',
          child: Column(
            children: <Widget>[
              for (final Map<String, dynamic> r in resources)
                NavRow(
                  title: (r['label'] ?? r['name'] ?? '').toString(),
                  subtitle: r['hours']?.toString(),
                  leading: const Icon(Icons.phone_outlined, size: 20),
                  trailing: SelectableText(
                    (r['value'] ?? r['number'] ?? '').toString(),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      fontFeatures: const <FontFeature>[
                        FontFeature.tabularFigures(),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        );
      },
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _ReportReceived extends StatelessWidget {
  const _ReportReceived();

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const PackText('Received')),
    body: const PageBody(
      children: <Widget>[
        Note(
          'A person will read this. You will hear again when it has been '
          'reviewed — but not what was decided, because that is about '
          'someone else.',
          tone: ChipTone.verified,
          icon: Icons.check_circle_outline,
        ),
      ],
    ),
  );
}
