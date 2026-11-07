package expo.modules.classalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      AlarmStore.ACTION_FIRE -> {
        // Delete it from our list first: an alarm that has rung is gone, whatever happens next.
        intent.getStringExtra(AlarmStore.EXTRA_ID)?.let { AlarmStore.forget(context, it) }
        val ring = Intent(context, AlarmService::class.java)
          .setAction(AlarmService.ACTION_RING)
          .putExtra(AlarmStore.EXTRA_TITLE, intent.getStringExtra(AlarmStore.EXTRA_TITLE) ?: "上课提醒")
          .putExtra(AlarmStore.EXTRA_BODY, intent.getStringExtra(AlarmStore.EXTRA_BODY) ?: "")
          .putExtra(AlarmService.EXTRA_SOUND, intent.getStringExtra(AlarmService.EXTRA_SOUND) ?: AlarmStore.sound(context))
          .putExtra(AlarmService.EXTRA_VIBRATION, intent.getLongArrayExtra(AlarmService.EXTRA_VIBRATION) ?: AlarmStore.vibration(context))
        try {
          ContextCompat.startForegroundService(context, ring)
        } catch (_: Exception) {
          // Starting from the background was refused (exact alarm access revoked): still show the reminder.
          AlarmService.postReminder(context, ring.getStringExtra(AlarmStore.EXTRA_TITLE) ?: "上课提醒", ring.getStringExtra(AlarmStore.EXTRA_BODY) ?: "")
        }
      }
      AlarmStore.ACTION_STOP -> AlarmService.stop(context)
      Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> AlarmStore.rescheduleAll(context)
    }
  }
}
