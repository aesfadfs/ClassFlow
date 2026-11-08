package expo.modules.classalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * Rings one class alarm: plays the chosen tone on the ALARM stream (so silent and
 * notification volume do not mute it), vibrates, and shows a notification with 「停止」.
 * Stops after a minute, on 「停止」, or when the app is opened.
 */
class AlarmService : Service() {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { finish() }
  private var title = ""
  private var body = ""

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP_SERVICE) { finish(); return START_NOT_STICKY }
    title = intent?.getStringExtra(AlarmStore.EXTRA_TITLE) ?: "上课提醒"
    body = intent?.getStringExtra(AlarmStore.EXTRA_BODY) ?: ""
    ensureChannel(this)
    val notification = ringingNotification()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(RINGING_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    else startForeground(RINGING_ID, notification)
    releasePlayback()
    play(intent?.getStringExtra(EXTRA_SOUND) ?: "class_bell")
    vibrate(intent?.getLongArrayExtra(EXTRA_VIBRATION) ?: LongArray(0))
    handler.removeCallbacks(timeout)
    handler.postDelayed(timeout, RING_MS)
    return START_NOT_STICKY
  }

  private fun ringingNotification(): Notification {
    val stop = PendingIntent.getService(this, 2, Intent(this, AlarmService::class.java).setAction(ACTION_STOP_SERVICE),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val open = AlarmStore.launchPendingIntent(this)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(smallIcon(this))
      .setContentTitle(title)
      .setContentText(body)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setColor(0xFF364BB6.toInt())
      .setContentIntent(open)
      .setDeleteIntent(stop)
      .addAction(0, "停止", stop)
      .build()
  }

  /** A bundled tone's name, "default", or the URI of the user's own tone (a file the app keeps). */
  private fun toneUri(sound: String): Uri? = when {
    sound.startsWith("file:") -> Uri.parse(sound).takeIf { uri -> uri.path?.let { java.io.File(it).exists() } == true }
    sound == "default" -> RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
    else -> resources.getIdentifier(sound, "raw", packageName).takeIf { it != 0 }?.let { Uri.parse("android.resource://$packageName/$it") }
  }

  private fun play(sound: String) {
    if (sound == "none") return
    // A custom tone that is missing or cannot be decoded still rings, with the class bell.
    if (!start(toneUri(sound)) && sound != FALLBACK_TONE) start(toneUri(FALLBACK_TONE))
  }

  private fun start(uri: Uri?): Boolean {
    if (uri == null) return false
    val next = MediaPlayer()
    return try {
      next.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
      next.setDataSource(this, uri)
      next.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK)
      next.isLooping = true
      next.prepare()
      next.start()
      player = next
      true
    } catch (_: Exception) {
      next.release()
      false
    }
  }

  private fun vibrate(pattern: LongArray) {
    if (pattern.size < 2) return
    val device = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    else @Suppress("DEPRECATION") (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator)
    vibrator = device
    val attributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()
    @Suppress("DEPRECATION")
    device.vibrate(VibrationEffect.createWaveform(pattern, -1), attributes)
  }

  private fun releasePlayback() {
    try { player?.stop() } catch (_: Exception) {}
    player?.release()
    player = null
    vibrator?.cancel()
    vibrator = null
  }

  /** Stop ringing and leave a quiet notification behind, so the reminder can still be read. */
  private fun finish() {
    handler.removeCallbacks(timeout)
    releasePlayback()
    if (title.isNotEmpty()) postReminder(this, title, body)
    title = ""
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
    stopSelf()
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    releasePlayback()
    super.onDestroy()
  }

  companion object {
    const val ACTION_RING = "app.classflow.alarm.RING"
    const val ACTION_STOP_SERVICE = "app.classflow.alarm.STOP_SERVICE"
    const val EXTRA_SOUND = "sound"
    const val EXTRA_VIBRATION = "vibration"
    private const val CHANNEL_ID = "classflow-alarm"
    private const val RINGING_ID = 4207
    private const val RING_MS = 60_000L
    private const val FALLBACK_TONE = "class_bell"

    fun stop(context: Context) {
      // Only reaches the service when it is running; otherwise there is nothing to stop.
      try { context.startService(Intent(context, AlarmService::class.java).setAction(ACTION_STOP_SERVICE)) } catch (_: Exception) {}
    }

    fun ensureChannel(context: Context) {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) != null) return
      // The service plays the tone itself on the alarm stream, so the channel stays silent.
      manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "上课闹钟", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "上课提醒响铃时的通知（铃声由课序走闹钟音量播放）"
        setSound(null, null)
        enableVibration(false)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      })
    }

    fun postReminder(context: Context, title: String, body: String) {
      ensureChannel(context)
      val notification = NotificationCompat.Builder(context, CHANNEL_ID)
        .setSmallIcon(smallIcon(context))
        .setContentTitle(title)
        .setContentText(body)
        .setCategory(NotificationCompat.CATEGORY_REMINDER)
        .setColor(0xFF364BB6.toInt())
        .setAutoCancel(true)
        .setContentIntent(AlarmStore.launchPendingIntent(context))
        .build()
      try {
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify((System.currentTimeMillis() % 100000).toInt() + 5000, notification)
      } catch (_: SecurityException) {}
    }

    private fun smallIcon(context: Context): Int =
      context.resources.getIdentifier("notification_icon", "drawable", context.packageName).takeIf { it != 0 } ?: context.applicationInfo.icon
  }
}
