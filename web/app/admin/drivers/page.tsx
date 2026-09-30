'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CheckCircle2, Ban, Search, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
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
import { ALL_DRIVERS } from '@/lib/graphql/dashboards';
import { ADMIN_SET_DRIVER_APPROVAL, ADMIN_SET_DRIVER_SUSPENSION } from '@/lib/graphql/mutations';
import { formatMoney } from '@/lib/utils';

const TONE: Record<string, string> = {
  APPROVED: 'border-brand text-brand',
  PENDING_APPROVAL: 'border-yellow-500 bg-yellow-500/10 text-yellow-700',
  REJECTED: 'border-destructive bg-destructive/10 text-destructive',
  SUSPENDED: 'border-gray-500 bg-gray-500/10 text-gray-700',
};

function DriverRow({ d, onChanged }: { d: any; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<{ kind: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [approval] = useMutation(ADMIN_SET_DRIVER_APPROVAL);
  const [suspension] = useMutation(ADMIN_SET_DRIVER_SUSPENSION);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Action failed');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const approve = () => act(() => approval({ variables: { userId: d.userId, status: 'APPROVED' } }), `${d.user?.fullName} approved`);
  const reject = () => act(() => approval({ variables: { userId: d.userId, status: 'REJECTED', reason } }), `${d.user?.fullName} rejected`);
  const suspend = () => act(() => suspension({ variables: { userId: d.userId, suspended: true, reason } }), `${d.user?.fullName} suspended`);
  const reinstate = () => act(() => suspension({ variables: { userId: d.userId, suspended: false } }), `${d.user?.fullName} reinstated`);

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium">{d.user?.fullName}</p>
        <p className="text-xs text-muted-foreground">{d.user?.email} · {d.vehicleType ?? 'n/a'}</p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={TONE[d.approvalStatus] ?? ''}>{(d.approvalStatus || '').replace(/_/g, ' ').toLowerCase()}</Badge>
        {d.isSuspended && <Badge variant="outline" className="ml-1 border-destructive text-destructive">suspended</Badge>}
      </td>
      <td className="px-4 py-3 text-sm">
        <p>★ {Number(d.avgRating ?? 0).toFixed(1)} · {d.totalDeliveries ?? 0} drops</p>
        <p className="text-xs text-muted-foreground">Balance {formatMoney(d.earningsBalance ?? 0)} · {d.availability}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {d.approvalStatus === 'PENDING_APPROVAL' && (
            <>
              <Button size="sm" className="h-7 bg-brand text-xs hover:bg-brand-dark" disabled={busy} onClick={approve}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setConfirm({ kind: 'reject' })}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
          {d.approvalStatus === 'APPROVED' && !d.isSuspended && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={busy} onClick={() => setConfirm({ kind: 'suspend' })}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Suspend
            </Button>
          )}
          {d.isSuspended && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={reinstate}>
              <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Reinstate
            </Button>
          )}
          {d.approvalStatus === 'REJECTED' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={approve}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
            </Button>
          )}
        </div>
      </td>

      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{confirm?.kind === 'reject' ? 'Reject application' : 'Suspend driver'} — {d.user?.fullName}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="dr">Reason</Label>
            <Textarea id="dr" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Shared with the driver…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 4} onClick={confirm?.kind === 'reject' ? reject : suspend}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </tr>
  );
}

function DriversAdmin() {
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useQuery(ALL_DRIVERS, {
    variables: { ...(status !== 'ALL' ? { status } : {}), ...(search ? { search } : {}), page, limit: 20 },
    fetchPolicy: 'cache-and-network',
  });
  const rows: any[] = data?.drivers?.items ?? [];
  const pages = data?.drivers?.pages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending approval</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name, email or phone…" className="w-56" />
          <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No drivers match this filter.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Driver</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Performance</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((d) => <DriverRow key={d.userId} d={d} onChanged={() => refetch()} />)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

export default function AdminDriversPage() {
  return (
    <AdminShell title="Drivers" subtitle="Approve applications and manage the fleet">
      <DriversAdmin />
    </AdminShell>
  );
}
