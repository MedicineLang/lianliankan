# 灰鲸广告联盟 SDK 集成说明（com.waoqi.renthouse.cz.llk）

本工程已把灰鲸 SDK（ad-mill / WindMill 5.6.1.2）接完，包含**开屏、插屏、激励视频**三种广告位。
下文按「配置 → 代码 → 打包 → 安装 → 验证」顺序给出可照做的步骤。

---

## 一、环境要求

| 项 | 版本 |
|---|---|
| JDK | 17 |
| Android Studio | Hedgehog 以上，或命令行 Gradle 8.7 |
| compileSdk / targetSdk | 34 |
| minSdk | **24**（灰鲸 SDK 硬要求，低于 24 无法运行） |
| 包名 | `com.waoqi.renthouse.cz.llk`（必须与灰鲸后台登记一致） |

---

## 二、关键配置在哪里

| 配置 | 文件 | 说明 |
|---|---|---|
| 包名 | `gradle.properties` → `APP_PACKAGE` | 唯一入口，改这一行全局生效 |
| 应用 ID / 广告位 | `app/src/main/java/com/villagelink/game/ad/WhaleAdConfig.kt` | APP_ID=174334，6 个广告位 |
| 测试/正式开关 | 同上 → `IS_TEST` | 已设为 `false`（正式计费） |
| SDK 文件 | `app/libs/*.aar` | 18 个 aar，共 32MB |
| 权限与 FileProvider | `app/src/main/AndroidManifest.xml` | 已合并 SDK 要求项 |

---

## 三、依赖（build.gradle.kts 已配好）

```kotlin
implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.aar", "*.jar"))))
multiDexEnabled = true
minSdk = 24
```
另外补齐了 SDK 运行所需的 `gson`、`okhttp3`、`okio`、`glide`、`multidex`、`recyclerview`、`cardview`、`constraintlayout`、`material`。
> 文档里提到的 `com.googlecode.android-query:android-query:0.25.9` 已随 jcenter 下线，**不要加**，SDK 运行不依赖它。

---

## 四、Manifest 必须项（已写入）

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE"/>
<uses-permission android:name="android.permission.READ_PHONE_STATE"/>
<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>   <!-- 视频广告必加，否则黑屏 -->
<uses-permission android:name="android.permission.QUERY_ALL_PACKAGES"/>
```
以及两个 FileProvider（`GDTFileProvider` / `TTFileProvider`）与 `networkSecurityConfig`。
`READ_PHONE_STATE` / 存储权限在 `MainActivity.requestAdPermissions()` 里动态申请。

---

## 五、代码接入位置

```
MainActivity.kt              容器 + 初始化 + WebView 桥
ad/WhaleRewarded.kt          激励视频（预加载 / 展示 / 结算）
ad/WhaleInterstitial.kt      插屏（预加载 / 展示）
ad/WhaleSplash.kt            开屏（初始化成功后展示，5 秒兜底）
```

### 1. 初始化（MainActivity.onCreate）
```kotlin
WhaleRewarded.init(this) {           // 初始化成功后才接开屏
    if (savedInstanceState == null) { // 只有冷启动才弹开屏
        adLayer.visibility = View.VISIBLE
        WhaleSplash.show(this, adLayer)
    }
}
WhaleRewarded.preload(this)
WhaleInterstitial.preload(this)
```

### 2. 开屏
`WhaleSplash.show(activity, container)` 内部调用 `WMSplashAd.loadAdAndShow(container)`。
成功/失败/超时 5 秒都会 `removeAllViews()`，不会挡住游戏。

### 3. 插屏
`WhaleInterstitial.preload(activity)` 预热；`show(activity) { result -> }` 展示。
H5 已在**每 3 关且间隔 ≥2 分钟**时调用一次，不打断操作。
结果回调为 `shown`（已展示）/ `closed` / `error`，`error` 时静默跳过。

### 4. 激励视频
H5 调用 `window.WhaleAdBridge.showRewarded(placementId)`。
**发奖判定**：`onVideoRewarded` 打标记 → `onVideoAdClosed` 才回调 `reward`；
中途退出/跳过 → `closed`；加载或播放失败 → `error`。`error`/`closed` 均不扣积分、不发奖。

### 5. WebView 桥一览
| JS 方法 | 返回 | 用途 |
|---|---|---|
| `WhaleAdBridge.showRewarded(pid)` | Boolean | 展示激励视频 |
| `WhaleAdBridge.preloadRewarded()` | void | 预热激励视频 |
| `WhaleAdBridge.showInterstitial()` | Boolean | 展示插屏 |

广告结果统一回调 `window.WhaleAd.onEvent({result:'reward'|'closed'|'error'})`。

---

## 六、打包 APK

### 方式 A：Android Studio（推荐，最省事）
1. 打开 `android-app` 目录（不是仓库根目录）；
2. 首次打开会自动 Sync，`local.properties` 里的 `sdk.dir` 会自动生成；
3. 菜单 Run ▶ 或 Build → Build Bundle(s)/APK(s) → Build APK(s)；
4. 产物：`app/build/outputs/apk/debug/app-debug.apk`（debug 可直接测广告）。

### 方式 B：命令行
```bash
cd android-app
echo "sdk.dir=$ANDROID_HOME" > local.properties
./gradlew assembleDebug          # 没有 wrapper 时先执行 gradle wrapper --gradle-version 8.7
```
或 `./gradlew assembleRelease`（需在 `build.gradle.kts` 配 signingConfigs 正式签名）。

### 方式 C：GitHub Actions（无需本地环境）
仓库根目录 `.github/workflows/build-apk.yml` 已就绪：推到 GitHub → Actions → `Build Android APK` → Run workflow，
跑完在 Artifacts 下载 `village-link-apk`。

---

## 七、安装到设备 / 模拟器

```bash
adb devices                      # 确认设备已连接（真机需开启 USB 调试）
adb install -r app-debug.apk     # -r 覆盖安装
```
模拟器：Android Studio → Device Manager 建一个 **API 30+、x86_64** 的机型，
把 APK 直接拖进模拟器窗口即可，或：
```bash
adb -e install -r app-debug.apk
```
> 模拟器上部分渠道（穿山甲/优量汇）可能无填充，属正常现象，真机验证更准。

---

## 八、验证广告是否正常

```bash
adb logcat -s WhaleRewarded WhaleSplash WhaleInterstitial
```
正常日志顺序：
```
灰鲸 SDK 初始化成功 appId=174334
开屏加载成功 pid=9178873326955476 → 开屏展示成功 → 开屏关闭
激励视频加载成功 pid=5870225444210928 → 开始播放 → 奖励达成 → 广告关闭
```
判读：
| 现象 | 原因 |
|---|---|
| `初始化失败` | APP_ID 与包名不匹配，或网络/权限缺失 |
| `加载失败 code=...` | 该广告位暂无填充，换真机或稍后重试 |
| 点击无反应 | JS 桥未注入，确认 H5 与 APK 一起更新 |
| 后台无曝光 | `IS_TEST=true`、包名与后台不一致，或未过审 |

灰鲸后台「数据报表 → 广告位」看曝光/点击/收益，**收益按包名归因，包名不一致不计数**。

---

## 九、常见问题

1. **点广告黑屏 5 秒**：那是网页版的本地模拟广告，不是灰鲸 SDK。网页没有原生桥只能兜底，必须装 APK。
2. **编译报找不到 `android-query`**：删掉那一行依赖，SDK 不需要它。
3. **编译报 SDK 版本过低**：`minSdk` 必须 ≥ 24。
4. **装不上（INSTALL_FAILED_UPDATE_INCOMPATIBLE）**：手机里有同包名旧签名版本，先 `adb uninstall com.waoqi.renthouse.cz.llk`。
5. **开屏不弹**：只有冷启动弹一次；热启动/旋转不会重复弹，属预期行为。

---

## 十、上线清单

- [ ] `APP_PACKAGE` = 灰鲸后台已审核通过的正式包名
- [ ] `IS_TEST = false`
- [ ] 6 个广告位 ID 均为**正式**广告位（测试位不计收益）
- [ ] 隐私政策中披露设备标识（IMEI/OAID）与广告 SDK
- [ ] 用正式 keystore 签名出 release 包（debug 签名也能跑，但上架需正式签名）
- [ ] 真机回归：开屏、插屏、激励视频各跑通一次，后台能看到曝光
