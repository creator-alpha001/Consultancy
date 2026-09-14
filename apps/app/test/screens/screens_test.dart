import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:sankalp_app/api/api_client.dart';
import 'package:sankalp_app/main.dart';
import 'package:sankalp_app/providers.dart';
import 'package:sankalp_app/session/token_store.dart';

/// Every screen, drawn at a small phone's size with real content.
///
/// The responses are recorded from the dev API (`tool/screens/record.mjs`),
/// so each screen gets the awkward, real-length names and numbers it will
/// meet, not tidy placeholders. A screen that overflows at 360 dp — the
/// width of the cheapest Android phones this product is for — or with the
/// system text size turned up fails here, because Flutter reports an
/// overflow as an error.
///
/// Set `SCREENSHOTS=1` to also write a PNG of each screen to
/// `build/screens/`, for a person to look at.
///
/// A request with no recording is answered 404 and listed in
/// `build/screens/missing-<role>.txt`; run the recorder again to fill it.
void main() {
  final bool shots = Platform.environment['SCREENSHOTS'] == '1';

  setUpAll(_loadFonts);

  for (final String role in <String>['signed_out', 'seeker', 'provider']) {
    final File file = File('test/screens/fixtures/$role.json');
    if (!file.existsSync()) continue;
    final Map<String, dynamic> fixture =
        jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
    final List<String> routes = (fixture['routes'] as List<dynamic>).cast<String>();
    final Map<String, dynamic> responses = fixture['responses'] as Map<String, dynamic>;
    final Set<String> missing = <String>{};

    group(role, () {
      tearDownAll(() {
        final File out = File('build/screens/missing-$role.txt')
          ..createSync(recursive: true);
        out.writeAsStringSync(missing.join('\n'));
      });

      for (final String route in routes) {
        for (final _Size size in _sizes) {
          testWidgets('$route at ${size.name}', (WidgetTester tester) async {
            await _draw(
              tester,
              route: route,
              signedIn: role != 'signed_out',
              responses: responses,
              missing: missing,
              size: size,
            );
            if (shots && size.screenshot) {
              await _screenshot(tester, '${role}_${_slug(route)}');
            }
          });
        }
      }
    });
  }
}

class _Size {
  const _Size(this.name, this.width, this.height, this.textScale, {this.screenshot = false});
  final String name;
  final double width;
  final double height;
  final double textScale;
  final bool screenshot;
}

/// The narrowest common Android width, as-is and with large text; and a
/// tall 360-wide canvas so a screenshot shows the whole page at once.
const List<_Size> _sizes = <_Size>[
  _Size('360x640', 360, 640, 1),
  _Size('360 tall, large text', 360, 2200, 1.3),
  _Size('360 tall', 360, 2200, 1, screenshot: true),
];

Future<void> _draw(
  WidgetTester tester, {
  required String route,
  required bool signedIn,
  required Map<String, dynamic> responses,
  required Set<String> missing,
  required _Size size,
}) async {
  tester.view.physicalSize = Size(size.width * 2, size.height * 2);
  tester.view.devicePixelRatio = 2;
  tester.platformDispatcher.textScaleFactorTestValue = size.textScale;
  addTearDown(tester.view.reset);
  addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
  // A phone is driven by touch, and Flutter only draws keyboard focus rings
  // in the traditional (keyboard) mode the test binding defaults to.
  FocusManager.instance.highlightStrategy = FocusHighlightStrategy.alwaysTouch;
  addTearDown(() => FocusManager.instance.highlightStrategy = FocusHighlightStrategy.automatic);

  final MemoryTokenStore tokens = MemoryTokenStore();
  if (signedIn) await tokens.write('recorded');

  final Dio dio = Dio();
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (RequestOptions o, RequestInterceptorHandler h) {
        final String key = _key(o);
        final Object? hit = responses[key];
        if (hit is Map<String, dynamic>) {
          h.resolve(
            Response<dynamic>(
              requestOptions: o,
              data: hit['body'],
              statusCode: hit['status'] as int? ?? 200,
            ),
          );
          return;
        }
        if (o.method == 'GET') missing.add(key);
        h.resolve(
          Response<dynamic>(
            requestOptions: o,
            statusCode: 404,
            data: <String, dynamic>{
              'error': <String, dynamic>{'code': 'NOT_RECORDED', 'message': 'Not recorded: $key'},
            },
          ),
        );
      },
    ),
  );

  await tester.pumpWidget(
    ProviderScope(
      overrides: <Override>[
        tokenStoreProvider.overrideWithValue(tokens),
        apiClientProvider.overrideWithValue(
          ApiClient(baseUrl: 'http://recorded', tokens: tokens, dio: dio),
        ),
      ],
      child: const SankalpApp(),
    ),
  );
  await _settle(tester);

  final BuildContext context = tester.element(find.byType(Navigator).first);
  GoRouter.of(context).go(route);
  await _settle(tester);
}

/// Pumps until the screen has loaded, without waiting for things that
/// never settle (a spinner, a countdown).
Future<void> _settle(WidgetTester tester) async {
  for (int i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

String _key(RequestOptions o) {
  final List<String> keys = o.queryParameters.keys.toList()..sort();
  final String query = keys.isEmpty
      ? ''
      : '?${keys.map((String k) => '${Uri.encodeQueryComponent(k)}=${Uri.encodeQueryComponent('${o.queryParameters[k]}')}').join('&')}';
  return '${o.method} ${o.path}$query';
}

String _slug(String route) =>
    route.replaceAll(RegExp(r'[0-9a-f]{8}-[0-9a-f-]{27}'), 'id').replaceAll(RegExp(r'[^a-zA-Z0-9]+'), '_').replaceAll(RegExp(r'^_|_$'), '');

/// Note: flutter_test draws elevation shadows as a thin solid outline
/// (`debugDisableShadows`), so floating buttons and cards with elevation
/// show a black edge in these pictures that a phone does not draw.
Future<void> _screenshot(WidgetTester tester, String name) async {
  final RenderRepaintBoundary boundary = tester.renderObject<RenderRepaintBoundary>(
    find.byType(RepaintBoundary).first,
  );
  await tester.runAsync(() async {
    final ui.Image image = await boundary.toImage(pixelRatio: 2);
    final ByteData? bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return;
    File('build/screens/$name.png')
      ..createSync(recursive: true)
      ..writeAsBytesSync(bytes.buffer.asUint8List());
  });
}

/// Real faces instead of the test font's boxes, so a screenshot shows
/// what a phone shows — and so text measures at its real width.
Future<void> _loadFonts() async {
  Future<void> load(String family, List<String> paths) async {
    final FontLoader loader = FontLoader(family);
    for (final String p in paths) {
      final File f = File(p);
      if (!f.existsSync()) continue;
      loader.addFont(Future<ByteData>.value(ByteData.sublistView(f.readAsBytesSync())));
    }
    await loader.load();
  }

  await load('Inter', <String>[
    'assets/fonts/Inter-Regular.ttf',
    'assets/fonts/Inter-Medium.ttf',
    'assets/fonts/Inter-SemiBold.ttf',
  ]);
  await load('Noto Sans Devanagari', <String>[
    'assets/fonts/NotoSansDevanagari-Regular.ttf',
    'assets/fonts/NotoSansDevanagari-Medium.ttf',
    'assets/fonts/NotoSansDevanagari-SemiBold.ttf',
  ]);

  // The icon font ships with the SDK rather than the app.
  Directory dir = File(Platform.resolvedExecutable).parent;
  for (int i = 0; i < 8; i++) {
    final File icons = File('${dir.path}/bin/cache/artifacts/material_fonts/materialicons-regular.otf');
    if (icons.existsSync()) {
      await load('MaterialIcons', <String>[icons.path]);
      break;
    }
    dir = dir.parent;
  }
}
