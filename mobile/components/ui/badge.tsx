import { StyleSheet, Text, View } from 'react-native';
import { palette, radius } from '@/lib/theme';

export type BadgeTone = 'brand' | 'neutral' | 'danger' | 'warning' | 'info';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  brand: { bg: palette.brandSoft, fg: palette.brandDark },
  neutral: { bg: '#E2E8F0', fg: '#334155' },
  danger: { bg: '#FEE2E2', fg: '#B91C1C' },
  warning: { bg: '#FEF3C7', fg: '#B45309' },
  info: { bg: '#DBEAFE', fg: '#1D4ED8' },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.base, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700' },
});
