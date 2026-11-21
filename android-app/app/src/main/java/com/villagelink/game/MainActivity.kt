package com.villagelink.game

import android.Manifest
import android.annotation.SuppressLint
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import com.villagelink.game.ad.WhaleInterstitial
import com.villagelink.game.ad.WhaleRewarded
import com.villagelink.game.ad.WhaleSplash

/**
 * WebView 容器：加载内置 H5 游戏并注入广告桥。
 *
 * 视图结构：
 *   FrameLayout(root)
 *     ├─ WebView        游戏页面
 *     └─ FrameLayout    adLayer，开屏广告覆盖层（默认 GONE）
 *
 * 页面通过 WebViewAssetLoader 以 https://appassets.androidplatform.net 访问，
 * 比 file:// 更稳（Origin 正常、localStorage 与云端同步不被拦截）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var adLayer: FrameLayout

    private val assetLoader: WebViewAssetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        hideSystemBars()
        requestAdPermissions()

        webView = WebView(this)
        adLayer = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
            visibility = View.GONE
        }
        val root = FrameLayout(this)
        root.addView(
            webView,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        root.addView(
            adLayer,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        setContentView(root)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
        }
        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }
        webView.addJavascriptInterface(Bridge(), "WhaleAdBridge")
        webView.loadUrl("https://appassets.androidplatform.net/assets/game.html")

        // 初始化成功后展示开屏（仅冷启动，避免旋转/恢复时反复弹）
        WhaleRewarded.init(this) {
            // SDK 就绪后立刻预拉一条激励视频，玩家点「看广告」基本秒开
            WhaleRewarded.preload(this)
            if (savedInstanceState == null) {
                adLayer.visibility = View.VISIBLE
                WhaleSplash.show(this, adLayer)
            }
        }
        WhaleInterstitial.preload(this)
    }

    /**
     * H5 桥，注入为 window.WhaleAdBridge：
     *   showRewarded(placementId) -> Boolean   激励视频
     *   preloadRewarded()                      预热激励视频
     *   showInterstitial() -> Boolean          插屏（游戏内低频展示）
     */
    inner class Bridge {
        @JavascriptInterface
        fun showRewarded(placementId: String): Boolean {
            // 在 JS 线程等待主线程结果，把真实启动状态同步返回给 H5，避免误报「正在加载」
            val latch = CountDownLatch(1)
            var started = false
            runOnUiThread {
                started = WhaleRewarded.show(this@MainActivity, placementId) { result -> emit(result) }
                if (!started) emit("error")
                latch.countDown()
            }
            latch.await(800, TimeUnit.MILLISECONDS)
            return started
        }

        @JavascriptInterface
        fun preloadRewarded() {
            runOnUiThread { WhaleRewarded.preload(this@MainActivity) }
        }

        @JavascriptInterface
        fun showInterstitial(): Boolean {
            var shown = false
            runOnUiThread {
                shown = WhaleInterstitial.show(this@MainActivity) { }
                if (!shown) WhaleInterstitial.preload(this@MainActivity)
            }
            return shown
        }
    }

    /** 灰鲸等广告 SDK 需要的运行时权限（Android 6+ 必须动态申请） */
    private fun requestAdPermissions() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            needed += Manifest.permission.READ_PHONE_STATE
        }
        if (Build.VERSION.SDK_INT <= 32 &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED
        ) {
            needed += Manifest.permission.WRITE_EXTERNAL_STORAGE
        }
        if (needed.isNotEmpty()) requestPermissions(needed.toTypedArray(), 1001)
    }

    private fun emit(result: String) {
        runOnUiThread {
            webView.evaluateJavascript(
                "window.WhaleAd && window.WhaleAd.onEvent({result:'" + result + "'})",
                null
            )
        }
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                )
        }
    }

    override fun onResume() {
        super.onResume()
        WhaleRewarded.preload(this)
        WhaleInterstitial.preload(this)
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
