package expo.modules.classalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ClassAlarmModule : Module() {
  private val context get() = requireNotNull(appContext.reactContext) { "React context is not ready" }

  override fun definition() = ModuleDefinition {
    Name("ClassAlarm")

    Function("sync") { alarmsJson: String, sound: String, vibration: List<Double> ->
      AlarmStore.replaceAll(context, AlarmStore.parse(alarmsJson), sound, vibration.map { it.toLong() }.toLongArray())
    }

    Function("cancelAll") {
      AlarmStore.replaceAll(context, emptyList(), AlarmStore.sound(context), AlarmStore.vibration(context))
      Unit
    }

    Function("stopRinging") {
      AlarmService.stop(context)
    }

    Function("canScheduleExact") {
      AlarmStore.canScheduleExact(context)
    }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try { context.startActivity(intent) } catch (_: Exception) {}
      }
    }

    // A one-off alarm that is not part of the synced list, so a sync can never cancel it early.
    Function("test") { seconds: Int, title: String, body: String, sound: String, vibration: List<Double> ->
      val alarm = ClassAlarm("test-" + System.currentTimeMillis(), System.currentTimeMillis() + seconds * 1000L, title, body)
      val intent = AlarmStore.fireIntent(context, alarm)
        .putExtra(AlarmService.EXTRA_SOUND, sound)
        .putExtra(AlarmService.EXTRA_VIBRATION, vibration.map { it.toLong() }.toLongArray())
      val pending = PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      val manager = context.getSystemService(android.content.Context.ALARM_SERVICE) as AlarmManager
      if (AlarmStore.canScheduleExact(context)) manager.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.at, AlarmStore.launchPendingIntent(context)), pending)
      else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, pending)
    }
  }
}
