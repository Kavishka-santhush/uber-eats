'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useApolloClient, useMutation, useQuery } from '@apollo/client';
import { Flame, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { RestaurantPage, type OwnedBranch } from '@/components/restaurant-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { MGR_BRANCH_MENU } from '@/lib/graphql/dashboards';
import {
  CREATE_MENU_CATEGORY, DELETE_MENU_CATEGORY, UPDATE_MENU_CATEGORY,
  CREATE_MENU_ITEM, UPDATE_MENU_ITEM, DELETE_MENU_ITEM, SET_MENU_ITEM_AVAILABILITY,
} from '@/lib/graphql/mutations';
import { useAuth } from '@/lib/auth/store';
import { assetUrl, config } from '@/lib/config';
import { formatMoney } from '@/lib/utils';

const SLOTS = ['ALL_DAY', 'BREAKFAST', 'LUNCH', 'DINNER'];
const LS_BRANCH = 'qb_restaurant_branch_id';

function errMsg(e: any, fallback: string) {
  return e?.message?.replace('GraphQL error: ', '') || fallback;
}

/** Parse "Size: S, M +1.00, L +2.50" lines into variant groups. */
function parseVariants(text: string) {
  const groups: Record<string, { label: string; priceModifier: number }[]> = {};
  const order: string[] = [];
  text.split('\n').forEach((line) => {
    const [gName, opts] = line.split(':');
    if (!gName || !opts) return;
    const g = gName.trim();
    if (!g) return;
    if (!groups[g]) {
      groups[g] = [];
      order.push(g);
    }
    opts.split(',').forEach((o) => {
      const raw = o.trim();
      if (!raw) return;
      const m = raw.match(/^(.*?)(?:\s*\+(\d+(?:\.\d+)?))?$/);
      const label = (m?.[1] || raw).trim();
      const priceModifier = m?.[2] ? Number(m[2]) : 0;
      if (label) groups[g].push({ label, priceModifier });
    });
  });
  return order.filter((g) => groups[g].length).map((g) => ({ name: g, options: groups[g] }));
}

/** Parse "Extra cheese: 1.50" lines (append * for required) into add-ons. */
function parseAddOns(text: string) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const required = l.endsWith('*');
      if (required) l = l.slice(0, -1);
      const [name, price] = l.split(':').map((s) => s.trim());
      return { name, price: Number(price || 0) || 0, isRequired: required };
    })
    .filter((a) => a.name);
}

function variantsToText(item: any): string {
  return (item?.variants ?? [])
    .map((v: any) => `${v.name}: ${(v.options ?? []).map((o: any) => `${o.label}${Number(o.priceModifier) ? ` +${o.priceModifier}` : ''}`).join(', ')}`)
    .join('\n');
}
function addOnsToText(item: any): string {
  return (item?.addOns ?? []).map((a: any) => `${a.name}: ${a.price}${a.isRequired ? '*' : ''}`).join('\n');
}

/** Upload one or more images to the local /upload/menu endpoint. */
async function uploadMenuImages(files: File[], token: string): Promise<string[]> {
  const fd = new FormData();
  files.forEach((f) => fd.append('files', f));
  const res = await fetch(`${config.apiUrl.replace(/\/$/, '')}/upload/menu`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error || 'Upload failed');
  return (json?.urls ?? []) as string[];
}

function ItemDialog({
  open, onClose, branchId, categories, item,
}: {
  open: boolean;
  onClose: () => void;
  branchId: string;
  categories: any[];
  item: any | null;
}) {
  const token = useAuth((s) => s.accessToken);
  const client = useApolloClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [price, setPrice] = useState('');
  const [compareAt, setCompareAt] = useState('');
  const [prep, setPrep] = useState('');
  const [calories, setCalories] = useState('');
  const [slot, setSlot] = useState('ALL_DAY');
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [images, setImages] = useState<string[]>([]);
  const [variantsText, setVariantsText] = useState('');
  const [addOnsText, setAddOnsText] = useState('');

  // (re)seed the form whenever the dialog opens
  const openKey = `${open ? 'o' : 'c'}:${item?.id ?? 'new'}`;
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setCategoryId(item?.category?.id ?? categories[0]?.id ?? '');
    setPrice(item ? String(item.price) : '');
    setCompareAt(item?.compareAtPrice ? String(item.compareAtPrice) : '');
    setPrep(item?.prepTimeMinutes ? String(item.prepTimeMinutes) : '');
    setCalories(item?.calories ? String(item.calories) : '');
    setSlot(item?.slot ?? 'ALL_DAY');
    setFlags(
      item
        ? {
            isBestSeller: !!item.isBestSeller, isVegan: !!item.isVegan, isVegetarian: !!item.isVegetarian,
            isSpicy: !!item.isSpicy, isGlutenFree: !!item.isGlutenFree, isNew: !!item.isNew,
          }
        : {},
    );
    setImages(item?.imageUrls ?? []);
    setVariantsText(variantsToText(item));
    setAddOnsText(addOnsToText(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openKey]);

  const [createItem] = useMutation(CREATE_MENU_ITEM);
  const [updateItem] = useMutation(UPDATE_MENU_ITEM);

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length || !token) return;
    setUploading(true);
    try {
      const urls = await uploadMenuImages(Array.from(files), token);
      setImages((prev) => [...prev, ...urls].slice(0, 6));
    } catch (e: any) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!categoryId) return toast.error('Create a category first');
    if (name.trim().length < 2) return toast.error('Name is too short');
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) return toast.error('Set a valid price');
    setBusy(true);
    try {
      if (item) {
        // scalars only — variant/add-on structures can't be edited via updateMenuItem
        await updateItem({
          variables: {
            id: item.id,
            input: {
              name: name.trim(),
              description: description.trim() || null,
              categoryId,
              price: priceNum,
              ...(compareAt && Number(compareAt) > 0 ? { compareAtPrice: Number(compareAt) } : {}),
              ...(prep ? { prepTimeMinutes: Number(prep) } : {}),
              ...(calories ? { calories: Number(calories) } : {}),
              slot,
              imageUrls: images,
              ...flags,
            },
          },
        });
        toast.success('Dish updated');
      } else {
        await createItem({
          variables: {
            branchId,
            input: {
              categoryId,
              name: name.trim(),
              description: description.trim() || undefined,
              price: priceNum,
              ...(compareAt && Number(compareAt) > 0 ? { compareAtPrice: Number(compareAt) } : {}),
              ...(prep ? { prepTimeMinutes: Number(prep) } : {}),
              ...(calories ? { calories: Number(calories) } : {}),
              slot,
              imageUrls: images,
              ...flags,
              variants: parseVariants(variantsText),
              addOns: parseAddOns(addOnsText),
            },
          },
        });
        toast.success('Dish added');
      }
      await client.refetchQueries({ include: [MGR_BRANCH_MENU] });
      onClose();
    } catch (e: any) {
      toast.error(errMsg(e, 'Could not save the dish'));
    } finally {
      setBusy(false);
    }
  };

  const flagDefs: [string, string][] = [
    ['isBestSeller', 'Best seller'], ['isNew', 'New'], ['isVegan', 'Vegan'],
    ['isVegetarian', 'Vegetarian'], ['isSpicy', 'Spicy'], ['isGlutenFree', 'Gluten free'],
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${item.name}` : 'New dish'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-name">Name</Label>
              <Input id="d-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Margherita pizza" />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Choose category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d-desc">Description</Label>
            <Textarea id="d-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="San Marzano tomato, fior di latte, basil…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-price">Price</Label>
              <Input id="d-price" type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-compare">Offer price until… (compare-at)</Label>
              <Input id="d-compare" type="number" min="0" step="0.01" value={compareAt} onChange={(e) => setCompareAt(e.target.value)} placeholder="Normal price shown struck-through" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-prep">Prep minutes</Label>
              <Input id="d-prep" type="number" min="0" value={prep} onChange={(e) => setPrep(e.target.value)} placeholder="15" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Menu slot</Label>
              <Select value={slot} onValueChange={setSlot}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SLOTS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-cal">Calories (optional)</Label>
              <Input id="d-cal" type="number" min="0" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border p-3">
            {flagDefs.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Switch checked={!!flags[key]} onCheckedChange={(v) => setFlags((f) => ({ ...f, [key]: v }))} />
                {label}
              </label>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Photos (up to 6)</Label>
            <div className="flex flex-wrap gap-2">
              {images.map((src) => (
                <div key={src} className="relative h-16 w-16 overflow-hidden rounded-md border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(src) || ''} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    className="absolute right-0 top-0 bg-black/60 p-0.5 text-white"
                    onClick={() => setImages((p) => p.filter((i) => i !== src))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:text-foreground"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => onPickFiles(e.target.files)} />
            {uploading && <p className="text-xs text-muted-foreground">Uploading…</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-variants">Variants — one per line</Label>
              <Textarea
                id="d-variants"
                rows={3}
                value={variantsText}
                onChange={(e) => setVariantsText(e.target.value)}
                placeholder={'Size: Regular, Large +2.00\nCrust: Thin, Pan'}
                disabled={!!item}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-addons">Add-ons — "name: price" per line (* = required)</Label>
              <Textarea
                id="d-addons"
                rows={3}
                value={addOnsText}
                onChange={(e) => setAddOnsText(e.target.value)}
                placeholder={'Extra cheese: 1.50\nGluten-free base: 2.50*'}
                disabled={!!item}
              />
            </div>
          </div>
          {item && (
            <p className="text-xs text-muted-foreground">
              Variants and add-ons are shown for reference — delete and re-create the dish to change their structure.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={busy}>
              {busy ? 'Saving…' : item ? 'Save changes' : 'Add dish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open, onClose, branchId, category,
}: {
  open: boolean;
  onClose: () => void;
  branchId: string;
  category: any | null;
}) {
  const client = useApolloClient();
  const [name, setName] = useState('');
  const [slot, setSlot] = useState('ALL_DAY');
  const [busy, setBusy] = useState(false);
  const [createCat] = useMutation(CREATE_MENU_CATEGORY);
  const [updateCat] = useMutation(UPDATE_MENU_CATEGORY);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setSlot(category?.slot ?? 'ALL_DAY');
    }
  }, [open, category]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error('Category name is too short');
    setBusy(true);
    try {
      if (category) await updateCat({ variables: { id: category.id, input: { name: name.trim(), slot } } });
      else await createCat({ variables: { branchId, input: { name: name.trim(), slot } } });
      await client.refetchQueries({ include: [MGR_BRANCH_MENU] });
      toast.success(category ? 'Category updated' : 'Category added');
      onClose();
    } catch (err: any) {
      toast.error(errMsg(err, 'Could not save the category'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Starters" />
          </div>
          <div className="space-y-1.5">
            <Label>Menu slot</Label>
            <Select value={slot} onValueChange={setSlot}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLOTS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, ' ').toLowerCase()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={busy}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AvailabilityPicker({ item }: { item: any }) {
  const client = useApolloClient();
  const [mutate, { loading }] = useMutation(SET_MENU_ITEM_AVAILABILITY, {
    onCompleted: () => client.refetchQueries({ include: [MGR_BRANCH_MENU] }),
    onError: (e: any) => toast.error(errMsg(e, 'Could not update availability')),
  });
  const opts: { v: string; label: string }[] = [
    { v: 'AVAILABLE', label: 'Available' },
    { v: 'SOLD_OUT', label: 'Sold out' },
    { v: 'UNAVAILABLE', label: 'Hidden' },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <Button
          key={o.v}
          size="sm"
          variant={item.availability === o.v ? 'default' : 'ghost'}
          className={item.availability === o.v ? 'h-7 bg-brand px-2 text-xs hover:bg-brand-dark' : 'h-7 px-2 text-xs text-muted-foreground'}
          disabled={loading}
          onClick={() => mutate({ variables: { id: item.id, availability: o.v } })}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

function MenuBoard({ branches }: { branches: OwnedBranch[] }) {
  const [branchId, setBranchId] = useState('');
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: any | null }>({ open: false, item: null });
  const [catDialog, setCatDialog] = useState<{ open: boolean; category: any | null }>({ open: false, category: null });
  const [confirmDelete, setConfirmDelete] = useState<{ kind: 'item' | 'category'; target: any } | null>(null);
  const client = useApolloClient();
  const [deleteItem] = useMutation(DELETE_MENU_ITEM);
  const [deleteCat] = useMutation(DELETE_MENU_CATEGORY);

  useEffect(() => {
    if (!branches.length) return;
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LS_BRANCH);
    } catch {
      /* private mode */
    }
    setBranchId(branches.some((b) => b.id === stored) ? stored! : branches[0].id);
  }, [branches]);

  const { data, loading, refetch } = useQuery(MGR_BRANCH_MENU, {
    variables: { branchId },
    skip: !branchId,
    fetchPolicy: 'cache-and-network',
  });
  const categories: any[] = data?.branchMenu ?? [];
  const flatCats = useMemo(() => categories, [categories]);

  if (!branches.length) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No branches available for this account yet.</p>;
  }

  const doDelete = async () => {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'item') await deleteItem({ variables: { id: confirmDelete.target.id } });
      else await deleteCat({ variables: { id: confirmDelete.target.id } });
      await client.refetchQueries({ include: [MGR_BRANCH_MENU] });
      toast.success(confirmDelete.kind === 'item' ? 'Dish removed' : 'Category removed');
    } catch (e: any) {
      toast.error(errMsg(e, 'Delete failed'));
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={branchId}
          onValueChange={(v) => {
            setBranchId(v);
            try {
              window.localStorage.setItem(LS_BRANCH, v);
            } catch {
              /* ignore */
            }
          }}
        >
          <SelectTrigger className="w-60"><SelectValue placeholder="Choose branch" /></SelectTrigger>
          <SelectContent>
            {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatDialog({ open: true, category: null })} disabled={!branchId}>
            <Plus className="mr-1 h-4 w-4" /> Category
          </Button>
          <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={!branchId || !categories.length}
            onClick={() => setItemDialog({ open: true, item: null })}>
            <Plus className="mr-1 h-4 w-4" /> Dish
          </Button>
        </div>
      </div>

      {loading && !categories.length ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      ) : !categories.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Your menu is empty. Start by adding a category (e.g. Starters, Pizzas, Drinks).</p>
            <Button size="sm" className="bg-brand hover:bg-brand-dark" onClick={() => setCatDialog({ open: true, category: null })} disabled={!branchId}>
              <Plus className="mr-1 h-4 w-4" /> Add first category
            </Button>
          </CardContent>
        </Card>
      ) : (
        categories.map((c: any) => (
          <Card key={c.id}>
            <CardContent className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold">{c.name}</h3>
                  <Badge variant="outline" className="text-xs">{c.slot.replace(/_/g, ' ').toLowerCase()}</Badge>
                  {c.isActive === false && <Badge variant="outline" className="text-xs text-muted-foreground">hidden</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  {c.isActive !== undefined && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      visible
                      <Switch
                        checked={!!c.isActive}
                        onCheckedChange={async (v) => {
                          try {
                            await client.mutate({ mutation: UPDATE_MENU_CATEGORY, variables: { id: c.id, input: { name: c.name, slot: c.slot, isActive: v } } });
                            refetch();
                          } catch (e: any) {
                            toast.error(errMsg(e, 'Could not update category'));
                          }
                        }}
                      />
                    </label>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCatDialog({ open: true, category: c })}>Rename</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ kind: 'category', target: c })}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              </div>
              <div className="divide-y rounded-lg border">
                {(c.items ?? []).map((it: any) => (
                  <div key={it.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                      {it.imageUrls?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={assetUrl(it.imageUrls[0]) || ''} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center"><Flame className="h-4 w-4 text-muted-foreground" /></div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {it.name}
                        {it.isBestSeller && <Badge className="ml-2 bg-brand/10 text-brand" variant="outline">best seller</Badge>}
                        {it.availability === 'SOLD_OUT' && <Badge className="ml-2 bg-destructive/10 text-destructive" variant="outline">sold out</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(it.price)}
                        {it.compareAtPrice ? ` · was ${formatMoney(it.compareAtPrice)}` : ''}
                        {it.prepTimeMinutes ? ` · ${it.prepTimeMinutes} min` : ''}
                        {it.variants?.length ? ` · ${it.variants.length} variant group${it.variants.length > 1 ? 's' : ''}` : ''}
                        {it.addOns?.length ? ` · ${it.addOns.length} add-on${it.addOns.length > 1 ? 's' : ''}` : ''}
                      </p>
                    </div>
                    <AvailabilityPicker item={it} />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setItemDialog({ open: true, item: { ...it, category: c } })}>Edit</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => setConfirmDelete({ kind: 'item', target: it })}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {(c.items ?? []).length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">No dishes in this category yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <ItemDialog open={itemDialog.open} onClose={() => setItemDialog({ open: false, item: null })} branchId={branchId} categories={flatCats} item={itemDialog.item} />
      <CategoryDialog open={catDialog.open} onClose={() => setCatDialog({ open: false, category: null })} branchId={branchId} category={catDialog.category} />

      <Dialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.kind === 'item' ? 'dish' : 'category'}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmDelete?.kind === 'item'
              ? `"${confirmDelete?.target?.name}" will be removed from the menu. Past orders keep their snapshot.`
              : `"${confirmDelete?.target?.name}" and all of its dishes will be removed.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Keep it</Button>
            <Button variant="destructive" onClick={doDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function RestaurantMenuPage() {
  return (
    <RestaurantPage>{(ctx) => <MenuBoard branches={ctx.branches} />}</RestaurantPage>
  );
}
