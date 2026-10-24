package com.adrian.spacemanager;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

public class StorageBridge {
    private final Activity activity;
    private final WebView webView;

    public StorageBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public boolean hasStoragePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return Environment.isExternalStorageManager();
        }
        return true;
    }

    @JavascriptInterface
    public void requestStoragePermission() {
        activity.runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    activity.startActivity(intent);
                }
            }
        });
    }

    @JavascriptInterface
    public String getStorageOverview() {
        try {
            File path = Environment.getExternalStorageDirectory();
            StatFs stat = new StatFs(path.getPath());
            long blockSize = stat.getBlockSizeLong();
            long totalBlocks = stat.getBlockCountLong();
            long availableBlocks = stat.getAvailableBlocksLong();

            long totalBytes = totalBlocks * blockSize;
            long freeBytes = availableBlocks * blockSize;
            long usedBytes = totalBytes - freeBytes;
            int percent = totalBytes > 0 ? (int) Math.round(((double) usedBytes / totalBytes) * 100) : 0;

            JSONObject obj = new JSONObject();
            obj.put("success", true);
            obj.put("totalBytes", totalBytes);
            obj.put("freeBytes", freeBytes);
            obj.put("usedBytes", usedBytes);
            obj.put("percent", percent);
            obj.put("deviceModel", Build.MANUFACTURER.toUpperCase() + " " + Build.MODEL);
            obj.put("androidVersion", "Android " + Build.VERSION.RELEASE);
            return obj.toString();
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }

    private static class FolderStat {
        long bytes = 0;
        int count = 0;
    }

    private FolderStat measureDir(File dir, String filterExt) {
        FolderStat stat = new FolderStat();
        if (dir == null || !dir.exists() || !dir.canRead()) return stat;

        File[] files = dir.listFiles();
        if (files == null) return stat;

        for (File f : files) {
            if (f.isDirectory()) {
                FolderStat sub = measureDir(f, filterExt);
                stat.bytes += sub.bytes;
                stat.count += sub.count;
            } else if (f.isFile()) {
                if (filterExt == null || f.getName().toLowerCase().endsWith(filterExt)) {
                    stat.bytes += f.length();
                    stat.count++;
                }
            }
        }
        return stat;
    }

    @JavascriptInterface
    public String scanCategories() {
        try {
            File root = Environment.getExternalStorageDirectory();

            // WhatsApp Media path resolution
            File modernWa = new File(root, "Android/media/com.whatsapp/WhatsApp/Media");
            File legacyWa = new File(root, "WhatsApp/Media");
            File waDir = modernWa.exists() ? modernWa : legacyWa;

            JSONArray categories = new JSONArray();

            // 1. WhatsApp Sent Videos
            File waSentVideos = new File(waDir, "WhatsApp Video/Sent");
            FolderStat sSentVid = measureDir(waSentVideos, null);
            categories.put(createCategory("waSentVideos", "Videos Enviados de WhatsApp (Duplicados)",
                    "Copias de videos enviados en chats que ya tienes en tu galería",
                    sSentVid.bytes, sSentVid.count, waSentVideos.getAbsolutePath(), "clean"));

            // 2. WhatsApp Voice Notes
            File waVoiceNotes = new File(waDir, "WhatsApp Voice Notes");
            FolderStat sVoice = measureDir(waVoiceNotes, ".opus");
            categories.put(createCategory("waVoiceNotes", "Notas de Voz de WhatsApp (.opus)",
                    "Audios antiguos acumulados a lo largo de meses",
                    sVoice.bytes, sVoice.count, waVoiceNotes.getAbsolutePath(), "review"));

            // 3. WhatsApp Sent Images
            File waSentImages = new File(waDir, "WhatsApp Images/Sent");
            FolderStat sSentImg = measureDir(waSentImages, null);
            categories.put(createCategory("waSentImages", "Fotos Enviadas de WhatsApp (Duplicados)",
                    "Imágenes que ya enviaste y que duplican memoria",
                    sSentImg.bytes, sSentImg.count, waSentImages.getAbsolutePath(), "clean"));

            // 4. WhatsApp Statuses
            File waStatuses = new File(waDir, ".Statuses");
            FolderStat sStatus = measureDir(waStatuses, null);
            categories.put(createCategory("waStatuses", "Estados de WhatsApp (Caché Caducada)",
                    "Estados de contactos que ya cumplieron 24 horas",
                    sStatus.bytes, sStatus.count, waStatuses.getAbsolutePath(), "clean"));

            // 5. Thumbnails cache
            File dcimThumb = new File(root, "DCIM/.thumbnails");
            FolderStat sThumb = measureDir(dcimThumb, null);
            categories.put(createCategory("dcimThumbnails", "Base de Miniaturas Oculta (.thumbnails)",
                    "Caché .thumbdata de la galería de fotos de Samsung",
                    sThumb.bytes, sThumb.count, dcimThumb.getAbsolutePath(), "clean"));

            // 6. APKs in Downloads
            File downloadDir = new File(root, "Download");
            FolderStat sApk = measureDir(downloadDir, ".apk");
            categories.put(createCategory("downloadApks", "Instaladores APK en Descargas",
                    "Archivos instaladores .apk que ya fueron instalados",
                    sApk.bytes, sApk.count, downloadDir.getAbsolutePath(), "clean"));

            // 7. Camera photos & videos
            File cameraDir = new File(root, "DCIM/Camera");
            FolderStat sCam = measureDir(cameraDir, null);
            categories.put(createCategory("cameraMedia", "Galería de Cámara (DCIM/Camera)",
                    "Fotos y videos originales tomados con tu cámara",
                    sCam.bytes, sCam.count, cameraDir.getAbsolutePath(), "keep"));

            JSONObject result = new JSONObject();
            result.put("success", true);
            result.put("categories", categories);
            return result.toString();
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }

    private JSONObject createCategory(String id, String name, String desc, long bytes, int count, String path, String action) throws Exception {
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("name", name);
        o.put("description", desc);
        o.put("bytes", bytes);
        o.put("count", count);
        o.put("path", path);
        o.put("action", action);
        return o;
    }

    private void deleteRecursively(File fileOrDir, String filterExt) {
        if (fileOrDir == null || !fileOrDir.exists()) return;
        if (fileOrDir.isDirectory()) {
            File[] files = fileOrDir.listFiles();
            if (files != null) {
                for (File f : files) {
                    deleteRecursively(f, filterExt);
                }
            }
        } else if (fileOrDir.isFile()) {
            if (filterExt == null || fileOrDir.getName().toLowerCase().endsWith(filterExt)) {
                fileOrDir.delete();
            }
        }
    }

    @JavascriptInterface
    public String cleanCategory(String categoryId, boolean dryRun) {
        try {
            File root = Environment.getExternalStorageDirectory();
            File modernWa = new File(root, "Android/media/com.whatsapp/WhatsApp/Media");
            File legacyWa = new File(root, "WhatsApp/Media");
            File waDir = modernWa.exists() ? modernWa : legacyWa;

            File targetDir = null;
            String filterExt = null;

            if ("waSentVideos".equals(categoryId)) targetDir = new File(waDir, "WhatsApp Video/Sent");
            else if ("waVoiceNotes".equals(categoryId)) { targetDir = new File(waDir, "WhatsApp Voice Notes"); filterExt = ".opus"; }
            else if ("waSentImages".equals(categoryId)) targetDir = new File(waDir, "WhatsApp Images/Sent");
            else if ("waStatuses".equals(categoryId)) targetDir = new File(waDir, ".Statuses");
            else if ("dcimThumbnails".equals(categoryId)) targetDir = new File(root, "DCIM/.thumbnails");
            else if ("downloadApks".equals(categoryId)) { targetDir = new File(root, "Download"); filterExt = ".apk"; }

            if (targetDir == null || !targetDir.exists()) {
                return "{\"success\": true, \"freedBytes\": 0, \"freedFiles\": 0}";
            }

            FolderStat stat = measureDir(targetDir, filterExt);

            if (!dryRun) {
                deleteRecursively(targetDir, filterExt);
            }

            JSONObject res = new JSONObject();
            res.put("success", true);
            res.put("dryRun", dryRun);
            res.put("freedBytes", stat.bytes);
            res.put("freedFiles", stat.count);
            return res.toString();
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }

    @JavascriptInterface
    public String getHeavyFiles() {
        try {
            File root = Environment.getExternalStorageDirectory();
            List<File> largeFiles = new ArrayList<>();
            findLargeFiles(root, largeFiles, 30 * 1024 * 1024, 0);

            Collections.sort(largeFiles, (f1, f2) -> Long.compare(f2.length(), f1.length()));

            JSONArray arr = new JSONArray();
            int limit = Math.min(largeFiles.size(), 40);
            for (int i = 0; i < limit; i++) {
                File f = largeFiles.get(i);
                JSONObject item = new JSONObject();
                item.put("name", f.getName());
                item.put("path", f.getAbsolutePath());
                item.put("size", f.length());
                arr.put(item);
            }

            JSONObject res = new JSONObject();
            res.put("success", true);
            res.put("files", arr);
            return res.toString();
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }

    private void findLargeFiles(File dir, List<File> result, long minSize, int depth) {
        if (dir == null || !dir.exists() || !dir.canRead() || depth > 5) return;
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (f.isDirectory()) {
                if (!f.getName().startsWith(".") && !f.getName().equals("Android")) {
                    findLargeFiles(f, result, minSize, depth + 1);
                }
            } else if (f.isFile() && f.length() >= minSize) {
                result.add(f);
            }
        }
    }
}
