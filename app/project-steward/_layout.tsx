import { Stack } from 'expo-router';
import { Colors } from '@/lib/theme';

// Standalone route group. Deliberately NOT registered in app/(tabs)/_layout.tsx;
// shared navigation integration is gate G5 and happens later with coordination.
export default function ProjectStewardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.neutral[950] },
      }}
    />
  );
}
