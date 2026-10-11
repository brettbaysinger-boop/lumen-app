import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { pushEnabled, refreshPush } from '@/lib/push-client';
import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({handleNotification:async notification => {
  const current = await supabase.auth.getSession();
  const owner = current.data.session?.user.id;
  const show = !!owner && notification.request.content.data.owner_id === owner && await pushEnabled(owner);
  return {shouldPlaySound:show,shouldSetBadge:false,shouldShowBanner:show,shouldShowList:show};
}});
export function PushLifecycle() {
  const { session, loading, setupCompanionId } = useAuth();
  const owner = session?.user.id;
  useEffect(() => {
    if (Platform.OS !== 'android' || !owner || loading || setupCompanionId) return;
    let live = true;
    const refresh = () => { if (live) void refreshPush(owner).catch(() => {}); };
    refresh();
    const app = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    const token = Notifications.addPushTokenListener(refresh);
    const timer = setInterval(refresh, 6 * 60 * 60 * 1000);
    async function open(response: Notifications.NotificationResponse | null) {
      if (!live || !response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const data = response.notification.request.content.data;
      if (data.screen !== 'my-day' || data.owner_id !== owner) return;
      const current = await supabase.auth.getSession();
      if (!live || current.data.session?.user.id !== owner) return;
      router.push('/(tabs)/my-day');
      await Notifications.clearLastNotificationResponseAsync();
    }
    void Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const response = Notifications.addNotificationResponseReceivedListener(value => { void open(value).catch(() => {}); });
    return () => { live=false; app.remove(); token.remove(); response.remove(); clearInterval(timer); };
  }, [owner, loading, setupCompanionId]);
  return null;
}
