'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ORDER_CHAT } from '@/lib/graphql/queries';
import { SEND_ORDER_MESSAGE } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth/store';
import { formatTime } from '@/lib/date';

interface ChatMsg {
  id: string;
  body: string;
  createdAt: string;
  sender: { id: string; fullName: string; avatarUrl?: string | null };
}

/**
 * Live order chat between the customer and the restaurant/driver.
 * Messages arrive over the order room (`chat:message`) and are sent via the
 * sendOrderMessage mutation; the query provides the backlog on mount.
 */
export function ChatPanel({ orderId }: { orderId: string }) {
  const me = useAuth((s) => s.user);
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { data, error } = useQuery<{ orderChat: ChatMsg[] }>(ORDER_CHAT, {
    variables: { orderId },
    fetchPolicy: 'cache-and-network',
  });
  const [send, { loading }] = useMutation(SEND_ORDER_MESSAGE);
  const [live, setLive] = useState<ChatMsg[]>([]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onMsg = (msg: ChatMsg) => {
      if (msg && (msg as any).orderId === orderId) {
        setLive((l) => (l.some((m) => m.id === msg.id) ? l : [...l, msg]));
      }
    };
    socket.on('chat:message', onMsg);
    return () => {
      socket.off('chat:message', onMsg);
    };
  }, [orderId]);

  const backlog = data?.orderChat ?? [];
  const merged = [...backlog, ...live.filter((m) => !backlog.some((b) => b.id === m.id))];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [merged.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await send({ variables: { orderId, body } });
    } catch {
      setText(body);
    }
  };

  return (
    <div className="flex h-80 flex-col rounded-xl border bg-card">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {error && <p className="text-sm text-muted-foreground">Chat unavailable.</p>}
        {merged.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">No messages yet — say hi 👋</p>
        )}
        {merged.map((m) => {
          const mine = m.sender?.id === me?.id;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
              {!mine && (
                <Avatar className="h-6 w-6">
                  <AvatarImage src={m.sender.avatarUrl || ''} />
                  <AvatarFallback>{(m.sender.fullName || '?')[0]}</AvatarFallback>
                </Avatar>
              )}
              <div
                className={`max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ${
                  mine ? 'bg-brand text-white' : 'bg-muted'
                }`}
              >
                {!mine && <p className="text-[10px] font-semibold opacity-70">{m.sender.fullName}</p>}
                {m.body}
                <p className={`text-[10px] ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
                  {formatTime(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 border-t p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          disabled={!me}
        />
        <Button type="submit" size="icon" disabled={!me || loading || !text.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
