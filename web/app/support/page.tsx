'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@apollo/client';
import { gql } from '@apollo/client';
import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { RAISE_TICKET } from '@/lib/graphql/mutations';
import { formatDateTime } from '@/lib/date';

const MY_TICKETS = gql`
  query MyTickets($page: Int, $limit: Int) {
    myTickets(page: $page, limit: $limit) {
      items { id number subject status category createdAt }
      total
      page
      pages
    }
  }
`;

const CATEGORIES = [
  'ORDER_ISSUE',
  'PAYMENT_ISSUE',
  'DELIVERY_ISSUE',
  'ACCOUNT_ISSUE',
  'OTHER',
];

const STATUS_TONE: Record<string, string> = {
  OPEN: 'bg-yellow-500 text-white',
  IN_PROGRESS: 'bg-blue-600 text-white',
  RESOLVED: 'bg-brand text-white',
  CLOSED: 'bg-gray-500 text-white',
  ESCALATED: 'bg-destructive text-white',
};

function SupportInner() {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('ORDER_ISSUE');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [raiseTicket] = useMutation(RAISE_TICKET);
  const { data, loading, refetch } = useQuery(MY_TICKETS, { variables: { page: 1, limit: 10 } });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (subject.trim().length < 4) return toast.error('Give your issue a clear subject');
    if (description.trim().length < 10) return toast.error('Please describe the issue (10+ characters)');
    setBusy(true);
    try {
      const res = await raiseTicket({
        variables: { input: { subject: subject.trim(), description: description.trim(), category } },
      });
      toast.success(`Ticket ${res.data?.raiseTicket?.number ?? ''} opened — we reply within 24h.`);
      setSubject('');
      setDescription('');
      refetch();
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Could not open a ticket');
    } finally {
      setBusy(false);
    }
  };

  const tickets: any[] = data?.myTickets?.items ?? [];

  return (
    <div className="container max-w-4xl py-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <LifeBuoy className="h-6 w-6 text-brand" /> Help & support
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Fastest answers for order issues: open the order and use the chat with the restaurant or driver.
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Open a ticket</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="subject">Subject</Label>
                <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Missing items in my order" />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c.replace(/_/g, ' ')}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="desc">Description</Label>
                <Textarea
                  id="desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us what happened, including the order number if you have it…"
                />
              </div>
              <Button type="submit" className="w-full bg-brand hover:bg-brand-dark" disabled={busy}>
                {busy ? 'Sending…' : 'Submit ticket'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">My tickets</CardTitle></CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
            ) : tickets.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No tickets yet.</p>
            ) : (
              <ul className="divide-y">
                {tickets.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        #{t.number} · {formatDateTime(t.createdAt)}
                      </p>
                    </div>
                    <Badge className={STATUS_TONE[t.status] || ''} variant="outline">
                      {t.status.replace(/_/g, ' ')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t p-3 text-center text-xs text-muted-foreground">
              Replies appear in your <Link href="/notifications" className="underline">notifications</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <AuthGuard>
      <SupportInner />
    </AuthGuard>
  );
}
