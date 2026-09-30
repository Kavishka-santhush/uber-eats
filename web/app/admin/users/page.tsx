'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Search, ShieldAlert, CheckCircle2, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ALL_USERS } from '@/lib/graphql/dashboards';
import { ADMIN_SET_USER_STATUS } from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { formatDateTime } from '@/lib/date';

const ROLES = ['CUSTOMER', 'DRIVER', 'RESTAURANT_OWNER', 'RESTAURANT_STAFF', 'SUPPORT_AGENT', 'OPS_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'border-brand text-brand',
  PENDING: 'border-yellow-500 bg-yellow-500/10 text-yellow-700',
  SUSPENDED: 'border-gray-500 bg-gray-500/10 text-gray-700',
  BANNED: 'border-destructive bg-destructive/10 text-destructive',
};

function UserRow({ u, onChanged }: { u: any; onChanged: () => void }) {
  const me = useAuth((s) => s.user);
  const [setStatus, { loading }] = useMutation(ADMIN_SET_USER_STATUS);
  const isSelf = me?.id === u.id;

  const act = async (status: string) => {
    try {
      await setStatus({ variables: { id: u.id, status } });
      toast.success(`${u.fullName} → ${status.toLowerCase()}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Action failed');
    }
  };

  return (
    <tr>
      <td className="px-4 py-3">
        <p className="font-medium">
          {u.fullName}
          {isSelf && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
        </p>
        <p className="text-xs text-muted-foreground">{u.email}</p>
      </td>
      <td className="px-4 py-3 text-sm">{u.role.replace(/_/g, ' ')}</td>
      <td className="px-4 py-3">
        <Badge variant="outline" className={STATUS_TONE[u.status] ?? ''}>{u.status.toLowerCase()}</Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDateTime(u.createdAt)}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1.5">
          {u.status !== 'ACTIVE' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading || isSelf} onClick={() => act('ACTIVE')}>
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Activate
            </Button>
          )}
          {u.status === 'ACTIVE' && (
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={loading || isSelf} onClick={() => act('SUSPENDED')}>
              <Ban className="mr-1 h-3.5 w-3.5" /> Suspend
            </Button>
          )}
          {u.status !== 'BANNED' && (
            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={loading || isSelf} onClick={() => act('BANNED')}>
              <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Ban
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function UsersAdmin() {
  const [role, setRole] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, loading, refetch } = useQuery(ALL_USERS, {
    variables: {
      ...(role !== 'ALL' ? { role } : {}),
      ...(status !== 'ALL' ? { status } : {}),
      ...(search ? { search } : {}),
      page,
      limit: 25,
    },
    fetchPolicy: 'cache-and-network',
  });
  const rows: any[] = data?.users?.items ?? [];
  const pages = data?.users?.pages ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            {ROLES.map((r) => <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {['ACTIVE', 'PENDING', 'SUSPENDED', 'BANNED'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
          <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Name or email…" className="w-52" />
          <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
        </form>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading && rows.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">No users match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2">User</th>
                    <th className="px-4 py-2">Role</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Joined</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((u) => <UserRow key={u.id} u={u} onChanged={() => refetch()} />)}
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

export default function AdminUsersPage() {
  return (
    <AdminShell title="Users" subtitle="Search and manage every account on the platform">
      <UsersAdmin />
    </AdminShell>
  );
}
