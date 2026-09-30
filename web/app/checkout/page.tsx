'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gql, useMutation, useQuery } from '@apollo/client';
import { CreditCard, Wallet, Banknote, Plus, Ticket, CalendarClock } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ME_FULL } from '@/lib/graphql/queries';
import { PLACE_ORDER, CREATE_CARD_PAYMENT, ADD_ADDRESS } from '@/lib/graphql/mutations';
import { useCart, selectSubtotal } from '@/lib/cart/store';
import { collectAndConfirmCard } from '@/lib/stripe';
import { formatMoney } from '@/lib/utils';
import { useAuth } from '@/lib/auth/store';

interface Address {
  id: string;
  label?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  isDefault?: boolean;
}

type Method = 'CARD' | 'WALLET' | 'CASH';

export default function CheckoutPage() {
  return (
    <AuthGuard>
      <CheckoutInner />
    </AuthGuard>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const lines = useCart((s) => s.lines);
  const branchId = useCart((s) => s.branchId);
  const branchName = useCart((s) => s.branchName);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart(selectSubtotal);

  const meQ = useQuery(ME_FULL, { fetchPolicy: 'network-only' });
  const addresses: Address[] = meQ.data?.me?.addresses ?? [];
  const walletBalance = Number(meQ.data?.me?.wallet?.balance ?? 0);

  const [addressId, setAddressId] = useState<string>('');
  useEffect(() => {
    if (!addressId && addresses.length > 0) {
      setAddressId((addresses.find((a) => a.isDefault) ?? addresses[0]).id);
    }
  }, [addresses, addressId]);

  const [method, setMethod] = useState<Method>('CARD');
  const [promo, setPromo] = useState('');
  const [usePoints, setUsePoints] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [placing, setPlacing] = useState(false);
  const cardMountRef = useRef<HTMLDivElement | null>(null);

  const loyaltyPoints: number = meQ.data?.me?.loyaltyPoints ?? 0;

  const [placeOrder] = useMutation(PLACE_ORDER);
  const [cardPayment] = useMutation(CREATE_CARD_PAYMENT);

  // server-side fee quote (deliveryQuote returns a free-form JSON object)
  const quoteQ = useQuery(
    gql`
      query CheckoutQuote($branchId: ID!, $addressId: ID!, $itemsTotal: Decimal!) {
        deliveryQuote(branchId: $branchId, addressId: $addressId, itemsTotal: $itemsTotal)
      }
    `,
    { variables: { branchId, addressId, itemsTotal: subtotal.toFixed(2) }, skip: !branchId || !addressId },
  );
  const quote: any = quoteQ.data?.deliveryQuote;
  const deliveryFee = Number(quote?.deliveryFee ?? 0);
  const serviceFee = Number(quote?.serviceFee ?? 0);
  const total = Math.max(0, subtotal + deliveryFee + serviceFee);

  const canSubmit = useMemo(
    () => !!branchId && lines.length > 0 && !!addressId && !placing,
    [branchId, lines.length, addressId, placing],
  );

  if (lines.length === 0) {
    router.replace('/cart');
    return null;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setPlacing(true);
    try {
      const { data } = await placeOrder({
        variables: {
          input: {
            branchId,
            addressId,
            paymentMethod: method,
            promoCode: promo.trim() || undefined,
            loyaltyPointsToUse: usePoints > 0 ? usePoints : undefined,
            specialInstructions: instructions.trim() || undefined,
            scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
            items: lines.map((l) => ({
              menuItemId: l.menuItemId,
              quantity: l.quantity,
              variantOptionId: l.variantOptionId || undefined,
              addOnId: l.addOns[0]?.id || undefined,
              specialInstructions: l.specialInstructions || undefined,
            })),
          },
        },
      });
      const order = data.placeOrder;

      if (method === 'CARD' && order?.id) {
        // fetch clientSecret and confirm card inline
        const payRes = await cardPayment({ variables: { orderId: order.id } });
        const clientSecret: string | undefined = payRes.data?.createCardPayment?.clientSecret;
        if (!clientSecret) throw new Error('Payment setup failed');
        if (!cardMountRef.current) {
          const el = document.createElement('div');
          document.body.appendChild(el);
          cardMountRef.current = el;
        }
        cardMountRef.current.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
        cardMountRef.current.innerHTML =
          '<div class="w-full max-w-sm rounded-xl bg-white p-4 space-y-3"><p class="font-semibold text-gray-900">Pay with card</p><div id="qb-card-el" class="rounded border p-2 bg-white"></div></div>';
        const mountEl = document.getElementById('qb-card-el');
        if (!mountEl) throw new Error('Card form failed to mount');
        const result = await collectAndConfirmCard(mountEl, { clientSecret, holderName: user?.fullName });
        cardMountRef.current.remove();
        cardMountRef.current = null;
        if (result !== 'succeeded') throw new Error('Card payment was not completed');
      }

      clear();
      toast.success('Order placed! Track it live now.');
      router.push(`/orders/${order.id}`);
    } catch (err: any) {
      if (cardMountRef.current) {
        cardMountRef.current.remove();
        cardMountRef.current = null;
      }
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not place the order');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Checkout</h1>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Address */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Delivery address</CardTitle>
              <AddAddressDialog onAdded={(id) => setAddressId(id)} />
            </CardHeader>
            <CardContent>
              {meQ.loading ? (
                <Skeleton className="h-16 w-full" />
              ) : addresses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add an address to continue.</p>
              ) : (
                <RadioGroup value={addressId} onValueChange={setAddressId} className="gap-2">
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm has-[input:checked]:border-brand has-[input:checked]:bg-brand/5"
                    >
                      <RadioGroupItem value={a.id} className="mt-0.5" />
                      <span>
                        <span className="font-medium">{a.label || 'Address'}</span>
                        <span className="block text-muted-foreground">
                          {a.line1}{a.line2 ? `, ${a.line2}` : ''}{a.city ? `, ${a.city}` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              )}
            </CardContent>
          </Card>

          {/* Payment */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment method</CardTitle>
            </CardHeader>
            <CardContent>
              <RadioGroup value={method} onValueChange={(v) => setMethod(v as Method)} className="gap-2">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[input:checked]:border-brand">
                  <RadioGroupItem value="CARD" />
                  <CreditCard className="h-4 w-4" /> Credit / debit card (Stripe)
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[input:checked]:border-brand">
                  <RadioGroupItem value="WALLET" />
                  <Wallet className="h-4 w-4" /> Wallet · balance {formatMoney(walletBalance)}
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm has-[input:checked]:border-brand">
                  <RadioGroupItem value="CASH" />
                  <Banknote className="h-4 w-4" /> Cash on delivery
                </label>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Promo, rewards & notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Ticket className="mt-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Promo code"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value.toUpperCase())}
                  className="max-w-60"
                />
              </div>
              {loyaltyPoints > 0 && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="points" className="flex items-center gap-1 whitespace-nowrap">
                    <Wallet className="h-4 w-4" /> Use points
                  </Label>
                  <Input
                    id="points"
                    type="number"
                    min={0}
                    max={loyaltyPoints}
                    value={usePoints || ''}
                    onChange={(e) => setUsePoints(Math.max(0, Math.min(loyaltyPoints, Number(e.target.value) || 0)))}
                    className="max-w-28"
                  />
                  <span className="text-xs text-muted-foreground">{loyaltyPoints} available (1 pt = $0.01)</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <Input
                  type="datetime-local"
                  value={scheduledFor}
                  min={new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16)}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="max-w-60"
                />
                <span className="text-xs text-muted-foreground">Schedule (optional)</span>
              </div>
              <Textarea
                placeholder="Order notes for the restaurant…"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle className="text-base">
              Order summary {branchName && <span className="text-sm font-normal text-muted-foreground">· {branchName}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {lines.map((l) => (
              <div key={l.lineId} className="flex justify-between gap-2">
                <span className="min-w-0 truncate">
                  {l.quantity}× {l.name}
                  {l.variantLabel ? ` (${l.variantLabel})` : ''}
                </span>
                <span className="shrink-0">{formatMoney((l.unitPrice + l.addOns.reduce((n, a) => n + a.price, 0)) * l.quantity)}</span>
              </div>
            ))}
            <Separator />
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Delivery fee</span>
              <span>{quoteQ.loading ? '…' : formatMoney(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Service fee</span>
              <span>{quoteQ.loading ? '…' : formatMoney(serviceFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span><span>{formatMoney(total)}</span>
            </div>
            {quote?.minutes && (
              <p className="text-xs text-muted-foreground">Estimated arrival in ~{Math.round(quote.minutes)} min.</p>
            )}
            <Button
              className="w-full bg-brand hover:bg-brand-dark"
              size="lg"
              disabled={!canSubmit}
              onClick={submit}
            >
              {placing ? 'Placing order…' : `Place order · ${formatMoney(total)}`}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By placing the order you agree to our <Link href="/support" className="underline">terms</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Inline address creation so checkout is never blocked by a missing address. */
function AddAddressDialog({ onAdded }: { onAdded: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ label: 'Home', line1: '', line2: '', city: '', country: '', postalCode: '', lat: '', lng: '' });
  const [addAddress] = useMutation(ADD_ADDRESS);

  const geolocate = () => {
    if (!navigator.geolocation) return toast.error('Geolocation not available');
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, lat: pos.coords.latitude.toFixed(7), lng: pos.coords.longitude.toFixed(7) })),
      () => toast.error('Could not get your location — enter coordinates manually'),
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.line1 || !form.city || !form.country || !form.lat || !form.lng) {
      return toast.error('Street, city, country and coordinates are required');
    }
    setBusy(true);
    try {
      const { data } = await addAddress({
        variables: {
          input: {
            label: form.label || undefined,
            line1: form.line1,
            line2: form.line2 || undefined,
            city: form.city,
            country: form.country,
            postalCode: form.postalCode || undefined,
            lat: form.lat,
            lng: form.lng,
            isDefault: true,
          },
        },
      });
      onAdded(data.addAddress.id);
      setOpen(false);
      toast.success('Address added');
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not save address');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="mr-1 h-4 w-4" /> Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New delivery address</DialogTitle></DialogHeader>
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
          <Button type="submit" className="w-full bg-brand hover:bg-brand-dark" disabled={busy}>
            {busy ? 'Saving…' : 'Save address'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
