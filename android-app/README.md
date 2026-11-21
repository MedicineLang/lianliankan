# 村庄连连看 · Android 工程（WebView 壳 + 灰鲸激励视频）

H5 游戏本体（`tasks/index.html`）已在壳内运行：`app/src/main/assets/game.html`，
含云端存档、签到、商城、运营后台与微信登录。本工程的职责只有两件事：

1. 提供一个可安装的 Android 应用容器；
2. 把「看广告 +1 次」接到灰鲸激励视频。

## 目录

```
android-app/
├── app/build.gradle.kts              依赖（灰鲸 aar 走 app/libs）
├── app/src/main/assets/game.html      游戏本体（由 sync-web-assets.sh 同步）
├── app/src/main/assets/assets/icons/  方块图标（8 张）
├── app/src/main/java/com/villagelink/game/
│   ├── MainActivity.kt                WebView 容器 + JS 桥
│   └── ad/WhaleAdConfig.kt            灰鲸参数（AppID / 广告位 ID）
│   └── ad/WhaleRewarded.kt            SDK 调用唯一入口（6 处 TODO）
├── sync-web-assets.sh                 一键同步最新 H5
└── ci/github-actions-build-apk.yml    云端出包（可选）
```

## 一、出 APK（三种方式任选）

**A. Android Studio（推荐，最省事）**
`File → Open` 打开 `android-app` 目录 → 等待 Gradle 同步 → `Build → Build App Bundle(s)/APK(s) → Build APK(s)`。
产物：`app/build/outputs/apk/debug/app-debug.apk`，可直接安装到手机。

**B. 命令行（需本机 JDK 17 + Android SDK）**
```bash
cd android-app
gradle wrapper --gradle-version 8.7   # 首次生成 gradlew
./gradlew assembleDebug
```

**C. GitHub Actions**：把 `ci/github-actions-build-apk.yml` 复制到仓库根 `.github/workflows/`，手动触发即可下载 APK。

> 说明：本沙箱环境没有 Android SDK / Gradle 工具链，**未在此处编译验证**。
> 工程的依赖版本（AGP 8.5.2 / Kotlin 1.9.24 / compileSdk 34 / minSdk 23）为当前稳定组合，
> 首次在 Android Studio 打开会自动下载所需组件。

## 二、灰鲸参数（已按你提供的信息填好）

| 项 | 值 | 位置 |
| --- | --- | --- |
| 应用 ID | `174334` | `WhaleAdConfig.APP_ID` |
| 包名 | `com.klkl99.cn.cs` | `app/build.gradle.kts` 的 `applicationId` |
| 激励视频 | `5870225444210928` | `WhaleAdConfig.REWARDED_ID` / H5 `CONFIG.AD_PLACEMENT_ID` |
| 开屏 | `9178873326955476` | `WhaleAdConfig.SPLASH_ID` |
| 插屏 | `7921135964545941` | `WhaleAdConfig.INTERSTITIAL_ID` |
| 全屏插屏 | `6610418752764618` | `WhaleAdConfig.FULL_INTERSTITIAL_ID` |
| 信息流 | `4714663972050724` | `WhaleAdConfig.FEED_ID` |
| Banner | `7677974859977385` | `WhaleAdConfig.BANNER_ID` |

> ⚠️ **当前为测试包名 + 测试广告位，测试包名无收益。**
> 上线前需联系灰鲸商务，用正式包名与正式广告位替换上表；届时只需改 `WhaleAdConfig.kt`、
> `applicationId` 与 H5 的 `CONFIG.AD_PLACEMENT_ID`，业务代码零改动，并把 `IS_TEST` 改为 `false`。

本游戏当前只用到**激励视频**（看广告 +1 次抽奖机会）。开屏在冷启动调用（`MainActivity.onCreate`），
插屏已预留入口（`WhaleRewarded.showInterstitial`），建议只在「领取奖励弹窗关闭后」这类自然停顿处调用，
不要在用户点按钮的瞬间弹出，否则会被判为诱导点击导致封量。

## 三、接入灰鲸 SDK（拿到包后 3 步）

1. **放 SDK**：把灰鲸提供的 `aar`（及随包文档要求的其它 aar/jar）放进 `app/libs/`，
   `app/build.gradle.kts` 已用 `fileTree(... include *.aar)` 自动加载，无需改代码。
   若灰鲸提供 maven 坐标，改为 `implementation("...")`，并在 `settings.gradle.kts` 补充其仓库地址。
2. **填参数**：`WhaleAdConfig.APP_ID` 与 `WhaleAdConfig.PLACEMENT_ID`（激励视频广告位）。
3. **补 6 处调用**：`WhaleRewarded.kt` 中标记 `TODO(灰鲸)` 的位置，按官方文档填初始化、预加载、展示、回调映射、
   开屏与插屏。激励视频结果映射只有三种：`reward`（看完发奖）、`closed`（中途关闭，不发奖）、`error`（无填充/超时）。

灰鲸 API 的类名与方法名以官方文档为准，本工程不猜测、不硬编码，避免接错版本。

## 三、奖励闭环（已实现，无需再改）

- H5：`watchAd()` 发现 `window.WhaleAdBridge.showRewarded` 存在 → 走真实广告；不存在（普通浏览器）→ 回退本地 5 秒模拟，玩法不受影响。
- 原生：桥收到调用 → `WhaleRewarded.show()` → 结果回调 `window.WhaleAd.onEvent({result})`。
- 结算：仅 `reward` 触发 `finishAd()`（+1 抽奖机会、累计广告进度、进入 60 秒冷却），`closed`/`error` 一律不发奖，避免刷奖。
- 广告位已填入激励视频 ID `5870225444210928`；SDK 未接好前点击会提示「广告加载失败」。
- 测试期若想在 APK 里也能看模拟广告拿机会，把 H5 的 `CONFIG.AD_FALLBACK` 改为 `true`
  （上线前务必改回 `false`，否则用户可绕过真实广告直接领奖，广告收益归零）。

## 四、H5 更新后

```bash
bash android-app/sync-web-assets.sh
```
会把最新的 `tasks/index.html` 与图标同步进工程，再重新打包即可。

## 五、上架合规清单（必做）

- 首次启动弹隐私政策，用户同意后再调用 `WhaleRewarded.init()`（广告 SDK 不得在同意前初始化）。
- 隐私政策中披露：第三方广告 SDK 名称、收集的设备信息类型与用途、个性化广告开关方式。
- `AndroidManifest.xml` 的权限按灰鲸文档增删（当前仅网络、网络状态、Wi-Fi 状态）。
- 应用商店要求提供软件著作权 / 备案等信息，与广告 SDK 无冲突但需一并提交。
