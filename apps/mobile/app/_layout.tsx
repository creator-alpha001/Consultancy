import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StoreProvider } from '@/lib/store';
import { LIGHT as C, type } from '@/theme/tokens';

export default function RootLayout(): JSX.Element {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: C.paper },
            headerShadowVisible: false,
            headerTintColor: C.ink,
            headerTitleStyle: { ...type.heading, color: C.ink },
            contentStyle: { backgroundColor: C.paper },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ title: 'Sign in', presentation: 'modal' }} />
          <Stack.Screen name="register" options={{ title: 'Create account', presentation: 'modal' }} />
        </Stack>
      </StoreProvider>
    </SafeAreaProvider>
  );
}
