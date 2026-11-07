package expo.modules.classalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * The alarms this app created, kept in its own preferences. Only alarms listed here are
 * ever cancelled, and they are this app's own PendingIntents, so alarms the user made in a
 * clock app can never be touched.
 */
data class ClassAlarm(val id: String, val at: Long, val title: String, val body: String)

object AlarmStore {
  const val ACTION_FIRE = "app.classflow.alarm.FIRE"
  const val ACTION_STOP = "app.classflow.alarm.STOP"
  const val EXTRA_TITLE = "title"
  const val EXTRA_BODY = "body"
  const val EXTRA_ID = "id"
  private const val PREFS = "classflow_alarms"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_SOUND = "sound"
  private const val KEY_VIBRATION = "vibration"

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun sound(context: Context): String = prefs(context).getString(KEY_SOUND, "class_bell") ?: "class_bell"

  fun vibration(context: Context): LongArray =
    (prefs(context).getString(KEY_VIBRATION, "") ?: "").split(',').mapNotNull { it.trim().toLongOrNull() }.toLongArray()

  fun load(context: Context): List<ClassAlarm> {
    val raw = prefs(context).getString(KEY_ALARMS, null) ?: return emptyList()
    return try {
      val array = JSONArray(raw)
      (0 until array.length()).map { index ->
        val item = array.getJSONObject(index)
        ClassAlarm(item.getString("id"), item.getLong("at"), item.optString("title"), item.optString("body"))
      }
    } catch (_: Exception) { emptyList() }
  }

  private fun save(context: Context, alarms: List<ClassAlarm>, sound: String? = null, vibration: LongArray? = null) {
    val array = JSONArray()
    alarms.forEach { array.put(JSONObject().put("id", it.id).put("at", it.at).put("title", it.title).put("body", it.body)) }
    prefs(context).edit().apply {
      putString(KEY_ALARMS, array.toString())
      if (sound != null) putString(KEY_SOUND, sound)
      if (vibration != null) putString(KEY_VIBRATION, vibration.joinToString(","))
    }.apply()
  }

  fun parse(json: String): List<ClassAlarm> {
    val array = JSONArray(json)
    return (0 until array.length()).map { index ->
      val item = array.getJSONObject(index)
      ClassAlarm(item.getString("id"), item.getDouble("at").toLong(), item.optString("title"), item.optString("body"))
    }
  }

  /** Cancels every alarm this app set before, then sets `alarms` (past ones are dropped). */
  fun replaceAll(context: Context, alarms: List<ClassAlarm>, sound: String, vibration: LongArray): Int {
    load(context).forEach { cancel(context, it.id) }
    val now = System.currentTimeMillis()
    val upcoming = alarms.filter { it.at > now }
    save(context, upcoming, sound, vibration)
    upcoming.forEach { schedule(context, it) }
    return upcoming.size
  }

  /** After a reboot or clock change: set the stored alarms again, forgetting ones already past. */
  fun rescheduleAll(context: Context) {
    val now = System.currentTimeMillis()
    val upcoming = load(context).filter { it.at > now }
    save(context, upcoming)
    upcoming.forEach { schedule(context, it) }
  }

  /** An alarm that has rung is deleted at once. */
  fun forget(context: Context, id: String) {
    save(context, load(context).filter { it.id != id })
  }

  fun canScheduleExact(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    return (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  }

  fun schedule(context: Context, alarm: ClassAlarm) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val fire = firePendingIntent(context, alarm, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    if (canScheduleExact(context)) {
      // The same mechanism clock apps use: exact, wakes the phone, shows the alarm icon in the status bar.
      manager.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.at, launchPendingIntent(context)), fire)
    } else {
      manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.at, fire)
    }
  }

  private fun cancel(context: Context, id: String) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val pending = firePendingIntent(context, ClassAlarm(id, 0, "", ""), PendingIntent.FLAG_NO_CREATE) ?: return
    manager.cancel(pending)
    pending.cancel()
  }

  fun fireIntent(context: Context, alarm: ClassAlarm): Intent =
    Intent(context, AlarmReceiver::class.java)
      .setAction(ACTION_FIRE)
      // The id in the data URI keeps each alarm's PendingIntent distinct.
      .setData(Uri.parse("classflow-alarm://fire/" + Uri.encode(alarm.id)))
      .putExtra(EXTRA_ID, alarm.id)
      .putExtra(EXTRA_TITLE, alarm.title)
      .putExtra(EXTRA_BODY, alarm.body)

  private fun firePendingIntent(context: Context, alarm: ClassAlarm, flag: Int): PendingIntent? =
    PendingIntent.getBroadcast(context, 0, fireIntent(context, alarm), flag or PendingIntent.FLAG_IMMUTABLE)

  fun launchPendingIntent(context: Context): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(context, 1, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
