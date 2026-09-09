import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// The video vendor seam.
///
/// This mirrors the API's own `RoomProvider` interface exactly, and for
/// the same reason. The server provisions rooms through
/// `HundredMsSandboxRoomProvider` behind `ROOM_PROVIDER`; the client
/// joins them through this behind [roomClientProvider]. When real 100ms
/// credentials exist, `HundredMsRoomClient` is a drop-in — no screen
/// changes, because no screen knows the vendor's name.
///
/// **Why a fake rather than a stub that throws.** Everything around the
/// video — consent, the live agenda, the timer, audio-only, ending the
/// session — is real, testable behaviour that must work now. A seam with
/// a working fake lets all of it be built and driven; a `TODO` in the
/// middle of the room screen would have blocked the other four rules
/// that live there.
///
/// **What no fake can prove.** CLAUDE.md's stack table forbids building
/// SFU infrastructure, and the two session requirements that are not
/// modellable here — adaptive bitrate and the network-quality indicator
/// — are exactly the ones `TRACKER.md` already records as unbuildable
/// without real infrastructure. A field saying "the bitrate adapted"
/// would be a lie with a schema. Nothing here pretends otherwise.
abstract interface class RoomClient {
  Future<RoomConnection> join(RoomCredentials credentials);
}

/// What the API hands back from `POST /sessions/:id/room`.
///
/// Deliberately vendor-shaped-but-not-vendor-specific: a token, a room
/// reference and the provider's name. A client that read a 100ms-specific
/// field would have to change when the vendor does.
class RoomCredentials {
  const RoomCredentials({
    required this.provider,
    required this.roomReference,
    this.token,
  });

  factory RoomCredentials.fromJson(Map<String, dynamic> json) =>
      RoomCredentials(
        provider: json['provider'] as String? ?? 'fake',
        roomReference: json['roomReference'] as String? ?? '',
        token: json['token'] as String?,
      );

  final String provider;
  final String roomReference;
  final String? token;
}

abstract interface class RoomConnection {
  /// True while media is actually flowing.
  bool get isConnected;

  Future<void> setMicEnabled({required bool enabled});

  /// Turning video off is how audio-only is entered. It is a normal
  /// operation, not an error path (CLAUDE.md #22).
  Future<void> setVideoEnabled({required bool enabled});

  Future<void> leave();
}

/// The implementation used until real vendor credentials exist.
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
    return _FakeConnection();
  }
}

class _FakeConnection implements RoomConnection {
  bool _connected = true;

  @override
  bool get isConnected => _connected;

  @override
  Future<void> setMicEnabled({required bool enabled}) async {}

  @override
  Future<void> setVideoEnabled({required bool enabled}) async {}

  @override
  Future<void> leave() async => _connected = false;
}

/// Swap this one line to ship real video.
final Provider<RoomClient> roomClientProvider = Provider<RoomClient>(
  (Ref ref) => const FakeRoomClient(),
);
