import { PushLifecycle } from '@/components/PushLifecycle';
import { useEffect } from 'react';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { useAuth, AuthProvider } from '@/lib/auth';
import { ThemeProvider, useTheme } from '@/lib/theme-context';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { APP_ORIENTATION } from '@/lib/room-rotation';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { mode } = useTheme();
  const { session, loading, error, setupCompanionId } = useAuth();
  const pathname = usePathname();
  useEffect(() => {
    if (session && !loading && !error && setupCompanionId && pathname !== '/companion-setup')
      router.replace('/companion-setup');
  }, [session?.user.id, loading, error, setupCompanionId, pathname]);
  return (
    <>
      <PushLifecycle />
      {/* Every screen states portrait; the Live Room screen alone overrides it (lib/room-rotation.ts). */}
      <Stack screenOptions={{ headerShown: false, orientation: APP_ORIENTATION }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}
