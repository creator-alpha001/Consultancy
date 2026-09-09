import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_error.dart';
import '../theme/generated_tokens.dart';
import 'text.dart';

/// The four states every fetched screen actually has.
///
/// Loading, error, empty and loaded — and the error state is split again,
/// because "you are offline" and "the server refused this" want different
/// words and different buttons. Users here are on mid-range Android over
/// patchy networks; offline is a normal condition, not an exception, and
/// showing them a stack trace or a bare spinner-forever is the failure
/// this widget exists to prevent.
///
/// Empty is a required argument rather than an optional one on purpose: a
/// list with nothing in it needs a sentence saying why, and leaving that
/// to each screen is how a blank rectangle ships.
class AsyncBody<T> extends StatelessWidget {
  const AsyncBody({
    required this.value,
    required this.builder,
    required this.emptyWhen,
    required this.emptyMessage,
    this.onRetry,
    super.key,
  });

  final AsyncValue<T> value;
  final Widget Function(T data) builder;
  final bool Function(T data) emptyWhen;
  final String emptyMessage;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) => value.when(
    loading: () => const Center(child: CircularProgressIndicator()),
    error: (Object e, StackTrace _) => _Failure(error: e, onRetry: onRetry),
    data: (T data) =>
        emptyWhen(data) ? _Empty(message: emptyMessage) : builder(data),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(Space.xl),
      child: PackText(
        message,
        textAlign: TextAlign.center,
        style: Theme.of(
          context,
        ).textTheme.bodyMedium?.copyWith(color: BaseColors.inkMuted),
      ),
    ),
  );
}

class _Failure extends StatelessWidget {
  const _Failure({required this.error, this.onRetry});

  final Object error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final bool offline = error is ApiException && (error as ApiException).isOffline;

    // The API localises `message` and it is displayed exactly as sent.
    // Anything that is not an ApiException never reaches the user as
    // itself — a Dart exception on a screen is a bug report, not a
    // sentence a person can act on.
    final String text = error is ApiException
        ? (error as ApiException).message
        : 'Something went wrong. Please try again.';

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(Space.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Icon(
              offline ? Icons.wifi_off_outlined : Icons.error_outline,
              color: BaseColors.inkMuted,
              size: 32,
            ),
            const SizedBox(height: Space.md),
            Semantics(
              liveRegion: true,
              child: PackText(
                text,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium,
              ),
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: Space.lg),
              OutlinedButton(
                onPressed: onRetry,
                child: const PackText('Try again'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
