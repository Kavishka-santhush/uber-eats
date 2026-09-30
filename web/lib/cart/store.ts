import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartAddOn {
  id: string;
  name: string;
  price: number;
}

export interface CartLine {
  lineId: string; // stable key (item + variant + add-ons + instructions combo)
  menuItemId: string;
  branchId: string;
  restaurantId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  variantOptionId?: string | null;
  variantLabel?: string | null;
  addOns: CartAddOn[];
  specialInstructions?: string;
  image?: string;
}

type AddInput = Omit<CartLine, 'lineId' | 'quantity'> & { quantity?: number; branchName?: string };

interface CartState {
  lines: CartLine[];
  branchId: string | null;
  branchName: string | null;
  add: (line: AddInput) => void;
  setQty: (lineId: string, quantity: number) => void;
  remove: (lineId: string) => void;
  clear: () => void;
}

function keyFor(l: Pick<CartLine, 'menuItemId' | 'variantOptionId' | 'addOns' | 'specialInstructions'>) {
  return [
    l.menuItemId,
    l.variantOptionId ?? '-',
    l.addOns.map((a) => a.id).sort().join(','),
    l.specialInstructions ?? '',
  ].join('|');
}

/**
 * Single-branch cart: adding an item from a different branch replaces the cart,
 * matching delivery semantics where one order ships from one kitchen.
 */
export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      branchId: null,
      branchName: null,
      add: ({ branchName, quantity = 1, ...rest }) =>
        set((state) => {
          const replacingBranch = !!state.branchId && state.branchId !== rest.branchId;
          const base = replacingBranch ? [] : state.lines;
          const key = keyFor(rest);
          const existing = base.find((l) => keyFor(l) === key);
          const lines = existing
            ? base.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + quantity } : l))
            : [...base, { ...rest, quantity, lineId: `${key}-${Date.now()}` }];
          return {
            lines,
            branchId: rest.branchId,
            branchName: branchName ?? (replacingBranch ? null : state.branchName),
          };
        }),
      setQty: (lineId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.lineId !== lineId)
              : state.lines.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
        })),
      remove: (lineId) => set((state) => ({ lines: state.lines.filter((l) => l.lineId !== lineId) })),
      clear: () => set({ lines: [], branchId: null, branchName: null }),
    }),
    { name: 'qb_cart' },
  ),
);

export const selectCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
export const selectSubtotal = (s: CartState) =>
  s.lines.reduce((n, l) => n + (l.unitPrice + l.addOns.reduce((a, x) => a + x.price, 0)) * l.quantity, 0);
