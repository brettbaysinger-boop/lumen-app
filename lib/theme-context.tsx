import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import type { ReactNode } from 'react';
import { getThemeColors, type SchemeId, type ExtendedThemeColors } from './theme';

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

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        const saved = localStorage.getItem('lumen-theme') as SchemeId | null;
        if (saved) setSchemeIdState(saved);
      } catch {
        // localStorage might not be available
      }
    }
  }, []);

  const setSchemeId = useCallback((id: SchemeId) => {
    setSchemeIdState(id);
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem('lumen-theme', id);
      } catch {
        // ignore
      }
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
