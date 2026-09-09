import '../api/api_client.dart';
import 'pack.dart';

/// Reads the published packs from the API and holds them for the session.
///
/// The catalogue is the app's vocabulary. Almost every screen needs it,
/// it changes only when an admin publishes a manifest, and on a patchy
/// network re-fetching it per screen would be the single largest waste of
/// a user's data. So it is fetched once and kept.
///
/// It is NOT persisted to disk. A stale pack is worse than a slow one:
/// republishing a manifest is how a label, a price band or a helpline
/// number is corrected, and CLAUDE.md #25 makes at least one of those a
/// safety matter. In-memory caching gets the speed without the risk of
/// showing yesterday's helpline number after an update.
class PackRepository {
  PackRepository(this._api);

  final ApiClient _api;
  Catalogue? _cached;
  Future<Catalogue>? _inFlight;

  Catalogue? get cached => _cached;

  /// The published catalogue. Concurrent callers share one request rather
  /// than each firing their own — five widgets mounting at once should
  /// not be five round trips on a 3G connection.
  Future<Catalogue> catalogue({bool refresh = false}) {
    if (!refresh && _cached != null) return Future<Catalogue>.value(_cached);
    return _inFlight ??= _fetch().whenComplete(() => _inFlight = null);
  }

  Future<Catalogue> _fetch() async {
    final List<dynamic> raw = await _api.get<List<dynamic>>('/catalogue');
    final Catalogue c = Catalogue.fromJson(raw);
    _cached = c;
    return c;
  }

  void clear() {
    _cached = null;
  }
}
