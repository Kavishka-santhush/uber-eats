'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CheckCircle2, ChefHat, Clock3, Inbox, PackageCheck, Truck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { RestaurantPage, type OwnedBranch } from '@/components/restaurant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { BRANCH_ORDERS } from '@/lib/graphql/dashboards';
import {
  ACCEPT_ORDER, REJECT_ORDER, SET_ORDER_PREPARING, MARK_ORDER_READY,
} from '@/lib/graphql/mutations';
import { getSocket, joinBranch, leaveBranch } from '@/lib/socket';
import { formatMoney } from '@/lib/utils';
import { formatTime, timeAgo } from '@/lib/date';

type TabKey = 'NEW' | 'KITCHEN' | 'READY' | 'ON' | 'DONE';

const TABS: { key: TabKey; label: string; statuses: string[] }[] = [
  { key: 'NEW', label: 'New', statuses: ['PLACED'] },
  { key: 'KITCHEN', label: 'In kitchen', statuses: ['CONFIRMED', 'PREPARING'] },
  { key: 'READY', label: 'Ready for pickup', statuses: ['READY_FOR_PICKUP'] },
  { key: 'ON', label: 'On the way', statuses: ['DRIVER_ASSIGNED', 'DRIVER_EN_ROUTE_TO_RESTAURANT', 'PICKED_UP', 'OUT_FOR_DELIVERY'] },
  { key: 'DONE', label: 'Completed', statuses: ['DELIVERED'] },
];

const LS_BRANCH = 'qb_restaurant_branch_id';

function OrderCard({ order }: { order: any }) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [prepMinutes, setPrepMinutes] = useState('');
  const [busy, setBusy] = useState(false);

  const [acceptMut] = useMutation(ACCEPT_ORDER);
  const [prepareMut] = useMutation(SET_ORDER_PREPARING);
  const [readyMut] = useMutation(MARK_ORDER_READY);
  const [rejectMut] = useMutation(REJECT_ORDER);

  const run = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      return true;
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Action failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  let actions: ReactNode;
  switch (order.status) {
    case 'PLACED':
      actions = (
        <>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => setRejectOpen(true)}>
            <XCircle className="mr-1 h-4 w-4" /> Reject
          </Button>
          <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={busy} onClick={() => setAcceptOpen(true)}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Accept
          </Button>
        </>
      );
      break;
    case 'CONFIRMED':
      actions = (
        <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={busy}
          onClick={() => run(() => prepareMut({ variables: { id: order.id } }), 'Started preparing')}>
          <ChefHat className="mr-1 h-4 w-4" /> Start preparing
        </Button>
      );
      break;
    case 'PREPARING':
      actions = (
        <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={busy}
          onClick={() => run(() => readyMut({ variables: { id: order.id } }), 'Marked as ready for pickup')}>
          <PackageCheck className="mr-1 h-4 w-4" /> Mark ready
        </Button>
      );
      break;
    case 'READY_FOR_PICKUP':
      actions = (
        <Badge variant="outline" className="border-yellow-500 bg-yellow-500/10 text-yellow-700">
          <Clock3 className="mr-1 h-3.5 w-3.5" /> Waiting for driver
        </Badge>
      );
      break;
    case 'DELIVERED':
      actions = (
        <Badge variant="outline" className="border-brand text-brand">
          Delivered {order.deliveredAt ? formatTime(order.deliveredAt) : ''}
        </Badge>
      );
      break;
    case 'CANCELLED':
      actions = <Badge variant="outline">Cancelled</Badge>;
      break;
    default:
      actions = (
        <Badge variant="outline">
          <Truck className="mr-1 h-3.5 w-3.5" /> {order.status.replace(/_/g, ' ')}
        </Badge>
      );
  }

  async function runAccept(mins?: number) {
    return run(
      () => acceptMut({ variables: { id: order.id, ...(mins ? { prepMinutes: mins } : {}) } }),
      'Order accepted',
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-bold">
              #{order.orderNumber}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {timeAgo(order.createdAt)} · placed {formatTime(order.createdAt)}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              {order.customer?.fullName}
              {order.customer?.phone ? ` · ${order.customer.phone}` : ''}
              {order.address?.label ? ` · ${order.address.label}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">{order.address?.line1}</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{formatMoney(order.total)}</p>
            <Badge variant="outline" className="mt-1 text-xs">
              {order.paymentMethod === 'CASH' ? 'CASH ON DELIVERY' : order.paymentMethod}
              {' · '}
              {order.paymentStatus}
            </Badge>
          </div>
        </div>

        <ul className="mt-3 space-y-0.5 rounded-lg bg-muted/50 p-2.5 text-sm">
          {(order.items ?? []).map((it: any) => (
            <li key={it.id} className="flex justify-between gap-3">
              <span>
                <span className="font-medium">{it.quantity}×</span> {it.nameSnapshot}
                {it.specialInstructions ? (
                  <span className="text-xs italic text-muted-foreground"> — {it.specialInstructions}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-muted-foreground">{formatMoney(it.lineTotal)}</span>
            </li>
          ))}
        </ul>
        {order.specialInstructions && (
          <p className="mt-2 rounded-md bg-yellow-500/10 p-2 text-xs font-medium text-yellow-800">
            Note to kitchen: {order.specialInstructions}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {actions}
          {order.estimatedDeliveryAt && (
            <span className="text-xs text-muted-foreground">ETA {formatTime(order.estimatedDeliveryAt)}</span>
          )}
        </div>

        {/* accept with optional prep override */}
        <Dialog open={acceptOpen} onOpenChange={setAcceptOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Accept order #{order.orderNumber}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="prep">Preparation time (optional override, minutes)</Label>
              <Input
                id="prep"
                type="number"
                min={5}
                max={120}
                value={prepMinutes}
                onChange={(e) => setPrepMinutes(e.target.value)}
                placeholder="Uses the branch default if empty"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAcceptOpen(false)}>Cancel</Button>
              <Button
                className="bg-brand hover:bg-brand-dark"
                disabled={busy}
                onClick={async () => {
                  const mins = prepMinutes ? Math.max(5, Number(prepMinutes)) : undefined;
                  const ok = await runAccept(mins);
                  if (ok) setAcceptOpen(false);
                }}
              >
                Accept order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* reject with mandatory reason */}
        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Reject order #{order.orderNumber}</DialogTitle></DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (shared with the customer)</Label>
              <Textarea
                id="reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. We ran out of a key ingredient and cannot fulfil this order."
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={busy || reason.trim().length < 4}
                onClick={async () => {
                  const ok = await run(
                    () => rejectMut({ variables: { id: order.id, reason: reason.trim() } }),
                    'Order rejected — the customer was notified',
                  );
                  if (ok) setRejectOpen(false);
                }}
              >
                Reject order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/** One status tab of the board; only the visible tab is kept mounted+subscribed. */
function OrderTabQuery({ branchId, tab }: { branchId: string; tab: (typeof TABS)[number] }) {
  // Completed orders are terminal, so request them explicitly by status.
  // Every other tab reads the default "active" set and filters client-side
  // (some tabs span multiple statuses the server filter can't express at once).
  const variables =
    tab.key === 'DONE'
      ? { branchId, status: 'DELIVERED', page: 1, limit: 50 }
      : { branchId, page: 1, limit: 50 };
  const { data, loading, refetch } = useQuery(BRANCH_ORDERS, {
    variables,
    skip: !branchId,
    fetchPolicy: 'cache-and-network',
  });

  // live refresh: any order:status event for this branch reloads the tab
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !branchId) return;
    const handler = (payload: any) => {
      if (payload?.branchId && payload.branchId !== branchId) return;
      refetch();
    };
    socket.on('order:status', handler);
    return () => {
      socket.off('order:status', handler);
    };
  }, [branchId, refetch]);

  const all: any[] = data?.branchOrders?.items ?? [];
  const orders = all.filter((o) => tab.statuses.includes(o.status));

  return (
    <div className="space-y-3">
      {loading && orders.length === 0 && (
        Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)
      )}
      {!loading && orders.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-14 text-center text-muted-foreground">
          <Inbox className="h-7 w-7" />
          <p className="text-sm">{tab.key === 'DONE' ? 'No completed orders yet.' : "You're all caught up."}</p>
        </div>
      )}
      {orders.map((o: any) => <OrderCard key={o.id} order={o} />)}
    </div>
  );
}

function OrdersBoard({ branches }: { branches: OwnedBranch[] }) {
  const [branchId, setBranchId] = useState<string>('');
  const [tab, setTab] = useState<TabKey>('NEW');

  // resolve branch: first available (branches arrive from the shell context)
  useEffect(() => {
    if (!branches.length) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LS_BRANCH);
    } catch {
      /* private mode */
    }
    const valid = branches.some((b) => b.id === stored) ? stored! : branches[0].id;
    setBranchId(valid);
  }, [branches]);

  // join the branch socket room while the board is mounted
  useEffect(() => {
    if (!branchId) return;
    joinBranch(branchId);
    return () => leaveBranch(branchId);
  }, [branchId]);

  const branch = useMemo(() => branches.find((b) => b.id === branchId), [branches, branchId]);

  if (!branches.length) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        No branches available for this account yet.
      </p>
    );
  }

  const activeTab = TABS.find((t) => t.key === tab)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={branchId}
          onValueChange={(v) => {
            setBranchId(v);
            try {
              window.localStorage.setItem(LS_BRANCH, v);
            } catch {
              /* ignore */
            }
          }}
        >
          <SelectTrigger className="w-60"><SelectValue placeholder="Choose branch" /></SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {branch && (
          <Badge variant="outline" className={branch.status === 'OPEN' ? 'border-brand text-brand' : ''}>
            Store is {(branch.status ?? 'CLOSED').toLowerCase()}
          </Badge>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (tab === t.key ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <OrderTabQuery key={`${branchId}:${tab}`} branchId={branchId} tab={activeTab} />
    </div>
  );
}

export default function RestaurantOrdersPage() {
  return (
    <RestaurantPage>{(ctx) => <OrdersBoard branches={ctx.branches} />}</RestaurantPage>
  );
}
