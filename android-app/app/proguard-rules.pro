# 灰鲸 SDK 的 consumer-rules 通常自带；若上架后发现广告类被混淆，保留其包名
-keep class com.whale.** { *; }
-keep class com.graywhale.** { *; }
