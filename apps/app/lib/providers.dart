import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api/api_client.dart';
import 'api/repository.dart';
import 'api/uploads.dart';
import 'config.dart';
import 'pack/pack.dart';
import 'pack/pack_repository.dart';
import 'session/auth_controller.dart';
import 'session/token_store.dart';

/// The composition root.
///
/// Everything with a lifetime lives here so that a test can replace any
/// of it with an override, and so there is exactly one place that knows
/// how the pieces fit together.

final Provider<TokenStore> tokenStoreProvider = Provider<TokenStore>(
  (Ref ref) => defaultTokenStore(),
);

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>(
  (Ref ref) => ApiClient(
    baseUrl: Config.apiBaseUrl,
    tokens: ref.watch(tokenStoreProvider),
  ),
);

final ChangeNotifierProvider<AuthController> authProvider =
    ChangeNotifierProvider<AuthController>(
      (Ref ref) => AuthController(
        api: ref.watch(apiClientProvider),
        tokens: ref.watch(tokenStoreProvider),
      ),
    );

/// Every API call the app makes. Screens read this, never the raw client.
final Provider<Repository> repositoryProvider = Provider<Repository>(
  (Ref ref) => Repository(ref.watch(apiClientProvider)),
);

/// Uploading files. Separate from [Repository] because it is the one
/// place that turns bytes into a request, and because its size limit is
/// a client-side courtesy rather than an API call.
final Provider<Uploads> uploadsProvider = Provider<Uploads>(
  (Ref ref) => Uploads(ref.watch(apiClientProvider)),
);

final Provider<PackRepository> packRepositoryProvider = Provider<PackRepository>(
  (Ref ref) => PackRepository(ref.watch(apiClientProvider)),
);

/// The published catalogue. Every screen that renders a noun needs it.
final FutureProvider<Catalogue> catalogueProvider = FutureProvider<Catalogue>(
  (Ref ref) => ref.watch(packRepositoryProvider).catalogue(),
);

/// The interface language.
///
/// A single value rather than a per-family one: a person reads in one
/// language, and the packs answer in it. Which languages a DOMAIN can be
/// worked in is a different question entirely, and a matching dimension
/// rather than a display preference (CLAUDE.md #19).
final StateProvider<String> langProvider = StateProvider<String>(
  (Ref ref) => Config.defaultLang,
);
