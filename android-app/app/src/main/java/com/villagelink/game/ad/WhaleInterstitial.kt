package com.villagelink.game.ad

import android.app.Activity
import android.util.Log
import com.mobads.vivatb.WindMillError
import com.mobads.vivatb.models.AdInfo
import com.mobads.vivatb.interstitial.WMInterstitialAd
import com.mobads.vivatb.interstitial.WMInterstitialAdListener
import com.mobads.vivatb.interstitial.WMInterstitialAdRequest

/**
 * 灰鲸插屏广告封装（预加载 + 展示）。
 *
 * 用法：启动后调用 preload() 预热；合适的时机（例如回首页、局末结算）
 * 调用 show(activity) { result -> } ，result 为 shown / closed / error。
 * 插屏加载失败时静默跳过，不影响游戏。
 */
object WhaleInterstitial {

    private const val TAG = "WhaleInterstitial"

    @Volatile private var ready = false
    @Volatile private var loading = false

    private var ad: WMInterstitialAd? = null
    private var pending: ((String) -> Unit)? = null

    fun preload(activity: Activity) {
        if (WhaleAdConfig.INTERSTITIAL_ID.isBlank()) return
        if (ready || loading) return
        loading = true
        try {
            acquire(activity).loadAd()
        } catch (e: Throwable) {
            loading = false
            Log.e(TAG, "插屏预加载异常", e)
        }
    }

    /** @return true 表示已展示；false 表示暂不可用（调用方可直接忽略） */
    fun show(activity: Activity, callback: ((String) -> Unit)? = null): Boolean {
        if (WhaleAdConfig.INTERSTITIAL_ID.isBlank()) {
            callback?.invoke("error")
            return false
        }
        val current = ad
        if (!ready || current == null || !current.isReady) {
            loading = false
            preload(activity)
            callback?.invoke("error")
            return false
        }
        return try {
            pending = callback
            current.showAd(activity, HashMap())
            true
        } catch (e: Throwable) {
            pending = null
            Log.e(TAG, "插屏展示异常", e)
            callback?.invoke("error")
            false
        }
    }

    private fun acquire(activity: Activity): WMInterstitialAd {
        ad?.let { return it }
        val request = WMInterstitialAdRequest(WhaleAdConfig.APP_ID, WhaleAdConfig.INTERSTITIAL_ID, null)
        val instance = WMInterstitialAd(activity, request)
        instance.setInterstitialAdListener(object : WMInterstitialAdListener {
            override fun onInterstitialAdLoadSuccess(placementId: String?) {
                loading = false
                ready = true
                Log.i(TAG, "插屏加载成功 pid=$placementId")
            }

            override fun onInterstitialAdLoadError(error: WindMillError?, msg: String?) {
                loading = false
                ready = false
                Log.w(TAG, "插屏加载失败 msg=$msg")
                flush("error")
            }

            override fun onInterstitialAdPlayStart(adInfo: AdInfo?) {
                Log.i(TAG, "插屏开始播放")
            }

            override fun onInterstitialAdPlayError(error: WindMillError?, msg: String?) {
                Log.w(TAG, "插屏播放失败 msg=$msg")
                flush("error")
            }

            override fun onInterstitialAdPlayEnd(adInfo: AdInfo?) {
                Log.i(TAG, "插屏播放结束")
            }

            override fun onInterstitialAdClicked(adInfo: AdInfo?) {
                Log.i(TAG, "插屏点击")
            }

            override fun onInterstitialAdClosed(adInfo: AdInfo?) {
                Log.i(TAG, "插屏关闭")
                ready = false
                flush("closed")
                try { instance.destroy() } catch (_: Throwable) {}
                if (ad === instance) ad = null
            }
        })
        ad = instance
        return instance
    }

    private fun flush(result: String) {
        val cb = pending
        pending = null
        try {
            cb?.invoke(result)
        } catch (e: Throwable) {
            Log.e(TAG, "插屏回调异常", e)
        }
    }
}
