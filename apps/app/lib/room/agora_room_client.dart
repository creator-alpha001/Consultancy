import 'dart:async';

import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:permission_handler/permission_handler.dart';

import 'room_client.dart';

/// Refused before or during joining, with a reason a person can act on.
class RoomJoinRefused implements Exception {
  const RoomJoinRefused(this.message);
  final String message;

  @override
  String toString() => message;
}

/// Agora, behind [RoomClient].
///
/// **Voice first.** The engine joins with the microphone published and
/// the camera off. Video is enabled on the engine so the other person's
/// camera can be received the moment they turn it on, but nothing is
/// sent from this device until its user chooses to.
///
/// **The network is the SDK's to adapt to.** Dual-stream is on, so a
/// receiver on a weak link gets the low-resolution stream; and the
/// subscribe fallback drops a failing downlink to audio on its own. What
/// this class adds is reporting — link state and quality flow into
/// [RoomState] for the screen to act on.
class AgoraRoomClient implements RoomClient {
  const AgoraRoomClient();

  static const String providerCode = 'agora';

  @override
  Future<RoomConnection> join(RoomCredentials credentials) async {
    final String? appId = credentials.appId;
    final String? token = credentials.token;
    final int? uid = credentials.uid;
    if (appId == null || token == null || uid == null) {
      throw const RoomJoinRefused(
        'The room could not be opened. Try again in a moment.',
      );
    }

    // The microphone is the call. Asked for here, at the moment it is
    // needed, rather than at install where the reason is not obvious.
    final PermissionStatus mic = await Permission.microphone.request();
    if (!mic.isGranted) {
      throw const RoomJoinRefused(
        'The microphone is needed to join. Allow it in your phone’s '
        'settings for this app, then join again.',
      );
    }

    final RtcEngine engine = createAgoraRtcEngine();
    await engine.initialize(
      RtcEngineContext(
        appId: appId,
        channelProfile: ChannelProfileType.channelProfileCommunication,
        audioScenario: AudioScenarioType.audioScenarioChatroom,
      ),
    );

    final AgoraConnection connection = AgoraConnection._(
      engine,
      credentials.roomReference,
    );
    engine.registerEventHandler(connection._handler());

    await engine.setAudioProfile(
      profile: AudioProfileType.audioProfileSpeechStandard,
    );
    await engine.enableVideo();
    await engine.enableLocalVideo(false);
    await engine.enableDualStreamMode(enabled: true);
    await engine.setRemoteSubscribeFallbackOption(
      StreamFallbackOptions.streamFallbackOptionAudioOnly,
    );
    await engine.setDefaultAudioRouteToSpeakerphone(true);

    await engine.joinChannel(
      token: token,
      channelId: credentials.roomReference,
      uid: uid,
      options: const ChannelMediaOptions(
        clientRoleType: ClientRoleType.clientRoleBroadcaster,
        channelProfile: ChannelProfileType.channelProfileCommunication,
        publishMicrophoneTrack: true,
        publishCameraTrack: false,
        autoSubscribeAudio: true,
        autoSubscribeVideo: true,
      ),
    );
    return connection;
  }
}

class AgoraConnection implements RoomConnection {
  AgoraConnection._(this._engine, this._channel);

  final RtcEngine _engine;
  final String _channel;
  final ValueNotifier<RoomState> _state = ValueNotifier<RoomState>(
    const RoomState(),
  );
  final StreamController<void> _expiring = StreamController<void>.broadcast();
  bool _released = false;

  @override
  ValueListenable<RoomState> get state => _state;

  @override
  Stream<void> get tokenExpiring => _expiring.stream;

  void _set(RoomState next) {
    if (!_released) _state.value = next;
  }

  RtcEngineEventHandler _handler() => RtcEngineEventHandler(
    onConnectionStateChanged:
        (
          RtcConnection _,
          ConnectionStateType s,
          ConnectionChangedReasonType _,
        ) {
          final RoomLink link = switch (s) {
            ConnectionStateType.connectionStateConnected => RoomLink.connected,
            ConnectionStateType.connectionStateReconnecting =>
              RoomLink.reconnecting,
            ConnectionStateType.connectionStateFailed => RoomLink.failed,
            ConnectionStateType.connectionStateConnecting =>
              RoomLink.connecting,
            ConnectionStateType.connectionStateDisconnected =>
              _state.value.link == RoomLink.left
                  ? RoomLink.left
                  : RoomLink.reconnecting,
          };
          _set(
            _state.value.copyWith(
              link: link,
              connectedOnce:
                  _state.value.connectedOnce || link == RoomLink.connected,
            ),
          );
        },
    onUserJoined: (RtcConnection _, int remoteUid, int _) =>
        _set(_state.value.copyWith(otherPresent: true, otherUid: remoteUid)),
    onUserOffline:
        (RtcConnection _, int remoteUid, UserOfflineReasonType _) {
          if (_state.value.otherUid == remoteUid) {
            _set(
              _state.value.copyWith(otherPresent: false, clearOtherUid: true),
            );
          }
        },
    // Reported every two seconds, uid 0 being this device. The worse of
    // up- and downlink decides, because either one breaks the call.
    onNetworkQuality:
        (RtcConnection _, int remoteUid, QualityType tx, QualityType rx) {
          if (remoteUid != 0) return;
          _set(_state.value.copyWith(quality: _coarsen(tx, rx)));
        },
    onTokenPrivilegeWillExpire: (RtcConnection _, String _) =>
        _expiring.add(null),
  );

  static LinkQuality _coarsen(QualityType tx, QualityType rx) {
    int rank(QualityType q) => switch (q) {
      QualityType.qualityExcellent || QualityType.qualityGood => 1,
      QualityType.qualityPoor ||
      QualityType.qualityBad ||
      QualityType.qualityVbad ||
      QualityType.qualityDown => 2,
      _ => 0,
    };
    final int worst = rank(tx) > rank(rx) ? rank(tx) : rank(rx);
    return switch (worst) {
      1 => LinkQuality.good,
      2 => LinkQuality.poor,
      _ => LinkQuality.unknown,
    };
  }

  @override
  Future<void> setMicEnabled({required bool enabled}) async {
    await _engine.muteLocalAudioStream(!enabled);
    _set(_state.value.copyWith(micOn: enabled));
  }

  @override
  Future<void> setVideoEnabled({required bool enabled}) async {
    if (enabled) {
      final PermissionStatus camera = await Permission.camera.request();
      if (!camera.isGranted) {
        throw const RoomJoinRefused(
          'The camera is not allowed for this app. The call carries on '
          'with voice.',
        );
      }
    }
    await _engine.enableLocalVideo(enabled);
    await _engine.updateChannelMediaOptions(
      ChannelMediaOptions(publishCameraTrack: enabled),
    );
    _set(_state.value.copyWith(cameraOn: enabled));
  }

  @override
  Future<void> setIncomingVideoEnabled({required bool enabled}) =>
      _engine.muteAllRemoteVideoStreams(!enabled);

  @override
  Future<void> renewToken(String token) => _engine.renewToken(token);

  @override
  Widget? localView() {
    if (_released || !_state.value.cameraOn) return null;
    return AgoraVideoView(
      controller: VideoViewController(
        rtcEngine: _engine,
        canvas: const VideoCanvas(uid: 0),
      ),
    );
  }

  @override
  Widget? remoteView() {
    final int? other = _state.value.otherUid;
    if (_released || other == null) return null;
    return AgoraVideoView(
      controller: VideoViewController.remote(
        rtcEngine: _engine,
        canvas: VideoCanvas(uid: other),
        connection: RtcConnection(channelId: _channel),
      ),
    );
  }

  @override
  Future<void> leave() async {
    if (_released) return;
    _set(_state.value.copyWith(link: RoomLink.left));
    _released = true;
    try {
      await _engine.leaveChannel();
    } finally {
      await _engine.release();
      await _expiring.close();
    }
  }
}
