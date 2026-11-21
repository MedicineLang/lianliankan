package com.villagelink.game.ad

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.ViewGroup
import com.mobads.vivatb.WindMillError
import com.mobads.vivatb.models.AdInfo
import com.mobads.vivatb.splash.WMSplashAd
import com.mobads.vivatb.splash.WMSplashAdListener
import com.mobads.vivatb.splash.WMSplashAdRequest

/**
 * 灰鲸开屏广告封装。
 *
 * 用法：Activity 里准备一个覆盖全屏的容器（FrameLayout），
 * 在 SDK 初始化成功后调用 WhaleSplash.show(activity, container)。
 * 无论成功、失败还是超时，容器都会被移除，不会挡住游戏。
 */
object WhaleSplash {

    private const val TAG = "WhaleSplash"

    /** 兜底时长：超过这个时间还没展示出广告，就撤掉遮罩 */
    private const val WATCHDOG_MS = 5000L

    private var ad: WMSplashAd? = null

    fun show(activity: Activity, container: ViewGroup) {
        if (!WhaleAdConfig.enabled || WhaleAdConfig.SPLASH_ID.isBlank()) {
            Log.i(TAG, "未配置开屏广告位，跳过")
            hide(container)
            return
        }
        activity.runOnUiThread { start(activity, container) }
    }

    private fun start(activity: Activity, container: ViewGroup) {
        val handler = Handler(Looper.getMainLooper())
        var finished = false
        var presented = false

        val splash = try {
            WMSplashAd(activity, WMSplashAdRequest(WhaleAdConfig.APP_ID, WhaleAdConfig.SPLASH_ID, null))
        } catch (e: Throwable) {
            Log.e(TAG, "开屏创建异常", e)
            hide(container)
            return
        }
        ad = splash

        fun finish() {
            if (finished) return
            finished = true
            handler.removeCallbacksAndMessages(null)
            try { splash.destroy() } catch (_: Throwable) {}
            hide(container)
        }

        val watchdog = Runnable {
            if (!presented) {
                Log.w(TAG, "开屏超时未展示，撤掉遮罩")
                finish()
            }
        }
        handler.postDelayed(watchdog, WATCHDOG_MS)

        splash.setSplashAdListener(object : WMSplashAdListener {
            override fun onSplashAdSuccessLoad(placementId: String?) {
                Log.i(TAG, "开屏加载成功 pid=$placementId")
            }

            override fun onSplashAdFailToLoad(error: WindMillError?, msg: String?) {
                Log.w(TAG, "开屏加载失败 msg=$msg")
                finish()
            }

            override fun onSplashAdSuccessPresent(adInfo: AdInfo?) {
                presented = true
                handler.removeCallbacks(watchdog)
                Log.i(TAG, "开屏展示成功")
            }

            override fun onSplashAdFailToPresent(error: WindMillError?, msg: String?) {
                Log.w(TAG, "开屏展示失败 msg=$msg")
                finish()
            }

            override fun onSplashAdClicked(adInfo: AdInfo?) {
                Log.i(TAG, "开屏点击")
            }

            override fun onSplashClosed(adInfo: AdInfo?) {
                Log.i(TAG, "开屏关闭")
                finish()
            }
        })

        try {
            splash.loadAdAndShow(container)
        } catch (e: Throwable) {
            Log.e(TAG, "开屏调用异常", e)
            finish()
        }
    }

    private fun hide(container: ViewGroup) {
        container.post {
            container.removeAllViews()
            container.visibility = View.GONE
        }
    }
}
