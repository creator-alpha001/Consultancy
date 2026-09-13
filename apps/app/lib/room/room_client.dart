import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'agora_room_client.dart';

/// The video vendor seam.
///
/// This mirrors the API's own `RoomProvider` interface, and for the same
/// reason. The server names the vendor in the join credentials it issues
/// (`POST /sessions/:id/room` → `join.provider`), and [roomClientProvider]
/// picks the matching implementation — so no screen knows the vendor's
/// name, and a server without vendor credentials gets the fake without
/// anyone editing this file.
///
/// **What the vendor does that no fake can.** Adaptive bitrate, falling a
/// weak downlink back to a low stream or to audio, and reconnecting after
/// a network switch are the SDK's job. What the app owns is reacting to
/// what the SDK reports: surfacing quality, dropping to audio-only, and
/// telling the API when the link went and came back so lost time is
/// credited (CLAUDE.md #22, #23).
abstract interface class RoomClient {
  Future<RoomConnection> join(RoomCredentials credentials);
}

/// What the API hands back in `join` from `POST /sessions/:id/room`.
///
/// Vendor-shaped but not vendor-specific: a client reads `provider` to
/// choose an implementation and treats the rest as opaque.
class RoomCredentials {
  const RoomCredentials({
    required this.provider,
    required this.roomReference,
    this.appId,
    this.token,
    this.uid,
  });

  /// Reads the `join` object of the room response. A response without one
  /// (an older API) is treated as the fake, never as a real room.
  factory RoomCredentials.fromRoomResponse(Map<String, dynamic> json) {
    final Object? join = json['join'];
    final Map<String, dynamic> j = join is Map<String, dynamic>
        ? join
        : const <String, dynamic>{};
    return RoomCredentials(
      provider: j['provider'] as String? ?? 'fake',
      roomReference: j['roomReference'] as String? ?? '',
      appId: j['appId'] as String?,
      token: j['token'] as String?,
      uid: (j['uid'] as num?)?.toInt(),
    );
  }

  final String provider;
  final String roomReference;
  final String? appId;
  final String? token;
  final int? uid;
}

/// The state of the link to the room, as the vendor reports it.
enum RoomLink { connecting, connected, reconnecting, failed, left }

/// Network quality, coarsened from the vendor's scale. Only the three
/// states a person can act on are kept.
enum LinkQuality { unknown, good, poor }

@immutable
class RoomState {
  const RoomState({
    this.link = RoomLink.connecting,
    this.quality = LinkQuality.unknown,
    this.micOn = true,
    this.cameraOn = false,
    this.otherPresent = false,
    this.otherUid,
    this.connectedOnce = false,
  });

  final RoomLink link;
  final LinkQuality quality;
  final bool micOn;

  /// Off at join: sessions are voice-first, and video is a choice.
  final bool cameraOn;
  final bool otherPresent;

  /// The other participant's media identity, when the vendor uses one.
  final int? otherUid;

  /// Whether the link was ever up. A drop before the first connection is
  /// a failure to join, not lost session time.
  final bool connectedOnce;

  RoomState copyWith({
    RoomLink? link,
    LinkQuality? quality,
    bool? micOn,
    bool? cameraOn,
    bool? otherPresent,
    int? otherUid,
    bool clearOtherUid = false,
    bool? connectedOnce,
  }) => RoomState(
    link: link ?? this.link,
    quality: quality ?? this.quality,
    micOn: micOn ?? this.micOn,
    cameraOn: cameraOn ?? this.cameraOn,
    otherPresent: otherPresent ?? this.otherPresent,
    otherUid: clearOtherUid ? null : (otherUid ?? this.otherUid),
    connectedOnce: connectedOnce ?? this.connectedOnce,
  );
}

abstract interface class RoomConnection {
  /// Everything a screen renders about the call.
  ValueListenable<RoomState> get state;

  /// Fires when the join token is close to expiry. The screen fetches
  /// fresh credentials from the API and passes the token to [renewToken].
  Stream<void> get tokenExpiring;

  Future<void> setMicEnabled({required bool enabled});

  /// Turning the camera off is how audio-only is entered. It is a normal
  /// operation, not an error path (CLAUDE.md #22).
  Future<void> setVideoEnabled({required bool enabled});

  /// Stop receiving the other person's video too — the downlink half of
  /// audio-only, for a connection too weak to carry it.
  Future<void> setIncomingVideoEnabled({required bool enabled});

  Future<void> renewToken(String token);

  /// This device's camera, or null when there is nothing to show.
  Widget? localView();

  /// The other participant's video, or null when there is nothing to show.
  Widget? remoteView();

  Future<void> leave();
}

/// Used when the API issued no real room (no vendor configured).
///
/// It connects to nothing and says so. What it does provide is the
/// lifecycle — join, mute, leave — so every screen and every test around
/// it exercises the real code path.
class FakeRoomClient implements RoomClient {
  const FakeRoomClient();

  @override
  Future<RoomConnection> join(RoomCredentials credentials) async {
    debugPrint(
      'RoomClient: joined "${credentials.roomReference}" via '
      '${credentials.provider} (fake — no media)',
    );
    return FakeConnection();
  }
}

class FakeConnection implements RoomConnection {
  final ValueNotifier<RoomState> _state = ValueNotifier<RoomState>(
    const RoomState(link: RoomLink.connected, connectedOnce: true),
  );

  @override
  ValueListenable<RoomState> get state => _state;

  @override
  Stream<void> get tokenExpiring => const Stream<void>.empty();

  @override
  Future<void> setMicEnabled({required bool enabled}) async =>
      _state.value = _state.value.copyWith(micOn: enabled);

  @override
  Future<void> setVideoEnabled({required bool enabled}) async =>
      _state.value = _state.value.copyWith(cameraOn: enabled);

  @override
  Future<void> setIncomingVideoEnabled({required bool enabled}) async {}

  @override
  Future<void> renewToken(String token) async {}

  @override
  Widget? localView() => null;

  @override
  Widget? remoteView() => null;

  @override
  Future<void> leave() async =>
      _state.value = _state.value.copyWith(link: RoomLink.left);
}

/// Chooses the implementation the API's credentials name.
///
/// The web target is a test surface only (see TRACKER.md) and never
/// joins a real room: the Agora web SDK needs scripts this build does not
/// ship, and a browser here is driving widgets, not making calls.
class VendorRoomClient implements RoomClient {
  const VendorRoomClient();

  @override
  Future<RoomConnection> join(RoomCredentials credentials) {
    if (credentials.provider == AgoraRoomClient.providerCode && !kIsWeb) {
      return const AgoraRoomClient().join(credentials);
    }
    return const FakeRoomClient().join(credentials);
  }
}

final Provider<RoomClient> roomClientProvider = Provider<RoomClient>(
  (Ref ref) => const VendorRoomClient(),
);
