import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNode } from 'react';
import { getThemeColors, SCHEMES, type SchemeId, type ExtendedThemeColors } from './theme';

interface ThemeContextValue {
  colors: ExtendedThemeColors;
  schemeId: SchemeId;
  setSchemeId: (id: SchemeId) => void;
  mode: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: getThemeColors('lumen-dark'),
  schemeId: 'lumen-dark',
  setSchemeId: () => {},
  mode: 'dark',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [schemeId, setSchemeIdState] = useState<SchemeId>('lumen-dark');

  const chosen = useRef(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const saved = Platform.OS === 'web' ? localStorage.getItem('lumen-theme')
          : await AsyncStorage.getItem('lumen-theme');
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

  const colors = useMemo(() => getThemeColors(schemeId), [schemeId]);
  const mode = schemeId.includes('light') ? 'light' : 'dark';

  return (
    <ThemeContext.Provider value={{ colors, schemeId, setSchemeId, mode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
