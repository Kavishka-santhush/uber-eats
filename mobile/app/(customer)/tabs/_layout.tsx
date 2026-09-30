import React from 'react';
import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '@/lib/cart/store';
import { useAuth } from '@/lib/auth/store';
import { palette, useTheme } from '@/lib/theme';

/**
 * Customer tab bar. Four destinations only — the cart lives above the fold as
 * a floating pill (see components/cart-fab) because it is contextual, not a
 * place people browse.
 */
export default function CustomerTabsLayout() {
  const theme = useTheme();
  const user = useAuth((s) => s.user);
  const lines = useCart((s) => s.lines);
  const units = lines.reduce((n, l) => n + l.quantity, 0);

  if (!user) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.brand,
        tabBarInactiveTintColor: theme.subtext,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'search' : 'search-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Orders',
          // the basket is one tap away from this tab's "resume order" header
          tabBarBadge: units > 0 ? units : undefined,
          tabBarBadgeStyle: { backgroundColor: palette.brand, fontSize: 10 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'receipt' : 'receipt-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
