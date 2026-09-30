import React, { type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { palette, radius, useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';

interface ScreenProps {
  children: ReactNode;
  /** Screen title rendered in the custom header. */
  title?: string;
  subtitle?: string;
  /** Shows a back chevron (defaults off — tab roots don't need one). */
  back?: boolean;
  /** Small text button on the right of the header (e.g. "Clear", "Done"). */
  action?: { label: string; onPress: () => void };
  /** Wrap children in a ScrollView. */
  scroll?: boolean;
  refresh?: () => void;
  refreshing?: boolean;
  /** Sticky bottom bar (cart totals, driver CTA…). */
  footer?: ReactNode;
  keyboardAvoiding?: boolean;
  contentStyle?: ViewStyle;
}

/**
 * Single chrome component for every screen: safe-area padding, optional header,
 * scroll behaviour and a fixed footer. Keeping it in one place means the nav
 * bar insets and typography never drift between screens.
 */
export function Screen({
  children,
  title,
  subtitle,
  back,
  action,
  scroll = true,
  refresh,
  refreshing,
  footer,
  keyboardAvoiding,
  contentStyle,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.scroll, contentStyle, { paddingBottom: 24 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        refresh ? <RefreshControl refreshing={!!refreshing} onRefresh={refresh} tintColor={palette.brand} /> : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.padded, { flex: 1 }]}>{children}</View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={{ paddingTop: insets.top }}>
        {(title || back || action) && (
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              {back ? (
                <Pressable
                  hitSlop={12}
                  onPress={() => (router.canGoBack?.() ? router.back() : router.replace('/tabs'))}
                  style={[styles.backBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
                  accessibilityRole="button"
                  accessibilityLabel="Go back"
                >
                  <Ionicons name="chevron-back" size={20} color={theme.text} />
                </Pressable>
              ) : null}
              <View style={{ flex: 1, marginLeft: back ? 10 : 0 }}>
                {!!title && (
                  <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
                    {title}
                  </Text>
                )}
                {!!subtitle && (
                  <Text style={[styles.subtitle, { color: theme.subtext }]} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            {!!action && (
              <Pressable hitSlop={10} onPress={action.onPress} accessibilityRole="button">
                <Text style={{ color: palette.brand, fontWeight: '700', fontSize: 14 }}>{action.label}</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>

      {body}

      {!!footer && (
        <View style={[styles.footer, { backgroundColor: theme.card, borderColor: theme.border, paddingBottom: insets.bottom + 8 }]}>
          {footer}
        </View>
      )}
    </View>
  );

  if (!keyboardAvoiding) return content;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {content}
    </KeyboardAvoidingView>
  );
}

/** Titled block inside a screen. */
export function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: { label: string; onPress: () => void };
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
          {!!subtitle && <Text style={[styles.sectionSub, { color: theme.subtext }]}>{subtitle}</Text>}
        </View>
        {!!action && (
          <Pressable hitSlop={10} onPress={action.onPress} accessibilityRole="button">
            <Text style={{ color: palette.brand, fontWeight: '700', fontSize: 13 }}>{action.label}</Text>
          </Pressable>
        )}
      </View>
      {children}
    </View>
  );
}

export function EmptyState({
  icon = 'cube-outline',
  title,
  body,
  ctaLabel,
  ctaOnPress,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaOnPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.inputBg }]}>
        <Ionicons name={icon} size={30} color={theme.subtext} />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text>
      {!!body && <Text style={[styles.emptyBody, { color: theme.subtext }]}>{body}</Text>}
      {!!ctaLabel && !!ctaOnPress && <Button title={ctaLabel} onPress={ctaOnPress} style={{ marginTop: 14 }} />}
    </View>
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={palette.brand} />
      {!!label && <Text style={{ color: theme.subtext, marginTop: 8, fontSize: 13 }}>{label}</Text>}
    </View>
  );
}

/** Horizontal row of filter pills. */
export function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            style={[
              styles.chip,
              {
                backgroundColor: active ? palette.brand : theme.card,
                borderColor: active ? palette.brand : theme.border,
              },
            ]}
          >
            <Text style={{ color: active ? '#fff' : theme.text, fontSize: 13, fontWeight: '700' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − qty + stepper used in the cart and item sheet. */
export function QtyStepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.stepper, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Pressable
        hitSlop={8}
        onPress={() => onChange(Math.max(min, value - 1))}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        style={styles.stepBtn}
      >
        <Ionicons name="remove" size={18} color={value <= min ? theme.subtext : palette.brand} />
      </Pressable>
      <Text style={[styles.stepValue, { color: theme.text }]}>{value}</Text>
      <Pressable
        hitSlop={8}
        onPress={() => onChange(value + 1)}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        style={styles.stepBtn}
      >
        <Ionicons name="add" size={18} color={palette.brand} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16 },
  padded: { padding: 16 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  headerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '900', letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, marginTop: 1 },
  footer: { borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },
  section: { marginBottom: 22 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  sectionSub: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  emptyBody: { fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
  loading: { paddingVertical: 40, alignItems: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 2,
  },
  stepBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 24, textAlign: 'center', fontWeight: '800', fontSize: 15 },
});
