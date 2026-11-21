package com.villagelink.game.ad

/**
 * 灰鲸广告联盟参数集中配置。
 *
 * 【重要】正式包名由 gradle.properties 的 APP_PACKAGE 提供（当前 com.waoqi.renthouse.cz.llk），
 * 必须与灰鲸后台登记的应用包名完全一致，否则曝光不计收益。IS_TEST 必须为 false 才会走正式结算。
 */
object WhaleAdConfig {

    /** 灰鲸应用 ID */
    const val APP_ID = "174334"

    /** 运行时包名，与实际安装包一致（由 BuildConfig.APPLICATION_ID 提供） */
    val packageName: String get() = com.villagelink.game.BuildConfig.APPLICATION_ID

    /** true = 测试模式（无收益），上线须为 false */
    const val IS_TEST = false

    /** 激励视频（本游戏「看广告 +1 次」使用） */
    const val REWARDED_ID = "5870225444210928"

    /** 开屏 */
    const val SPLASH_ID = "9178873326955476"

    /** 插屏 */
    const val INTERSTITIAL_ID = "7921135964545941"

    /** 全屏插屏 */
    const val FULL_INTERSTITIAL_ID = "6610418752764618"

    /** 信息流 */
    const val FEED_ID = "4714663972050724"

    /** Banner */
    const val BANNER_ID = "7677974859977385"

    val enabled: Boolean get() = APP_ID.isNotBlank() && REWARDED_ID.isNotBlank()
}
