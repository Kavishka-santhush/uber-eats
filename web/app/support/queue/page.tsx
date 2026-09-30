'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { ChevronLeft, ChevronRight, Search, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { TICKETS, TICKET_DETAIL } from '@/lib/graphql/dashboards';
import { REPLY_TICKET, RESOLVE_TICKET, ASSIGN_TICKET } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';

const STATUS_TONE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  OPEN: 'destructive',
  IN_PROGRESS: 'default',
  ESCALATED: 'destructive',
  RESOLVED: 'secondary',
  CLOSED: 'outline',
};

const CATEGORY_LABEL: Record<string, string> = {
  ORDER_ISSUE: 'Order',
  PAYMENT_ISSUE: 'Payment',
  DELIVERY_ISSUE: 'Delivery',
  ACCOUNT_ISSUE: 'Account',
  RESTAURANT_ISSUE: 'Restaurant',
  DRIVER_ISSUE: 'Driver',
  OTHER: 'Other',
};

function err(e: any, fallback: string) {
  return e?.message?.replace('GraphQL error: ', '') || fallback;
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function ResolveDialog({
  open,
  onClose,
  ticketId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  ticketId: string | null;
  onDone: () => void;
}) {
  const [resolve, { loading }] = useMutation(RESOLVE_TICKET);
  const [status, setStatus] = useState('RESOLVED');
  const [resolution, setResolution] = useState('');
  const [refund, setRefund] = useState('');
  const [credit, setCredit] = useState('');

  useEffect(() => {
    if (open) { setStatus('RESOLVED'); setResolution(''); setRefund(''); setCredit(''); }
  }, [open]);

  const submit = async () => {
    if (!ticketId) return;
    if (!resolution.trim()) return toast.error('Write a short resolution note first');
    const num = (v: string) => (v.trim() ? Number(v) : undefined);
    const refundAmount = num(refund);
    const walletCredit = num(credit);
    if (refundAmount !== undefined && (!Number.isFinite(refundAmount) || refundAmount < 0)) return toast.error('Refund must be a positive number');
    if (walletCredit !== undefined && (!Number.isFinite(walletCredit) || walletCredit < 0)) return toast.error('Wallet credit must be a positive number');
    try {
      await resolve({
        variables: {
          input: {
            ticketId,
            status,
            resolution: resolution.trim(),
            ...(refundAmount !== undefined ? { refundAmount } : {}),
            ...(walletCredit !== undefined ? { walletCredit } : {}),
          },
        },
      });
      toast.success(`Ticket ${status.toLowerCase()}`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(err(e, 'Could not resolve the ticket'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Resolve ticket</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Final status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="ESCALATED">Escalated</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="res-note">Resolution note (sent to the customer)</Label>
            <Textarea id="res-note" rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="We refunded the delivery fee…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="res-refund">Refund amount ($)</Label>
              <Input id="res-refund" type="number" min="0" step="0.01" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="full order if linked" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-credit">Wallet credit ($)</Label>
              <Input id="res-credit" type="number" min="0" step="0.01" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="goodwill" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A refund refunds the linked order (partial when less than the total); wallet credit is added to the creator&apos;s balance.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-brand hover:bg-brand-dark" disabled={loading} onClick={submit}>Apply resolution</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TicketDetail({ id, onRefreshList }: { id: string; onRefreshList: () => void }) {
  const me = useAuth((s: any) => s.user);
  const role = me?.role;
  const { data, loading, refetch } = useQuery(TICKET_DETAIL, { variables: { id } });
  const t = data?.ticket;

  const [reply, setReply] = useState('');
  const [sendReply, { loading: replying }] = useMutation(REPLY_TICKET);
  const [assign, { loading: assigning }] = useMutation(ASSIGN_TICKET);
  const [resolveOpen, setResolveOpen] = useState(false);

  const refreshAll = () => { refetch(); onRefreshList(); };

  const submitReply = async () => {
    if (!reply.trim()) return;
    try {
      await sendReply({ variables: { ticketId: id, body: reply.trim() } });
      setReply('');
      refreshAll();
    } catch (e: any) {
      toast.error(err(e, 'Could not post the reply'));
    }
  };

  const claim = async () => {
    if (!me?.id) return;
    try {
      await assign({ variables: { ticketId: id, agentId: me.id } });
      toast.success('Ticket assigned to you');
      refreshAll();
    } catch (e: any) {
      toast.error(err(e, 'Could not claim the ticket'));
    }
  };

  if (loading && !t) {
    return <div className="space-y-3 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>;
  }
  if (!t) return <p className="p-6 text-center text-sm text-muted-foreground">Ticket not found.</p>;

  const canClaim = ['SUPER_ADMIN', 'ADMIN'].includes(role) && !t.assignedTo;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_TONE[t.status] ?? 'outline'} className="text-xs">{t.status.replaceAll('_', ' ')}</Badge>
          <Badge variant="outline" className="text-xs">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
          {t.aiCategory && <Badge variant="secondary" className="text-xs">AI: {t.aiCategory}</Badge>}
          <span className="ml-auto text-xs text-muted-foreground">P{t.priority} · {fmtDate(t.createdAt)}</span>
        </div>
        <h3 className="mt-2 text-sm font-bold">{t.number} — {t.subject}</h3>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{t.description}</p>
        <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          <p>From <span className="font-medium text-foreground">{t.creator?.fullName}</span> ({t.creator?.email}{t.creator?.phone ? ` · ${t.creator.phone}` : ''})</p>
          {t.order && <p>Order {t.order.orderNumber} · ${Number(t.order.total).toFixed(2)} · {t.order.status.replaceAll('_', ' ')}{t.order.branch?.name ? ` · ${t.order.branch.name}` : ''}</p>}
          <p>Assigned to: {t.assignedTo?.fullName ?? 'nobody'}</p>
          {t.resolution && <p className="text-foreground">Resolution: {t.resolution}{t.refundAmount ? ` · refund $${Number(t.refundAmount).toFixed(2)}` : ''}{t.walletCredit ? ` · credit $${Number(t.walletCredit).toFixed(2)}` : ''}</p>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {canClaim && (
            <Button size="sm" variant="outline" disabled={assigning} onClick={claim}>
              <UserCheck className="mr-1 h-3.5 w-3.5" /> {assigning ? 'Claiming…' : 'Assign to me'}
            </Button>
          )}
          <Button size="sm" className="bg-brand hover:bg-brand-dark" onClick={() => setResolveOpen(true)}>
            Resolve / escalate
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {(t.messages ?? []).map((m: any) => (
          <div key={m.id} className={'max-w-[85%] rounded-xl border px-3 py-2 text-sm ' + (m.isStaff ? 'ml-auto bg-brand/5' : 'bg-card')}>
            <p className="text-xs font-semibold">
              {m.author?.fullName ?? 'Unknown'}
              {m.isStaff && <span className="ml-1 rounded bg-brand px-1 py-0.5 text-[10px] font-bold text-white">STAFF</span>}
            </p>
            <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{fmtDate(m.createdAt)}</p>
          </div>
        ))}
        {(t.messages ?? []).length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">No messages yet — start the conversation below.</p>
        )}
      </div>

      {!['RESOLVED', 'CLOSED'].includes(t.status) && (
        <div className="flex items-end gap-2 border-t p-3">
          <Textarea
            rows={2}
            className="flex-1"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to the customer…"
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitReply(); }}
          />
          <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={replying || !reply.trim()} onClick={submitReply}>
            {replying ? 'Sending…' : 'Send'}
          </Button>
        </div>
      )}

      <ResolveDialog open={resolveOpen} onClose={() => setResolveOpen(false)} ticketId={id} onDone={refreshAll} />
    </div>
  );
}

function QueueView() {
  const [status, setStatus] = useState('OPEN');
  const [mine, setMine] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const variables = {
    ...(status !== 'ALL' ? { status } : {}),
    ...(mine ? { assignedToMe: true } : {}),
    ...(search ? { search } : {}),
    page,
    limit: 25,
  };
  const { data, loading, refetch } = useQuery(TICKETS, { variables });
  const page_ = data?.tickets;
  const tickets: any[] = page_?.items ?? [];

  const items = useMemo(() => tickets, [tickets]);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Card className="flex flex-col">
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Ticket queue</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="ESCALATED">Escalated</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
                <SelectItem value="ALL">All statuses</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant={mine ? 'default' : 'outline'} className="h-9 text-xs" onClick={() => { setMine((m) => !m); setPage(1); }}>
              Mine only
            </Button>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}
            >
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="subject / # number" className="h-9 w-36 text-xs" />
              <Button type="submit" size="sm" variant="ghost" className="h-9 px-2"><Search className="h-4 w-4" /></Button>
            </form>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading && items.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No tickets match this filter.</p>
          ) : (
            <ul className="max-h-[460px] divide-y overflow-y-auto">
              {items.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={'w-full px-4 py-3 text-left transition-colors hover:bg-accent ' + (selectedId === t.id ? 'bg-accent' : '')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold">{t.number}</span>
                      <Badge variant={STATUS_TONE[t.status] ?? 'outline'} className="text-[10px]">{t.status.replaceAll('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[t.category] ?? t.category}</Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground">P{t.priority}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.creator?.fullName}
                      {t.order ? ` · order ${t.order.orderNumber}` : ''}
                      {t.assignedTo ? ` · → ${t.assignedTo.fullName}` : ' · unassigned'}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{page_?.total ?? 0} tickets · page {page_?.page ?? 1} / {Math.max(1, page_?.pages ?? 1)}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={page >= (page_?.pages ?? 1)} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[520px]">
        <CardContent className="p-0">
          {selectedId ? (
            <TicketDetail key={selectedId} id={selectedId} onRefreshList={refetch} />
          ) : (
            <div className="flex h-full min-h-[520px] items-center justify-center p-6">
              <p className="max-w-xs text-center text-sm text-muted-foreground">Select a ticket on the left to read the conversation, reply, claim and resolve it.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SupportQueuePage() {
  return (
    <AdminShell roles={['SUPER_ADMIN', 'ADMIN', 'SUPPORT_AGENT']} title="Support queue" subtitle="Answer, claim and resolve customer tickets">
      <QueueView />
    </AdminShell>
  );
}
