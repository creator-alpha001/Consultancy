import 'package:flutter/material.dart';

/// The app-wide messenger, for a message that has to outlive the screen
/// that raised it — signing in replaces the sign-in screen entirely, so a
/// SnackBar shown from there would vanish with it.
final GlobalKey<ScaffoldMessengerState> rootMessenger =
    GlobalKey<ScaffoldMessengerState>();
