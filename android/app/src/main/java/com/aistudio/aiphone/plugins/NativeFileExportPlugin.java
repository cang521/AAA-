package com.aistudio.aiphone.plugins;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;

import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "NativeFileExport")
public class NativeFileExportPlugin extends Plugin {
    private static final String TAG = "NativeFileExport";
    private static final String CACHE_EXPORT_DIR = "exports";
    private static final String DOWNLOADS_SUBDIR = "AiPhoneExports";
    private static final long CACHE_STALE_MS = 24L * 60L * 60L * 1000L;
    private static final int COPY_BUFFER_SIZE = 64 * 1024;

    // Single-threaded executor ensures sequential chunk writes never interleave out of order
    private static final ExecutorService EXPORT_EXECUTOR = Executors.newSingleThreadExecutor();

    private volatile String pendingSaveFileName = null;
    private volatile String pendingSaveMimeType = null;
    private volatile boolean pendingAllowDownloadsFallback = true;

    private volatile String pendingShareFileName = null;
    private volatile String pendingShareMimeType = null;
    private volatile BroadcastReceiver activeShareReceiver = null;
    private final AtomicBoolean activeShareChosen = new AtomicBoolean(false);

    private String sanitizeFileName(String rawName) {
        if (rawName == null) {
            return "export_backup.dat";
        }
        String trimmed = rawName.trim();
        // Strip any directory components or traversal characters
        int lastSlash = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
        if (lastSlash >= 0 && lastSlash + 1 < trimmed.length()) {
            trimmed = trimmed.substring(lastSlash + 1);
        }
        String cleaned = trimmed.replaceAll("[\\\\/:*?\"<>|\\r\\n\\t]+", "_");
        while (cleaned.contains("..")) {
            cleaned = cleaned.replace("..", "_");
        }
        cleaned = cleaned.trim();
        if (cleaned.isEmpty() || ".".equals(cleaned)) {
            return "export_backup.dat";
        }
        return cleaned;
    }

    private String normalizeMimeType(String rawMime, String fileName) {
        if (rawMime != null && !rawMime.trim().isEmpty()) {
            String lower = rawMime.trim().toLowerCase();
            // Android Document Picker can reject application/x-jsonlines on some OEMs
            if ("application/x-jsonlines".equals(lower)) {
                return "application/octet-stream";
            }
            return lower;
        }
        String lowerName = fileName != null ? fileName.toLowerCase() : "";
        if (lowerName.endsWith(".zip")) return "application/zip";
        if (lowerName.endsWith(".json")) return "application/json";
        if (lowerName.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    private File getExportCacheDir() {
        File dir = new File(getContext().getCacheDir(), CACHE_EXPORT_DIR);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        return dir;
    }

    private File getCacheExportFile(String safeName) {
        return new File(getExportCacheDir(), safeName);
    }

    private void pruneStaleCacheFiles(File currentTarget) {
        try {
            File dir = getExportCacheDir();
            File[] files = dir.listFiles();
            if (files == null) return;
            long cutoff = System.currentTimeMillis() - CACHE_STALE_MS;
            for (File f : files) {
                if (f.isFile() && !f.equals(currentTarget) && f.lastModified() < cutoff) {
                    f.delete();
                }
            }
        } catch (Exception ignored) {}
    }

    @PluginMethod
    public void beginCacheFile(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        EXPORT_EXECUTOR.execute(() -> {
            try {
                File target = getCacheExportFile(safeName);
                pruneStaleCacheFiles(target);
                if (target.exists()) {
                    target.delete();
                }
                File parent = target.getParentFile();
                if (parent != null && !parent.exists()) {
                    parent.mkdirs();
                }
                try (FileOutputStream fos = new FileOutputStream(target, false)) {
                    fos.flush();
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", safeName);
                ret.put("absolutePath", target.getAbsolutePath());
                ret.put("bytesWritten", 0);
                call.resolve(ret);
            } catch (Throwable t) {
                Log.e(TAG, "beginCacheFile failed", t);
                call.reject("NATIVE_WRITE_FAILED: 初始化导出缓存文件失败: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void appendCacheFileChunk(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        final String base64Chunk = call.getString("base64Chunk");
        final String textChunk = call.getString("textChunk");

        if ((base64Chunk == null || base64Chunk.isEmpty()) && (textChunk == null || textChunk.isEmpty())) {
            call.reject("NATIVE_WRITE_FAILED: 写入分片数据为空");
            return;
        }

        EXPORT_EXECUTOR.execute(() -> {
            try {
                File target = getCacheExportFile(safeName);
                byte[] bytes;
                if (base64Chunk != null && !base64Chunk.isEmpty()) {
                    bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                } else {
                    bytes = textChunk.getBytes(StandardCharsets.UTF_8);
                }
                try (FileOutputStream fos = new FileOutputStream(target, true)) {
                    fos.write(bytes);
                    fos.flush();
                }
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", safeName);
                ret.put("chunkBytes", bytes.length);
                ret.put("totalBytes", target.length());
                call.resolve(ret);
            } catch (OutOfMemoryError oom) {
                Log.e(TAG, "appendCacheFileChunk OOM", oom);
                call.reject("NATIVE_WRITE_FAILED: 原生缓存写入内存不足，建议按角色或分类分批导出");
            } catch (Throwable t) {
                Log.e(TAG, "appendCacheFileChunk failed", t);
                call.reject("NATIVE_WRITE_FAILED: 写入导出缓存失败: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void verifyCacheFile(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        EXPORT_EXECUTOR.execute(() -> {
            try {
                File target = getCacheExportFile(safeName);
                boolean exists = target.exists() && target.isFile();
                long size = exists ? target.length() : 0L;
                JSObject ret = new JSObject();
                ret.put("exists", exists);
                ret.put("size", size);
                ret.put("fileName", safeName);
                ret.put("absolutePath", target.getAbsolutePath());
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("NATIVE_WRITE_FAILED: 校验缓存文件失败: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        final String mimeType = normalizeMimeType(call.getString("mimeType"), safeName);
        EXPORT_EXECUTOR.execute(() -> performSaveToDownloads(call, safeName, mimeType));
    }

    private void performSaveToDownloads(PluginCall call, String safeName, String mimeType) {
        File cacheFile = getCacheExportFile(safeName);
        if (!cacheFile.exists() || !cacheFile.isFile() || cacheFile.length() <= 0) {
            call.reject("NATIVE_WRITE_FAILED: 导出缓存文件不存在或大小为 0，无法保存到下载目录");
            return;
        }

        Context context = getContext();
        long expectedSize = cacheFile.length();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = context.getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, safeName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + DOWNLOADS_SUBDIR);
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri itemUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (itemUri == null) {
                    call.reject("NATIVE_WRITE_FAILED: 无法在系统下载目录创建目标文件");
                    return;
                }

                long copied = 0L;
                try (InputStream in = new FileInputStream(cacheFile);
                     OutputStream out = resolver.openOutputStream(itemUri, "w")) {
                    if (out == null) {
                        throw new IllegalStateException("无法打开下载目录输出流");
                    }
                    copied = copyStream(in, out);
                    out.flush();
                } catch (Throwable writeErr) {
                    try {
                        resolver.delete(itemUri, null, null);
                    } catch (Exception ignored) {}
                    throw writeErr;
                }

                ContentValues finishValues = new ContentValues();
                finishValues.put(MediaStore.Downloads.IS_PENDING, 0);
                resolver.update(itemUri, finishValues, null, null);

                if (copied <= 0 || copied != expectedSize) {
                    call.reject("NATIVE_WRITE_FAILED: 下载目录写入校验不完整 (" + copied + "/" + expectedSize + " bytes)");
                    return;
                }

                String displayName = resolveDisplayName(context, itemUri, safeName);
                JSObject ret = new JSObject();
                ret.put("status", "saved");
                ret.put("deliveryMethod", "downloads");
                ret.put("fileName", displayName);
                ret.put("bytesWritten", copied);
                ret.put("locationLabel", "系统下载目录 Download/" + DOWNLOADS_SUBDIR + "/" + displayName);
                ret.put("uri", itemUri.toString());
                call.resolve(ret);
                return;
            }

            // Android 7~9 fallback
            File targetDir = null;
            boolean hasLegacyPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
            if (hasLegacyPerm && Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState())) {
                File publicDownloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                File candidate = new File(publicDownloads, DOWNLOADS_SUBDIR);
                if (candidate.exists() || candidate.mkdirs()) {
                    targetDir = candidate;
                }
            }
            if (targetDir == null) {
                File appExtDownloads = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (appExtDownloads != null) {
                    File candidate = new File(appExtDownloads, DOWNLOADS_SUBDIR);
                    if (candidate.exists() || candidate.mkdirs()) {
                        targetDir = candidate;
                    }
                }
            }
            if (targetDir == null) {
                call.reject("NATIVE_WRITE_FAILED: 未能获取可用的下载保存目录");
                return;
            }

            File outFile = resolveUniqueFile(targetDir, safeName);
            long copied = 0L;
            try (InputStream in = new FileInputStream(cacheFile);
                 OutputStream out = new FileOutputStream(outFile, false)) {
                copied = copyStream(in, out);
                out.flush();
            }

            if (!outFile.exists() || outFile.length() <= 0 || copied != expectedSize) {
                call.reject("NATIVE_WRITE_FAILED: 下载文件写入后校验失败");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("status", "saved");
            ret.put("deliveryMethod", "downloads");
            ret.put("fileName", outFile.getName());
            ret.put("bytesWritten", outFile.length());
            ret.put("locationLabel", outFile.getAbsolutePath());
            ret.put("uri", Uri.fromFile(outFile).toString());
            call.resolve(ret);
        } catch (Throwable t) {
            Log.e(TAG, "performSaveToDownloads failed", t);
            call.reject("NATIVE_WRITE_FAILED: 保存到下载目录失败: " + t.getMessage());
        }
    }

    @PluginMethod
    public void presentSaveAs(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        final String mimeType = normalizeMimeType(call.getString("mimeType"), safeName);
        final boolean allowFallback = call.getBoolean("allowDownloadsFallback", true);

        File cacheFile = getCacheExportFile(safeName);
        if (!cacheFile.exists() || !cacheFile.isFile() || cacheFile.length() <= 0) {
            call.reject("NATIVE_WRITE_FAILED: 导出缓存文件不存在或大小为 0，无法调起系统保存");
            return;
        }

        try {
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(mimeType);
            intent.putExtra(Intent.EXTRA_TITLE, safeName);

            Context context = getContext();
            if (intent.resolveActivity(context.getPackageManager()) == null) {
                if (allowFallback) {
                    EXPORT_EXECUTOR.execute(() -> performSaveToDownloads(call, safeName, mimeType));
                } else {
                    JSObject ret = new JSObject();
                    ret.put("status", "unavailable");
                    ret.put("reason", "当前系统未提供文件“另存为”选择器");
                    call.resolve(ret);
                }
                return;
            }

            pendingSaveFileName = safeName;
            pendingSaveMimeType = mimeType;
            pendingAllowDownloadsFallback = allowFallback;
            startActivityForResult(call, intent, "handleSaveAsResult");
        } catch (Throwable t) {
            Log.e(TAG, "presentSaveAs failed", t);
            if (allowFallback) {
                EXPORT_EXECUTOR.execute(() -> performSaveToDownloads(call, safeName, mimeType));
            } else {
                call.reject("SYSTEM_SHARE_FAILED: 调起系统保存面板失败: " + t.getMessage());
            }
        }
    }

    @ActivityCallback
    private void handleSaveAsResult(PluginCall call, ActivityResult result) {
        final String safeName = pendingSaveFileName;
        final String mimeType = pendingSaveMimeType;
        pendingSaveFileName = null;
        pendingSaveMimeType = null;

        if (call == null) {
            return;
        }

        if (result == null || result.getResultCode() != Activity.RESULT_OK
                || result.getData() == null || result.getData().getData() == null) {
            JSObject ret = new JSObject();
            ret.put("status", "cancelled");
            ret.put("fileName", safeName != null ? safeName : "export_backup");
            call.resolve(ret);
            return;
        }

        final Uri destUri = result.getData().getData();
        final String targetName = safeName != null ? safeName : "export_backup.dat";
        final String targetMime = mimeType != null ? mimeType : "application/octet-stream";

        EXPORT_EXECUTOR.execute(() -> {
            File cacheFile = getCacheExportFile(targetName);
            if (!cacheFile.exists() || !cacheFile.isFile() || cacheFile.length() <= 0) {
                call.reject("NATIVE_WRITE_FAILED: 导出缓存文件已失效或为空，请重试导出");
                return;
            }

            Context context = getContext();
            ContentResolver resolver = context.getContentResolver();
            long copied = 0L;
            try (InputStream in = new FileInputStream(cacheFile);
                 OutputStream out = openOutputStreamCompat(resolver, destUri)) {
                if (out == null) {
                    call.reject("NATIVE_WRITE_FAILED: 无法打开用户选择的保存路径进行写入");
                    return;
                }
                copied = copyStream(in, out);
                out.flush();
            } catch (Throwable t) {
                Log.e(TAG, "handleSaveAsResult write failed", t);
                call.reject("NATIVE_WRITE_FAILED: 写入所选保存位置失败: " + t.getMessage());
                return;
            }

            if (copied <= 0) {
                call.reject("NATIVE_WRITE_FAILED: 写入完成但校验文件字节数为 0");
                return;
            }

            String actualName = resolveDisplayName(context, destUri, targetName);
            JSObject ret = new JSObject();
            ret.put("status", "saved");
            ret.put("deliveryMethod", "system_document_picker");
            ret.put("fileName", actualName);
            ret.put("mimeType", targetMime);
            ret.put("bytesWritten", copied);
            ret.put("locationLabel", "系统已保存文件: " + actualName + " (" + destUri.getAuthority() + ")");
            ret.put("uri", destUri.toString());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void shareCacheFile(PluginCall call) {
        final String safeName = sanitizeFileName(call.getString("fileName"));
        final String mimeType = normalizeMimeType(call.getString("mimeType"), safeName);
        final String title = call.getString("title", "导出数据文件");
        final boolean allowFallback = call.getBoolean("allowDownloadsFallback", true);

        File cacheFile = getCacheExportFile(safeName);
        if (!cacheFile.exists() || !cacheFile.isFile() || cacheFile.length() <= 0) {
            call.reject("NATIVE_WRITE_FAILED: 导出缓存文件不存在或大小为 0，无法调起系统分享");
            return;
        }

        try {
            Context context = getContext();
            Uri contentUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                cacheFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType(mimeType);
            shareIntent.putExtra(Intent.EXTRA_STREAM, contentUri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, safeName);
            shareIntent.setClipData(ClipData.newUri(context.getContentResolver(), safeName, contentUri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            if (shareIntent.resolveActivity(context.getPackageManager()) == null) {
                if (allowFallback) {
                    EXPORT_EXECUTOR.execute(() -> performSaveToDownloads(call, safeName, mimeType));
                } else {
                    JSObject ret = new JSObject();
                    ret.put("status", "unavailable");
                    ret.put("reason", "当前设备没有可用的系统分享接收应用");
                    call.resolve(ret);
                }
                return;
            }

            cleanupShareReceiver();
            activeShareChosen.set(false);

            String chosenAction = context.getPackageName() + ".ACTION_EXPORT_SHARE_CHOSEN_" + System.currentTimeMillis();
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    activeShareChosen.set(true);
                }
            };
            activeShareReceiver = receiver;
            Context appCtx = context.getApplicationContext();
            ContextCompat.registerReceiver(
                appCtx,
                receiver,
                new IntentFilter(chosenAction),
                ContextCompat.RECEIVER_NOT_EXPORTED
            );

            Intent callbackIntent = new Intent(chosenAction);
            callbackIntent.setPackage(context.getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                flags |= PendingIntent.FLAG_MUTABLE;
            }
            PendingIntent sender = PendingIntent.getBroadcast(context, 9401, callbackIntent, flags);
            Intent chooserIntent = Intent.createChooser(shareIntent, title, sender.getIntentSender());
            chooserIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            pendingShareFileName = safeName;
            pendingShareMimeType = mimeType;
            startActivityForResult(call, chooserIntent, "handleShareResult");
        } catch (Throwable t) {
            cleanupShareReceiver();
            Log.e(TAG, "shareCacheFile failed", t);
            if (allowFallback) {
                EXPORT_EXECUTOR.execute(() -> performSaveToDownloads(call, safeName, mimeType));
            } else {
                call.reject("SYSTEM_SHARE_FAILED: 调起系统分享失败: " + t.getMessage());
            }
        }
    }

    @ActivityCallback
    private void handleShareResult(PluginCall call, ActivityResult result) {
        final String safeName = pendingShareFileName;
        pendingShareFileName = null;
        pendingShareMimeType = null;

        if (call == null) {
            cleanupShareReceiver();
            return;
        }

        final int resultCode = result != null ? result.getResultCode() : Activity.RESULT_CANCELED;
        final String targetName = safeName != null ? safeName : "export_backup.dat";

        // Give BroadcastReceiver a short window in case EXTRA_CHOSEN_COMPONENT arrives slightly asynchronously
        EXPORT_EXECUTOR.execute(() -> {
            try {
                if (!activeShareChosen.get()) {
                    Thread.sleep(150);
                }
            } catch (InterruptedException ignored) {}

            boolean chosen = activeShareChosen.get();
            cleanupShareReceiver();

            File cacheFile = getCacheExportFile(targetName);
            long size = cacheFile.exists() ? cacheFile.length() : 0L;

            if (!chosen && resultCode != Activity.RESULT_OK) {
                JSObject ret = new JSObject();
                ret.put("status", "cancelled");
                ret.put("fileName", targetName);
                ret.put("bytesWritten", size);
                call.resolve(ret);
                return;
            }

            JSObject ret = new JSObject();
            ret.put("status", "shared");
            ret.put("deliveryMethod", "system_share");
            ret.put("fileName", targetName);
            ret.put("bytesWritten", size);
            ret.put("locationLabel", "已通过 Android 系统分享发送（缓存副本: cache/exports/" + targetName + "）");
            call.resolve(ret);
        });
    }

    private void cleanupShareReceiver() {
        BroadcastReceiver receiver = activeShareReceiver;
        activeShareReceiver = null;
        if (receiver != null) {
            try {
                getContext().getApplicationContext().unregisterReceiver(receiver);
            } catch (Exception ignored) {}
        }
    }

    private OutputStream openOutputStreamCompat(ContentResolver resolver, Uri destUri) throws Exception {
        try {
            return resolver.openOutputStream(destUri, "wt");
        } catch (Exception e) {
            return resolver.openOutputStream(destUri, "w");
        }
    }

    private long copyStream(InputStream in, OutputStream out) throws Exception {
        byte[] buffer = new byte[COPY_BUFFER_SIZE];
        long total = 0L;
        int read;
        while ((read = in.read(buffer)) != -1) {
            if (read > 0) {
                out.write(buffer, 0, read);
                total += read;
            }
        }
        return total;
    }

    private File resolveUniqueFile(File dir, String fileName) {
        File candidate = new File(dir, fileName);
        if (!candidate.exists()) {
            return candidate;
        }
        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String ext = dot > 0 ? fileName.substring(dot) : "";
        for (int i = 1; i < 1000; i++) {
            File alt = new File(dir, base + "_" + i + ext);
            if (!alt.exists()) {
                return alt;
            }
        }
        return new File(dir, base + "_" + System.currentTimeMillis() + ext);
    }

    private String resolveDisplayName(Context context, Uri uri, String fallback) {
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = cursor.getString(idx);
                    if (name != null && !name.trim().isEmpty()) {
                        return name.trim();
                    }
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                try { cursor.close(); } catch (Exception ignored) {}
            }
        }
        return fallback;
    }

    @Override
    protected void handleOnDestroy() {
        cleanupShareReceiver();
        super.handleOnDestroy();
    }
}
