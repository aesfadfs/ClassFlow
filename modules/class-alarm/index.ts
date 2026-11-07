import { requireOptionalNativeModule } from 'expo-modules-core';

/** Android only; null on iOS and the web. */
export type ClassAlarmNative = {
  /** Replaces every alarm this app created with `alarmsJson` ([{ id, at, title, body }]); returns how many were set. */
  sync(alarmsJson: string, sound: string, vibration: number[]): number;
  /** Removes every alarm this app created. Never touches alarms from other apps. */
  cancelAll(): void;
  /** Silences an alarm that is ringing right now. */
  stopRinging(): void;
  /** Android 12: exact alarms need the 「闹钟和提醒」 special access. */
  canScheduleExact(): boolean;
  openExactAlarmSettings(): void;
  /** A one-off alarm `seconds` from now, outside the synced list. */
  test(seconds: number, title: string, body: string, sound: string, vibration: number[]): void;
};

export default requireOptionalNativeModule<ClassAlarmNative>('ClassAlarm');
