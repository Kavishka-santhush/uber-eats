import { StyleSheet, TextInput, View, Text, type TextInputProps } from 'react-native';
import { useTheme, radius, palette } from '@/lib/theme';

interface Props extends TextInputProps {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, style, ...rest }: Props) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label && <Text style={[styles.label, { color: theme.text }]}>{label}</Text>}
      <TextInput
        placeholderTextColor={theme.subtext}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.inputBg,
            borderColor: error ? palette.danger : theme.border,
          },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[styles.helper, { color: palette.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.helper, { color: theme.subtext }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  helper: { fontSize: 12, marginTop: 4 },
});
