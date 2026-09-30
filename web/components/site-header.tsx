'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { gql, useQuery } from '@apollo/client';
import { Bell, ShoppingCart, Menu, Sun, Moon, LogOut, User as UserIcon, LayoutDashboard } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { useAuth, homePathForRole, STAFF_ROLES } from '@/lib/auth/store';
import { logout } from '@/lib/auth/api';
import { useCart, selectCount } from '@/lib/cart/store';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const UNREAD_QUERY = gql`
  query UnreadCount {
    unreadCount
  }
`;

function initials(name?: string) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

export function SiteHeader() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const user = useAuth((s) => s.user);
  const cartCount = useCart(selectCount);
  const [mobileOpen, setMobileOpen] = useState(false);

  const unreadQ = useQuery(UNREAD_QUERY, { skip: !user, pollInterval: 60_000 });
  const unread: number = unreadQ.data?.unreadCount ?? 0;

  const onLogout = async () => {
    await logout();
    router.replace('/');
  };

  const roleHome = user ? homePathForRole(user.role) : '/';
  const isStaff = user && STAFF_ROLES.includes(user.role);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      <div className="container flex h-16 items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen((v) => !v)}>
          <Menu className="h-5 w-5" />
        </Button>

        <Link href="/" className="flex items-center gap-2 font-bold text-xl">
          <span className="text-brand">Quick</span>Bite
        </Link>

        <nav className="ml-6 hidden items-center gap-6 text-sm md:flex">
          <Link href="/" className="hover:text-brand">Browse</Link>
          <Link href="/restaurants" className="hover:text-brand">Restaurants</Link>
          {user && <Link href="/orders" className="hover:text-brand">Orders</Link>}
          {user && <Link href="/support" className="hover:text-brand">Support</Link>}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {user && (
            <Link href="/notifications" className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="h-5 w-5" />
              </Button>
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
          )}

          <Link href="/cart">
            <Button variant="ghost" size="icon">
              <ShoppingCart className="h-5 w-5" />
              {cartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                  {cartCount}
                </span>
              )}
            </Button>
          </Link>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="ml-1 rounded-full outline-none">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatarUrl || ''} />
                    <AvatarFallback>{initials(user.fullName)}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="truncate">{user.fullName}</span>
                    <span className="text-xs text-muted-foreground">{user.role.replace('_', ' ').toLowerCase()}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/profile')}>
                  <UserIcon className="mr-2 h-4 w-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push(roleHome)}>
                  <LayoutDashboard className="mr-2 h-4 w-4" />
                  {isStaff || user.role === 'RESTAURANT_OWNER' || user.role === 'DRIVER' ? 'Dashboard' : 'My account'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onLogout} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => router.push('/login')}>Log in</Button>
              <Button className={cn('bg-brand hover:bg-brand-dark')} onClick={() => router.push('/register')}>
                Sign up
              </Button>
            </div>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background md:hidden">
          <nav className="container flex flex-col py-2 text-sm">
            <Link className="py-2" href="/" onClick={() => setMobileOpen(false)}>Browse</Link>
            <Link className="py-2" href="/restaurants" onClick={() => setMobileOpen(false)}>Restaurants</Link>
            {user && <Link className="py-2" href="/orders" onClick={() => setMobileOpen(false)}>Orders</Link>}
            {user && <Link className="py-2" href="/support" onClick={() => setMobileOpen(false)}>Support</Link>}
          </nav>
        </div>
      )}
    </header>
  );
}
