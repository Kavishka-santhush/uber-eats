import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery } from '@apollo/client';
import { Ionicons } from '@expo/vector-icons';
import { ORDER_CHAT } from '@/lib/graphql/queries';
import { SEND_ORDER_MESSAGE } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth/store';
import { palette, radius, useTheme } from '@/lib/theme';
import { timeAgo } from '@/lib/date';

interface Props {
  orderId: string;
  /** Height of the scroll area — the parent controls layout. */
  height?: number;
}

/**
 * Order chat between customer, restaurant and driver. Messages arrive over the
 * `order:<id>` room (`chat:message`), so the panel stays current without
 * polling; a refetch on mount covers anything sent while the app was closed.
 */
export function ChatPanel({ orderId, height = 260 }: Props) {
  const theme = useTheme();
  const me = useAuth((s) => s.user);
  const listRef = useRef<ScrollView | null>(null);
  const [draft, setDraft] = useState('');

  const { data, loading, refetch } = useQuery(ORDER_CHAT, { variables: { orderId }, fetchPolicy: 'cache-and-network' });
  const [send, { loading: sending }] = useMutation(SEND_ORDER_MESSAGE, {
    onCompleted: () => {
      setDraft('');
      refetch();
    },
  });

  const messages: any[] = data?.orderChat ?? [];

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onMessage = (payload: any) => {
      // The server broadcasts chat:message into the order room; refetch keeps
      // the list authoritative (and covers messages sent while the app closed).
      if (payload?.orderId && payload.orderId !== orderId) return;
      refetch();
    };
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:message', onMessage);
    };
  }, [orderId, refetch]);

  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const submit = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setDraft('');
    try {
      await send({ variables: { orderId, body } });
    } catch {
      // restore the text so nothing is typed away by a failure
      setDraft(body);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView ref={listRef} style={{ height }} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {loading && !messages.length && <Text style={{ color: theme.subtext, fontSize: 13 }}>Loading conversation…</Text>}
        {!loading && !messages.length && (
          <Text style={{ color: theme.subtext, fontSize: 13 }}>
            No messages yet — ask the restaurant or your driver anything about this order.
          </Text>
        )}
        {messages.map((m) => {
          const mine = m.sender?.id === me?.id;
          return (
            <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
              <View
                style={[
                  styles.bubble,
                  { backgroundColor: mine ? palette.brand : theme.inputBg, maxWidth: '82%' },
                ]}
              >
                {!mine && !!m.sender?.fullName && (
                  <Text style={styles.sender}>{m.sender.fullName}</Text>
                )}
                <Text style={{ color: mine ? '#fff' : theme.text, fontSize: 14, lineHeight: 19 }}>{m.body}</Text>
                <Text style={[styles.stamp, { color: mine ? '#FFFFFFBB' : theme.subtext }]}>{timeAgo(m.createdAt)}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.composer, { borderColor: theme.border }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a message…"
          placeholderTextColor={theme.subtext}
          style={[styles.input, { color: theme.text, backgroundColor: theme.inputBg }]}
          onSubmitEditing={submit}
          returnKeyType="send"
          multiline
        />
        <Pressable
          onPress={submit}
          disabled={!draft.trim() || sending}
          hitSlop={6}
          style={[styles.send, { opacity: !draft.trim() || sending ? 0.45 : 1, backgroundColor: palette.brand }]}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Ionicons name="arrow-up" size={18} color="#fff" />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  bubbleRow: { flexDirection: 'row' },
  rowLeft: { justifyContent: 'flex-start' },
  rowRight: { justifyContent: 'flex-end' },
  bubble: { borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 9 },
  sender: { fontSize: 11, fontWeight: '800', color: '#64748B', marginBottom: 2 },
  stamp: { fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderTopWidth: 1, paddingTop: 10 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: radius.input,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 96,
    minHeight: 40,
  },
  send: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
});
