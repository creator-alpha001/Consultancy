import 'dart:convert';
import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';

import 'api_client.dart';

/// Uploading a file, and the limits that come with it.
///
/// **Everything private, always.** An attachment is never a public URL:
/// it is reached through `attachmentLink`, which mints a five-minute
/// signed link watermarked with whoever is looking (CLAUDE.md #29). This
/// class therefore returns an id and nothing that resembles a location.
///
/// **The uploader is the session, never a field.** `POST /attachments`
/// takes no owner — the API derives it from the actor, so there is no
/// request shape in which a client can upload as someone else (#28).
class Uploads {
  const Uploads(this._api);

  /// A ceiling the client enforces before spending a user's data on a
  /// request the server would refuse anyway.
  ///
  /// Base64 inflates by about a third, so the encoded body is roughly
  /// 13 MB at this limit. On a patchy connection that is already a long
  /// wait, which is the real reason for the cap rather than the server's
  /// own limit.
  static const int maxBytes = 10 * 1024 * 1024;

  final ApiClient _api;

  /// Uploads bytes and returns the attachment id.
  ///
  /// Throws [UploadTooLarge] before any network call when the file is
  /// over [maxBytes] — telling someone their file is too big after a
  /// four-minute upload is the worst possible time to tell them.
  Future<String> upload({
    required Uint8List bytes,
    required String contentType,
    String? filename,
  }) async {
    if (bytes.lengthInBytes == 0) {
      throw const UploadEmpty();
    }
    if (bytes.lengthInBytes > maxBytes) {
      throw UploadTooLarge(bytes.lengthInBytes);
    }

    final Map<String, dynamic> res = await _api.post<Map<String, dynamic>>(
      '/attachments',
      body: <String, dynamic>{
        'contentBase64': base64Encode(bytes),
        'contentType': contentType,
        'filename': ?filename,
      },
    );
    return res['id'] as String;
  }

  /// Picks a file and uploads it. Returns null when the picker was
  /// dismissed, which is not an error and must not be shown as one.
  Future<PickedUpload?> pickAndUpload() async {
    final PlatformFile? file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: const <String>['pdf', 'jpg', 'jpeg', 'png', 'heic'],
    );
    if (file == null) return null;

    // Size FIRST, before reading a byte. The picker reports it without
    // I/O where the platform can, so an oversized file is refused
    // without loading 40 MB into memory on a mid-range handset.
    final int size = file.lengthSync() ?? await file.length();
    if (size > maxBytes) throw UploadTooLarge(size);

    final Uint8List bytes = await file.readAsBytes();
    final String contentType = _contentTypeFor(file.extension);
    final String id = await upload(
      bytes: bytes,
      contentType: contentType,
      filename: file.name,
    );
    return PickedUpload(
      attachmentId: id,
      filename: file.name,
      contentType: contentType,
      byteSize: bytes.lengthInBytes,
    );
  }

  /// Extension → MIME. Deliberately a short allow-list rather than a
  /// guess: an unknown type is sent as a generic binary, which the server
  /// can refuse, instead of being labelled as something it is not.
  static String _contentTypeFor(String? extension) =>
      switch (extension?.toLowerCase()) {
        'pdf' => 'application/pdf',
        'jpg' || 'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'heic' => 'image/heic',
        _ => 'application/octet-stream',
      };
}

class PickedUpload {
  const PickedUpload({
    required this.attachmentId,
    required this.filename,
    required this.contentType,
    required this.byteSize,
  });

  final String attachmentId;
  final String filename;
  final String contentType;
  final int byteSize;

  /// Whether this is a scan or photograph, which decides whether a text
  /// equivalent is REQUIRED rather than nice to have.
  bool get isImage => contentType.startsWith('image/');

  String get readableSize {
    if (byteSize < 1024) return '$byteSize bytes';
    if (byteSize < 1024 * 1024) return '${(byteSize / 1024).round()} KB';
    return '${(byteSize / (1024 * 1024)).toStringAsFixed(1)} MB';
  }
}

sealed class UploadRefused implements Exception {
  const UploadRefused();
  String get message;
}

class UploadTooLarge extends UploadRefused {
  const UploadTooLarge(this.byteSize);
  final int byteSize;

  @override
  String get message =>
      'That file is larger than 10 MB. A smaller scan or a lower-quality '
      'photo will upload much faster on a mobile connection.';
}

class UploadEmpty extends UploadRefused {
  const UploadEmpty();

  @override
  String get message => 'That file is empty.';
}
