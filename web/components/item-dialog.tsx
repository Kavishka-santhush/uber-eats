'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { useCart } from '@/lib/cart/store';
import { formatMoney } from '@/lib/utils';
import { assetUrl } from '@/lib/config';

export interface MenuOption { id: string; label: string; priceModifier: number | string; isDefault?: boolean }
export interface MenuVariant { id: string; name: string; optionType: string; options: MenuOption[] }
export interface MenuAddOn { id: string; name: string; price: number | string; isRequired?: boolean }

export interface MenuViewItem {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  imageUrls?: string[] | null;
  variants?: MenuVariant[] | null;
  addOns?: MenuAddOn[] | null;
}

interface Props {
  item: MenuViewItem;
  branchId: string;
  branchName: string;
  restaurantId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Item detail dialog. The order API (CartLineInput) accepts ONE variant option
 * and ONE add-on per line, so the UI enforces exactly that: a single radio
 * selection across all variant groups plus a single optional add-on.
 */
export function ItemDialog({ item, branchId, branchName, restaurantId, open, onOpenChange }: Props) {
  const add = useCart((s) => s.add);
  const [qty, setQty] = useState(1);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [optionLabel, setOptionLabel] = useState<string | null>(null);
  const [addOnId, setAddOnId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState('');

  const initDefaults = () => {
    let def: MenuOption | null = null;
    for (const v of item.variants ?? []) {
      const d = v.options.find((o) => o.isDefault);
      if (d) { def = d; break; }
    }
    if (!def && (item.variants ?? []).length > 0) def = item.variants![0].options[0];
    setOptionId(def?.id ?? null);
    setOptionLabel(def?.label ?? null);
    const req = (item.addOns ?? []).find((a) => a.isRequired);
    setAddOnId(req?.id ?? null);
  };
  const handleOpen = (o: boolean) => {
    if (o) initDefaults();
    onOpenChange(o);
  };

  const unit = Number(item.price);
  const variantExtra = useMemo(() => {
    for (const v of item.variants ?? []) {
      const opt = v.options.find((o) => o.id === optionId);
      if (opt) return Number(opt.priceModifier ?? 0);
    }
    return 0;
  }, [item.variants, optionId]);
  const addOnExtra = useMemo(() => {
    const a = (item.addOns ?? []).find((x) => x.id === addOnId);
    return a ? Number(a.price) : 0;
  }, [item.addOns, addOnId]);
  const linePrice = (unit + variantExtra + addOnExtra) * qty;

  const pickOption = (opt: MenuOption) => {
    if (optionId === opt.id) {
      setOptionId(null);
      setOptionLabel(null);
    } else {
      setOptionId(opt.id);
      setOptionLabel(opt.label);
    }
  };

  const submit = () => {
    const addOn = (item.addOns ?? []).find((x) => x.id === addOnId);
    add({
      menuItemId: item.id,
      branchId,
      branchName,
      restaurantId,
      name: item.name,
      unitPrice: unit,
      quantity: qty,
      variantOptionId: optionId,
      variantLabel: optionLabel,
      addOns: addOn ? [{ id: addOn.id, name: addOn.name, price: Number(addOn.price) }] : [],
      specialInstructions: instructions.trim() || undefined,
      image: item.imageUrls?.[0] ?? undefined,
    });
    toast.success(`${item.name} added to cart`);
    onOpenChange(false);
    setQty(1);
    setInstructions('');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>
        {item.imageUrls?.[0] && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(item.imageUrls[0])} alt={item.name} className="h-40 w-full rounded-lg object-cover" />
        )}
        {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

        {(item.variants ?? []).map((v) => (
          <div key={v.id} className="space-y-2">
            <Separator />
            <Label className="font-semibold">{v.name}</Label>
            {v.options.map((o) => (
              <label
                key={o.id}
                className="flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`variant-${item.id}`}
                    checked={optionId === o.id}
                    onChange={() => pickOption(o)}
                  />
                  {o.label}
                </span>
                {Number(o.priceModifier) !== 0 && (
                  <span className="text-muted-foreground">
                    {Number(o.priceModifier) > 0 ? '+' : ''}{formatMoney(o.priceModifier)}
                  </span>
                )}
              </label>
            ))}
          </div>
        ))}

        {(item.addOns ?? []).length > 0 && (
          <div className="space-y-2">
            <Separator />
            <Label className="font-semibold">Add-on</Label>
            {item.addOns!.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center justify-between rounded-md border p-2 text-sm hover:bg-accent"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name={`addon-${item.id}`}
                    disabled={a.isRequired}
                    checked={addOnId === a.id}
                    onChange={() => setAddOnId(a.id)}
                  />
                  {a.name}
                  {a.isRequired && <span className="text-xs text-muted-foreground">(required)</span>}
                </span>
                <span className="text-muted-foreground">+{formatMoney(a.price)}</span>
              </label>
            ))}
            {(item.addOns ?? []).some((a) => !a.isRequired) && (
              <label className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-accent">
                <input
                  type="radio"
                  name={`addon-${item.id}`}
                  checked={addOnId === null}
                  onChange={() => setAddOnId(null)}
                />
                No add-on
              </label>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Separator />
          <Label htmlFor="instructions">Special instructions</Label>
          <Textarea
            id="instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Allergies, delivery notes…"
          />
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setQty((q) => Math.max(1, q - 1))}>
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-8 text-center font-semibold">{qty}</span>
            <Button variant="outline" size="icon" onClick={() => setQty((q) => q + 1)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button className="bg-brand hover:bg-brand-dark" onClick={submit}>
            Add · {formatMoney(linePrice)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
