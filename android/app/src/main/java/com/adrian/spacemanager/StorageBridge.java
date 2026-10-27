package com.adrian.spacemanager;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.StatFs;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

public class StorageBridge {
    private final Activity activity;
    private final WebView webView;
    private static final String CHANNEL_ID = "space_manager_updates";

    public StorageBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Actualizaciones de Space Manager",
                    NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Alertas automáticas cuando haya una nueva versión del APK disponible en GitHub.");
            NotificationManager manager = activity.getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
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
    public String getAppVersionInfo() {
        try {
            PackageInfo pInfo = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
            String vName = pInfo.versionName;
            long vCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pInfo.getLongVersionCode() : pInfo.versionCode;
            JSONObject obj = new JSONObject();
            obj.put("versionName", vName);
            obj.put("versionCode", vCode);
            return obj.toString();
        } catch (Exception e) {
            return "{\"versionName\": \"1.2.1\", \"versionCode\": 4}";
        }
    }

    @JavascriptInterface
    public void openUrl(String urlString) {
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlString));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                activity.startActivity(intent);
            } catch (Exception e) {
                sendError("No se pudo abrir el enlace: " + e.getMessage());
            }
        });
    }

    @JavascriptInterface
    public void checkForUpdates(final boolean isManualCheck) {
        new Thread(() -> {
            try {
                URL url = new URL("https://api.github.com/repos/AdrianP2001/pc-space-manager/releases/latest");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setRequestProperty("User-Agent", "SpaceManagerApp");
                conn.setRequestProperty("Accept", "application/vnd.github.v3+json");
                conn.setConnectTimeout(9000);
                conn.setReadTimeout(9000);

                int responseCode = conn.getResponseCode();
                if (responseCode == 200) {
                    BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder sb = new StringBuilder();
                    String line;
                    while ((line = reader.readLine()) != null) {
                        sb.append(line);
                    }
                    reader.close();

                    JSONObject release = new JSONObject(sb.toString());
                    String tagName = release.optString("tag_name", "");
                    String releaseName = release.optString("name", tagName);
                    String releaseBody = release.optString("body", "");
                    String publishedAt = release.optString("published_at", "");

                    // Extract APK download URL from assets
                    String apkDownloadUrl = "";
                    long apkSize = 0;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject asset = assets.getJSONObject(i);
                            String assetName = asset.optString("name", "");
                            if (assetName.endsWith(".apk")) {
                                apkDownloadUrl = asset.optString("browser_download_url", "");
                                apkSize = asset.optLong("size", 0);
                                break;
                            }
                        }
                    }

                    if (apkDownloadUrl.isEmpty()) {
                        apkDownloadUrl = release.optString("html_url", "https://github.com/AdrianP2001/pc-space-manager/releases/latest");
                    }

                    // Get current version
                    String currentVersion = "1.1.0";
                    try {
                        PackageInfo pInfo = activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0);
                        currentVersion = pInfo.versionName;
                    } catch (Exception ignored) {}

                    boolean hasUpdate = isNewerVersion(tagName, currentVersion);

                    JSONObject updateResult = new JSONObject();
                    updateResult.put("hasUpdate", hasUpdate);
                    updateResult.put("latestVersion", tagName.replace("v", "").replace("-apk", ""));
                    updateResult.put("currentVersion", currentVersion);
                    updateResult.put("releaseName", releaseName);
                    updateResult.put("releaseNotes", releaseBody);
                    updateResult.put("apkUrl", apkDownloadUrl);
                    updateResult.put("apkSize", apkSize);
                    updateResult.put("publishedAt", publishedAt);
                    updateResult.put("isManualCheck", isManualCheck);

                    if (hasUpdate) {
                        showUpdateSystemNotification(updateResult.getString("latestVersion"), apkDownloadUrl);
                    }

                    sendUpdateResult(updateResult.toString());
                } else {
                    sendUpdateError(isManualCheck, "Respuesta del servidor: HTTP " + responseCode);
                }
            } catch (Exception e) {
                sendUpdateError(isManualCheck, "Error al comprobar actualización: " + e.getMessage());
            }
        }).start();
    }

    private boolean isNewerVersion(String remote, String current) {
        if (remote == null || current == null) return false;
        String cleanRemote = remote.trim().replaceAll("^[vV]", "").replaceAll("-.*$", "");
        String cleanCurrent = current.trim().replaceAll("^[vV]", "").replaceAll("-.*$", "");

        String[] rParts = cleanRemote.split("\\.");
        String[] cParts = cleanCurrent.split("\\.");
        int max = Math.max(rParts.length, cParts.length);

        for (int i = 0; i < max; i++) {
            int r = (i < rParts.length) ? parseSafeInt(rParts[i]) : 0;
            int c = (i < cParts.length) ? parseSafeInt(cParts[i]) : 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    }

    private int parseSafeInt(String s) {
        try {
            return Integer.parseInt(s.replaceAll("\\D+", ""));
        } catch (Exception e) {
            return 0;
        }
    }

    private void showUpdateSystemNotification(String remoteVersion, String apkUrl) {
        activity.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                int flags = PendingIntent.FLAG_UPDATE_CURRENT;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    flags |= PendingIntent.FLAG_IMMUTABLE;
                }
                PendingIntent pendingIntent = PendingIntent.getActivity(activity, 0, intent, flags);

                int appIcon = activity.getApplicationInfo().icon;
                if (appIcon == 0) appIcon = android.R.drawable.stat_sys_download_done;

                NotificationCompat.Builder builder = new NotificationCompat.Builder(activity, CHANNEL_ID)
                        .setSmallIcon(appIcon)
                        .setContentTitle("🚀 Actualización Space Manager v" + remoteVersion)
                        .setContentText("Toca aquí para descargar e instalar la nueva versión.")
                        .setStyle(new NotificationCompat.BigTextStyle().bigText("Hay una nueva versión disponible (v" + remoteVersion + ") en GitHub con mejoras. Toca para actualizar directamente."))
                        .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                        .setAutoCancel(true)
                        .setContentIntent(pendingIntent);

                NotificationManagerCompat.from(activity).notify(2026, builder.build());
            } catch (Exception ignored) {}
        });
    }

    private void sendUpdateResult(String jsonResult) {
        activity.runOnUiThread(() -> {
            String escaped = jsonResult.replace("\\", "\\\\").replace("'", "\\'");
            String js = "if (window.onUpdateCheckResult) window.onUpdateCheckResult(JSON.parse('" + escaped + "'));";
            webView.evaluateJavascript(js, null);
        });
    }

    private void sendUpdateError(boolean isManual, String errorMsg) {
        activity.runOnUiThread(() -> {
            String cleanErr = errorMsg.replace("\\", "\\\\").replace("'", "\\'");
            String js = "if (window.onUpdateCheckError) window.onUpdateCheckError(" + isManual + ", '" + cleanErr + "');";
            webView.evaluateJavascript(js, null);
        });
    }

    @JavascriptInterface
    public String getStorageVolumes() {
        try {
            JSONArray arr = new JSONArray();
            List<String> seenPaths = new ArrayList<>();

            // 1. Internal Storage
            File internal = Environment.getExternalStorageDirectory();
            if (internal != null && internal.exists()) {
                seenPaths.add(internal.getAbsolutePath());
                JSONObject intVol = getVolumeJson("internal", "Almacenamiento Interno", internal.getAbsolutePath(), false, true);
                arr.put(intVol);
            }

            // 2. Discover External SD cards / OTG via getExternalFilesDirs
            File[] extDirs = activity.getExternalFilesDirs(null);
            if (extDirs != null) {
                for (File ext : extDirs) {
                    if (ext == null) continue;
                    String path = ext.getAbsolutePath();
                    int idx = path.indexOf("/Android/data");
                    if (idx != -1) {
                        String rootPath = path.substring(0, idx);
                        if (!seenPaths.contains(rootPath)) {
                            seenPaths.add(rootPath);
                            File rootFile = new File(rootPath);
                            if (rootFile.exists() && rootFile.canRead()) {
                                String name = "Tarjeta MicroSD (" + rootFile.getName() + ")";
                                JSONObject sdVol = getVolumeJson("sd_" + rootFile.getName(), name, rootPath, true, false);
                                arr.put(sdVol);
                            }
                        }
                    }
                }
            }

            // 3. Inspect /storage directory directly (via MANAGE_EXTERNAL_STORAGE)
            File storageRoot = new File("/storage");
            if (storageRoot.exists() && storageRoot.canRead()) {
                File[] list = storageRoot.listFiles();
                if (list != null) {
                    for (File f : list) {
                        if (f.isDirectory() && f.canRead()) {
                            String name = f.getName();
                            if (!name.equalsIgnoreCase("emulated") &&
                                !name.equalsIgnoreCase("self") &&
                                !name.equalsIgnoreCase("knox") &&
                                !seenPaths.contains(f.getAbsolutePath())) {
                                seenPaths.add(f.getAbsolutePath());
                                String displayName = name.contains("-") ? "Tarjeta SD (" + name + ")" : "Almacenamiento Externo (" + name + ")";
                                JSONObject vol = getVolumeJson("ext_" + name, displayName, f.getAbsolutePath(), true, false);
                                arr.put(vol);
                            }
                        }
                    }
                }
            }

            JSONObject result = new JSONObject();
            result.put("success", true);
            result.put("deviceModel", Build.MANUFACTURER.toUpperCase() + " " + Build.MODEL);
            result.put("androidVersion", "Android " + Build.VERSION.RELEASE);
            result.put("volumes", arr);
            return result.toString();
        } catch (Exception e) {
            return "{\"success\": false, \"error\": \"" + e.getMessage() + "\"}";
        }
    }

    private JSONObject getVolumeJson(String id, String name, String path, boolean isRemovable, boolean isPrimary) {
        JSONObject obj = new JSONObject();
        try {
            StatFs stat = new StatFs(path);
            long blockSize = stat.getBlockSizeLong();
            long totalBytes = stat.getBlockCountLong() * blockSize;
            long freeBytes = stat.getAvailableBlocksLong() * blockSize;
            long usedBytes = totalBytes - freeBytes;
            int percent = totalBytes > 0 ? (int) Math.round(((double) usedBytes / totalBytes) * 100) : 0;

            obj.put("id", id);
            obj.put("name", name);
            obj.put("path", path);
            obj.put("isRemovable", isRemovable);
            obj.put("isPrimary", isPrimary);
            obj.put("totalBytes", totalBytes);
            obj.put("freeBytes", freeBytes);
            obj.put("usedBytes", usedBytes);
            obj.put("percent", percent);
        } catch (Exception e) {
            try {
                obj.put("id", id);
                obj.put("name", name);
                obj.put("path", path);
                obj.put("isRemovable", isRemovable);
                obj.put("isPrimary", isPrimary);
                obj.put("totalBytes", 0);
                obj.put("freeBytes", 0);
                obj.put("usedBytes", 0);
                obj.put("percent", 0);
            } catch (Exception ignored) {}
        }
        return obj;
    }

    @JavascriptInterface
    public String getStorageOverview() {
        return getStorageVolumes();
    }

    private static class FolderStat {
        long bytes = 0;
        int count = 0;
    }

    private FolderStat measureDir(File dir, String filterExt, int[] progressCounter) {
        FolderStat stat = new FolderStat();
        if (dir == null || !dir.exists() || !dir.canRead()) return stat;

        File[] files = dir.listFiles();
        if (files == null) return stat;

        for (File f : files) {
            if (progressCounter != null) progressCounter[0]++;
            if (f.isDirectory()) {
                FolderStat sub = measureDir(f, filterExt, progressCounter);
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
    public void startScan(final String targetVolumePath) {
        new Thread(() -> {
            try {
                File targetRoot = (targetVolumePath != null && !targetVolumePath.isEmpty())
                        ? new File(targetVolumePath)
                        : Environment.getExternalStorageDirectory();

                if (!targetRoot.exists() || !targetRoot.canRead()) {
                    sendError("No se puede acceder a la unidad: " + targetVolumePath);
                    return;
                }

                final int[] counter = {0};
                sendProgress(5, "Iniciando análisis de almacenamiento...", 0);

                JSONArray categories = new JSONArray();
                List<File> largeFiles = new ArrayList<>();

                // 1. WhatsApp Sent Videos
                sendProgress(15, "Inspeccionando videos enviados de WhatsApp (duplicados)...", counter[0]);
                File modernWa = new File(targetRoot, "Android/media/com.whatsapp/WhatsApp/Media");
                File legacyWa = new File(targetRoot, "WhatsApp/Media");
                File waDir = modernWa.exists() ? modernWa : legacyWa;

                File waSentVideos = new File(waDir, "WhatsApp Video/Sent");
                FolderStat sSentVid = measureDir(waSentVideos, null, counter);
                categories.put(createCategory("waSentVideos", "Videos Enviados de WhatsApp (Duplicados)",
                        "Copias de videos enviados en chats que ya tienes en tu galería",
                        sSentVid.bytes, sSentVid.count, waSentVideos.getAbsolutePath(), "clean"));

                // 2. WhatsApp Voice Notes
                sendProgress(30, "Analizando notas de voz y audios de WhatsApp (.opus)...", counter[0]);
                File waVoiceNotes = new File(waDir, "WhatsApp Voice Notes");
                FolderStat sVoice = measureDir(waVoiceNotes, ".opus", counter);
                categories.put(createCategory("waVoiceNotes", "Notas de Voz de WhatsApp (.opus)",
                        "Audios antiguos acumulados a lo largo de meses",
                        sVoice.bytes, sVoice.count, waVoiceNotes.getAbsolutePath(), "review"));

                // 3. WhatsApp Sent Images
                sendProgress(45, "Revisando fotos enviadas de WhatsApp (duplicados)...", counter[0]);
                File waSentImages = new File(waDir, "WhatsApp Images/Sent");
                FolderStat sSentImg = measureDir(waSentImages, null, counter);
                categories.put(createCategory("waSentImages", "Fotos Enviadas de WhatsApp (Duplicados)",
                        "Imágenes que ya enviaste y que duplican memoria",
                        sSentImg.bytes, sSentImg.count, waSentImages.getAbsolutePath(), "clean"));

                // 4. WhatsApp Statuses
                File waStatuses = new File(waDir, ".Statuses");
                FolderStat sStatus = measureDir(waStatuses, null, counter);
                categories.put(createCategory("waStatuses", "Estados de WhatsApp (Caché Caducada)",
                        "Estados de contactos que ya cumplieron 24 horas",
                        sStatus.bytes, sStatus.count, waStatuses.getAbsolutePath(), "clean"));

                // 5. Thumbnails cache
                sendProgress(60, "Buscando base oculta de miniaturas (.thumbnails de Samsung)...", counter[0]);
                File dcimThumb = new File(targetRoot, "DCIM/.thumbnails");
                FolderStat sThumb = measureDir(dcimThumb, null, counter);
                categories.put(createCategory("dcimThumbnails", "Base de Miniaturas Oculta (.thumbnails)",
                        "Caché .thumbdata de la galería de fotos de Samsung",
                        sThumb.bytes, sThumb.count, dcimThumb.getAbsolutePath(), "clean"));

                // 6. APKs in Downloads
                sendProgress(75, "Analizando instaladores APK y descargas...", counter[0]);
                File downloadDir = new File(targetRoot, "Download");
                FolderStat sApk = measureDir(downloadDir, ".apk", counter);
                categories.put(createCategory("downloadApks", "Instaladores APK en Descargas",
                        "Archivos instaladores .apk que ya fueron instalados",
                        sApk.bytes, sApk.count, downloadDir.getAbsolutePath(), "clean"));

                // 7. Lost.dir / SD Junk if scanning external volume
                File lostDir = new File(targetRoot, "LOST.DIR");
                if (lostDir.exists() && lostDir.canRead()) {
                    FolderStat sLost = measureDir(lostDir, null, counter);
                    categories.put(createCategory("lostDir", "Archivos Huérfanos de SD (LOST.DIR)",
                            "Fragmentos de archivos corruptos o recuperados por el sistema",
                            sLost.bytes, sLost.count, lostDir.getAbsolutePath(), "clean"));
                }

                // 8. Camera photos & videos
                File cameraDir = new File(targetRoot, "DCIM/Camera");
                FolderStat sCam = measureDir(cameraDir, null, counter);
                categories.put(createCategory("cameraMedia", "Galería de Cámara (DCIM/Camera)",
                        "Fotos y videos originales tomados con tu cámara",
                        sCam.bytes, sCam.count, cameraDir.getAbsolutePath(), "keep"));

                // 9. Heavy Files (>30 MB)
                sendProgress(88, "Buscando archivos pesados (>30 MB)...", counter[0]);
                findLargeFiles(targetRoot, largeFiles, 30 * 1024 * 1024, 0, counter);
                Collections.sort(largeFiles, (f1, f2) -> Long.compare(f2.length(), f1.length()));

                JSONArray arrHeavy = new JSONArray();
                int limit = Math.min(largeFiles.size(), 50);
                for (int i = 0; i < limit; i++) {
                    File f = largeFiles.get(i);
                    JSONObject item = new JSONObject();
                    item.put("name", f.getName());
                    item.put("path", f.getAbsolutePath());
                    item.put("size", f.length());
                    arrHeavy.put(item);
                }

                // Step 10: Complete!
                sendProgress(100, "¡Auditoría de almacenamiento finalizada!", counter[0]);

                JSONObject finalResult = new JSONObject();
                finalResult.put("success", true);
                finalResult.put("volumePath", targetRoot.getAbsolutePath());
                finalResult.put("totalFilesInspected", counter[0]);
                finalResult.put("categories", categories);
                finalResult.put("heavyFiles", arrHeavy);

                sendComplete(finalResult.toString());
            } catch (Exception e) {
                sendError("Error durante el escaneo: " + e.getMessage());
            }
        }).start();
    }

    private void sendProgress(int percent, String stage, int itemsCount) {
        activity.runOnUiThread(() -> {
            String cleanStage = stage.replace("\\", "\\\\").replace("'", "\\'");
            String js = String.format(Locale.US, "if (window.onScanProgress) window.onScanProgress(%d, '%s', %d);",
                    percent, cleanStage, itemsCount);
            webView.evaluateJavascript(js, null);
        });
    }

    private void sendComplete(String jsonResult) {
        activity.runOnUiThread(() -> {
            String escaped = jsonResult.replace("\\", "\\\\").replace("'", "\\'");
            String js = "if (window.onScanComplete) window.onScanComplete(JSON.parse('" + escaped + "'));";
            webView.evaluateJavascript(js, null);
        });
    }

    private void sendError(String errorMsg) {
        activity.runOnUiThread(() -> {
            String cleanErr = errorMsg.replace("\\", "\\\\").replace("'", "\\'");
            String js = "if (window.onScanError) window.onScanError('" + cleanErr + "');";
            webView.evaluateJavascript(js, null);
        });
    }

    @JavascriptInterface
    public String cleanCategory(String categoryId, String volumePath, boolean dryRun) {
        try {
            File root = (volumePath != null && !volumePath.isEmpty())
                    ? new File(volumePath)
                    : Environment.getExternalStorageDirectory();

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
            else if ("lostDir".equals(categoryId)) targetDir = new File(root, "LOST.DIR");

            if (targetDir == null || !targetDir.exists()) {
                return "{\"success\": true, \"freedBytes\": 0, \"freedFiles\": 0}";
            }

            FolderStat stat = measureDir(targetDir, filterExt, null);

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
    public String cleanCategory(String categoryId, boolean dryRun) {
        return cleanCategory(categoryId, null, dryRun);
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

    private void findLargeFiles(File dir, List<File> result, long minSize, int depth, int[] progressCounter) {
        if (dir == null || !dir.exists() || !dir.canRead() || depth > 5) return;
        File[] files = dir.listFiles();
        if (files == null) return;

        for (File f : files) {
            if (progressCounter != null) progressCounter[0]++;
            if (f.isDirectory()) {
                if (!f.getName().startsWith(".") && !f.getName().equals("Android")) {
                    findLargeFiles(f, result, minSize, depth + 1, progressCounter);
                }
            } else if (f.isFile() && f.length() >= minSize) {
                result.add(f);
            }
        }
    }
}
