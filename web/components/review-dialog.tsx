'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PENDING_REVIEW } from '@/lib/graphql/queries';
import { CREATE_REVIEW } from '@/lib/graphql/mutations';

interface Props {
  order: {
    id: string;
    branch?: { id: string; restaurant?: { id: string } };
    delivery?: { driver?: { userId: string } | null };
  } | null;
  onClose: () => void;
  onDone?: () => void;
}

function StarsInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} stars`}>
          <Star className={'h-6 w-6 ' + (n <= value ? 'fill-yellow-400 text-yellow-400' : 'text-muted')} />
        </button>
      ))}
    </div>
  );
}

/**
 * Post-delivery rating dialog: rates the restaurant and (when there was a
 * delivery) the driver, skipping whatever was already rated.
 */
export function ReviewDialog({ order, onClose, onDone }: Props) {
  const [orderRated, setOrderRated] = useState(false);
  const [driverRated, setDriverRated] = useState(false);
  const hasDriver = !!order?.delivery?.driver?.userId;

  const [rating, setRating] = useState(5);
  const [driverRating, setDriverRating] = useState(5);
  const [comment, setComment] = useState('');
  const [driverComment, setDriverComment] = useState('');
  const [busy, setBusy] = useState(false);

  const pendingQ = useQuery(PENDING_REVIEW, {
    variables: { orderId: order?.id },
    skip: !order?.id,
    errorPolicy: 'ignore',
  });

  useEffect(() => {
    const p = pendingQ.data?.pendingReviewForOrder;
    if (p) {
      setOrderRated(!!p.orderRated);
      setDriverRated(!!p.driverRated);
    }
  }, [pendingQ.data]);

  const [createReview] = useMutation(CREATE_REVIEW);

  const submit = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const restaurantId = order.branch?.restaurant?.id;
      if (!orderRated && restaurantId) {
        await createReview({
          variables: {
            input: {
              orderId: order.id,
              restaurantId,
              branchId: order.branch?.id,
              type: 'restaurant',
              rating,
              comment: comment.trim() || undefined,
            },
          },
        });
      }
      if (hasDriver && !driverRated) {
        await createReview({
          variables: {
            input: {
              orderId: order.id,
              restaurantId: order.branch?.restaurant?.id,
              driverUserId: order.delivery!.driver!.userId,
              type: 'driver',
              rating: driverRating,
              comment: driverComment.trim() || undefined,
            },
          },
        });
      }
      toast.success('Thanks for your feedback!');
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message?.replace('GraphQL error: ', '') || 'Could not save your review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate your order</DialogTitle>
          <DialogDescription>Help others (and us) keep things delicious.</DialogDescription>
        </DialogHeader>

        {orderRated ? (
          <p className="text-sm text-muted-foreground">You already rated the restaurant for this order.</p>
        ) : (
          <div className="space-y-2">
            <Label>Restaurant</Label>
            <StarsInput value={rating} onChange={setRating} />
            <Textarea
              placeholder="How was the food and service?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        )}

        {hasDriver && (
          <>
            <Separator />
            {driverRated ? (
              <p className="text-sm text-muted-foreground">You already rated the driver.</p>
            ) : (
              <div className="space-y-2">
                <Label>Driver</Label>
                <StarsInput value={driverRating} onChange={setDriverRating} />
                <Textarea
                  placeholder="How was the delivery?"
                  value={driverComment}
                  onChange={(e) => setDriverComment(e.target.value)}
                />
              </div>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Later</Button>
          <Button className="bg-brand hover:bg-brand-dark" disabled={busy} onClick={submit}>
            {busy ? 'Sending…' : 'Submit review'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
