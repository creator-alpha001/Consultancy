import 'package:flutter_test/flutter_test.dart';
import 'package:sankalp_app/room/room_client.dart';

void main() {
  group('RoomCredentials.fromRoomResponse', () {
    test('reads the join object the API returns beside the session', () {
      final RoomCredentials c = RoomCredentials.fromRoomResponse(
        <String, dynamic>{
          'id': 'session-1',
          'roomProvider': 'agora',
          'join': <String, dynamic>{
            'provider': 'agora',
            'roomReference': 'sankalp-session-1',
            'appId': 'app',
            'token': '007abc',
            'uid': 12345,
            'expiresAt': '2026-09-14T10:00:00.000Z',
          },
        },
      );
      expect(c.provider, 'agora');
      expect(c.roomReference, 'sankalp-session-1');
      expect(c.appId, 'app');
      expect(c.token, '007abc');
      expect(c.uid, 12345);
    });

    test('treats a response without join as the fake, never as a real room', () {
      // An older API returned only the session. Reading its roomProvider
      // as a vendor would try to join a real room with no token.
      final RoomCredentials c = RoomCredentials.fromRoomResponse(
        <String, dynamic>{'id': 'session-1', 'roomProvider': 'agora'},
      );
      expect(c.provider, 'fake');
      expect(c.token, isNull);
    });
  });

  group('the fake room', () {
    test('joins voice-first and follows the controls', () async {
      final RoomConnection c = await const VendorRoomClient().join(
        const RoomCredentials(provider: '100ms_sandbox', roomReference: 'r'),
      );
      expect(c.state.value.link, RoomLink.connected);
      expect(c.state.value.micOn, isTrue);
      // Camera off at join (CLAUDE.md #22: voice first, video a choice).
      expect(c.state.value.cameraOn, isFalse);

      await c.setVideoEnabled(enabled: true);
      expect(c.state.value.cameraOn, isTrue);
      await c.setMicEnabled(enabled: false);
      expect(c.state.value.micOn, isFalse);

      await c.leave();
      expect(c.state.value.link, RoomLink.left);
    });
  });
}
