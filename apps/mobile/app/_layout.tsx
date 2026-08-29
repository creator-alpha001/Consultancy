import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  NotoSansDevanagari_400Regular,
  NotoSansDevanagari_500Medium,
  NotoSansDevanagari_600SemiBold,
} from '@expo-google-fonts/noto-sans-devanagari';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '@/lib/store';
import { LIGHT as C, font } from '@/theme/tokens';

/**
 * Both scripts are loaded up front.
 *
 * Inter carries the Latin; Noto Sans Devanagari carries the Hindi, which
 * Inter has no glyphs for at all. Loading only Inter would have shipped a
 * product whose Hindi is drawn in whatever the platform substitutes —
 * a different colour, weight and baseline from everything around it, on
 * the screens a Hindi speaker reads first.
 *
 * The faces are bundled, not fetched, so this resolves offline and the
 * blank frame below lasts a frame or two rather than a network round
 * trip. It is a white screen, not a spinner: at this duration a spinner
 * is a flash of anxiety, not information.
 */
export default function RootLayout(): JSX.Element {
  const [ready] = useFonts({
    [font.regular]: Inter_400Regular,
    [font.medium]: Inter_500Medium,
    [font.semibold]: Inter_600SemiBold,
    [font.devaRegular]: NotoSansDevanagari_400Regular,
    [font.devaMedium]: NotoSansDevanagari_500Medium,
    [font.devaSemibold]: NotoSansDevanagari_600SemiBold,
  });

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.paper }} />;

  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.paper },
            headerShadowVisible: false,
            headerTintColor: C.ink,
            // react-navigation's header title accepts only family, size,
            // weight and colour — no letterSpacing.
            headerTitleStyle: { fontFamily: font.semibold, fontSize: 17, color: C.ink },
            headerTitleAlign: 'center',
            contentStyle: { backgroundColor: C.paper },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="register" options={{ title: 'Create account', presentation: 'modal' }} />
          {/*
            Not a modal, and not dismissable by swiping away: a provider
            who backs out of this cannot sign in at all, so leaving it
            looking optional would strand them.
          */}
          <Stack.Screen name="mfa-enrol" options={{ title: 'Two-factor setup', gestureEnabled: false }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
