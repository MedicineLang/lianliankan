pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // 灰鲸 SDK 若走官方仓库，在这里补充（见 app/libs 方式可省略）
        // maven { url = uri("https://<灰鲸官方仓库地址>") }
    }
}

rootProject.name = "VillageLink"
include(":app")
