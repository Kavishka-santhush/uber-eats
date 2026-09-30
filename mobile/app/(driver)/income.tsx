import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardRow } from '@/components/ui/card';
import { LoadingBlock, Screen, Section } from '@/components/screen';
import { DRIVER_EARNINGS, MY_DRIVER_PROFILE } from '@/lib/graphql/queries';
import { formatPrice } from '@/components/price';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';

/**
 * Driver income — summary tiles (today / week / month / lifetime) plus a
 * simple 14-day bar chart built from `driverEarnings.byDay`.
 */
export default function DriverIncomeScreen() {
  const theme = useTheme();

  const { data: earnData, loading } = useQuery(DRIVER_EARNINGS, { fetchPolicy: 'cache-and-network' });
  const { data: profileData } = useQuery(MY_DRIVER_PROFILE);
  const earnings = earnData?.driverEarnings;
  const profile = profileData?.myDriverProfile;

  if (loading && !earnings) {
    return (
      <Screen back title="Earnings">
        <LoadingBlock label="Loading earnings…" />
      </Screen>
    );
  }

  const byDay: { date: string; amount: number }[] = (earnings?.byDay ?? [])
    .map((d: any) => ({ date: d.date, amount: num(d.amount) }))
    .sort((a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date))
    .slice(-14);
  const maxAmt = Math.max(...byDay.map((d) => d.amount), 1);

  return (
    <Screen back title="Earnings" subtitle={`${profile?.totalDeliveries ?? 0} total deliveries`}>
      {/* Summary tiles */}
      <View style={styles.grid}>
        <SummaryTile label="Today" value={earnings?.today} theme={theme} />
        <SummaryTile label="This week" value={earnings?.week} theme={theme} />
        <SummaryTile label="This month" value={earnings?.month} theme={theme} />
        <SummaryTile label="Lifetime" value={earnings?.lifetime} theme={theme} />
      </View>

      {/* Available balance */}
      <Card style={{ marginTop: 14 }}>
        <CardRow
          right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}
          onPress={() => router.push('/history')}
        >
          <Text style={[styles.bold, { color: theme.text }]}>{formatPrice(profile?.earningsBalance)}</Text>
          <Text style={[styles.hint, { color: theme.subtext }]}>Available balance · view history</Text>
        </CardRow>
      </Card>

      {/* Bar chart */}
      {byDay.length > 0 && (
        <Section title="Last 14 days" subtitle="Earnings per delivery day">
          <Card style={{ padding: 16 }}>
            <View style={styles.chart}>
              {byDay.map((d) => {
                const pct = d.amount / maxAmt;
                return (
                  <View key={d.date} style={styles.barCol}>
                    <Text style={[styles.barAmount, { color: theme.subtext }]}>{d.amount > 0 ? formatPrice(d.amount, 0) : ''}</Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(pct * 100, 3),
                          backgroundColor: pct > 0.7 ? palette.brand : palette.brandSoft,
                        },
                      ]}
                    />
                    <Text style={[styles.barLabel, { color: theme.subtext }]}>{d.date.slice(5)}</Text>
                  </View>
                );
              })}
            </View>
          </Card>
        </Section>
      )}

      {/* Stats */}
      <Section title="Performance">
        <Card>
          <StatRow label="Completion rate" value={`${num(profile?.completionRate).toFixed(0)}%`} theme={theme} />
          <StatRow label="Acceptance rate" value={`${num(profile?.acceptanceRate).toFixed(0)}%`} theme={theme} />
          <StatRow label="On-time rate" value={`${num(profile?.onTimeRate).toFixed(0)}%`} theme={theme} />
          <StatRow label="Avg rating" value={`${(profile?.avgRating ?? 0).toFixed(2)} ★ (${profile?.reviewCount ?? 0})`} theme={theme} last />
        </Card>
      </Section>
    </Screen>
  );
}

function SummaryTile({ label, value, theme }: { label: string; value: any; theme: any }) {
  return (
    <View style={[styles.tile, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.tileLabel, { color: theme.subtext }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: theme.text }]}>{formatPrice(value)}</Text>
    </View>
  );
}

function StatRow({ label, value, theme, last }: { label: string; value: string; theme: any; last?: boolean }) {
  return (
    <View style={[styles.statRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={{ color: theme.subtext, fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: theme.text, fontWeight: '700', fontSize: 13 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 4 },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.card, borderWidth: 1, padding: 14 },
  tileLabel: { fontSize: 12, marginBottom: 4 },
  tileValue: { fontSize: 17, fontWeight: '800' },
  bold: { fontSize: 14, fontWeight: '800' },
  hint: { fontSize: 12, marginTop: 2 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 3 },
  barCol: { flex: 1, alignItems: 'center' },
  bar: { width: '80%', borderRadius: 3 },
  barAmount: { fontSize: 9, marginBottom: 2 },
  barLabel: { fontSize: 8.5, marginTop: 4 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
});
