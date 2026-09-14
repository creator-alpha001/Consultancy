import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers.dart';
import 'router.dart';
import 'theme/app_theme.dart';
import 'widgets/messenger.dart';

void main() {
  runApp(const ProviderScope(child: SankalpApp()));
}

class SankalpApp extends ConsumerStatefulWidget {
  const SankalpApp({super.key});

  @override
  ConsumerState<SankalpApp> createState() => _SankalpAppState();
}

class _SankalpAppState extends ConsumerState<SankalpApp> {
  GoRouter? _router;

  @override
  void initState() {
    super.initState();
    // Resolve the stored token into a real answer before anything but the
    // splash is drawn.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(ref.read(authProvider).restore());
    });
  }

  @override
  Widget build(BuildContext context) {
    // Built once: a GoRouter rebuilt on every frame loses its history.
    final GoRouter router = _router ??= buildRouter(ref);

    return MaterialApp.router(
      title: 'Sankalp',
      debugShowCheckedModeBanner: false,
      scaffoldMessengerKey: rootMessenger,
      // The ROOT theme is always the platform's. A family's accent is
      // applied to the subtree showing that family's record, never here —
      // see theme/app_theme.dart for why that is a rule and not a taste.
      theme: AppTheme.platform(),
      routerConfig: router,
      localizationsDelegates: const <LocalizationsDelegate<Object>>[
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const <Locale>[
        Locale('en'),
        Locale('hi'),
        Locale('mr'),
        Locale('ta'),
        Locale('bn'),
        Locale('gu'),
        Locale('pa'),
        Locale('te'),
        Locale('kn'),
        Locale('ml'),
        Locale('or'),
      ],
    );
  }
}
