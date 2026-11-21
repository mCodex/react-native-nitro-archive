# Generated Nitro registration calls Hybrid Objects by name.
-keep class com.margelo.nitro.archive.** { *; }

# The JNI bridge finds these managed members by name.
-keep class dev.modex.nitroarchive.infrastructure.zip.RustZipArchive$ReadResult {
    <init>(byte[], java.lang.String);
}
-keep interface dev.modex.nitroarchive.infrastructure.zip.RustZipArchive$Progress {
    boolean update(long, long);
}
-keep class * implements dev.modex.nitroarchive.infrastructure.zip.RustZipArchive$Progress {
    boolean update(long, long);
}
