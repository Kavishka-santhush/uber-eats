'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Plus, Power, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AdminShell } from '@/components/admin-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { PLATFORM_SETTINGS, SURGE_ZONES } from '@/lib/graphql/dashboards';
import { ADMIN_UPSERT_SETTING, UPSERT_SURGE_ZONE, TOGGLE_SURGE_ZONE, DELETE_SURGE_ZONE } from '@/lib/graphql/mutations';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function err(e: any, fallback: string) {
  return e?.message?.replace('GraphQL error: ', '') || fallback;
}

function SettingRow({ setting, onSaved }: { setting: { key: string; value: any }; onSaved: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(setting.value, null, 2));
  const [upsert, { loading }] = useMutation(ADMIN_UPSERT_SETTING);
  const dirty = text !== JSON.stringify(setting.value, null, 2);

  const save = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      toast.error('Value must be valid JSON');
      return;
    }
    try {
      await upsert({ variables: { key: setting.key, value: parsed } });
      toast.success(`${setting.key} saved`);
      onSaved();
    } catch (e: any) {
      toast.error(err(e, 'Could not save setting'));
    }
  };

  return (
    <div className="border-b py-3 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <code className="text-sm font-semibold">{setting.key}</code>
        <Button size="sm" variant={dirty ? 'default' : 'ghost'} className="h-7 bg-brand text-xs hover:bg-brand-dark" disabled={!dirty || loading} onClick={save}>
          <Save className="mr-1 h-3.5 w-3.5" /> {loading ? 'Saving…' : 'Save'}
        </Button>
      </div>
      <Textarea rows={3} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

function SettingsSection() {
  const { data, loading, refetch } = useQuery(PLATFORM_SETTINGS);
  const settings: any[] = data?.platformSettings ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('{\n  \n}');
  const [upsert, { loading: adding }] = useMutation(ADMIN_UPSERT_SETTING);

  const addSetting = async (e: FormEvent) => {
    e.preventDefault();
    if (!newKey.trim()) return toast.error('Key is required');
    let parsed: unknown;
    try {
      parsed = JSON.parse(newVal);
    } catch {
      toast.error('Value must be valid JSON');
      return;
    }
    try {
      await upsert({ variables: { key: newKey.trim(), value: parsed } });
      toast.success('Setting created');
      setAddOpen(false);
      setNewKey('');
      refetch();
    } catch (e2: any) {
      toast.error(err(e2, 'Could not create setting'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Platform settings</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New key
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {loading && settings.length === 0 ? (
          <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
        ) : settings.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No settings stored yet.</p>
        ) : (
          settings.map((s) => <SettingRow key={s.key} setting={s} onSaved={refetch} />)
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>New platform setting</DialogTitle></DialogHeader>
            <form onSubmit={addSetting} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="k">Key</Label>
                <Input id="k" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="e.g. commission.rate" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v">Value (JSON)</Label>
                <Textarea id="v" rows={5} className="font-mono text-xs" value={newVal} onChange={(e) => setNewVal(e.target.value)} />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={adding}>Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

interface ZoneForm {
  id?: string;
  name: string;
  centerLat: string;
  centerLng: string;
  radiusKm: string;
  multiplier: string;
  isActive: boolean;
  days: number[];
}

const EMPTY_ZONE: ZoneForm = { name: '', centerLat: '', centerLng: '', radiusKm: '3', multiplier: '1.5', isActive: true, days: [] };

function ZoneDialog({ open, onClose, zone, onSaved }: { open: boolean; onClose: () => void; zone: ZoneForm | null; onSaved: () => void }) {
  const [form, setForm] = useState<ZoneForm>(zone ?? EMPTY_ZONE);
  const [upsert, { loading }] = useMutation(UPSERT_SURGE_ZONE);

  useEffect(() => {
    if (open) setForm(zone ?? EMPTY_ZONE);
  }, [open, zone]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const num = (v: string) => Number(v);
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.centerLat || !form.centerLng) return toast.error('Centre coordinates are required');
    if (!form.multiplier || num(form.multiplier) < 1) return toast.error('Multiplier must be at least 1');
    try {
      await upsert({
        variables: {
          ...(zone?.id ? { id: zone.id } : {}),
          input: {
            name: form.name.trim(),
            centerLat: num(form.centerLat),
            centerLng: num(form.centerLng),
            radiusKm: num(form.radiusKm) || 3,
            multiplier: num(form.multiplier),
            isActive: form.isActive,
            daysOfWeek: form.days,
          },
        },
      });
      toast.success(zone?.id ? 'Surge zone updated' : 'Surge zone created');
      onSaved();
      onClose();
    } catch (e2: any) {
      toast.error(err(e2, 'Could not save the zone'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{zone?.id ? 'Edit surge zone' : 'New surge zone'}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="z-name">Name</Label>
            <Input id="z-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Downtown dinner rush" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="z-lat">Centre lat</Label>
              <Input id="z-lat" type="number" step="0.000001" value={form.centerLat} onChange={(e) => setForm((f) => ({ ...f, centerLat: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="z-lng">Centre lng</Label>
              <Input id="z-lng" type="number" step="0.000001" value={form.centerLng} onChange={(e) => setForm((f) => ({ ...f, centerLng: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="z-rad">Radius (km)</Label>
              <Input id="z-rad" type="number" step="0.1" min="0.5" value={form.radiusKm} onChange={(e) => setForm((f) => ({ ...f, radiusKm: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="z-mult">Multiplier</Label>
              <Input id="z-mult" type="number" step="0.05" min="1" value={form.multiplier} onChange={(e) => setForm((f) => ({ ...f, multiplier: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Active days (none = every day)</Label>
            <div className="flex flex-wrap gap-1.5">
              {DAY_NAMES.map((d, i) => {
                const on = form.days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, days: on ? f.days.filter((x) => x !== i) : [...f.days, i] }))}
                    className={
                      'rounded-full border px-2.5 py-1 text-xs transition-colors ' +
                      (on ? 'border-brand bg-brand text-white' : 'text-muted-foreground hover:text-foreground')
                    }
                  >
                    {d.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} /> Active
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={loading}>Save zone</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SurgeSection() {
  const { data, loading, refetch } = useQuery(SURGE_ZONES, { variables: { activeOnly: false } });
  const [editing, setEditing] = useState<ZoneForm | null>(null);
  const [open, setOpen] = useState(false);
  const [toggle] = useMutation(TOGGLE_SURGE_ZONE);
  const [remove] = useMutation(DELETE_SURGE_ZONE);
  const zones: any[] = data?.surgeZones ?? [];

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (z: any) => {
    setEditing({
      id: z.id,
      name: z.name,
      centerLat: String(z.centerLat),
      centerLng: String(z.centerLng),
      radiusKm: String(z.radiusKm),
      multiplier: String(z.multiplier),
      isActive: !!z.isActive,
      days: z.daysOfWeek ?? [],
    });
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Surge pricing zones</CardTitle>
          <Button size="sm" variant="outline" onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New zone</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading && zones.length === 0 ? (
          <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
        ) : zones.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No surge zones — delivery fees use the flat rate everywhere.</p>
        ) : (
          <ul className="divide-y">
            {zones.map((z) => (
              <li key={z.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {z.name} <Badge variant="outline" className="ml-1 text-xs">×{Number(z.multiplier).toFixed(2)}</Badge>
                    {z.branch && <span className="ml-2 text-xs font-normal text-muted-foreground">→ {z.branch.name}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    radius {Number(z.radiusKm).toFixed(1)} km · {(z.daysOfWeek ?? []).length ? (z.daysOfWeek as number[]).map((d) => DAY_NAMES[d]?.slice(0, 3)).join(' ') : 'every day'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Power className="h-3.5 w-3.5" />
                    <Switch
                      checked={!!z.isActive}
                      onCheckedChange={async (v) => {
                        try {
                          await toggle({ variables: { id: z.id, active: v } });
                          refetch();
                        } catch (e: any) {
                          toast.error(err(e, 'Could not toggle'));
                        }
                      }}
                    />
                  </label>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openEdit(z)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    onClick={async () => {
                      try {
                        await remove({ variables: { id: z.id } });
                        toast.success('Zone deleted');
                        refetch();
                      } catch (e: any) {
                        toast.error(err(e, 'Could not delete'));
                      }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <ZoneDialog open={open} onClose={() => setOpen(false)} zone={editing} onSaved={refetch} />
    </Card>
  );
}

function SettingsView() {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SettingsSection />
      <SurgeSection />
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <AdminShell roles={['SUPER_ADMIN']} title="Platform settings" subtitle="Commission, loyalty, surge zones and raw settings">
      <SettingsView />
    </AdminShell>
  );
}
