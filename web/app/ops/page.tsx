'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { AlertTriangle, Navigation, RefreshCw, Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell, StatTile } from '@/components/admin-shell';
import { MapView, type MapMarker } from '@/components/map-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ACTIVE_DELIVERIES, ONLINE_DRIVERS } from '@/lib/graphql/dashboards';
import { ADMIN_REASSIGN_DELIVERY } from '@/lib/graphql/mutations';
import { getSocket } from '@/lib/socket';
import { useAuth } from '@/lib/auth/store';

/** Delivery lifecycle states we care about on the live board. */
const STATUS_TONE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRIVER_ASSIGNED: 'outline',
  EN_ROUTE_TO_PICKUP: 'secondary',
  PICKED_UP: 'secondary',
  EN_ROUTE_TO_DROPOFF: 'default',
};

const DEFAULT_CENTER = { lat: 40.7128, lng: -74.006 };

function err(e: any, fallback: string) {
  return e?.message?.replace('GraphQL error: ', '') || fallback;
}

interface LiveLoc {
  lat: number | string;
  lng: number | string;
  recordedAt?: string;
}

interface Delivery {
  id: string;
  status: string;
  etaMinutes?: number | null;
  pickupLat: number | string;
  pickupLng: number | string;
  dropoffLat: number | string;
  dropoffLng: number | string;
  routePolyline?: string | null;
  liveLocations?: LiveLoc[];
  order: { id: string; orderNumber: string; status: string; total: number | string; branch?: { name?: string } | null; customer?: { fullName?: string } | null };
  driver?: { userId: string; avgRating?: number | string | null; lastLat?: number | string | null; lastLng?: number | string | null; user?: { fullName?: string } | null } | null;
}

interface OnlineDriver {
  userId: string;
  availability: string;
  lastLat?: number | string | null;
  lastLng?: number | string | null;
  avgRating?: number | string | null;
  user?: { fullName?: string } | null;
}

function ReassignDialog({
  open,
  onClose,
  delivery,
  freeDrivers,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  delivery: Delivery | null;
  freeDrivers: OnlineDriver[];
  onDone: () => void;
}) {
  const [reassign] = useMutation(ADMIN_REASSIGN_DELIVERY);
  const [picked, setPicked] = useState('__unassign__');

  useEffect(() => {
    if (open) setPicked('__unassign__');
  }, [open, delivery]);

  const submit = async () => {
    if (!delivery) return;
    try {
      await reassign({
        variables: {
          deliveryId: delivery.id,
          ...(picked !== '__unassign__' ? { toDriverId: picked } : {}),
        },
      });
      toast.success(picked === '__unassign__' ? 'Driver unassigned — order re-broadcast' : 'Delivery reassigned');
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(err(e, 'Could not reassign the delivery'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign delivery</DialogTitle>
        </DialogHeader>
        {delivery && (
          <p className="text-sm text-muted-foreground">
            Order <span className="font-semibold text-foreground">{delivery.order.orderNumber}</span> —{' '}
            {delivery.driver?.user?.fullName ? `currently ${delivery.driver.user.fullName}` : 'no driver yet'}
          </p>
        )}
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger><SelectValue placeholder="Pick a driver" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__unassign__">Unassign &amp; re-broadcast to all online drivers</SelectItem>
            {freeDrivers.map((d) => (
              <SelectItem key={d.userId} value={d.userId}>
                {d.user?.fullName ?? d.userId} · ★{Number(d.avgRating ?? 0).toFixed(2)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {freeDrivers.length === 0 && picked !== '__unassign__' && (
          <p className="text-xs text-muted-foreground">No free online drivers — unassign and wait for an accept.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-brand hover:bg-brand-dark" onClick={submit}>Confirm</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpsView() {
  const role = useAuth((s: any) => s.user?.role);
  const { data, loading, refetch } = useQuery(ACTIVE_DELIVERIES, { pollInterval: 20_000 });
  const { data: driversData } = useQuery(ONLINE_DRIVERS, { pollInterval: 30_000 });

  const [deviation, setDeviation] = useState<{ orderId: string; deliveryId: string } | null>(null);
  const [delay, setDelay] = useState<{ orderNumber: string; minutesLate: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reassignFor, setReassignFor] = useState<Delivery | null>(null);

  // Realtime: the server auto-joins OPS staff to the "ops" room; we just listen.
  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    const onOrder = () => refetch();
    const onLocation = () => refetch();
    const onDeviation = (p: any) => {
      setDeviation({ orderId: p?.orderId ?? '', deliveryId: p?.deliveryId ?? '' });
      refetch();
    };
    const onDelay = (p: any) => {
      const first = Array.isArray(p) ? p[0] : p;
      if (first) setDelay({ orderNumber: first.orderNumber ?? 'order', minutesLate: first.minutesLate ?? 0 });
    };
    s.on('ops:order_update', onOrder);
    s.on('ops:driver_location', onLocation);
    s.on('ops:route_deviation', onDeviation);
    s.on('ops:delay_alert', onDelay);
    return () => {
      s.off('ops:order_update', onOrder);
      s.off('ops:driver_location', onLocation);
      s.off('ops:route_deviation', onDeviation);
      s.off('ops:delay_alert', onDelay);
    };
  }, [refetch]);

  const deliveries: Delivery[] = useMemo(() => data?.activeDeliveries ?? [], [data]);
  const online: OnlineDriver[] = useMemo(() => driversData?.onlineDrivers ?? [], [driversData]);

  const assigned = deliveries.filter((d) => d.driver).length;
  const free = online.filter((d) => d.availability === 'ONLINE' && !deliveries.some((dv) => dv.driver?.userId === d.userId));

  const n = (v: number | string | null | undefined) => Number(v ?? NaN);
  const center = useMemo(() => {
    const pts = deliveries.map((d) => ({ lat: n(d.pickupLat), lng: n(d.pickupLng) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (!pts.length) return DEFAULT_CENTER;
    return { lat: pts.reduce((a, p) => a + p.lat, 0) / pts.length, lng: pts.reduce((a, p) => a + p.lng, 0) / pts.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries]);

  const selected = deliveries.find((d) => d.id === selectedId) ?? null;

  const markers: MapMarker[] = useMemo(() => {
    const mk: MapMarker[] = [];
    deliveries.forEach((d, i) => {
      const idx = d.liveLocations?.length ? d.liveLocations!.length - 1 : -1;
      const live = idx >= 0 ? d.liveLocations![idx] : null;
      const driverPos = live
        ? { lat: n(live.lat), lng: n(live.lng) }
        : d.driver
          ? { lat: n(d.driver.lastLat), lng: n(d.driver.lastLng) }
          : null;
      if (driverPos && Number.isFinite(driverPos.lat) && Number.isFinite(driverPos.lng)) {
        mk.push({
          id: `drv-${d.id}`,
          lat: driverPos.lat,
          lng: driverPos.lng,
          label: d.driver?.user?.fullName ?? `Driver · ${d.order.orderNumber}`,
          kind: 'driver',
          color: selected?.id === d.id ? '#7c3aed' : undefined,
        });
      }
      const pickup = { lat: n(d.pickupLat), lng: n(d.pickupLng) };
      if (Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng)) {
        mk.push({ id: `pu-${d.id}`, lat: pickup.lat, lng: pickup.lng, label: `Pickup · ${d.order.branch?.name ?? `#${i + 1}`}`, kind: 'pickup' });
      }
      const drop = { lat: n(d.dropoffLat), lng: n(d.dropoffLng) };
      if (Number.isFinite(drop.lat) && Number.isFinite(drop.lng)) {
        mk.push({ id: `do-${d.id}`, lat: drop.lat, lng: drop.lng, label: `Dropoff · ${d.order.orderNumber}`, kind: 'dropoff' });
      }
    });
    // Free drivers without an active delivery still show as fleet presence.
    free.forEach((d) => {
      const pos = { lat: n(d.lastLat), lng: n(d.lastLng) };
      if (Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) {
        mk.push({ id: `free-${d.userId}`, lat: pos.lat, lng: pos.lng, label: `Free · ${d.user?.fullName ?? 'driver'}`, kind: 'driver' });
      }
    });
    return mk;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, free, selected]);

  const canReassign = ['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER'].includes(role);

  return (
    <div className="space-y-5">
      {(deviation || delay) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {deviation && <span>Route deviation reported on order {deviation.orderId.slice(0, 8)}…</span>}
          {delay && <span>Delay alert: {delay.orderNumber} is ~{delay.minutesLate} min late.</span>}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 text-xs"
            onClick={() => { setDeviation(null); setDelay(null); }}
          >
            Acknowledge
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Active deliveries" value={deliveries.length} hint="not yet delivered/cancelled" />
        <StatTile label="Assigned" value={assigned} hint={`${deliveries.length - assigned} awaiting a driver`} />
        <StatTile label="Drivers online" value={online.length} hint={`${free.length} free right now`} />
        <StatTile label="Avg ETA" value={(() => { const etas = deliveries.map((d) => n(d.etaMinutes)).filter(Number.isFinite); return etas.length ? `${Math.round(etas.reduce((a, b) => a + b, 0) / etas.length)}m` : '—'; })()} hint="across active runs" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Live map</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected ? `Route shown for order ${selected.order.orderNumber}. Click a row to switch, click the map background to clear.` : 'Click a delivery row to trace its route.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={refetch}>
            <RefreshCw className="mr-1 h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <MapView
            center={center}
            markers={markers}
            polyline={selected?.routePolyline ?? undefined}
            zoom={selected ? 14 : 12}
            className="h-[380px] w-full overflow-hidden rounded-xl border"
            onClick={() => setSelectedId(null)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Active deliveries</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading && deliveries.length === 0 ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
          ) : deliveries.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing on the road right now — no active deliveries.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Driver</TableHead>
                    <TableHead>ETA</TableHead>
                    {canReassign && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow
                      key={d.id}
                      className={selected?.id === d.id ? 'bg-brand/5' : 'cursor-pointer'}
                      onClick={() => setSelectedId((cur) => (cur === d.id ? null : d.id))}
                    >
                      <TableCell className="font-medium">{d.order.orderNumber}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_TONE[d.status] ?? 'outline'} className="text-xs">
                          {d.status.replaceAll('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate">{d.order.branch?.name ?? '—'}</TableCell>
                      <TableCell className="max-w-[150px] truncate">{d.order.customer?.fullName ?? '—'}</TableCell>
                      <TableCell>
                        {d.driver ? (
                          <span className="flex items-center gap-1.5 text-sm">
                            <Navigation className="h-3.5 w-3.5 text-brand" />
                            {d.driver.user?.fullName ?? '—'}
                            <span className="text-xs text-muted-foreground">★{Number(d.driver.avgRating ?? 0).toFixed(2)}</span>
                          </span>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Unassigned</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{d.etaMinutes != null ? `${d.etaMinutes}m` : '—'}</TableCell>
                      {canReassign && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); setReassignFor(d); }}
                          >
                            <Shuffle className="mr-1 h-3.5 w-3.5" /> Reassign
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReassignDialog
        open={!!reassignFor}
        onClose={() => setReassignFor(null)}
        delivery={reassignFor}
        freeDrivers={free}
        onDone={refetch}
      />
    </div>
  );
}

export default function OpsPage() {
  return (
    <AdminShell roles={['SUPER_ADMIN', 'ADMIN', 'OPS_MANAGER']} title="Live operations" subtitle="Real-time fleet, deliveries and delay alerts">
      <OpsView />
    </AdminShell>
  );
}
