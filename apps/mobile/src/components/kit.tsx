import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { LIGHT as C, TOUCH, radius, shadow, space, type } from '../theme/tokens';

/**
 * The interface vocabulary.
 *
 * One rule shaped all of it: **nothing here explains the system to the
 * user.** The web build put engineering commentary on every screen — why
 * there is no price sort, what the database refuses — and that is most of
 * why it read as an internal tool. Those constraints still hold; they are
 * just enforced silently, the way a well-made product enforces things.
 */

export function Screen({
  children,
  scroll = true,
  pad = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  pad?: boolean;
}): JSX.Element {
  const inner = <View style={pad ? s.pad : undefined}>{children}</View>;
  return scroll ? (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.scrollBody}
      keyboardShouldPersistTaps="handled"
    >
      {inner}
    </ScrollView>
  ) : (
    <View style={s.screen}>{inner}</View>
  );
}

export function H1({ children }: { children: ReactNode }): JSX.Element {
  return <Text style={[type.display, { color: C.ink, marginBottom: space.xs }]}>{children}</Text>;
}

export function H2({ children }: { children: ReactNode }): JSX.Element {
  return <Text style={[type.title, { color: C.ink }]}>{children}</Text>;
}

export function H3({ children }: { children: ReactNode }): JSX.Element {
  return <Text style={[type.heading, { color: C.ink }]}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }): JSX.Element {
  return <Text style={[type.body, { color: muted ? C.inkMuted : C.ink }]}>{children}</Text>;
}

export function Small({ children, muted = true }: { children: ReactNode; muted?: boolean }): JSX.Element {
  return <Text style={[type.small, { color: muted ? C.inkMuted : C.ink }]}>{children}</Text>;
}

export function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <Text style={[type.caption, { color: C.inkFaint, textTransform: 'uppercase', marginBottom: space.sm }]}>
      {children}
    </Text>
  );
}

export function Card({
  children,
  onPress,
  style,
  tone,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  tone?: 'default' | 'alert';
}): JSX.Element {
  const base = [
    s.card,
    tone === 'alert' && { borderColor: C.correction, backgroundColor: C.correctionSoft },
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { opacity: 0.7, transform: [{ scale: 0.995 }] }]}
    >
      {children}
    </Pressable>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <View style={{ marginBottom: space.xl }}>
      {(title || action) && (
        <View style={s.sectionHead}>
          {title ? <H3>{title}</H3> : <View />}
          {action}
        </View>
      )}
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  busy,
  full = true,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  busy?: boolean;
  full?: boolean;
}): JSX.Element {
  const tone = {
    primary: { bg: C.accent, fg: C.accentInk, border: C.accent },
    secondary: { bg: 'transparent', fg: C.ink, border: C.rule },
    danger: { bg: 'transparent', fg: C.correction, border: C.correction },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!busy }}
      onPress={disabled || busy ? undefined : onPress}
      style={({ pressed }) => [
        s.button,
        full && { alignSelf: 'stretch' },
        { backgroundColor: tone.bg, borderColor: tone.border },
        (disabled || busy) && { opacity: 0.45 },
        pressed && { opacity: 0.75 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <Text style={[type.bodyStrong, { color: tone.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  tone = 'neutral',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: 'neutral' | 'good' | 'warn' | 'alert' | 'accent';
}): JSX.Element {
  const palette = {
    neutral: { bg: C.surfaceSunk, fg: C.inkMuted },
    good: { bg: C.goodSoft, fg: C.good },
    warn: { bg: C.warnSoft, fg: C.warn },
    alert: { bg: C.correctionSoft, fg: C.correction },
    accent: { bg: C.accentSoft, fg: C.accent },
  }[tone];

  const body = (
    <View
      style={[
        s.chip,
        { backgroundColor: palette.bg },
        selected && { backgroundColor: C.ink },
      ]}
    >
      <Text style={[type.smallStrong, { color: selected ? C.paper : palette.fg }]}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.7 }]}
    >
      {body}
    </Pressable>
  );
}

export function Row({
  children,
  gap = space.sm,
  wrap,
  between,
  align = 'center',
}: {
  children: ReactNode;
  gap?: number;
  wrap?: boolean;
  between?: boolean;
  align?: ViewStyle['alignItems'];
}): JSX.Element {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap,
        alignItems: align,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        justifyContent: between ? 'space-between' : 'flex-start',
      }}
    >
      {children}
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }): JSX.Element {
  const initials = name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: C.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[type.bodyStrong, { color: C.accent, fontSize: size * 0.34 }]}>{initials}</Text>
    </View>
  );
}

export function Field({
  label: text,
  value,
  onChangeText,
  placeholder,
  multiline,
  secure,
  keyboard,
  autoCapitalize = 'none',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secure?: boolean;
  keyboard?: 'default' | 'email-address' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
}): JSX.Element {
  return (
    <View style={{ marginBottom: space.lg }}>
      <Text style={[type.smallStrong, { color: C.inkMuted, marginBottom: space.xs }]}>{text}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.inkFaint}
        secureTextEntry={secure}
        keyboardType={keyboard}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={[
          s.input,
          multiline && { height: 96, textAlignVertical: 'top', paddingTop: space.md },
        ]}
      />
    </View>
  );
}

/** An error, from the API's stable code plus its localised message. */
export function ErrorNote({ error }: { error?: { code: string; message: string } | null }): JSX.Element | null {
  if (!error) return null;
  return (
    <View style={s.error} accessibilityRole="alert">
      <Text style={[type.bodyStrong, { color: C.correction }]}>{error.message}</Text>
    </View>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }): JSX.Element {
  return (
    <View style={s.empty}>
      <Text style={[type.body, { color: C.inkMuted, textAlign: 'center' }]}>{text}</Text>
      {action ? <View style={{ marginTop: space.md, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Loading(): JSX.Element {
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={C.accent} />
    </View>
  );
}

/** Progress through the engagement lifecycle. */
export function Stepper({ status }: { status: string }): JSX.Element {
  const steps = ['draft', 'agreed', 'working', 'delivered', 'assessed', 'completed'];
  const i = steps.indexOf(status);
  if (i === -1) {
    return <Chip label={status.replace(/_/g, ' ')} tone="alert" />;
  }
  return (
    <View style={{ gap: space.sm }}>
      <Row gap={space.xs}>
        {steps.map((step, n) => (
          <View
            key={step}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              backgroundColor: n <= i ? C.accent : C.surfaceSunk,
            }}
          />
        ))}
      </Row>
      <Small>
        Step {i + 1} of {steps.length} · {steps[i]}
      </Small>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  scrollBody: { paddingBottom: space.xxl * 2 },
  pad: { paddingHorizontal: space.lg, paddingTop: space.lg },
  card: {
    backgroundColor: C.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: C.rule,
    padding: space.lg,
    gap: space.sm,
    ...shadow.card,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  button: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  chip: {
    minHeight: 32,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: radius.md,
    backgroundColor: C.surface,
    paddingHorizontal: space.md,
    fontSize: 16, // 16px stops iOS zooming the viewport on focus
    color: C.ink,
  },
  error: {
    backgroundColor: C.correctionSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.lg,
  },
  empty: {
    paddingVertical: space.xl,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.rule,
  },
});
