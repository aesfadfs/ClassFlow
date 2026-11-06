import { Platform } from 'react-native';
import { vibrationPattern, type Reminder, type ReminderSettings } from '../domain/reminders';

// System notifications for class reminders (Android / iOS). The web build has
// no background scheduling, so every call is a no-op there.

const CHANNEL_PREFIX = 'class-reminders';
const PREFIX = 'classflow-reminder:';

type Notifications = typeof import('expo-notifications');
type Look = Pick<ReminderSettings, 'sound' | 'vibration'>;
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

const soundFile = (look: Look) => look.sound === 'none' ? null : look.sound === 'default' ? 'default' : `${look.sound}.wav`;

/**
 * Android fixes a channel's sound and vibration once it is created, so each
 * combination gets its own channel; channels for other combinations are removed.
 */
async function prepareChannel(module: Notifications, look: Look): Promise<string | undefined> {
  if (Platform.OS !== 'android') return undefined;
  const id = `${CHANNEL_PREFIX}-${look.sound}-${look.vibration}`;
  const pattern = vibrationPattern(look.vibration);
  await module.setNotificationChannelAsync(id, {
    name: '上课提醒',
    description: '每节课开始前的提醒',
    // High importance: shown as a heads-up pop-up with sound and vibration.
    importance: module.AndroidImportance.HIGH,
    sound: soundFile(look),
    enableVibrate: !!pattern,
    vibrationPattern: pattern,
    lightColor: '#364BB6',
    lockscreenVisibility: module.AndroidNotificationVisibility.PUBLIC,
    audioAttributes: { usage: module.AndroidAudioUsage.NOTIFICATION, contentType: module.AndroidAudioContentType.SONIFICATION },
  });
  const channels = await module.getNotificationChannelsAsync();
  await Promise.all(channels.filter(channel => channel.id.startsWith(CHANNEL_PREFIX) && channel.id !== id).map(channel => module.deleteNotificationChannelAsync(channel.id)));
  return id;
}

export const remindersSupported = () => Platform.OS !== 'web';

/** Ask for permission when the user turns reminders on. Returns whether notifications may be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  const module = await notifications();
  if (!module) return false;
  const current = await module.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await module.requestPermissionsAsync()).granted;
}

const content = (look: Look, title: string, body: string) => ({
  title, body, sound: soundFile(look) ?? false, vibrate: vibrationPattern(look.vibration) ?? undefined, data: { kind: 'class-reminder' },
});

/** Replace every pending class reminder with `reminders`, using the chosen sound and vibration. */
export async function syncReminders(reminders: Reminder[], look: Look) {
  const module = await notifications();
  if (!module) return;
  const pending = await module.getAllScheduledNotificationsAsync();
  await Promise.all(pending.filter(item => item.identifier.startsWith(PREFIX)).map(item => module.cancelScheduledNotificationAsync(item.identifier)));
  if (!reminders.length || !(await module.getPermissionsAsync()).granted) return;
  const channelId = await prepareChannel(module, look);
  for (const reminder of reminders) {
    await module.scheduleNotificationAsync({
      identifier: PREFIX + reminder.id,
      content: content(look, reminder.title, reminder.body),
      trigger: { type: module.SchedulableTriggerInputTypes.DATE, date: reminder.fireAt, channelId },
    });
  }
}

/** A sample reminder a few seconds from now, to hear and feel the chosen sound and vibration. */
export async function sendTestReminder(look: Look): Promise<boolean> {
  const module = await notifications();
  if (!module || !(await requestReminderPermission())) return false;
  const channelId = await prepareChannel(module, look);
  await module.scheduleNotificationAsync({
    content: content(look, '测试提醒 · 10 分钟后上课', '这是上课提醒的样子，可以锁屏等几秒试试'),
    trigger: { type: module.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId },
  });
  return true;
}
