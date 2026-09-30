'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Store, Car, BarChart3, Settings, Radio, LifeBuoy } from 'lucide-react';
import { useAuth, STAFF_ROLES, type Role } from '@/lib/auth/store';

interface Item {
  href: string;
  label: string;
  icon: any;
  roles: Role[];
}

const A = ['SUPER_ADMIN', 'ADMIN'] as Role[];

const ITEMS: Item[] = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, roles: A },
  { href: '/admin/restaurants', label: 'Restaurants', icon: Store, roles: A },
  { href: '/admin/drivers', label: 'Drivers', icon: Car, roles: A },
  { href: '/admin/users', label: 'Users', icon: Users, roles: A },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, roles: A },
  { href: '/admin/settings', label: 'Settings', icon: Settings, roles: ['SUPER_ADMIN'] },
  { href: '/ops', label: 'Live ops', icon: Radio, roles: [...A, 'OPS_MANAGER'] },
  { href: '/support/queue', label: 'Support', icon: LifeBuoy, roles: [...A, 'SUPPORT_AGENT'] },
];

/**
 * Cross-role staff navigation. Renders only the sections the current user's
 * role is allowed to see, so admins, ops managers and support agents share one
 * rail. Returns null for non-staff visitors.
 */
export function StaffNav() {
  const user = useAuth((s) => s.user);
  const pathname = usePathname();
  if (!user || !STAFF_ROLES.includes(user.role)) return null;

  const items = ITEMS.filter((i) => i.roles.includes(user.role));

  return (
    <nav className="flex gap-1 overflow-x-auto border-b pb-px">
      {items.map((i) => {
        const active = pathname === i.href;
        return (
          <Link
            key={i.href}
            href={i.href}
            className={
              'flex shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
              (active ? 'border-brand text-brand' : 'border-transparent text-muted-foreground hover:text-foreground')
            }
          >
            <i.icon className="h-4 w-4" /> {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
