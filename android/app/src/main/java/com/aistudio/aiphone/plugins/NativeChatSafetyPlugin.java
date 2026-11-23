package com.aistudio.aiphone.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Append-only native chat journal. It lives outside WebView storage, survives
 * APK overwrite upgrades and is never touched by ordinary message/role deletion.
 */
@CapacitorPlugin(name = "NativeChatSafety")
public class NativeChatSafetyPlugin extends Plugin {
    private static final String FILE_NAME = "chat_safety_journal_v1.jsonl";
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    private File journalFile() {
        File dir = new File(getContext().getFilesDir(), "chat_safety");
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, FILE_NAME);
    }

    @PluginMethod
    public void appendBatch(PluginCall call) {
        final String recordsJson = call.getString("recordsJson", "[]");
        IO.execute(() -> {
            try {
                JSONArray records = new JSONArray(recordsJson);
                File target = journalFile();
                int written = 0;
                try (FileOutputStream output = new FileOutputStream(target, true)) {
                    for (int i = 0; i < records.length(); i++) {
                        JSONObject record = records.optJSONObject(i);
                        if (record == null || record.optString("id").isEmpty() || record.optString("characterId").isEmpty()) {
                            continue;
                        }
                        output.write(record.toString().getBytes(StandardCharsets.UTF_8));
                        output.write('\n');
                        written += 1;
                    }
                    output.flush();
                    output.getFD().sync();
                }
                JSObject result = new JSObject();
                result.put("written", written);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("原生聊天安全副本写入失败", error);
            }
        });
    }

    @PluginMethod
    public void readBatch(PluginCall call) {
        final int offset = Math.max(0, call.getInt("offset", 0));
        final int limit = Math.max(1, Math.min(1000, call.getInt("limit", 500)));
        IO.execute(() -> {
            JSONArray resultArray = new JSONArray();
            int lineIndex = 0;
            int nextOffset = offset;
            boolean hasMore = false;
            File target = journalFile();
            if (target.exists()) {
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                    new FileInputStream(target), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (lineIndex < offset) {
                            lineIndex += 1;
                            continue;
                        }
                        if (resultArray.length() >= limit) {
                            hasMore = true;
                            break;
                        }
                        lineIndex += 1;
                        nextOffset = lineIndex;
                        try {
                            resultArray.put(new JSONObject(line));
                        } catch (Exception ignored) {
                            // A damaged tail line never prevents reading earlier durable records.
                        }
                    }
                } catch (Exception error) {
                    call.reject("原生聊天安全副本读取失败", error);
                    return;
                }
            }
            JSObject result = new JSObject();
            result.put("recordsJson", resultArray.toString());
            result.put("nextOffset", nextOffset);
            result.put("hasMore", hasMore);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void appendTombstones(PluginCall call) {
        final String idsJson = call.getString("idsJson", "[]");
        IO.execute(() -> {
            try {
                JSONArray ids = new JSONArray(idsJson);
                int written = 0;
                try (FileOutputStream output = new FileOutputStream(journalFile(), true)) {
                    for (int i = 0; i < ids.length(); i++) {
                        String id = ids.optString(i, "");
                        if (id.isEmpty()) continue;
                        JSONObject tombstone = new JSONObject();
                        tombstone.put("id", id);
                        tombstone.put("__deleted", true);
                        tombstone.put("deletedAt", System.currentTimeMillis());
                        output.write(tombstone.toString().getBytes(StandardCharsets.UTF_8));
                        output.write('\n');
                        written += 1;
                    }
                    output.flush();
                    output.getFD().sync();
                }
                JSObject result = new JSObject();
                result.put("written", written);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("原生聊天删除标记写入失败", error);
            }
        });
    }
}
