'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation } from '@apollo/client';
import { Pencil, Plus, Star, Trash2, Store } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ME_FULL } from '@/lib/graphql/queries';
import {
  UPDATE_PROFILE, CHANGE_PASSWORD, ADD_ADDRESS, UPDATE_ADDRESS, DELETE_ADDRESS,
  SET_DEFAULT_ADDRESS, UPDATE_NOTIFICATION_PREF,
} from '@/lib/graphql/mutations';
import { formatMoney } from '@/lib/utils';
import { assetUrl } from '@/lib/config';
import { useAuth } from '@/lib/auth/store';

interface Address {
  id: string;
  label?: string | null;
  fullName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state?: string | null;
  country: string;
  postalCode?: string | null;
  lat: number | string;
  lng: number | string;
  isDefault?: boolean;
}

function ProfileInner({ initialTab }: { initialTab: string }) {
  const me = useAuth((s) => s.user);
  const patchUser = useAuth((s) => s.patchUser);
  const { data, loading, refetch } = useQuery(ME_FULL, { fetchPolicy: 'cache-and-network' });
  const profile = data?.me;

  // ---- account form ----
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [updateProfile] = useMutation(UPDATE_PROFILE);
  const [changePassword] = useMutation(CHANGE_PASSWORD);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');

  useEffect(() => {
    if (profile) {
      setName(profile.fullName ?? '');
      setPhone(profile.phone ?? '');
    }
  }, [profile]);

  const saveAccount = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await updateProfile({ variables: { input: { fullName: name.trim(), phone: phone.trim() || null } } });
      patchUser({ fullName: res.data?.updateProfile?.fullName ?? name });
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (newPw.length < 8) return toast.error('New password must be at least 8 characters');
    try {
      await changePassword({ variables: { oldPassword: oldPw, newPassword: newPw } });
      setOldPw('');
      setNewPw('');
      toast.success('Password changed');
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not change password');
    }
  };

  // ---- addresses ----
  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  // ---- notification prefs ----
  const [pref, setPref] = useState<{ pushOrders: boolean; pushPromos: boolean; emailOrders: boolean; emailPromos: boolean; smsCritical: boolean } | null>(null);
  const [updatePref] = useMutation(UPDATE_NOTIFICATION_PREF);
  useEffect(() => {
    if (profile?.notificationPref) setPref(profile.notificationPref);
  }, [profile]);

  const togglePref = async (key: string, value: boolean) => {
    if (!pref) return;
    const next = { ...pref, [key]: value };
    setPref(next);
    try {
      await updatePref({ variables: { input: next } });
    } catch {
      toast.error('Could not save preference');
    }
  };

  if (loading && !profile) {
    return (
      <div className="container max-w-4xl space-y-4 py-8">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {profile?.avatarUrl ? (
          <img src={assetUrl(profile.avatarUrl)} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/20 text-xl font-bold text-brand">
            {(profile?.fullName ?? me?.fullName ?? '?')[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold">{profile?.fullName ?? me?.fullName}</h1>
          <p className="text-sm text-muted-foreground">{profile?.email ?? me?.email}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-sm text-muted-foreground">Wallet</p>
          <p className="font-semibold">{formatMoney(profile?.wallet?.balance ?? 0)}</p>
        </div>
      </div>

      <Tabs defaultValue={['account', 'addresses', 'favorites', 'notifications', 'business'].includes(initialTab) ? initialTab : 'account'}>
        <TabsList className="mb-4">
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="addresses">Addresses</TabsTrigger>
          <TabsTrigger value="favorites">Favorites</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          {(profile?.ownedRestaurants?.length ?? 0) > 0 && <TabsTrigger value="business">Business</TabsTrigger>}
        </TabsList>

        {/* ---- account ---- */}
        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal info</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={saveAccount} className="max-w-md space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 0100" />
                </div>
                <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={savePassword} className="max-w-md space-y-3">
                <Input type="password" placeholder="Current password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} autoComplete="current-password" />
                <Input type="password" placeholder="New password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" />
                <Button type="submit" variant="outline">Update password</Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- addresses ---- */}
        <TabsContent value="addresses">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Saved addresses</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
                <Plus className="mr-1 h-4 w-4" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {(profile?.addresses ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No addresses yet — add one to speed up checkout.</p>
              )}
              {(profile?.addresses ?? []).map((a: Address) => (
                <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {a.label || 'Address'}
                      {a.isDefault && <Badge variant="secondary" className="text-xs">Default</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      {a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.country}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!a.isDefault && <SetDefaultButton id={a.id} onDone={refetch} />}
                    <Button size="icon" variant="ghost" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                    <DeleteAddressButton id={a.id} onDone={refetch} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- favorites ---- */}
        <TabsContent value="favorites">
          <Card>
            <CardContent className="p-4">
              {(profile?.favorites ?? []).length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No favorites yet — tap the heart on a restaurant page.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {(profile?.favorites ?? []).map((f: any) => (
                  <Link
                    key={f.id}
                    href={f.restaurant ? `/restaurant/${f.restaurant.slug}` : '#'}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:shadow-md"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={assetUrl(f.restaurant?.logoUrl)} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{f.restaurant?.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        {Number(f.restaurant?.avgRating ?? 0).toFixed(1)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- notification prefs ---- */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader><CardTitle className="text-base">Notification preferences</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              {pref && (
                <>
                  {[
                    { key: 'pushOrders', label: 'Push notifications about my orders' },
                    { key: 'pushPromos', label: 'Push notifications for promos' },
                    { key: 'emailOrders', label: 'Email me about my orders' },
                    { key: 'emailPromos', label: 'Email me offers and news' },
                    { key: 'smsCritical', label: 'SMS for critical updates' },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center justify-between rounded-lg p-2 hover:bg-accent">
                      <span className="text-sm">{row.label}</span>
                      <Switch
                        checked={(pref as any)[row.key]}
                        onCheckedChange={(v) => togglePref(row.key, v)}
                      />
                    </div>
                  ))}
                </>
              )}
              <Separator />
              <p className="text-xs text-muted-foreground">
                Browser push requires allowing notifications when prompted from the bell icon.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---- business (owner) ---- */}
        <TabsContent value="business">
          <Card>
            <CardHeader><CardTitle className="text-base">My restaurants</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {(profile?.ownedRestaurants ?? []).map((r: any) => (
                <div key={r.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <Store className="h-5 w-5 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.branches?.length ?? 0} branch(es) · {r.totalOrders ?? 0} orders</p>
                  </div>
                  <Badge variant={r.status === 'APPROVED' ? 'success' : r.status === 'PENDING_APPROVAL' ? 'warning' : 'destructive'}>
                    {r.status?.replace(/_/g, ' ')}
                  </Badge>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/restaurant">Manage</Link>
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editing && (
        <AddressDialog
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); }}
        />
      )}
    </div>
  );
}

function SetDefaultButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [setDefault] = useMutation(SET_DEFAULT_ADDRESS);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await setDefault({ variables: { id } });
          toast.success('Default address updated');
          onDone();
        } catch {
          toast.error('Could not update default');
        }
      }}
    >
      Make default
    </Button>
  );
}

function DeleteAddressButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [del] = useMutation(DELETE_ADDRESS);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="text-destructive"
      onClick={async () => {
        try {
          await del({ variables: { id } });
          onDone();
        } catch (e: any) {
          toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not delete');
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

/** Create/edit dialog; coordinates can be filled via browser geolocation. */
function AddressDialog({ address, onClose, onSaved }: { address: Address | null; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: address?.label ?? '',
    line1: address?.line1 ?? '',
    line2: address?.line2 ?? '',
    city: address?.city ?? '',
    country: address?.country ?? '',
    postalCode: address?.postalCode ?? '',
    lat: String(address?.lat ?? ''),
    lng: String(address?.lng ?? ''),
  });
  const [addAddress] = useMutation(ADD_ADDRESS);
  const [updateAddress] = useMutation(UPDATE_ADDRESS);
  const [setDefault] = useMutation(SET_DEFAULT_ADDRESS);

  const geolocate = () => {
    navigator.geolocation?.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(7), lng: p.coords.longitude.toFixed(7) })),
      () => toast.error('Could not read location'),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.line1 || !form.city || !form.country || !form.lat || !form.lng) {
      return toast.error('Street, city, country and coordinates are required');
    }
    setBusy(true);
    try {
      const input = {
        label: form.label || undefined,
        line1: form.line1,
        line2: form.line2 || undefined,
        city: form.city,
        country: form.country,
        postalCode: form.postalCode || undefined,
        lat: form.lat,
        lng: form.lng,
        isDefault: address ? address.isDefault : true,
      };
      if (address) await updateAddress({ variables: { id: address.id, input } });
      else {
        const { data } = await addAddress({ variables: { input } });
        if (data?.addAddress?.id && input.isDefault) await setDefault({ variables: { id: data.addAddress.id } });
      }
      toast.success('Address saved');
      onSaved();
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{address ? 'Edit address' : 'New address'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Label (Home)" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Button type="button" variant="outline" onClick={geolocate}>Use my location</Button>
          </div>
          <Input placeholder="Street address *" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} />
          <Input placeholder="Apartment, floor (optional)" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="City *" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="Country *" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input placeholder="Postal code" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
            <Input placeholder="Lat *" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} />
            <Input placeholder="Lng *" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProfileWithTabs() {
  const params = useSearchParams();
  return <ProfileInner initialTab={params.get('tab') ?? 'account'} />;
}

export default function ProfilePage() {
  return (
    <AuthGuard>
      <Suspense fallback={<div className="container py-8" />}>
        <ProfileWithTabs />
      </Suspense>
    </AuthGuard>
  );
}
