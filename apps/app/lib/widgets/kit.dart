import 'package:flutter/material.dart';

import '../api/models/engagement.dart';
import '../money/paise.dart';
import '../theme/app_theme.dart';
import '../theme/generated_tokens.dart';
import 'text.dart';

/// The interface vocabulary.
///
/// The web app's screens once carried a grey `RuleNote` on every panel
/// explaining why there is no price sort, what the database refuses, and
/// which rule was being obeyed. That was written for a reviewer, not a
/// user, and it is most of why those screens read as an internal tool.
///
/// **The constraints still hold here. They are enforced silently.** The
/// reasoning lives in comments like this one, where a developer will
/// find it and a user will not.

/// A surface with a hairline border. The product's basic unit.
class Panel extends StatelessWidget {
  const Panel({
    required this.child,
    this.title,
    this.note,
    this.trailing,
    this.padding = const EdgeInsets.all(Space.lg),
    super.key,
  });

  final Widget child;
  final String? title;
  final String? note;
  final Widget? trailing;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        color: BaseColors.surface,
        border: Border.all(color: BaseColors.line),
        borderRadius: BorderRadius.circular(Radii.lg),
      ),
      padding: padding,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (title != null) ...<Widget>[
            Row(
              children: <Widget>[
                Expanded(
                  child: PackText(title!, style: theme.textTheme.titleLarge),
                ),
                ?trailing,
              ],
            ),
            if (note != null) ...<Widget>[
              const SizedBox(height: Space.xs),
              PackText(
                note!,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: BaseColors.inkMuted,
                ),
              ),
            ],
            const SizedBox(height: Space.lg),
          ],
          child,
        ],
      ),
    );
  }
}

enum ChipTone { neutral, brand, verified, caution, danger, info }

/// A small status marker.
///
/// Colour is never the only carrier of meaning — every chip has a word in
/// it. That is the Definition of Done's accessibility bar, and it is also
/// simply how someone reads a list quickly.
class StatusChip extends StatelessWidget {
  const StatusChip(
    this.label, {
    this.tone = ChipTone.neutral,
    this.icon,
    super.key,
  });

  final String label;
  final ChipTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final BrandTokens brand = BrandTokens.of(context);
    final (Color bg, Color line, Color ink) = switch (tone) {
      ChipTone.neutral => (
        BaseColors.surfaceSunk,
        BaseColors.line,
        BaseColors.inkMuted,
      ),
      ChipTone.brand => (brand.brandSoft, brand.brandLine, brand.brandSoftInk),
      ChipTone.verified => (
        BaseColors.verifiedSoft,
        BaseColors.verifiedLine,
        BaseColors.verified,
      ),
      ChipTone.caution => (
        BaseColors.cautionSoft,
        BaseColors.cautionLine,
        BaseColors.caution,
      ),
      ChipTone.danger => (
        BaseColors.dangerSoft,
        BaseColors.dangerLine,
        BaseColors.danger,
      ),
      ChipTone.info => (
        BaseColors.infoSoft,
        BaseColors.infoLine,
        BaseColors.info,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: Space.md,
        vertical: Space.xs + 2,
      ),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(Radii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: 13, color: ink),
            const SizedBox(width: Space.xs + 2),
          ],
          PackText(
            label,
            style: Theme.of(
              context,
            ).textTheme.labelMedium?.copyWith(color: ink),
          ),
        ],
      ),
    );
  }
}

/// An amount.
///
/// Set in tabular figures so a column of them lines up and a changing
/// number does not make the row twitch — the same reason the web app has
/// a `.figure` class.
class Money extends StatelessWidget {
  const Money(this.amount, {this.style, this.compact = true, super.key});

  final Paise amount;
  final TextStyle? style;
  final bool compact;

  @override
  Widget build(BuildContext context) => Text(
    compact ? amount.formatCompact() : amount.format(),
    style: (style ?? Theme.of(context).textTheme.bodyMedium)?.copyWith(
      fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
    ),
  );
}

/// A label and a value, stacked. The workhorse of every detail screen.
class Field extends StatelessWidget {
  const Field({required this.label, required this.value, this.tone, super.key});

  final String label;
  final Widget value;
  final Color? tone;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        PackText(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: BaseColors.inkMuted,
          ),
        ),
        const SizedBox(height: 2),
        DefaultTextStyle.merge(
          style: theme.textTheme.bodyMedium?.copyWith(color: tone),
          child: value,
        ),
      ],
    );
  }
}

/// Where the money is, drawn as a rail.
///
/// The single most reassuring thing on the seeker's side: escrow means
/// their money has left them but has NOT reached the provider, and those
/// feel identical to someone who has just watched their balance drop. So
/// the state is named, not implied.
class EscrowRail extends StatelessWidget {
  const EscrowRail({required this.escrow, this.forProvider = false, super.key});

  final Escrow? escrow;

  /// The same money reads differently from the other side: to a provider
  /// it is "held for you, not yet yours", never "your money has left".
  final bool forProvider;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    final Escrow? e = escrow;

    final (String title, String detail, ChipTone tone) = switch (e) {
      null => (
        'Not funded yet',
        forProvider
            ? 'Nothing is held yet. Do not start until it is.'
            : 'Nothing has been taken. Work starts once the money is held.',
        ChipTone.neutral,
      ),
      final Escrow x when x.isHeld => (
        'Held',
        forProvider
            ? 'Held by the payment provider for this work. It reaches you '
                  'when they confirm the agreed goals were met.'
            : 'Your money has left your account but has NOT reached them. It '
                  'moves only when you confirm the agreed goals were met.',
        ChipTone.caution,
      ),
      final Escrow x when x.status == 'disputed_hold' => (
        'Held during the dispute',
        'Nobody receives it until the dispute is decided.',
        ChipTone.caution,
      ),
      final Escrow x when x.isReleased => (
        'Released',
        forProvider
            ? 'Paid to you after they confirmed the goals were met.'
            : 'Paid out after you confirmed the goals were met.',
        ChipTone.verified,
      ),
      final Escrow x when x.status == 'settled_split' => (
        'Divided by a ruling',
        'Split between you as the dispute decision set out.',
        ChipTone.info,
      ),
      final Escrow x when x.isRefunded => (
        'Refunded',
        forProvider ? 'Returned to them.' : 'Returned to you.',
        ChipTone.info,
      ),
      _ => (e.status, '', ChipTone.neutral),
    };

    return Panel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              StatusChip(title, tone: tone, icon: Icons.lock_outline),
              const Spacer(),
              if (e != null) Money(e.held, style: theme.textTheme.titleLarge),
            ],
          ),
          if (detail.isNotEmpty) ...<Widget>[
            const SizedBox(height: Space.md),
            PackText(
              detail,
              style: theme.textTheme.bodySmall?.copyWith(
                color: BaseColors.inkMuted,
              ),
            ),
          ],
          // What the platform took, stated rather than netted off in
          // silence. A person is entitled to see it.
          if (e?.platformFee != null && e!.isReleased) ...<Widget>[
            const SizedBox(height: Space.md),
            const Divider(height: 1),
            const SizedBox(height: Space.md),
            Row(
              children: <Widget>[
                Expanded(
                  child: PackText(
                    'Platform fee',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: BaseColors.inkMuted,
                    ),
                  ),
                ),
                Money(e.platformFee!, style: theme.textTheme.bodySmall),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// A row that leads somewhere.
class NavRow extends StatelessWidget {
  const NavRow({
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onTap,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ThemeData theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(Radii.md),
      child: ConstrainedBox(
        // The 48px floor applies to a list row as much as to a button.
        constraints: const BoxConstraints(minHeight: kTouchTarget),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            vertical: Space.md,
            horizontal: Space.sm,
          ),
          child: Row(
            children: <Widget>[
              if (leading != null) ...<Widget>[
                leading!,
                const SizedBox(width: Space.md),
              ],
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    PackText(title, style: theme.textTheme.bodyMedium),
                    if (subtitle != null) ...<Widget>[
                      const SizedBox(height: 2),
                      PackText(
                        subtitle!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: BaseColors.inkMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              ?trailing,
              if (onTap != null && trailing == null)
                const Icon(
                  Icons.chevron_right,
                  color: BaseColors.inkFaint,
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A short explanation set apart from the flow.
class Note extends StatelessWidget {
  const Note(this.text, {this.tone = ChipTone.info, this.icon, super.key});

  final String text;
  final ChipTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color line, Color ink) = switch (tone) {
      ChipTone.verified => (
        BaseColors.verifiedSoft,
        BaseColors.verifiedLine,
        BaseColors.verified,
      ),
      ChipTone.caution => (
        BaseColors.cautionSoft,
        BaseColors.cautionLine,
        BaseColors.caution,
      ),
      ChipTone.danger => (
        BaseColors.dangerSoft,
        BaseColors.dangerLine,
        BaseColors.danger,
      ),
      _ => (BaseColors.infoSoft, BaseColors.infoLine, BaseColors.info),
    };

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(Space.md),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(Radii.md),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: 16, color: ink),
            const SizedBox(width: Space.sm),
          ],
          Expanded(
            child: PackText(
              text,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: ink),
            ),
          ),
        ],
      ),
    );
  }
}

/// Vertical rhythm inside a scrolling screen.
class Stacked extends StatelessWidget {
  const Stacked({required this.children, this.gap = Space.lg, super.key});

  final List<Widget> children;
  final double gap;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: <Widget>[
      for (int i = 0; i < children.length; i++) ...<Widget>[
        if (i > 0) SizedBox(height: gap),
        children[i],
      ],
    ],
  );
}

/// The standard page body: scrollable, padded, and pull-to-refresh.
class PageBody extends StatelessWidget {
  const PageBody({
    required this.children,
    this.onRefresh,
    this.padding = const EdgeInsets.all(Space.lg),
    super.key,
  });

  final List<Widget> children;
  final Future<void> Function()? onRefresh;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final Widget list = ListView(
      padding: padding,
      children: <Widget>[
        for (int i = 0; i < children.length; i++) ...<Widget>[
          if (i > 0) const SizedBox(height: Space.lg),
          children[i],
        ],
        const SizedBox(height: Space.xxl),
      ],
    );
    if (onRefresh == null) return list;
    return RefreshIndicator(onRefresh: onRefresh!, child: list);
  }
}

/// Status, as a word plus a colour — never a colour alone.
StatusChip engagementChip(EngagementStatus status) {
  final (String label, ChipTone tone) = switch (status) {
    EngagementStatus.draft => ('Draft', ChipTone.neutral),
    EngagementStatus.agreed => ('Agreed', ChipTone.info),
    EngagementStatus.working => ('In progress', ChipTone.brand),
    // Neutral on purpose: the same chip is read by both parties, and
    // "with you" is true for only one of them.
    EngagementStatus.delivered => ('Work sent', ChipTone.info),
    EngagementStatus.assessed => ('Assessed', ChipTone.caution),
    EngagementStatus.completed => ('Completed', ChipTone.verified),
    EngagementStatus.disputed => ('In dispute', ChipTone.danger),
    EngagementStatus.cancelled => ('Cancelled', ChipTone.neutral),
    EngagementStatus.refunded => ('Refunded', ChipTone.info),
    EngagementStatus.unknown => ('—', ChipTone.neutral),
  };
  return StatusChip(label, tone: tone);
}
