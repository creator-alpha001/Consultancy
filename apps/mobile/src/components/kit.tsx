import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { LIGHT as C, TOUCH, fontFor, radius, scaleWeight, shadow, space, type } from '../theme/tokens';

/**
 * The interface vocabulary.
 *
 * Two rules shaped it.
 *
 * **Nothing here explains the system to the user.** The web build put
 * engineering commentary on every screen — why there is no price sort,
 * what the database refuses — which is most of why it read as an internal
 * tool. Those constraints still hold; they are enforced silently.
 *
 * **Separation comes from fill and space, not from lines and shadows.**
 * Cards are a flat grey panel on white with no border and no elevation.
 * Every border removed is a border that cannot misalign, and the result
 * reads as composed rather than boxed.
 */

/* ── Text ────────────────────────────────────────────────────────────
 * One primitive under every string, because the font family has to be
 * chosen from the content: Inter cannot draw Devanagari, so a Hindi
 * label must be handed to Noto instead. Doing that here means no screen
 * has to remember to.
 */

type Scale = keyof typeof type;

function Txt({
  scale,
  color,
  style,
  children,
  ...rest
}: {
  scale: Scale;
  color?: string;
  style?: TextStyle | TextStyle[];
  children: ReactNode;
  numberOfLines?: number;
}): JSX.Element {
  const t = type[scale];
  const flat = typeof children === 'string' || typeof children === 'number' ? String(children) : '';
  return (
    <Text
      {...rest}
      style={[
        t,
        { fontFamily: fontFor(flat, scaleWeight[scale]), color: color ?? C.ink },
        style as TextStyle,
      ]}
    >
      {children}
    </Text>
  );
}

/* ── Layout ──────────────────────────────────────────────────────── */

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

/* ── Type ────────────────────────────────────────────────────────── */

export function H1({ children }: { children: ReactNode }): JSX.Element {
  return <Txt scale="display" style={{ marginBottom: space.md }}>{children}</Txt>;
}

export function H2({ children }: { children: ReactNode }): JSX.Element {
  return <Txt scale="title">{children}</Txt>;
}

export function H3({ children }: { children: ReactNode }): JSX.Element {
  return <Txt scale="heading">{children}</Txt>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }): JSX.Element {
  return <Txt scale="body" color={muted ? C.inkMuted : C.ink}>{children}</Txt>;
}

export function Small({ children, muted = true }: { children: ReactNode; muted?: boolean }): JSX.Element {
  return <Txt scale="small" color={muted ? C.inkMuted : C.ink}>{children}</Txt>;
}

/**
 * The line above a heading. Sentence case, not uppercase — small caps
 * with wide tracking is a badge, and a badge above every title is noise.
 */
export function Eyebrow({ children }: { children: ReactNode }): JSX.Element {
  return <Txt scale="small" color={C.inkMuted} style={{ marginBottom: space.sm }}>{children}</Txt>;
}

/* ── Surfaces ────────────────────────────────────────────────────── */

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
  const base = [s.card, tone === 'alert' && { backgroundColor: C.correctionSoft }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { backgroundColor: '#ececee' }]}
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
    <View style={{ marginBottom: space.xxl }}>
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

/* ── Controls ────────────────────────────────────────────────────── */

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
    primary: { bg: C.accent, fg: C.accentInk, border: 'transparent', press: '#3f3f46' },
    secondary: { bg: C.surface, fg: C.ink, border: C.rule, press: C.surfaceSunk },
    danger: { bg: C.surface, fg: C.correction, border: C.rule, press: C.correctionSoft },
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
        (disabled || busy) && { opacity: 0.4 },
        pressed && { backgroundColor: tone.press },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={tone.fg} />
      ) : (
        <Txt scale="bodyStrong" color={tone.fg}>{label}</Txt>
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
    accent: { bg: C.surfaceSunk, fg: C.ink },
  }[tone];

  const body = (
    <View style={[s.chip, { backgroundColor: palette.bg }, selected && { backgroundColor: C.ink }]}>
      <Txt scale="caption" color={selected ? C.accentInk : palette.fg}>{label}</Txt>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed && { opacity: 0.6 }]}
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

/**
 * The confidence list under a hero: a filled tick, then a short fact.
 * Three of them, never a paragraph.
 */
export function CheckList({ items }: { items: string[] }): JSX.Element {
  return (
    <View style={{ gap: space.md }}>
      {items.map((item) => (
        <Row key={item} gap={space.md} align="flex-start">
          <View style={s.tick}>
            <Txt scale="caption" color={C.accentInk} style={{ lineHeight: 15 }}>✓</Txt>
          </View>
          <View style={{ flex: 1 }}>
            <Txt scale="small" color={C.ink}>{item}</Txt>
          </View>
        </Row>
      ))}
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
        backgroundColor: C.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: fontFor(initials, 'medium'),
          fontSize: size * 0.36,
          color: C.accentInk,
          letterSpacing: -0.3,
        }}
      >
        {initials}
      </Text>
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
      <Txt scale="smallStrong" color={C.ink} style={{ marginBottom: space.sm }}>{text}</Txt>
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
          { fontFamily: fontFor(value || placeholder, 'regular') },
          multiline && { height: 112, textAlignVertical: 'top', paddingTop: space.md },
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
      <Txt scale="smallStrong" color={C.correction}>{error.message}</Txt>
    </View>
  );
}

export function Empty({ text, action }: { text: string; action?: ReactNode }): JSX.Element {
  return (
    <View style={s.empty}>
      <Txt scale="small" color={C.inkMuted} style={{ textAlign: 'center' }}>{text}</Txt>
      {action ? <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Loading(): JSX.Element {
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center' }}>
      <ActivityIndicator color={C.inkFaint} />
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
    <View style={{ gap: space.md }}>
      <Row gap={space.xs}>
        {steps.map((step, n) => (
          <View
            key={step}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              backgroundColor: n <= i ? C.ink : C.rule,
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
  scrollBody: { paddingBottom: space.xxxl },
  pad: { paddingHorizontal: space.xl, paddingTop: space.xl },
  card: {
    backgroundColor: C.surfaceSunk,
    borderRadius: radius.lg,
    padding: space.xl,
    gap: space.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  chip: {
    minHeight: 30,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 1,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  tick: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  input: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderColor: C.rule,
    borderRadius: radius.md,
    backgroundColor: C.surface,
    paddingHorizontal: space.lg,
    fontSize: 16, // 16px stops iOS zooming the viewport on focus
    color: C.ink,
  },
  error: {
    backgroundColor: C.correctionSoft,
    borderRadius: radius.md,
    padding: space.lg,
    marginBottom: space.lg,
  },
  empty: {
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: C.surfaceSunk,
  },
});

export { TOUCH };
