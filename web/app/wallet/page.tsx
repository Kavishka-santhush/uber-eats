'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { Coins, CreditCard, History, Wallet as WalletIcon, Trophy } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { MY_WALLET, LOYALTY_HISTORY, ME_FULL } from '@/lib/graphql/queries';
import { TOPUP_WALLET, CONFIRM_TOPUP, REDEEM_LOYALTY } from '@/lib/graphql/mutations';
import { collectAndConfirmCard } from '@/lib/stripe';
import { formatMoney } from '@/lib/utils';
import { formatDateTime } from '@/lib/date';
import { useAuth } from '@/lib/auth/store';

const TX_TONES: Record<string, string> = {
  DEPOSIT: 'text-brand',
  WALLET_TOPUP: 'text-brand',
  ADMIN_ADJUSTMENT: 'text-brand',
  ORDER_REFUND: 'text-brand',
  ORDER_PAYMENT: 'text-red-600',
  WITHDRAWAL: 'text-red-600',
};

function WalletInner() {
  const user = useAuth((s) => s.user);
  const [page, setPage] = useState(1);
  const { data, loading, refetch } = useQuery(MY_WALLET, { variables: { page, limit: 15 } });
  const meQ = useQuery(ME_FULL);
  const loyalty: number = meQ.data?.me?.loyaltyPoints ?? 0;
  const wallet = data?.myWallet;
  const txs: any[] = wallet?.transactions?.items ?? [];
  const pages = wallet?.transactions?.pages ?? 1;

  const loyaltyQ = useQuery(LOYALTY_HISTORY, { variables: { page: 1, limit: 10 } });

  const [amount, setAmount] = useState('20');
  const [topUp, { loading: toppingUp }] = useMutation(TOPUP_WALLET);
  const [confirmTopup] = useMutation(CONFIRM_TOPUP);
  const [redeem, { loading: redeeming }] = useMutation(REDEEM_LOYALTY);
  const cardMountRef = useRef<HTMLDivElement | null>(null);

  const doTopUp = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1) return toast.error('Enter at least 1.00');
    setBusyMount(true);
    try {
      const res = await topUp({ variables: { amount: amt.toFixed(2) } });
      const payload = res.data?.topUpWallet ?? {};
      if (!payload.clientSecret) {
        // free topup path (e.g. mock mode) — done immediately
        toast.success('Wallet credited');
        await refetch();
        return;
      }
      let mountEl = cardMountRef.current;
      if (!mountEl) {
        mountEl = document.createElement('div');
        document.body.appendChild(mountEl);
        cardMountRef.current = mountEl;
      }
      mountEl.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4';
      mountEl.innerHTML =
        '<div class="w-full max-w-sm space-y-3 rounded-xl bg-white p-4"><p class="font-semibold text-gray-900">Add funds with card</p><div id="qb-topup-card" class="rounded border bg-white p-2"></div></div>';
      const cardEl = document.getElementById('qb-topup-card');
      if (!cardEl) throw new Error('Card form failed to mount');
      const result = await collectAndConfirmCard(cardEl, { clientSecret: payload.clientSecret, holderName: user?.fullName });
      if (result !== 'succeeded') throw new Error('Card payment was not completed');
      if (payload.intentId) await confirmTopup({ variables: { intentId: payload.intentId } });
      toast.success('Wallet topped up!');
      refetch();
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Top-up failed');
    } finally {
      setBusyMount(false);
      cardMountRef.current?.remove();
      cardMountRef.current = null;
    }
  };
  const [busyMount, setBusyMount] = useState(false);

  const doRedeem = async () => {
    try {
      await redeem({ variables: { points: Math.min(loyalty, 500) } });
      toast.success('Loyalty points converted to wallet credit');
      refetch();
      meQ.refetch();
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Redeem failed');
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="mb-6 text-2xl font-bold">Wallet & rewards</h1>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-brand/15 p-3"><WalletIcon className="h-6 w-6 text-brand" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Balance</p>
              <p className="text-xl font-bold">{loading ? <Skeleton className="h-6 w-20" /> : formatMoney(wallet?.balance)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-full bg-amber-500/15 p-3"><Trophy className="h-6 w-6 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">Loyalty points</p>
              <p className="text-xl font-bold">{loyalty.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <form onSubmit={doTopUp} className="flex gap-2">
              <Input
                type="number"
                min={1}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Top-up amount"
              />
              <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={toppingUp || busyMount}>
                <CreditCard className="mr-1 h-4 w-4" /> Top up
              </Button>
            </form>
            <Button variant="outline" size="sm" className="mt-2 w-full" disabled={redeeming || loyalty < 100} onClick={doRedeem}>
              <Coins className="mr-1 h-3.5 w-3.5" /> Redeem 500 pts → $5.00
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Transactions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {txs.length === 0 && <p className="p-4 text-sm text-muted-foreground">No transactions yet.</p>}
            <ul className="divide-y">
              {txs.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.note || t.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className={TX_TONES[t.type] || 'font-medium'}>
                      {Number(t.amount) >= 0 ? '+' : ''}{formatMoney(t.amount)}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatMoney(t.balanceAfter)}</p>
                  </div>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="flex items-center justify-center gap-2 border-t p-3">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Newer</Button>
                <Badge variant="outline">{page}/{pages}</Badge>
                <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>Older</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4" /> Loyalty history
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Separator />
            <ul className="divide-y">
              {(loyaltyQ.data?.loyaltyHistory ?? []).map((h: any) => (
                <li key={h.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium">{h.note || h.type.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</p>
                  </div>
                  <p className={Number(h.points) >= 0 ? 'font-semibold text-brand' : 'font-semibold text-red-600'}>
                    {Number(h.points) >= 0 ? '+' : ''}{h.points} pts
                  </p>
                </li>
              ))}
              {(loyaltyQ.data?.loyaltyHistory ?? []).length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Earn points on every order!</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function WalletPage() {
  return (
    <AuthGuard>
      <WalletInner />
    </AuthGuard>
  );
}
