import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, Text, type ViewStyle } from 'react-native';
import { useTheme, radius, palette } from '@/lib/theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  title?: string;
  subtitle?: string;
}

export function Card({ children, style, title, subtitle }: CardProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.base,
        { backgroundColor: theme.card, borderColor: theme.border },
        style,
      ]}
    >
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text style={[styles.title, { color: theme.text }]}>{title}</Text>}
          {subtitle && <Text style={[styles.subtitle, { color: theme.subtext }]}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </View>
  );
}

/** Row inside a Card, with optional trailing element (switch, chevron…). */
export function CardRow({ children, right, onPress }: { children: ReactNode; right?: ReactNode; onPress?: () => void }) {
  const theme = useTheme();
  const inner = (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1 }}>{children}</View>
      {right}
    </View>
  );
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        {inner}
      </Pressable>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2, color: palette.muted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
