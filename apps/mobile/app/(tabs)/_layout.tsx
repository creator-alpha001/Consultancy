import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { LIGHT as C, font } from '@/theme/tokens';

/**
 * Bottom tabs — the single biggest thing the web build lacked. Thumb
 * reachable, always visible, and the shape of the app is legible at a
 * glance instead of hidden behind a wrapping top nav.
 *
 * The glyphs are text rather than an icon font: one fewer dependency, one
 * fewer thing to fail to load on a patchy connection, and the label is
 * always right there for a screen reader.
 */
function Icon({ glyph, color }: { glyph: string; color: string }): JSX.Element {
  return <Text style={{ fontSize: 19, color }}>{glyph}</Text>;
}

export default function TabsLayout(): JSX.Element {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.paper },
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: font.semibold, fontSize: 17, letterSpacing: -0.3, color: C.ink },
        headerTitleAlign: 'center',
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.inkFaint,
        // 80 rather than 68: at the smaller height the labels sat on the
        // very edge of the bar and their descenders were clipped.
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.rule,
          borderTopWidth: 1,
          height: 80,
          paddingBottom: 18,
          paddingTop: 10,
        },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11, letterSpacing: 0 },
        tabBarIconStyle: { marginBottom: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        // No header: the screen opens on its own large title, and a bar
        // repeating the word above it is a line of pure duplication.
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color }) => <Icon glyph="◈" color={color} />,
        }}
      />
      <Tabs.Screen
        name="find"
        options={{ title: 'Find', tabBarIcon: ({ color }) => <Icon glyph="⌕" color={color} /> }}
      />
      <Tabs.Screen
        name="work"
        options={{ title: 'Work', tabBarIcon: ({ color }) => <Icon glyph="▤" color={color} /> }}
      />
      <Tabs.Screen
        name="sessions"
        options={{ title: 'Sessions', tabBarIcon: ({ color }) => <Icon glyph="◷" color={color} /> }}
      />
      <Tabs.Screen
        name="you"
        options={{ title: 'You', tabBarIcon: ({ color }) => <Icon glyph="◐" color={color} /> }}
      />
    </Tabs>
  );
}
