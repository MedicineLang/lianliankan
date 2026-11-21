package com.villagelink.game.ad

import android.app.Activity
import android.util.Log
import com.mobads.vivatb.WindMillAd
import com.mobads.vivatb.WindMillError
import com.mobads.vivatb.WMAdConfig
import com.mobads.vivatb.models.AdInfo
import com.mobads.vivatb.reward.WMRewardAd
import com.mobads.vivatb.reward.WMRewardAdListener
import com.mobads.vivatb.reward.WMRewardAdRequest
import com.mobads.vivatb.reward.WMRewardInfo

/**
 * 灰鲸广告联盟（ad-mill / WindMill 5.6.1）激励视频封装。
 *
 * API 依据随包 AAR 的公开签名：
 *   WindMillAd.sharedAds().startWithAppId(context, appId, WMAdConfig, InitListener)
 *   WMRewardAd(activity, WMRewardAdRequest(appId, placementId, null))
 *     .setRewardAdListener(listener) / loadAd() / isReady() / showAd(activity, HashMap())
 */
object WhaleRewarded {

    private const val TAG = "WhaleRewarded"

    /** 广告结果回调，由 MainActivity 转发到 H5 的 window.WhaleAd.onEvent */
    fun interface Listener {
        fun onResult(result: String) // reward / closed / error
    }

    @Volatile private var inited = false
    @Volatile private var loading = false
    @Volatile private var ready = false
    @Volatile private var rewardedThisRound = false
    private var rewardAd: WMRewardAd? = null
    private var pending: Listener? = null

    /**
     * 初始化。必须在应用启动时调用一次（隐私同意之后）。
     * @param onReady 初始化成功回调，用于接开屏等「必须在初始化后」的广告
     */
    fun init(activity: Activity, onReady: (() -> Unit)? = null) {
        if (!WhaleAdConfig.enabled) {
            Log.i(TAG, "未配置灰鲸 APP_ID / 广告位，广告功能关闭")
            return
        }
        if (inited) {
            onReady?.let { activity.runOnUiThread(it) }
            return
        }
        try {
            WindMillAd.sharedAds().startWithAppId(
                activity.applicationContext,
                WhaleAdConfig.APP_ID,
                WMAdConfig.Builder().appId(WhaleAdConfig.APP_ID).build(),
                object : WindMillAd.WindMillAdInitListener {
                    override fun onInitSuccess() {
                        inited = true
                        Log.i(TAG, "灰鲸 SDK 初始化成功 appId=" + WhaleAdConfig.APP_ID)
                        onReady?.let { cb -> activity.runOnUiThread(cb) }
                    }

                    override fun onInitFailed(code: Int, msg: String?) {
                        inited = false
                        Log.w(TAG, "灰鲸 SDK 初始化失败 code=" + code + " msg=" + msg)
                    }
                }
            )
        } catch (e: Throwable) {
            Log.e(TAG, "初始化异常", e)
        }
    }

    /** 预加载激励视频，减少点击后的等待。 */
    fun preload(activity: Activity) {
        if (!WhaleAdConfig.enabled || WhaleAdConfig.REWARDED_ID.isBlank()) return
        if (ready || loading) return
        try {
            val ad = acquire(activity)
            loading = true
            ad.loadAd()
        } catch (e: Throwable) {
            loading = false
            Log.e(TAG, "预加载异常", e)
        }
    }

    private fun acquire(activity: Activity): WMRewardAd {
        rewardAd?.let { return it }
        val request = WMRewardAdRequest(WhaleAdConfig.APP_ID, WhaleAdConfig.REWARDED_ID, null)
        val ad = WMRewardAd(activity, request)
        ad.setRewardAdListener(object : WMRewardAdListener {
            override fun onVideoAdLoadSuccess(placementId: String?) {
                loading = false
                ready = true
                Log.i(TAG, "激励视频加载成功 pid=" + placementId)
            }

            override fun onVideoAdLoadError(error: WindMillError?, msg: String?) {
                loading = false
                ready = false
                Log.w(TAG, "激励视频加载失败 msg=" + msg)
                if (pending != null) flush("error")
            }

            override fun onVideoAdPlayStart(adInfo: AdInfo?) {
                Log.i(TAG, "开始播放")
            }

            override fun onVideoAdPlayError(error: WindMillError?, msg: String?) {
                Log.w(TAG, "播放失败 msg=" + msg)
                flush("error")
            }

            override fun onVideoAdPlayEnd(adInfo: AdInfo?) {
                Log.i(TAG, "播放结束")
            }

            override fun onVideoAdClicked(adInfo: AdInfo?) {
                Log.i(TAG, "广告点击")
            }

            override fun onVideoRewarded(adInfo: AdInfo?, rewardInfo: WMRewardInfo?) {
                rewardedThisRound = true
                Log.i(TAG, "奖励达成")
            }

            override fun onVideoAdClosed(adInfo: AdInfo?) {
                // 关闭才结算：看过奖励 -> reward，中途退出 -> closed
                val result = if (rewardedThisRound) "reward" else "closed"
                ready = false
                loading = false
                flush(result)
                rewardAd?.destroy()
                rewardAd = null
            }
        })
        rewardAd = ad
        return ad
    }

    /**
     * 展示激励视频（由 H5 的 window.WhaleAdBridge.showRewarded 触发）。
     * @return true 表示已开始展示流程；false 表示当前不可用，H5 会提示稍后重试（不扣积分）
     */
    fun show(activity: Activity, placementId: String, listener: Listener): Boolean {
        val pid = placementId.ifBlank { WhaleAdConfig.REWARDED_ID }
        if (!WhaleAdConfig.enabled || pid.isBlank()) {
            Log.i(TAG, "广告未启用")
            return false
        }
        if (!inited) {
            // 初始化未完成：只负责发起初始化，结果由调用方统一回调一次
            init(activity)
            return false
        }
        pending = listener
        rewardedThisRound = false
        return try {
            val ad = acquire(activity)
            if (ready && ad.isReady) {
                ad.showAd(activity, HashMap())
                true
            } else {
                // 未就绪：触发一次加载后返回 false，调用方回调一次 error，H5 不扣积分
                pending = null
                loading = false
                ad.loadAd()
                false
            }
        } catch (e: Throwable) {
            pending = null
            Log.e(TAG, "展示异常", e)
            false
        }
    }

    private fun flush(result: String) {
        val cb = pending
        pending = null
        try {
            cb?.onResult(result)
        } catch (e: Throwable) {
            Log.e(TAG, "回调异常", e)
        }
    }
}
