'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { registerCustomer } from '@/lib/auth/api';
import { GoogleButton } from '@/components/google-button';
import { config } from '@/lib/config';

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!accepted) return toast.error('Please accept the terms to continue');
    if (form.password.length < 8) return toast.error('Password must be at least 8 characters');
    setBusy(true);
    try {
      await registerCustomer({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      toast.success('Account created — happy ordering!');
      router.replace('/');
    } catch (err: any) {
      toast.error(err?.message?.replace('GraphQL error: ', '') || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container flex min-h-[70vh] items-center justify-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            Join <span className="text-brand">{config.appName}</span>
          </CardTitle>
          <CardDescription>Create your customer account in seconds.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" required value={form.fullName} onChange={set('fullName')} placeholder="Jane Doe" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 555 0100" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={form.password}
                onChange={set('password')}
                placeholder="At least 8 characters"
              />
            </div>
            <label className="flex items-start gap-2 text-sm text-muted-foreground">
              <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
              <span>
                I agree to the terms of service and privacy policy.
              </span>
            </label>
            <Button type="submit" className="w-full bg-brand hover:bg-brand-dark" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </Button>
          </form>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>
          <GoogleButton />

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-brand hover:underline">
              Log in
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            Are you a restaurant owner or driver? You can apply from your profile after signing up.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
