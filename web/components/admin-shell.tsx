'use client';

import { type ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { StaffNav } from '@/components/staff-nav';
import { type Role } from '@/lib/auth/store';

/** Guarded staff page: restricts to the given roles and renders the shared rail. */
export function AdminShell({
  children,
  roles = ['SUPER_ADMIN', 'ADMIN'],
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  roles?: Role[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <AuthGuard roles={roles}>
      <div className="container max-w-6xl space-y-5 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions}
        </div>
        <StaffNav />
        {children}
      </div>
    </AuthGuard>
  );
}

/** Tiny dependency-free horizontal bar chart for dashboard series. */
export function MiniBars({
  points,
  money = false,
  emptyLabel = 'No data yet',
}: {
  points: { label: string; value: number | string }[];
  money?: boolean;
  emptyLabel?: string;
}) {
  const rows = (points ?? []).map((p) => ({ label: p.label, value: Number(p.value) || 0 }));
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 truncate text-muted-foreground" title={r.label}>
            {r.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-brand/70" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
          <span className="w-20 shrink-0 text-right font-medium">
            {money ? `$${r.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : r.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Compact labelled statistic tile. */
export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
