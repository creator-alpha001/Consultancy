import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { LIGHT as C, type } from '@/theme/tokens';

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
        headerTitleStyle: { ...type.heading, color: C.ink },
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.inkFaint,
        tabBarStyle: {
          backgroundColor: C.surface,
          borderTopColor: C.rule,
          height: 64,
          paddingBottom: 9,
          paddingTop: 7,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color }) => <Icon glyph="◈" color={color} /> }}
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
