import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { ChipRow, EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { NOTIFICATIONS } from '@/lib/graphql/queries';
import { MARK_ALL_NOTIFICATIONS_READ, MARK_NOTIFICATION_READ } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { num } from '@/lib/geo';
import { palette, useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/date';

/** Server writes lowercase categories (see src/domain/notification.js). */
const CATEGORY_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  order: 'cube-outline',
  promo: 'ticket-outline',
  system: 'information-circle-outline',
  announcement: 'megaphone-outline',
  payment: 'wallet-outline',
  support: 'help-circle-outline',
};

/** Notification centre: unread filter, live socket refresh, deep links to orders. */
export default function NotificationsScreen() {
  const theme = useTheme();
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const { data, loading, refetch } = useQuery(NOTIFICATIONS, {
    variables: { page, limit: 20, onlyUnread },
    fetchPolicy: 'cache-and-network',
  });
  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [markAllRead, { loading: marking }] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  // The server pings user:<id> whenever a row is written.
  useEffect(() => {
    const socket = getSocket();
    const onNew = () => refetch();
    socket?.on('notification:new', onNew);
    return () => {
      socket?.off('notification:new', onNew);
    };
  }, [refetch]);

  const items: any[] = data?.notifications?.items ?? [];
  const pages = data?.notifications?.pages ?? 1;
  const unread = num(data?.notifications?.unread);

  const open = async (n: any) => {
    if (!n.isRead) {
      try {
        await markRead({ variables: { id: n.id } });
        refetch();
      } catch {
        /* a missed read-state is not worth blocking navigation */
      }
    }
    if (n.data?.orderId) router.push({ pathname: '/track/[id]', params: { id: n.data.orderId } });
    else if (n.data?.ticketId) router.push({ pathname: '/ticket/[id]', params: { id: n.data.ticketId } });
    else if (n.category === 'promo') router.push('/promos');
  };

  const markEverything = async () => {
    try {
      await markAllRead();
      refetch();
    } catch {
      /* non fatal */
    }
  };

  return (
    <Screen
      back
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread` : 'You are up to date'}
      refresh={refetch}
      refreshing={loading && !!data}
    >
      <View style={styles.filters}>
        <View style={{ flex: 1 }}>
          <ChipRow
            value={onlyUnread ? 'unread' : 'all'}
            onChange={(v) => {
              setOnlyUnread(v === 'unread');
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: `Unread${unread > 0 ? ` (${unread})` : ''}` },
            ]}
          />
        </View>
        <Button title="Mark all read" variant="ghost" size="sm" onPress={markEverything} disabled={unread === 0} loading={marking} />
      </View>

      <Section title={onlyUnread ? 'Unread' : 'Everything'} subtitle={pages > 1 ? `Page ${page} of ${pages}` : undefined}>
        {loading && !data ? (
          <LoadingBlock label="Loading your inbox…" />
        ) : items.length === 0 ? (
          <EmptyState
            icon="notifications-off-outline"
            title={onlyUnread ? 'Nothing unread' : 'No notifications yet'}
            body="Order updates, promo codes and support replies land here."
          />
        ) : (
          <Card>
            {items.map((n: any) => (
              <CardRow key={n.id} onPress={() => open(n)}>
                <View style={styles.row}>
                  <View style={[styles.iconBox, { backgroundColor: n.isRead ? theme.inputBg : palette.brandSoft }]}>
                    <Ionicons
                      name={CATEGORY_ICON[n.category] ?? 'notifications-outline'}
                      size={17}
                      color={n.isRead ? theme.subtext : palette.brandDark}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
                        {n.title}
                      </Text>
                      {!n.isRead && <View style={styles.dot} />}
                    </View>
                    {!!n.body && (
                      <Text style={[styles.body, { color: theme.subtext }]} numberOfLines={3}>
                        {n.body}
                      </Text>
                    )}
                    <View style={styles.metaRow}>
                      <Text style={[styles.meta, { color: theme.subtext }]}>{timeAgo(n.createdAt)}</Text>
                      {!!n.category && <Badge label={String(n.category).replace(/_/g, ' ')} tone="neutral" />}
                      {!!n.data?.orderId && <Badge label="View order" tone="brand" />}
                    </View>
                  </View>
                  <View style={styles.chevron}>
                    <Ionicons
                      name={n.data?.orderId || n.data?.ticketId ? 'chevron-forward' : 'chevron-down'}
                      size={16}
                      color={theme.subtext}
                    />
                  </View>
                </View>
              </CardRow>
            ))}
          </Card>
        )}

        {pages > 1 && (
          <View style={styles.pager}>
            <Button
              title="Newer"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            />
            <Text style={[styles.pageLabel, { color: theme.subtext }]}>
              {page} / {pages}
            </Text>
            <Button
              title="Older"
              variant="secondary"
              size="sm"
              disabled={page >= pages}
              onPress={() => setPage((p) => p + 1)}
            />
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  row: { flexDirection: 'row', gap: 11, flex: 1, alignItems: 'flex-start' },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: 14, fontWeight: '800', flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.brand },
  body: { fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  meta: { fontSize: 11.5 },
  chevron: { paddingTop: 8 },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12 },
  pageLabel: { fontSize: 12.5, fontWeight: '700' },
});
