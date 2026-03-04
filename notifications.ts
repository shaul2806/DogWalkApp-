import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { db } from './firebaseConfig';
import { doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';

const HOUSEHOLD_ID = 'balu_family';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Register push token ──
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.log('Push tokens require a Dev Build — skipping in Expo Go');
      return null;
    }

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    await updateDoc(ref, {
      pushTokens: arrayUnion({ userId, token }),
    }).catch(() => {});
    return token;
  } catch (e) {
    console.log('Push registration skipped:', e);
    return null;
  }
}

// ── Notify all other family members ──
export async function notifyFamily(senderUserId: string, title: string, body: string) {
  try {
    const ref = doc(db, 'households', HOUSEHOLD_ID);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const tokens: { userId: string; token: string }[] = snap.data().pushTokens ?? [];
    const othersTokens = tokens.filter(t => t.userId !== senderUserId).map(t => t.token);
    if (othersTokens.length === 0) return;
    await fetch('https://exp.host/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        othersTokens.map(token => ({ to: token, title, body, sound: 'default' }))
      ),
    });
  } catch (e) {
    console.log('notifyFamily skipped:', e);
  }
}

// ── Schedule hourly overdue reminder ──
export async function scheduleOverdueReminders() {
  try {
    await cancelOverdueReminders();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔴 Balu needs to go out!',
        body: 'No walk logged recently. Who can take him?',
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60 * 60,
        repeats: true,
      },
    });
  } catch (e) {
    console.log('scheduleOverdueReminders skipped:', e);
  }
}

// ── Schedule daily reminders at specific times ──
// enabledSlots: { morning: true, midday: false, ... }
// skipHours: 0 = always remind, 2 = skip if walked in last 2h, 4 = skip in last 4h
export async function scheduleReminderNotifications(
  enabledSlots: Record<string, boolean>,
  skipHours: number
) {
  try {
    // Cancel existing daily reminders first
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      if (notif.content.data?.type === 'daily_reminder') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }

    const SLOTS = [
      { key: 'morning', label: '🌅 Morning walk time!', hour: 7,  minute: 0 },
      { key: 'midday',  label: '☀️ Midday walk time!',  hour: 13, minute: 0 },
      { key: 'evening', label: '🌆 Evening walk time!', hour: 18, minute: 0 },
      { key: 'night',   label: '🌙 Night walk time!',   hour: 21, minute: 0 },
    ];

    const skipText = skipHours > 0
      ? ` (only if no walk in last ${skipHours}h)`
      : '';

    for (const slot of SLOTS) {
      if (!enabledSlots[slot.key]) continue;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: slot.label,
          body: `Time to take Balu out!${skipText}`,
          sound: true,
          data: { type: 'daily_reminder', slotKey: slot.key, skipHours },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: slot.hour,
          minute: slot.minute,
        },
      });
    }

    console.log('Daily reminders scheduled ✅');
  } catch (e) {
    console.log('scheduleReminderNotifications skipped:', e);
  }
}

// ── Cancel all scheduled notifications ──
export async function cancelOverdueReminders() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {
    console.log('cancelOverdueReminders skipped:', e);
  }
}
