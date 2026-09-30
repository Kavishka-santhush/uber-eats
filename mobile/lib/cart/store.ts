import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
 * matching delivery semantics where one order ships from one kitchen. Persisted
 * to AsyncStorage so the basket survives app restarts.
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
    {
      name: 'qb_cart',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Count of individual units in the basket (badge on the cart tab). */
export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

/** Items subtotal before fees, tips and discounts. */
export const cartItemsTotal = (lines: CartLine[]) =>
  lines.reduce((sum, l) => {
    const addOns = l.addOns.reduce((a, x) => a + x.price, 0) * l.quantity;
    return sum + l.unitPrice * l.quantity + addOns;
  }, 0);
