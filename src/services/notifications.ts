import { Platform } from 'react-native';
import ClassAlarm from '../../modules/class-alarm';
import { splitAlarms, vibrationPattern, type Reminder, type ReminderSettings } from '../domain/reminders';

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

/** Android alarm clock mode is available (native module linked, i.e. not iOS / web / an old build). */
export const alarmsSupported = () => Platform.OS === 'android' && !!ClassAlarm;
/** Android 12 needs the 「闹钟和提醒」 access for exact alarms; later versions grant it at install. */
export const alarmsExact = () => ClassAlarm?.canScheduleExact() ?? false;
export const openAlarmAccessSettings = () => ClassAlarm?.openExactAlarmSettings();
/** Silence an alarm that is ringing (called when the app comes to the front). */
export const stopAlarmRinging = () => { try { ClassAlarm?.stopRinging(); } catch { /* not ringing */ } };

/**
 * Replace every pending class reminder. With alarm mode on, the ones due within 24 hours become
 * alarms and the rest notifications; with it off, the alarms this app made are all removed.
 * Only this app's own alarms are ever touched.
 */
export async function syncReminders(reminders: Reminder[], settings: Look & Pick<ReminderSettings, 'alarm'>) {
  const useAlarms = settings.alarm && alarmsSupported();
  const { alarms, notifications: notified } = splitAlarms(reminders, new Date(), useAlarms);
  if (ClassAlarm) {
    try {
      if (useAlarms) ClassAlarm.sync(JSON.stringify(alarms.map(item => ({ id: item.id, at: item.fireAt.getTime(), title: item.title, body: item.body }))), settings.sound, vibrationPattern(settings.vibration) ?? []);
      else ClassAlarm.cancelAll();
    } catch { /* keep notifications working even if the alarm side fails */ }
  }
  await syncNotifications(notified, settings);
}

async function syncNotifications(reminders: Reminder[], look: Look) {
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
export async function sendTestReminder(look: Look & Partial<Pick<ReminderSettings, 'alarm'>>): Promise<boolean> {
  const module = await notifications();
  if (!module || !(await requestReminderPermission())) return false;
  if (look.alarm && alarmsSupported()) {
    ClassAlarm!.test(3, '测试闹钟 · 10 分钟后上课', '这是闹钟响铃的样子：静音时也会响，点「停止」结束', look.sound, vibrationPattern(look.vibration) ?? []);
    return true;
  }
  const channelId = await prepareChannel(module, look);
  await module.scheduleNotificationAsync({
    content: content(look, '测试提醒 · 10 分钟后上课', '这是上课提醒的样子，可以锁屏等几秒试试'),
    trigger: { type: module.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3, channelId },
  });
  return true;
}
