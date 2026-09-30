import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppearanceMode = 'system' | 'light' | 'dark';

interface AppearanceState {
  mode: AppearanceMode;
  setMode: (mode: AppearanceMode) => void;
}

/**
 * Appearance preference for the whole app. 'system' follows the OS colour
 * scheme (what useTheme() falls back to); light/dark override it locally and
 * are mirrored to the account via updateProfile(darkMode) so the preference
 * survives a reinstall once the user signs back in.
 */
export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'qb_appearance',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export const getAppearanceMode = (): AppearanceMode => useAppearance.getState().mode;
