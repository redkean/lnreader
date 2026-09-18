package com.margelo.nitro.nitrotts

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.content.ContextCompat

internal class TtsPlaybackService : Service() {
    private lateinit var mediaNotification: TtsMediaNotification
    private var removeSnapshotListener: (() -> Unit)? = null

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        mediaNotification = TtsMediaNotification(this)
        val snapshot = TtsPlaybackStore.snapshot()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                mediaNotification.build(snapshot),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK,
            )
        } else {
            startForeground(NOTIFICATION_ID, mediaNotification.build(snapshot))
        }
        removeSnapshotListener = TtsPlaybackStore.addSnapshotListener(
            mediaNotification::notify,
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_PLAY -> TtsPlaybackStore.play()
            ACTION_PAUSE -> TtsPlaybackStore.pause()
            ACTION_STOP -> TtsPlaybackStore.stop()
            ACTION_PREVIOUS -> TtsPlaybackStore.skipPrevious()
            ACTION_NEXT -> TtsPlaybackStore.skipNext()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        removeSnapshotListener?.invoke()
        removeSnapshotListener = null
        mediaNotification.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        internal const val NOTIFICATION_ID = 1001
        internal const val ACTION_PLAY = "com.lnreader.TTS_PLAY"
        internal const val ACTION_PAUSE = "com.lnreader.TTS_PAUSE"
        internal const val ACTION_STOP = "com.lnreader.TTS_STOP"
        internal const val ACTION_PREVIOUS = "com.lnreader.TTS_PREVIOUS"
        internal const val ACTION_NEXT = "com.lnreader.TTS_NEXT"

        @Volatile
        private var isRunning = false

        /**
         * Starts the playback service unless it is already running.
         *
         * Android 12+ refuses `startForegroundService()` while the app sits in the
         * background, so a service that is already up must never be restarted - crossing a
         * chapter boundary with the screen off would otherwise throw
         * `ForegroundServiceStartNotAllowedException`.
         */
        fun start(context: Context) {
            if (isRunning) {
                return
            }
            val intent = Intent(context, TtsPlaybackService::class.java)
            ContextCompat.startForegroundService(context, intent)
            isRunning = true
        }

        fun stop(context: Context) {
            isRunning = false
            context.stopService(Intent(context, TtsPlaybackService::class.java))
        }

    }
}
