import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Card, CardRow } from '@/components/ui/card';
import { EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { StatusBadge } from '@/components/status-badge';
import { formatPrice } from '@/components/price';
import { TICKET_DETAIL } from '@/lib/graphql/queries';
import { REPLY_TICKET } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth/store';
import { num } from '@/lib/geo';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDateTime, timeAgo } from '@/lib/date';

/** One support conversation: status, resolution, linked order and the reply thread. */
export default function TicketDetailScreen() {
  const theme = useTheme();
  const me = useAuth((s) => s.user);
  const { id } = useLocalSearchParams<{ id: string }>();
  const listRef = useRef<ScrollView | null>(null);

  const { data, loading, error, refetch } = useQuery(TICKET_DETAIL, {
    variables: { id },
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const [reply, { loading: sending }] = useMutation(REPLY_TICKET);

  const ticket: any = data?.ticket ?? null;
  const messages: any[] = ticket?.messages ?? [];
  const closed = ticket?.status === 'CLOSED' || ticket?.status === 'RESOLVED';

  // Support answers arrive as an in-app notification (no ticket-specific event).
  useEffect(() => {
    const socket = getSocket();
    const onNotify = () => refetch();
    socket?.on('notification:new', onNotify);
    return () => {
      socket?.off('notification:new', onNotify);
    };
  }, [refetch]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const [draft, setDraft] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft('');
    try {
      await reply({ variables: { ticketId: id, body } });
      setBanner(null);
      refetch();
    } catch (e: any) {
      setDraft(body);
      setBanner(cleanError(e) || 'Could not send your reply');
    }
  };

  if (loading && !ticket) {
    return (
      <Screen back title="Support ticket">
        <LoadingBlock label="Opening your ticket…" />
      </Screen>
    );
  }
  if (error || !ticket) {
    return (
      <Screen back title="Support ticket">
        <EmptyState
          icon="alert-circle-outline"
          title="Ticket not found"
          body={error?.message?.replace('GraphQL error: ', '') || 'This conversation is no longer available.'}
          ctaLabel="Back to support"
          ctaOnPress={() => router.replace('/support')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      back
      title={ticket.number}
      subtitle={ticket.subject}
      refresh={refetch}
      refreshing={loading && !!data}
      keyboardAvoiding
      footer={
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={closed ? 'Add a follow-up…' : 'Write a reply…'}
            placeholderTextColor={theme.subtext}
            style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg, borderColor: theme.border }]}
            multiline
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            hitSlop={6}
            style={[styles.send, { backgroundColor: palette.brand, opacity: !draft.trim() || sending ? 0.45 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Send reply"
          >
            <Ionicons name="arrow-up" size={18} color="#fff" />
          </Pressable>
        </View>
      }
    >
      <Card style={styles.headCard}>
        <CardRow right={<StatusBadge status={ticket.status} />}>
          <Text style={[styles.subject, { color: theme.text }]}>{ticket.subject}</Text>
          <Text style={[styles.meta, { color: theme.subtext }]}>
            Opened {formatDateTime(ticket.createdAt)}
            {ticket.assignedTo?.fullName ? ` · with ${ticket.assignedTo.fullName}` : ''}
          </Text>
          <View style={styles.tagRow}>
            <Badge label={pretify(ticket.category)} tone="neutral" />
            <Badge label={`Priority ${num(ticket.priority, 3)}/5`} tone={num(ticket.priority, 3) >= 4 ? 'danger' : 'info'} />
            {ticket.aiCategory && <Badge label={`AI: ${pretify(ticket.aiCategory)}`} tone="info" />}
          </View>
        </CardRow>
      </Card>

      {!!banner && (
        <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
          <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
        </View>
      )}

      {!!ticket.resolution && (
        <Section title="Resolution" subtitle={pretify(ticket.status)}>
          <Card>
            <CardRow>
              <Text style={{ color: theme.text, fontSize: 13.5, lineHeight: 20 }}>{ticket.resolution}</Text>
              {(num(ticket.refundAmount) > 0 || num(ticket.walletCredit) > 0) && (
                <View style={styles.moneyRow}>
                  {num(ticket.refundAmount) > 0 && (
                    <Badge label={`Refunded ${formatPrice(ticket.refundAmount)}`} tone="brand" />
                  )}
                  {num(ticket.walletCredit) > 0 && (
                    <Badge label={`Wallet credit ${formatPrice(ticket.walletCredit)}`} tone="brand" />
                  )}
                </View>
              )}
            </CardRow>
          </Card>
        </Section>
      )}

      {!!ticket.order && (
        <Section title="Linked order">
          <Card>
            <CardRow
              onPress={() => router.push({ pathname: '/track/[id]', params: { id: ticket.order.id } })}
              right={<Ionicons name="chevron-forward" size={17} color={theme.subtext} />}
            >
              <Text style={[styles.subject, { color: theme.text }]}>#{ticket.order.orderNumber}</Text>
              <Text style={[styles.meta, { color: theme.subtext }]} numberOfLines={1}>
                {ticket.order.branch?.restaurant?.name ?? ticket.order.branch?.name} · {formatPrice(ticket.order.total)}
              </Text>
            </CardRow>
          </Card>
        </Section>
      )}

      <Section title="Conversation" subtitle={`${messages.length} message${messages.length === 1 ? '' : 's'}`}>
        <View style={[styles.thread, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView ref={listRef} contentContainerStyle={styles.threadList} showsVerticalScrollIndicator={false}>
            {messages.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 13 }}>
                No messages yet — describe the issue below and we will pick it up.
              </Text>
            ) : (
              messages.map((m: any) => {
                const mine = m.author?.id === me?.id;
                return (
                  <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
                    <View style={[styles.bubble, { backgroundColor: mine ? palette.brand : theme.inputBg }]}>
                      {!mine && (
                        <Text style={styles.bubbleAuthor}>
                          {m.author?.fullName ?? 'Support'}
                          {m.isStaff ? ' · Support team' : ''}
                        </Text>
                      )}
                      <Text style={{ color: mine ? '#fff' : theme.text, fontSize: 14, lineHeight: 19 }}>{m.body}</Text>
                      <Text style={[styles.stamp, { color: mine ? '#FFFFFFBB' : theme.subtext }]}>{timeAgo(m.createdAt)}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
        {closed && (
          <Text style={[styles.closedNote, { color: theme.subtext }]}>
            This ticket is {pretify(ticket.status).toLowerCase()} — replying keeps it in the same thread for the team to read.
          </Text>
        )}
      </Section>
    </Screen>
  );
}

function pretify(value?: string | null): string {
  if (!value) return '';
  return value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  headCard: { marginBottom: 14 },
  subject: { fontSize: 15, fontWeight: '900' },
  meta: { fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 14, flexDirection: 'row' },
  moneyRow: { flexDirection: 'row', gap: 7, marginTop: 9, flexWrap: 'wrap' },
  thread: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  threadList: { padding: 12, gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 9, maxWidth: '84%' },
  bubbleAuthor: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 2 },
  stamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  closedNote: { fontSize: 11.5, marginTop: 8, lineHeight: 16 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 9 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14.5,
    maxHeight: 96,
    minHeight: 42,
    textAlignVertical: 'center',
  },
  send: { width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
});
