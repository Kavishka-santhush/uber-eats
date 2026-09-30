'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Bell, BellRing, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { NOTIFICATIONS } from '@/lib/graphql/queries';
import { MARK_NOTIFICATION_READ, MARK_ALL_NOTIFICATIONS_READ } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { timeAgo } from '@/lib/date';

function NotificationsInner() {
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data, loading, refetch } = useQuery(NOTIFICATIONS, {
    variables: { page, limit: 20, onlyUnread },
    fetchPolicy: 'cache-and-network',
  });
  const [markRead] = useMutation(MARK_NOTIFICATION_READ);
  const [markAll] = useMutation(MARK_ALL_NOTIFICATIONS_READ);

  // live refresh when a push arrives over the socket
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
  const unread: number = data?.notifications?.unread ?? 0;

  const clickItem = async (n: any) => {
    if (!n.isRead) {
      try {
        await markRead({ variables: { id: n.id } });
        refetch();
      } catch {
        /* non fatal */
      }
    }
    const link = n.data?.orderId ? `/orders/${n.data.orderId}` : n.data?.link;
    if (link && typeof window !== 'undefined') window.location.href = link;
  };

  return (
    <div className="container max-w-2xl py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bell className="h-6 w-6 text-brand" /> Notifications
          {unread > 0 && <Badge className="bg-brand">{unread} new</Badge>}
        </h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={onlyUnread ? 'default' : 'outline'}
            onClick={() => { setOnlyUnread((v) => !v); setPage(1); }}
          >
            Unread only
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={unread === 0}
            onClick={async () => {
              try {
                await markAll();
                toast.success('All marked as read');
                refetch();
              } catch {
                toast.error('Could not update');
              }
            }}
          >
            <CheckCheck className="mr-1 h-4 w-4" /> Mark all read
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <BellRing className="h-8 w-8" />
          <p>{onlyUnread ? 'No unread notifications.' : 'Nothing here yet.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <Card
              key={n.id}
              className={'cursor-pointer transition-colors hover:bg-accent ' + (!n.isRead ? 'border-brand/40' : '')}
            >
              <CardContent className="flex items-start gap-3 p-4" onClick={() => clickItem(n)}>
                <div className={'mt-1 h-2 w-2 shrink-0 rounded-full ' + (n.isRead ? 'bg-transparent' : 'bg-brand')} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.createdAt)}</p>
                </div>
                {n.category && <Badge variant="outline" className="shrink-0 text-xs">{n.category.replace(/_/g, ' ')}</Badge>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</Button>
        </div>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGuard>
      <NotificationsInner />
    </AuthGuard>
  );
}
