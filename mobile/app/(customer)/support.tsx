import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardRow } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChipRow, EmptyState, LoadingBlock, Screen, Section } from '@/components/screen';
import { statusTone } from '@/components/status-badge';
import { MY_ORDERS, MY_TICKETS } from '@/lib/graphql/queries';
import { RAISE_TICKET } from '@/lib/graphql/mutations';
import { palette, radius, useTheme } from '@/lib/theme';
import { formatDate } from '@/lib/date';

/** Mirrors the server TicketCategory enum. */
const CATEGORIES = [
  { value: 'ORDER_ISSUE', label: 'Order' },
  { value: 'PAYMENT_ISSUE', label: 'Payment' },
  { value: 'DELIVERY_ISSUE', label: 'Delivery' },
  { value: 'ACCOUNT_ISSUE', label: 'Account' },
  { value: 'RESTAURANT_ISSUE', label: 'Restaurant' },
  { value: 'DRIVER_ISSUE', label: 'Driver' },
  { value: 'OTHER', label: 'Other' },
];

const FAQS = [
  {
    q: 'Where is my order?',
    a: 'Open Orders and tap Track — the map shows your courier live, and the chat reaches both the kitchen and the driver.',
  },
  {
    q: 'Something is missing or wrong',
    a: 'Message the restaurant from the order screen first: it is the fastest fix and the kitchen can still send what you paid for.',
  },
  {
    q: 'How do refunds work?',
    a: 'Cancelling before cooking starts is refunded in full, and partially afterwards. Money returns to your wallet or the original card within 5–10 working days.',
  },
];

/** Help centre: FAQs, ticket list and the raise-a-ticket form. */
export default function SupportScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ orderId?: string }>();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('ORDER_ISSUE');
  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState<string | null>(params.orderId ?? null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [banner, setBanner] = useState<string | null>(null);

  const ticketsQ = useQuery(MY_TICKETS, { variables: { page: 1, limit: 15 }, fetchPolicy: 'cache-and-network' });
  const ordersQ = useQuery(MY_ORDERS, { variables: { page: 1, limit: 10 }, fetchPolicy: 'cache-and-network' });
  const [raiseTicket, { loading: busy }] = useMutation(RAISE_TICKET);

  const tickets: any[] = ticketsQ.data?.myTickets?.items ?? [];
  const recentOrders: any[] = ordersQ.data?.myOrders?.items ?? [];

  const submit = async () => {
    setBanner(null);
    if (subject.trim().length < 4) {
      setBanner('Give your issue a clear subject (at least 4 characters)');
      return;
    }
    if (description.trim().length < 10) {
      setBanner('Please describe the issue in a little more detail (10+ characters)');
      return;
    }
    try {
      const res = await raiseTicket({
        variables: {
          input: {
            subject: subject.trim(),
            description: description.trim(),
            category,
            orderId: orderId || undefined,
          },
        },
      });
      const id = res.data?.raiseTicket?.id;
      setSubject('');
      setDescription('');
      setOrderId(null);
      await ticketsQ.refetch();
      if (id) router.push({ pathname: '/ticket/[id]', params: { id } });
    } catch (e: any) {
      setBanner(cleanError(e) || 'Could not open a ticket');
    }
  };

  return (
    <Screen
      back
      title="Help & support"
      subtitle="Replies usually land within a few hours"
      refresh={() => {
        ticketsQ.refetch();
        ordersQ.refetch();
      }}
      refreshing={ticketsQ.loading && !!ticketsQ.data}
    >
      <Section title="Open a ticket">
        <Card style={{ padding: 12 }}>
          <Input
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            placeholder="Missing items in my order"
            maxLength={120}
          />
          <Text style={[styles.fieldLabel, { color: theme.text }]}>Category</Text>
          <View style={{ marginBottom: 12 }}>
            <ChipRow value={category} onChange={setCategory} options={CATEGORIES} />
          </View>
          <Input
            label="What happened?"
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us what went wrong, including times and order numbers…"
            multiline
            numberOfLines={5}
            style={styles.textarea}
            maxLength={1500}
          />

          {recentOrders.length > 0 && (
            <>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Link an order (optional)</Text>
              <View style={styles.orderChips}>
                {recentOrders.slice(0, 6).map((o: any) => {
                  const active = orderId === o.id;
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => setOrderId(active ? null : o.id)}
                      accessibilityRole="button"
                      style={[
                        styles.orderChip,
                        {
                          backgroundColor: active ? palette.brand : theme.inputBg,
                          borderColor: active ? palette.brand : theme.border,
                        },
                      ]}
                    >
                      <Text style={{ color: active ? '#fff' : theme.text, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>
                        #{o.orderNumber} · {o.branch?.name ?? 'Order'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {!!banner && (
            <View style={[styles.banner, { backgroundColor: '#FEF3C7' }]}>
              <Text style={{ color: '#B45309', fontSize: 12.5, flex: 1, lineHeight: 18 }}>{banner}</Text>
            </View>
          )}

          <Button title={busy ? 'Sending…' : 'Submit ticket'} onPress={submit} loading={busy} />
          <Text style={[styles.finePrint, { color: theme.subtext }]}>
            Faster for live orders: open the order and use its chat — the kitchen and courier see that immediately.
          </Text>
        </Card>
      </Section>

      <Section title="My tickets" subtitle={ticketsQ.loading && !ticketsQ.data ? undefined : `${tickets.length} conversation${tickets.length === 1 ? '' : 's'}`}>
        {ticketsQ.loading && !ticketsQ.data ? (
          <LoadingBlock label="Loading your tickets…" />
        ) : tickets.length === 0 ? (
          <EmptyState icon="help-circle-outline" title="No tickets yet" body="Anything you send us appears here with the full reply history." />
        ) : (
          <Card>
            {tickets.map((t: any) => (
              <CardRow
                key={t.id}
                onPress={() => router.push({ pathname: '/ticket/[id]', params: { id: t.id } })}
                right={<Badge label={label(t.status)} tone={statusTone(t.status)} />}
              >
                <Text style={[styles.ticketSubject, { color: theme.text }]} numberOfLines={1}>
                  {t.subject}
                </Text>
                <Text style={[styles.ticketMeta, { color: theme.subtext }]} numberOfLines={1}>
                  {t.number} · {formatDate(t.createdAt)}
                  {t.resolution ? ' · resolved' : ''}
                </Text>
              </CardRow>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Common questions">
        <Card>
          {FAQS.map((f, i) => {
            const expanded = openFaq === i;
            return (
              <CardRow key={f.q} onPress={() => setOpenFaq(expanded ? null : i)}>
                <View style={styles.faqRow}>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={theme.subtext}
                    style={styles.faqIcon}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.faqQ, { color: theme.text }]}>{f.q}</Text>
                    {expanded && <Text style={[styles.faqA, { color: theme.subtext }]}>{f.a}</Text>}
                  </View>
                </View>
              </CardRow>
            );
          })}
        </Card>
      </Section>

      <Text style={[styles.lastSeen, { color: theme.subtext }]}>
        Every reply is also sent to your {' '}
        <Text style={{ color: palette.brand, fontWeight: '800' }} onPress={() => router.push('/notifications')}>
          notifications
        </Text>
        .
      </Text>
    </Screen>
  );
}

function label(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

function cleanError(e: any): string | undefined {
  const message: string | undefined = e?.message;
  return message ? message.replace('GraphQL error: ', '') : undefined;
}

const styles = StyleSheet.create({
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  textarea: { height: 108, paddingTop: 10, paddingBottom: 10, textAlignVertical: 'top' },
  orderChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  orderChip: {
    maxWidth: '48%',
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  banner: { borderRadius: radius.input, padding: 11, marginBottom: 12, flexDirection: 'row' },
  finePrint: { fontSize: 11.5, marginTop: 9, lineHeight: 16, textAlign: 'center' },
  ticketSubject: { fontSize: 14, fontWeight: '800' },
  ticketMeta: { fontSize: 11.5, marginTop: 2 },
  faqRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, flex: 1 },
  faqIcon: { marginTop: 2 },
  faqQ: { fontSize: 13.5, fontWeight: '800' },
  faqA: { fontSize: 12.5, marginTop: 4, lineHeight: 18 },
  lastSeen: { fontSize: 11.5, textAlign: 'center', marginTop: 4 },
});
