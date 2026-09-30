'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { CheckCircle2, Ban, Star, Search, XCircle } from 'lucide-react';
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
import { ALL_RESTAURANTS } from '@/lib/graphql/dashboards';
import { ADMIN_SET_RESTAURANT_STATUS, ADMIN_FEATURE_RESTAURANT } from '@/lib/graphql/mutations';
import { formatDateTime } from '@/lib/date';

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'border-brand text-brand',
  PENDING_APPROVAL: 'border-yellow-500 bg-yellow-500/10 text-yellow-700',
  REJECTED: 'border-destructive bg-destructive/10 text-destructive',
  SUSPENDED: 'border-gray-500 bg-gray-500/10 text-gray-700',
};

function setStatusText(text: string) {
  return text.replace(/_/g, ' ').toLowerCase();
}

function RestaurantRow({ r, onChanged }: { r: any; onChanged: () => void }) {
  const [confirm, setConfirm] = useState<{ status: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [setStatus] = useMutation(ADMIN_SET_RESTAURANT_STATUS);
  const [feature] = useMutation(ADMIN_FEATURE_RESTAURANT);

  const apply = async (status: string, why?: string) => {
    setBusy(true);
    try {
      await setStatus({ variables: { id: r.id, status, ...(why ? { reason: why } : {}) } });
      toast.success(`${r.name} → ${setStatusText(status)}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Action failed');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium">{r.name}</p>
        <p className="text-xs text-muted-foreground">
          {r.owner?.fullName} · {r.owner?.email}
        </p>
        <p className="text-xs text-muted-foreground">
          {r.branches?.length ?? 0} branches · joined {formatDateTime(r.createdAt)}
        </p>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={STATUS_TONE[r.status] ?? ''}>{setStatusText(r.status)}</Badge>
        {r.isFeatured && <Badge className="ml-1 bg-brand/10 text-brand" variant="outline">featured</Badge>}
        {r.status === 'REJECTED' && r.rejectionReason && (
          <p className="mt-1 max-w-56 text-xs text-muted-foreground">“{r.rejectionReason}”</p>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        ★ {Number(r.avgRating ?? 0).toFixed(1)}
        <span className="text-muted-foreground"> · {r.totalOrders ?? 0} orders</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {r.status === 'PENDING_APPROVAL' && (
            <>
              <Button size="sm" className="h-7 bg-brand text-xs hover:bg-brand-dark" disabled={busy} onClick={() => apply('APPROVED')}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => setConfirm({ status: 'REJECTED' })}>
                <XCircle className="mr-1 h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
          {r.status === 'APPROVED' && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                onClick={async () => {
                  try {
                    await feature({ variables: { id: r.id, featured: !r.isFeatured } });
                    toast.success(r.isFeatured ? 'Unfeatured' : 'Featured on the home page');
                    onChanged();
                  } catch (e: any) {
                    toast.error(e?.message?.replace('GraphQL error: ', '') || 'Action failed');
                  }
                }}>
                <Star className="mr-1 h-3.5 w-3.5" /> {r.isFeatured ? 'Unfeature' : 'Feature'}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={busy}
                onClick={() => setConfirm({ status: 'SUSPENDED' })}>
                <Ban className="mr-1 h-3.5 w-3.5" /> Suspend
              </Button>
            </>
          )}
          {(r.status === 'SUSPENDED' || r.status === 'REJECTED') && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={() => apply('APPROVED')}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Re-approve
            </Button>
          )}
        </div>
      </td>

      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirm?.status === 'REJECTED' ? 'Reject application' : 'Suspend restaurant'} — {r.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rsn">Reason (sent to the owner)</Label>
            <Textarea id="rsn" rows={3} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={confirm?.status === 'REJECTED' ? 'e.g. Food-safety certificate is missing or unreadable.' : 'e.g. Repeated order cancellations.'} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={busy || reason.trim().length < 4} onClick={() => apply(confirm!.status, reason.trim())}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </tr>
  );
}

function RestaurantsAdmin() {
  const [status, setStatus] = useState<string>('PENDING_APPROVAL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useQuery(ALL_RESTAURANTS, {
    variables: {
      ...(status !== 'ALL' ? { status } : {}),
      ...(search ? { search } : {}),
      page,
      limit: 20,
    },
    fetchPolicy: 'cache-and-network',
  });
  const rows: any[] = data?.adminRestaurants?.items ?? [];
  const pages = data?.adminRestaurants?.pages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(v) => { setStatus(v); setPage(1); }}
        >
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending approval</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="SUSPENDED">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(searchInput.trim());
            setPage(1);
          }}
        >
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name…"
            className="w-52"
          />
          <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              No restaurants match this filter{search ? ` for “${search}”` : ''}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">Restaurant</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Performance</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => <RestaurantRow key={r.id} r={r} onChanged={() => refetch()} />)}
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

export default function AdminRestaurantsPage() {
  return (
    <AdminShell title="Restaurants" subtitle="Review applications and manage partners">
      <RestaurantsAdmin />
    </AdminShell>
  );
}
