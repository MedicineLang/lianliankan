plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.villagelink.game"
    compileSdk = 34

    defaultConfig {
        // 灰鲸后台登记包名，必须与后台一致才会产生收益
        applicationId = providers.gradleProperty("APP_PACKAGE").getOrElse("com.klkl99.cn.cs")
        minSdk = 24          // 灰鲸 SDK 5.6.1 要求 minSdk >= 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        multiDexEnabled = true
        buildConfigField("String", "WHALE_APP_ID", "\"174334\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*", "META-INF/NOTICE*")
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.multidex:multidex:2.0.1")
    implementation("androidx.recyclerview:recyclerview:1.2.0")
    implementation("androidx.cardview:cardview:1.0.0")
    implementation("androidx.constraintlayout:constraintlayout:2.0.4")
    implementation("androidx.legacy:legacy-support-v4:1.0.0")
    implementation("com.google.android.material:material:1.11.0")

    // 灰鲸 SDK 5.6.1 依赖（见随包 build.gradle）
    implementation("com.google.code.gson:gson:2.9.0")
    implementation("com.squareup.okhttp3:okhttp:3.12.13")
    implementation("com.squareup.okio:okio:1.17.5")
    implementation("com.github.bumptech.glide:glide:4.16.0")

    // 灰鲸聚合 SDK + 各渠道 adapter（18 个 aar 已放入 app/libs）
    implementation(fileTree("libs") { include("*.aar", "*.jar") })
}
