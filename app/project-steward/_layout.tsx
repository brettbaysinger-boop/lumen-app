import { Stack, Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme-context';

// PS-06: the standalone detail route must be gated too. The Projects
// tab inherits the same authenticated protection from the tab layout.
export default function ProjectStewardLayout() {
  const { session, loading, error, setupCompanionId } = useAuth();
  const { colors } = useTheme();

  if (loading) return (
    <View style={{
      flex: 1, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.neutral[950],
    }}>
      <ActivityIndicator color={colors.primary[400]} />
    </View>
  );
  if (!session || error) return <Redirect href="/login" />;
  if (setupCompanionId) return <Redirect href="/companion-setup" />;
  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: colors.neutral[950] },
    }} />
  );
}
