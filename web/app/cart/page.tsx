'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, Minus, Plus, ShoppingBag, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useCart, selectSubtotal } from '@/lib/cart/store';
import { formatMoney } from '@/lib/utils';
import { assetUrl } from '@/lib/config';
import { useAuth } from '@/lib/auth/store';

export default function CartPage() {
  const router = useRouter();
  const user = useAuth((s) => s.user);
  const lines = useCart((s) => s.lines);
  const branchName = useCart((s) => s.branchName);
  const setQty = useCart((s) => s.setQty);
  const remove = useCart((s) => s.remove);
  const clear = useCart((s) => s.clear);
  const subtotal = useCart(selectSubtotal);

  if (lines.length === 0) {
    return (
      <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
        <ShoppingBag className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="text-muted-foreground">Add something delicious from a nearby restaurant.</p>
        <Button className="bg-brand hover:bg-brand-dark" asChild>
          <Link href="/restaurants">Browse restaurants</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your cart</h1>
        <Button variant="ghost" size="sm" onClick={clear} className="text-destructive">
          <Trash2 className="mr-1 h-4 w-4" /> Clear
        </Button>
      </div>
      {branchName && (
        <Badge variant="secondary" className="mb-4 gap-1">
          <Store className="h-3 w-3" /> Delivering from {branchName}
        </Badge>
      )}

      <Card>
        <CardContent className="divide-y p-0">
          {lines.map((l) => {
            const unit = l.unitPrice + l.addOns.reduce((n, a) => n + a.price, 0);
            return (
              <div key={l.lineId} className="flex items-center gap-3 p-4">
                {l.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={assetUrl(l.image)} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-lg bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.name}</p>
                  {l.variantLabel && <p className="truncate text-xs text-muted-foreground">{l.variantLabel}</p>}
                  {l.addOns.map((a) => (
                    <p key={a.id} className="text-xs text-muted-foreground">+ {a.name}</p>
                  ))}
                  {l.specialInstructions && (
                    <p className="truncate text-xs italic text-muted-foreground">“{l.specialInstructions}”</p>
                  )}
                  <p className="mt-1 text-sm font-medium">{formatMoney(unit * l.quantity)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(l.lineId, l.quantity - 1)}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setQty(l.lineId, l.quantity + 1)}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(l.lineId)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
          <Separator />
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm text-muted-foreground">Subtotal</p>
              <p className="text-xl font-bold">{formatMoney(subtotal)}</p>
              <p className="text-xs text-muted-foreground">Delivery fee & taxes calculated at checkout.</p>
            </div>
            <Button
              size="lg"
              className="bg-brand hover:bg-brand-dark"
              onClick={() => router.push(user ? '/checkout' : `/login?next=${encodeURIComponent('/checkout')}`)}
            >
              Go to checkout
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
