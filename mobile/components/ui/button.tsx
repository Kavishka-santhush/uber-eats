import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { palette, radius, useTheme } from '@/lib/theme';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = 'primary', size = 'md', disabled, loading, style }: Props) {
  const theme = useTheme();
  const isDark = theme.dark;

  const bg =
    variant === 'primary' ? palette.brand
    : variant === 'danger' ? palette.danger
    : variant === 'secondary' ? (isDark ? theme.inputBg : '#E2E8F0')
    : 'transparent';

  const color =
    variant === 'secondary' ? theme.text
    : variant === 'ghost' ? palette.brand
    : '#FFFFFF';

  const heights = { sm: 34, md: 44, lg: 52 };
  const fonts = { sm: 13, md: 15, lg: 16 };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, minHeight: heights[size], opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: palette.brand },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <Text style={[styles.label, { color, fontSize: fonts[size] }]} numberOfLines={1}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.input,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontWeight: '700',
  },
});
