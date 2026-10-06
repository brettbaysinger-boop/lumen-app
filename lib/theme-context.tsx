import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { DEFAULT_APPEARANCE, readAppearance, appearanceColors, type Appearance } from './appearance';
import { getThemeColors, SCHEMES, type SchemeId, type ExtendedThemeColors } from './theme';

interface ThemeContextValue {
  colors: ExtendedThemeColors;
  schemeId: SchemeId;
  setSchemeId: (id: SchemeId) => void;
  mode: 'dark' | 'light';
  appearance: Appearance;
  setAppearance: (value: Partial<Appearance>) => void;
  resetAppearance: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: getThemeColors('gold-dark'),
  schemeId: 'gold-dark',
  setSchemeId: () => {},
  mode: 'dark',
  appearance: DEFAULT_APPEARANCE, setAppearance: () => {}, resetAppearance: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [schemeId, setSchemeIdState] = useState<SchemeId>('gold-dark');

  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE);
  const appearanceChosen = useRef(false);
  const appearanceRef = useRef(appearance);
  const chosen = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const saved = Platform.OS === 'web' ? localStorage.getItem('lumen-theme')
          : await AsyncStorage.getItem('lumen-theme');
        const custom = Platform.OS === 'web' ? localStorage.getItem('lumen-appearance-v2') : await AsyncStorage.getItem('lumen-appearance-v2');
        if (active && !appearanceChosen.current && custom) {
          const prefs = readAppearance(JSON.parse(custom));
          appearanceRef.current = prefs;
          setAppearanceState(prefs);
        }
        if (active && !chosen.current && SCHEMES.some(s => s.id === saved)) {
          setSchemeIdState(saved as SchemeId);
        }
      } catch { /* Keep the default if storage is unavailable. */ }
    };
    void load();
    return () => { active = false; };
  }, []);

  const setSchemeId = useCallback((id: SchemeId) => {
    chosen.current = true;
    setSchemeIdState(id);
    if (Platform.OS === 'web') {
      try { localStorage.setItem('lumen-theme', id); } catch { /* Keep in-session choice. */ }
    } else {
      void AsyncStorage.setItem('lumen-theme', id).catch(() => {});
    }
  }, []);

  const setAppearance = useCallback((value: Partial<Appearance>) => {
    appearanceChosen.current = true;
    const next = readAppearance({ ...appearanceRef.current, ...value });
    appearanceRef.current = next;
    setAppearanceState(next);
    if (Platform.OS === 'web') { try { localStorage.setItem('lumen-appearance-v2', JSON.stringify(next)); } catch {} }
    else void AsyncStorage.setItem('lumen-appearance-v2', JSON.stringify(next)).catch(() => {});
  }, []);
  const resetAppearance = useCallback(() => setAppearance(DEFAULT_APPEARANCE), [setAppearance]);
  const colors = useMemo(() => appearanceColors(schemeId, appearance), [schemeId, appearance]);
  const mode = schemeId.includes('light') ? 'light' : 'dark';

  return (
    <ThemeContext.Provider value={{ colors, schemeId, setSchemeId, mode, appearance, setAppearance, resetAppearance }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
