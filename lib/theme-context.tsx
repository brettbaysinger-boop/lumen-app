import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';
import { AppearanceSyncQueue } from './appearance-sync-queue';
import { AppearanceCache } from './appearance-cache';
import { supabase } from './supabase';
import {
  DEFAULT_APPEARANCE,
  readAppearance,
  appearanceColors,
  type Appearance,
} from './appearance';
import {
  getThemeColors,
  SCHEMES,
  type SchemeId,
  type ExtendedThemeColors,
} from './theme';

interface ThemeContextValue {
  colors: ExtendedThemeColors;
  schemeId: SchemeId;
  setSchemeId: (id: SchemeId) => void;
  mode: 'dark' | 'light';
  appearance: Appearance;
  setAppearance: (value: Partial<Appearance>) => void;
  resetAppearance: () => void;
  importDeviceAppearance: () => Promise<boolean>;
  hasDeviceAppearance: boolean;
}

type Preferences = {
  schemeId: SchemeId;
  appearance: Appearance;
};

type PendingPreferences = {
  preferences: Preferences;
  revision: number;
};

const DEFAULT_PREFERENCES: Preferences = {
  schemeId: 'gold-dark',
  appearance: DEFAULT_APPEARANCE,
};

const ThemeContext = createContext<ThemeContextValue>({
  colors: getThemeColors('gold-dark'),
  schemeId: 'gold-dark',
  setSchemeId: () => {},
  mode: 'dark',
  appearance: DEFAULT_APPEARANCE,
  setAppearance: () => {},
  resetAppearance: () => {},
  importDeviceAppearance: async () => false,
  hasDeviceAppearance: false,
});

function validScheme(value: unknown): SchemeId {
  return SCHEMES.some(s => s.id === value)
    ? value as SchemeId
    : 'gold-dark';
}

function parsePreferences(value: unknown): Preferences {
  const input = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  return {
    schemeId: validScheme(input.schemeId),
    appearance: readAppearance(input.appearance),
  };
}

async function readStorage(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  return AsyncStorage.getItem(key).catch(() => null);
}

const appearanceCache = new AppearanceCache<Preferences>({
  getItem: readStorage,
  async setItem(key, value) {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;

  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [hasDeviceAppearance, setHasDeviceAppearance] = useState(false);

  const prefsRef = useRef<Preferences>(DEFAULT_PREFERENCES);
  const userRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const readyRef = useRef(false);
  const queueRef = useRef<AppearanceSyncQueue<PendingPreferences> | null>(null);
  const initializationRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([
      readStorage('lumen-theme'),
      readStorage('lumen-appearance-v2'),
    ]).then(([scheme, appearance]) => {
      if (active) setHasDeviceAppearance(scheme !== null || appearance !== null);
    });

    return () => { active = false; };
  }, []);

  const publish = useCallback((next: Preferences) => {
    prefsRef.current = next;
    setPrefs(next);
  }, []);

  useEffect(() => {
    // Wait for initial authentication, but don't restart synchronization
    // whenever companion initialization changes the loading flag.
    if (loading && !userId) return;

    const generation = ++generationRef.current;
    userRef.current = userId;
    readyRef.current = false;
    revisionRef.current = 0;
    initializationRef.current = null;

    queueRef.current?.cancel();
    queueRef.current = null;

    publish(DEFAULT_PREFERENCES);

    if (!userId) return;

    let active = true;

    const queue = new AppearanceSyncQueue<PendingPreferences>(async snapshot => {
      if (!active || generationRef.current !== generation) {
        throw new Error('Appearance session changed');
      }

      const { error } = await supabase
        .from('user_appearance_preferences')
        .upsert({
          user_id: userId,
          scheme_id: snapshot.preferences.schemeId,
          appearance: snapshot.preferences.appearance,
        }, { onConflict: 'user_id' });

      if (error) throw error;

      if (
        active &&
        generationRef.current === generation &&
        userRef.current === userId
      ) {
        await appearanceCache.acknowledge(userId, snapshot.revision);
      }
    });

    queueRef.current = queue;

    const initialize = async () => {
      const cached = await appearanceCache.load(userId, parsePreferences);

      if (!active || generationRef.current !== generation) return;

      if (cached && revisionRef.current === 0 && !queue.pending) {
        publish(cached.preferences);
      }

      const { data, error } = await supabase
        .from('user_appearance_preferences')
        .select('scheme_id, appearance')
        .eq('user_id', userId)
        .maybeSingle();

      if (!active || generationRef.current !== generation) return;

      if (error) {
        console.warn('Raialume appearance load:', error.message);
        // A failed read is NOT an empty cloud record.
        // Retain local preferences and retry initialization later.
        return;
      }

      // Local edits made during the cloud request always take priority.
      // Their cache writes may still be completing asynchronously.
      if (revisionRef.current > 0) {
        readyRef.current = true;
        if (queue.pending) void queue.flush();
        return;
      }

      const latest = appearanceCache.current(userId) ?? cached;

      if (latest?.pending && !queue.pending) {
        // Recover an unsynchronized edit from this account's cache.
        queue.enqueue({
          preferences: latest.preferences,
          revision: latest.revision,
        });
      } else if (data) {
        const cloud = parsePreferences({
          schemeId: data.scheme_id,
          appearance: data.appearance,
        });

        if (!queue.pending) {
          publish(cloud);
          await appearanceCache.acceptCloud(userId, cloud);
        }
      } else if (latest && !queue.pending) {
        // No cloud row exists: seed it from this account's cache.
        const revision = await appearanceCache.update(
          userId,
          latest.preferences
        );

        if (!active || generationRef.current !== generation) return;

        queue.enqueue({
          preferences: latest.preferences,
          revision,
        });
      }

      if (!active || generationRef.current !== generation) return;

      readyRef.current = true;

      if (queue.pending) void queue.flush();
    };

    const retry = () => {
      if (!active || generationRef.current !== generation) return;

      if (!readyRef.current) {
        if (initializationRef.current) return;

        const operation = initialize()
          .catch(error => {
            console.warn('Raialume appearance initialization:', error);
          })
          .finally(() => {
            if (initializationRef.current === operation) {
              initializationRef.current = null;
            }
          });

        initializationRef.current = operation;
      } else if (queue.pending) {
        void queue.flush();
      }
    };

    retry();

    const timer = setInterval(retry, 15000);

    return () => {
      active = false;
      clearInterval(timer);
      initializationRef.current = null;
      queue.cancel();

      if (queueRef.current === queue) {
        queueRef.current = null;
      }
    };
  }, [userId, publish]);

  const update = useCallback((change: (current: Preferences) => Preferences) => {
    const accountId = userRef.current;
    if (!accountId) return;

    const next = change(prefsRef.current);

    revisionRef.current += 1;
    publish(next);

    const queue = queueRef.current;
    if (!queue) return;

    void appearanceCache.update(accountId, next).then(revision => {
      if (
        userRef.current !== accountId ||
        queueRef.current !== queue
      ) return;

      queue.enqueue({ preferences: next, revision });

      if (readyRef.current) {
        void queue.flush();
      }
    }).catch(error => {
      console.warn('Raialume appearance cache write:', error);
    });
  }, [publish]);

  const setSchemeId = useCallback((id: SchemeId) => {
    update(current => ({
      ...current,
      schemeId: validScheme(id),
    }));
  }, [update]);

  const setAppearance = useCallback((value: Partial<Appearance>) => {
    update(current => ({
      ...current,
      appearance: readAppearance({
        ...current.appearance,
        ...value,
      }),
    }));
  }, [update]);

  const resetAppearance = useCallback(() => {
    setAppearance(DEFAULT_APPEARANCE);
  }, [setAppearance]);

  const importDeviceAppearance = useCallback(async (): Promise<boolean> => {
    const accountId = userRef.current;
    if (!accountId || !readyRef.current) return false;

    const [savedScheme, savedAppearance] = await Promise.all([
      readStorage('lumen-theme'),
      readStorage('lumen-appearance-v2'),
    ]);

    if (userRef.current !== accountId) return false;
    if (savedScheme === null && savedAppearance === null) return false;

    let legacyAppearance: unknown = DEFAULT_APPEARANCE;

    if (savedAppearance !== null) {
      try {
        legacyAppearance = JSON.parse(savedAppearance);
      } catch {
        return false;
      }
    }

    const imported: Preferences = {
      schemeId: savedScheme === null
        ? prefsRef.current.schemeId
        : validScheme(savedScheme),
      appearance: savedAppearance === null
        ? prefsRef.current.appearance
        : readAppearance(legacyAppearance),
    };

    update(() => imported);
    return true;
  }, [update]);

  const colors = useMemo(
    () => appearanceColors(prefs.schemeId, prefs.appearance),
    [prefs]
  );

  const mode = prefs.schemeId.includes('light') ? 'light' : 'dark';

  return (
    <ThemeContext.Provider value={{
      colors,
      schemeId: prefs.schemeId,
      setSchemeId,
      mode,
      appearance: prefs.appearance,
      setAppearance,
      resetAppearance,
      importDeviceAppearance,
      hasDeviceAppearance,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
