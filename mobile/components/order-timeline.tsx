import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_LADDER, statusLabel } from '@/components/status-badge';
import { palette, useTheme } from '@/lib/theme';
import { formatTime } from '@/lib/date';

interface Log {
  id: string;
  status: string;
  note?: string | null;
  createdAt: string;
}

interface Props {
  status: string;
  logs?: Log[] | null;
  /** Compact = single line of dots (list rows); default = vertical stepper. */
  compact?: boolean;
}

const index = (status: string) => ORDER_LADDER.indexOf(status);

/**
 * Visualises the forward order lifecycle. Cancelled orders show a single red
 * entry; otherwise every step up to the current status is marked done and the
 * matching `order.statusLogs` timestamp is shown when the server recorded one.
 */
export function OrderTimeline({ status, logs, compact }: Props) {
  const theme = useTheme();

  if (status === 'CANCELLED') {
    return (
      <View style={styles.cancelled}>
        <Ionicons name="close-circle" size={18} color={palette.danger} />
        <Text style={[styles.cancelledText, { color: palette.danger }]}>This order was cancelled</Text>
      </View>
    );
  }

  const current = index(status);

  if (compact) {
    return (
      <View style={styles.dots}>
        {ORDER_LADDER.map((s, i) => (
          <View
            key={s}
            style={[
              styles.dot,
              { backgroundColor: i <= current ? palette.brand : theme.border },
              i === current && styles.dotCurrent,
            ]}
          />
        ))}
      </View>
    );
  }

  const timeFor = (s: string) => logs?.find((l) => l.status === s)?.createdAt;

  return (
    <View>
      {ORDER_LADDER.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const at = timeFor(s);
        return (
          <View key={s} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  {
                    backgroundColor: done || active ? palette.brand : theme.card,
                    borderColor: done || active ? palette.brand : theme.border,
                  },
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="#fff" />
                ) : active ? (
                  <View style={styles.pulse} />
                ) : null}
              </View>
              {i < ORDER_LADDER.length - 1 && (
                <View style={[styles.connector, { backgroundColor: done ? palette.brand : theme.border }]} />
              )}
            </View>
            <View style={styles.rowBody}>
              <Text
                style={[
                  styles.label,
                  { color: active ? theme.text : done ? theme.text : theme.subtext, fontWeight: active ? '900' : '600' },
                ]}
              >
                {statusLabel(s)}
              </Text>
              {!!at && <Text style={[styles.time, { color: theme.subtext }]}>{formatTime(at)}</Text>}
              {active && <Text style={[styles.activeHint, { color: palette.brandDark }]}>Current step</Text>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 54 },
  rail: { width: 26, alignItems: 'center' },
  node: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  connector: { flex: 1, width: 2, marginVertical: 2, minHeight: 24 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  rowBody: { flex: 1, paddingLeft: 12, paddingBottom: 14 },
  label: { fontSize: 14.5 },
  time: { fontSize: 12, marginTop: 2 },
  activeHint: { fontSize: 11.5, fontWeight: '800', marginTop: 2 },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotCurrent: { width: 10, height: 10 },
  cancelled: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  cancelledText: { fontSize: 14, fontWeight: '800' },
});
