import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Registers the device's Expo push token (push_tokens). Sending pushes is done server side later
 * (dispatch-notification, Phase 7). Needs a real device and an EAS project id; silently skipped otherwise.
 */
export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web' || !Device.isDevice) return;
    void (async () => {
      try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        if (!projectId) return;
        // loaded lazily: the module is not needed (and warns) on the web build
        const Notifications = await import('expo-notifications');
        const perm = await Notifications.requestPermissionsAsync();
        if (!perm.granted) return;
        const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
        await supabase.rpc('register_push_token', { p_token: data, p_platform: Platform.OS });
      } catch {
        /* push is optional — in-app notifications still work */
      }
    })();
  }, [enabled]);
}
