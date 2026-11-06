import { Platform } from 'react-native';
import type { Reminder } from '../domain/reminders';

// System notifications for class reminders (Android / iOS). The web build has
// no background scheduling, so every call is a no-op there.

const CHANNEL = 'class-reminders';
const PREFIX = 'classflow-reminder:';

type Notifications = typeof import('expo-notifications');
let loaded: Promise<Notifications | null> | null = null;

function notifications() {
  if (Platform.OS === 'web') return Promise.resolve(null);
  loaded ??= import('expo-notifications').then(module => {
    // Show the banner too when a reminder arrives while the app is open.
    module.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return module;
  }).catch(() => null);
  return loaded;
}

async function prepareChannel(module: Notifications) {
  if (Platform.OS !== 'android') return;
  // High importance: Android shows it as a heads-up pop-up with sound and vibration.
  await module.setNotificationChannelAsync(CHANNEL, {
    name: '上课提醒',
    description: '每节课开始前的提醒',
    importance: module.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
    lightColor: '#364BB6',
    lockscreenVisibility: module.AndroidNotificationVisibility.PUBLIC,
    sound: 'default',
  });
}

export const remindersSupported = () => Platform.OS !== 'web';

/** Ask for permission when the user turns reminders on. Returns whether notifications may be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  const module = await notifications();
  if (!module) return false;
  await prepareChannel(module);
  const current = await module.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await module.requestPermissionsAsync()).granted;
}

/** Replace every pending class reminder with `reminders`. */
export async function syncReminders(reminders: Reminder[]) {
  const module = await notifications();
  if (!module) return;
  const pending = await module.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter(item => item.identifier.startsWith(PREFIX)).map(item => module.cancelScheduledNotificationAsync(item.identifier)));
  if (!reminders.length || !(await module.getPermissionsAsync()).granted) return;
  await prepareChannel(module);
  for (const reminder of reminders) {
    await module.scheduleNotificationAsync({
      identifier: PREFIX + reminder.id,
      content: { title: reminder.title, body: reminder.body, sound: 'default', data: { kind: 'class-reminder' } },
      trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: reminder.fireAt, channelId: CHANNEL },
    });
  }
}
