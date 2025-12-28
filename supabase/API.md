# Recordings API

API documentation for ESP32 device interaction with Supabase.

## Base URL

```
https://dskmralypjipsbduefve.supabase.co/functions/v1
```

## Authentication

All APIs require `x-api-key` header:

```
x-api-key: YOUR_API_KEY
```

---

## 1. Upload Recording

Upload user voice recording.

### Request

```
POST /upload-recording
```

**Headers:**
| Header | Required | Value |
|--------|----------|-------|
| x-api-key | Yes | API key |
| Content-Type | Yes | `multipart/form-data` or `audio/mpeg` |

**Body (multipart):**
| Field | Type | Description |
|-------|------|-------------|
| file | File | Audio file |

**Body (raw):** Send audio binary data directly

### Response

```json
{
  "success": true,
  "recording": {
    "id": "uuid",
    "file_path": "user/1703750400000_recording.mp3",
    "status": "pending",
    "created_at": "2025-12-28T10:00:00.000Z"
  }
}
```

---

## 2. List Recordings

Get recording list with filtering support.

### Request

```
GET /list-recordings
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| sender | string | - | Filter by sender: `user` or `ai` |
| played | string | - | Filter by played status: `true` or `false` |
| limit | int | 50 | Limit number of results |
| offset | int | 0 | Pagination offset |

### Response

```json
{
  "recordings": [
    {
      "id": "uuid",
      "file_path": "ai/1703750400000_response.mp3",
      "duration": 15,
      "sender": "ai",
      "status": "done",
      "transcript": "AI response content",
      "played": false,
      "created_at": "2025-12-28T10:00:00.000Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

### Common Queries

**Get unplayed AI recordings:**
```
GET /list-recordings?sender=ai&played=false
```

**Get all user recordings:**
```
GET /list-recordings?sender=user
```

---

## 3. Download Recording

Download a specific recording file.

### Request

```
GET /download-recording?id={recording_id}
```

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| id | uuid | Yes | Recording ID |

### Response

Returns audio file on success (Content-Type: audio/mpeg)

**Error:**
```json
{
  "error": "Recording not found"
}
```

---

## 4. Mark as Played

Mark a recording as played.

### Request

```
POST /mark-played
Content-Type: application/json

{
  "id": "recording_uuid"
}
```

### Response

```json
{
  "success": true,
  "recording": {
    "id": "uuid",
    "played": true
  }
}
```

---

## ESP32 Example Code

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* BASE_URL = "https://dskmralypjipsbduefve.supabase.co/functions/v1";
const char* API_KEY = "YOUR_API_KEY";

// Upload recording
String uploadRecording(uint8_t* audioData, size_t dataSize) {
  HTTPClient http;
  http.begin(String(BASE_URL) + "/upload-recording");
  http.addHeader("x-api-key", API_KEY);
  http.addHeader("Content-Type", "audio/mpeg");

  int httpCode = http.POST(audioData, dataSize);
  String recordingId = "";

  if (httpCode == 201) {
    String response = http.getString();
    JsonDocument doc;
    deserializeJson(doc, response);
    recordingId = doc["recording"]["id"].as<String>();
  }

  http.end();
  return recordingId;
}

// Check for unplayed AI audio
bool hasUnplayedAudio(String& outId) {
  HTTPClient http;
  http.begin(String(BASE_URL) + "/list-recordings?sender=ai&played=false&limit=1");
  http.addHeader("x-api-key", API_KEY);

  int httpCode = http.GET();
  bool hasUnplayed = false;

  if (httpCode == 200) {
    String response = http.getString();
    JsonDocument doc;
    deserializeJson(doc, response);

    if (doc["total"].as<int>() > 0) {
      hasUnplayed = true;
      outId = doc["recordings"][0]["id"].as<String>();
    }
  }

  http.end();
  return hasUnplayed;
}

// Download recording
size_t downloadRecording(const String& id, uint8_t* buffer, size_t bufferSize) {
  HTTPClient http;
  http.begin(String(BASE_URL) + "/download-recording?id=" + id);
  http.addHeader("x-api-key", API_KEY);

  int httpCode = http.GET();
  size_t downloadedSize = 0;

  if (httpCode == 200) {
    WiFiClient* stream = http.getStreamPtr();
    downloadedSize = stream->readBytes(buffer, bufferSize);
  }

  http.end();
  return downloadedSize;
}

// Mark as played
bool markAsPlayed(const String& id) {
  HTTPClient http;
  http.begin(String(BASE_URL) + "/mark-played");
  http.addHeader("x-api-key", API_KEY);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"id\":\"" + id + "\"}";
  int httpCode = http.POST(body);

  http.end();
  return httpCode == 200;
}

// Get recordings list (for prev/next navigation)
void getRecordingsList(String* ids, int& count, int limit = 10) {
  HTTPClient http;
  http.begin(String(BASE_URL) + "/list-recordings?limit=" + String(limit));
  http.addHeader("x-api-key", API_KEY);

  int httpCode = http.GET();
  count = 0;

  if (httpCode == 200) {
    String response = http.getString();
    JsonDocument doc;
    deserializeJson(doc, response);

    JsonArray recordings = doc["recordings"].as<JsonArray>();
    for (JsonObject rec : recordings) {
      if (count < limit) {
        ids[count++] = rec["id"].as<String>();
      }
    }
  }

  http.end();
}
```

---

## Data Flow

```
┌─────────────┐                              ┌─────────────────┐
│   ESP32     │                              │  Alfred Agent   │
└──────┬──────┘                              └────────┬────────┘
       │                                              │
       ├─── POST /upload-recording ───┐               │
       │                              │               │
       │                              ▼               │
       │                      ┌──────────────┐        │
       │                      │   Supabase   │        │
       │                      │   Storage    │        │
       │                      │  recordings  │◄───────┤ Upload AI audio
       │                      └──────┬───────┘        │ (via /supabase skill)
       │                             │                │
       │                      ┌──────▼───────┐        │
       │                      │   Supabase   │        │
       │                      │   Database   │◄───────┤ Insert record
       │                      │  recordings  │        │ sender=ai, status=pending
       │                      └──────┬───────┘        │
       │                             │                │
       ├─── GET /list-recordings ────┤                │
       │    ?sender=ai&played=false  │                │
       │                             │                │
       ├─── GET /download-recording ─┤                │
       │    ?id=xxx                  │                │
       │                             │                │
       └─── POST /mark-played ───────┘                │
            {id: xxx}
```

## Recording Status

| sender | status | played | Description |
|--------|--------|--------|-------------|
| user | pending | - | Uploaded by user, waiting for Agent to process |
| user | processing | - | Agent is processing |
| user | done | - | Agent finished processing |
| ai | pending | false | AI response generated, waiting for ESP32 to play |
| ai | pending | true | AI response played by ESP32 |
