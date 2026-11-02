# Paint Engine Investigation

| Field         | Value                                      |
|---------------|--------------------------------------------|
| **Status**    | ACTIVE — Research Audit                    |
| **Date**      | 2026-11-02                                 |
| **Scope**     | ColorOS Notes (`com.oplus.note`) — Paint/Handwriting subsystem |
| **Author**    | Reverse-Engineering Audit Pipeline         |
| **Artefacts** | `apk-work/extracted/`, `apk-work/jadx-out/` |

> **Legend**
> - `[VERIFIED]` — Confirmed directly from source (proto, jadx, DB schema, bundle)
> - `[STRONGLY SUPPORTED]` — High-confidence inference from multiple corroborating sources
> - `[INFERRED]` — Reasonable inference from one source or architectural pattern
> - `[UNKNOWN]` — Insufficient evidence; must be determined by further work

---

## 1. Executive Summary

The ColorOS Notes paint engine is a **multi-layer, proprietary C++ subsystem** exposed to the Android host app via JNI and to the hybrid WebView editor via a JavaScript bridge. It spans seven distinct functional domains — vector ink capture, canvas rasterisation, handwritten text recognition (HTR), shape/math recognition, ONNX-backed ML inference, AI visual effects, and infrastructure — implemented in **28 native `.so` libraries** totalling roughly **90 MB** of unstripped-equivalent binary code.

At the data layer, every paint block is a **compound artefact**: a binary stroke file (`.bin`), a PNG preview, an optional text layer, an optional skin/background image, and optional mixture data, all cross-referenced through a normalised `paint_attachments` table, summarised in a protobuf `PaintNoteContent` blob, and represented inside the TipTap/ProseMirror document model as a single opaque `ot(s)` node.

**Cross-platform portability assessment (top-level):**
- The ink capture, HTR, math recognition, and AI effects subsystems are **NOT portable** as-is; they are closed, OPLUS-proprietary C++ binaries with no published API surface.
- Canvas rasterisation is **replaceable** with standard open APIs (HTML5 Canvas, Skia, Cairo, WebGL).
- Stroke data portability is **UNKNOWN** pending binary format reversal.
- A viable open reimplementation path exists: custom pressure-sensitive Bézier stroke engine, open stroke format, no HTR in v1.

---

## 2. In-Editor Paint Representation

### 2.1 ProseMirror Node: `ot(s)` `[VERIFIED]`

Paint blocks are embedded inside the TipTap/ProseMirror document as a custom node type, identified in the minified bundle as `ot(s)`. The node is **atomic** from the editor's perspective — it is not editable inline; tapping it launches the native paint activity.

**Node schema (reconstructed from bundle analysis):**

```
Node type : "paint"   (internal name inferred from serialisation)
Inline     : false     (block-level node)
Atom       : true      (opaque, no child content)

Attributes:
  paintid         : String   — links to PaintInfo.paintId / attachments row
  imageWidth      : Number   — rendered canvas width  (px or dp, INFERRED)
  imageHeight     : Number   — rendered canvas height (px or dp, INFERRED)
  backgroundType  : String   — background grid/style key (e.g. "blank", "lined")
```

> `[VERIFIED]` Node existence and attribute names confirmed from bundle analysis of `ot(s)` predicate.
> `[INFERRED]` Node type string ("paint"), inline=false, atom=true — standard ProseMirror pattern for an embedded media block; no explicit schema dump available.

### 2.2 Serialisation: `XP(t)` at bundle offset 643628 `[VERIFIED]`

```js
// index.js : 643628  (reconstructed from analysis)
function XP(t) {
  // ...
  if (ot(s)) {
    o.push({
      text:    "",
      isPaint: true,
      paintId: s.attrs.paintid
    });
  }
  // ...
}
```

`XP(t)` iterates document nodes and, for each `ot(s)` node, emits a flat object with `isPaint: true` and the `paintId` key. This is consumed by the bridge layer to construct the list of paint blocks when the note is saved or synced.

> `[VERIFIED]` `ot(s)` predicate and `isPaint`/`paintId` field emission confirmed from bundle.
> `[INFERRED]` Full iteration logic and surrounding context; only the `ot(s)` branch was positively identified.

### 2.3 TipTap JSON Representation `[STRONGLY SUPPORTED]`

Based on standard TipTap serialisation and the confirmed node attributes, a paint block node in the canonical TipTap JSON document would appear as:

```json
{
  "type": "paint",
  "attrs": {
    "paintid":        "<uuid>",
    "imageWidth":     800,
    "imageHeight":    600,
    "backgroundType": "blank"
  }
}
```

> `[STRONGLY SUPPORTED]` — TipTap always serialises custom atom nodes this way; actual JSON not directly observed.

### 2.4 Java→WebView Bridge Calls `[VERIFIED]`

Two bridge methods govern the paint block lifecycle inside the editor:

| Bridge Method                  | Direction      | Purpose                                                    |
|-------------------------------|----------------|------------------------------------------------------------|
| `callInsertNewPaintFromJava`   | Java → JS      | Inserts a new `ot(s)` node after the user finishes drawing. Payload contains full `PaintInfo` fields including `paintId`, `imageWidth`, `imageHeight`, `backgroundType`. |
| `callUpdatePaintFromJava`      | Java → JS      | Updates an existing paint node's attributes in-place (e.g. after re-edit resizes the canvas). |

> `[VERIFIED]` Both method names confirmed from bundle analysis.
> `[INFERRED]` Exact payload shape — inferred from `PaintInfo` model fields that map to node attributes.

---

## 3. PaintInfo Model `[VERIFIED]`

Full 24-field model sourced from jadx-decompiled Java source under `com.oplus.note.app`.

| # | Field Name                      | Type      | Purpose / Notes                                                                  |
|---|---------------------------------|-----------|----------------------------------------------------------------------------------|
| 1 | `addToHistory`                  | Boolean   | Whether this paint action should be pushed onto the undo/redo history stack       |
| 2 | `attachId`                      | String    | Foreign key → `paint_attachments.id` for the primary (TYPE_PAINT) attachment     |
| 3 | `backgroundType`                | String    | Canvas background style key (`blank`, `lined`, `grid`, etc.)                    |
| 4 | `bottomContentInfo`             | String    | Serialised JSON or descriptor for content below the paint block `[INFERRED]`    |
| 5 | `dataPath`                      | String    | Absolute path to the binary stroke file (`.bin`) on device storage               |
| 6 | `editStartTime`                 | Long      | Unix-ms timestamp when the user began editing; used for analytics/conflict res.  |
| 7 | `imageHeight`                   | Float     | Canvas height in pixels (or density-independent units `[INFERRED]`)              |
| 8 | `imagePath`                     | String    | Absolute path to the PNG canvas preview image                                    |
| 9 | `imageWidth`                    | Float     | Canvas width in pixels (or density-independent units `[INFERRED]`)               |
| 10| `isAddNewPaintByCreateNote`     | Boolean   | True when paint is inserted during initial note creation (not mid-note edit)     |
| 11| `isCreate`                      | Boolean   | True on first save; False on re-edit of an existing paint block                  |
| 12| `isEditing`                     | Boolean   | Runtime flag indicating the paint activity is currently active                   |
| 13| `isInfoSaved`                   | Boolean   | True once the PaintInfo has been persisted to DB                                 |
| 14| `isNewInserted`                 | Boolean   | Distinguishes a brand-new block from an update to an existing one                |
| 15| `mixtureId`                     | String    | ID of an optional mixture layer attachment (TYPE = PAINT_MIXTURE = 18)           |
| 16| `newPaintHeight`                | Integer   | Possibly the updated/cropped height after re-edit `[INFERRED]`                  |
| 17| `paintId`                       | String    | Primary identifier of this paint block; echoed as `paintid` in ProseMirror node |
| 18| `skinBgAttachId`                | String    | Attachment ID for the skin/background image (TYPE = PAINT_SKIN_BG = 19)         |
| 19| `skinBgPath`                    | String    | Absolute path to the skin/background image file on device storage                |
| 20| `textExtra`                     | String    | Extra metadata for the text layer `[INFERRED]`, possibly JSON                    |
| 21| `textId`                        | String    | Attachment ID for the handwriting-recognition text output (TYPE = PAINT_TEXT=16) |
| 22| `textPath`                      | String    | Absolute path to the HTR text layer file                                         |
| 23| `topContentInfo`                | String    | Serialised descriptor for content above the paint block `[INFERRED]`             |
| 24| `visibleRect`                   | RectF     | The visible/cropped rectangle of the canvas currently shown in the editor        |

---

## 4. PaintAttr Model (Cover Paint Variant) `[VERIFIED]`

A lighter, 8-field model used specifically for **cover paint** thumbnails (type constant `TYPE_COVER_PAINT = 4`):

| # | Field Name      | Type    | Purpose                                                          |
|---|-----------------|---------|------------------------------------------------------------------|
| 1 | `attachId`      | String  | Foreign key → `paint_attachments.id`                            |
| 2 | `imageHeight`   | —       | Height of the cover thumbnail                                    |
| 3 | `imageSrc`      | String  | URI/path of the source image used as cover                       |
| 4 | `imageWidth`    | —       | Width of the cover thumbnail                                     |
| 5 | `needShowTips`  | —       | Boolean-like flag; whether to overlay a tips/hint UI on cover    |
| 6 | `paintId`       | String  | Links back to the originating paint block                        |
| 7 | `paintSrc`      | String  | URI/path of the rendered paint image used as source `[INFERRED]`|
| 8 | `tips`          | —       | Tip/hint string displayed on the cover `[INFERRED]`              |

> `[VERIFIED]` Field names and count. `[INFERRED]` Field types and detailed semantics not confirmed from type signatures.

---

## 5. Database Schema

### 5.1 `paint_notes` Table `[VERIFIED]`

Source: `AppDatabase_Impl.java` (jadx decompile).

| # | Column                   | Type    | Constraints                     | Notes                                                     |
|---|--------------------------|---------|---------------------------------|-----------------------------------------------------------|
| 1 | `id`                     | TEXT    | PRIMARY KEY                     | UUID string; matches `PaintInfo.paintId`                  |
| 2 | `title`                  | TEXT    |                                 | Note title (may be empty for paint-only notes)            |
| 3 | `text`                   | TEXT    |                                 | Plain-text representation `[INFERRED]`                    |
| 4 | `content_id`             | TEXT    |                                 | Links to protobuf content blob identifier `[INFERRED]`    |
| 5 | `folder_id`              | TEXT    | NOT NULL                        | Parent folder UUID                                        |
| 6 | `timestamp`              | INTEGER | NOT NULL                        | Generic sort timestamp (Unix ms)                          |
| 7 | `create_time`            | INTEGER | NOT NULL                        | Note creation time (Unix ms)                              |
| 8 | `update_time`            | INTEGER | NOT NULL                        | Last modification time (Unix ms)                          |
| 9 | `top_time`               | INTEGER | NOT NULL                        | Time when note was pinned/topped (0 if not pinned)        |
| 10| `recycle_time`           | INTEGER | NOT NULL                        | Time moved to recycle bin (0 if active)                   |
| 11| `recycle_time_pre`       | INTEGER |                                 | Previous recycle time (for undo-delete) `[INFERRED]`      |
| 12| `state`                  | INTEGER | NOT NULL                        | Lifecycle state enum (active, deleted, syncing, etc.)     |
| 13| `deleted`                | INTEGER | NOT NULL                        | Soft-delete flag (0 = active, 1 = deleted)                |
| 14| `version`                | INTEGER | NOT NULL                        | App-layer optimistic concurrency version                  |
| 15| `sysVersion`             | INTEGER |                                 | System/server version counter for sync `[INFERRED]`       |
| 16| `encrypted`              | INTEGER | NOT NULL DEFAULT 0              | Encryption flag (0 = plain, 1 = encrypted)                |
| 17| `extra`                  | TEXT    |                                 | JSON blob for extensible metadata `[INFERRED]`            |
| 18| `first_img`              | TEXT    |                                 | Path/URI to the first image (cover thumbnail source)      |
| 19| `feature_list`           | TEXT    |                                 | Serialised feature flags or capability list `[INFERRED]`  |
| 20| `sys_protocol_version`   | INTEGER | NOT NULL                        | Protocol/schema version for server compatibility          |
| 21| `file_download_time`     | INTEGER | NOT NULL                        | Timestamp of last attachment file download (Unix ms)      |

### 5.2 `paint_attachments` Table `[VERIFIED]`

Source: `AppDatabase_Impl.java` (jadx decompile).

| # | Column             | Type    | Constraints                          | Notes                                                          |
|---|--------------------|---------|--------------------------------------|----------------------------------------------------------------|
| 1 | `id`               | TEXT    | NOT NULL, PK (composite)             | Attachment UUID                                               |
| 2 | `paint_note_id`    | TEXT    | NOT NULL, PK (composite), FK        | → `paint_notes.id`                                            |
| 3 | `type`             | INTEGER | NOT NULL                             | Attachment type constant (see §5.3)                           |
| 4 | `file_name`        | TEXT    | NOT NULL                             | Local filename on device storage                              |
| 5 | `state`            | INTEGER | NOT NULL                             | Download/upload state enum `[INFERRED]`                       |
| 6 | `md5`              | TEXT    |                                      | MD5 checksum of the attachment file for integrity verification |
| 7 | `url`              | TEXT    |                                      | Remote URL for cloud sync download                            |
| 8 | `checkPayload`     | TEXT    |                                      | Additional integrity/auth payload `[INFERRED]`                |
| 9 | `extra`            | TEXT    |                                      | JSON blob for extensible per-attachment metadata `[INFERRED]` |

**Primary key:** composite `(id, paint_note_id)`.

### 5.3 Attachment Type Constants `[VERIFIED]`

| Constant          | Value | File / Purpose                                               |
|-------------------|-------|--------------------------------------------------------------|
| `TYPE_PAINT`      | 1     | Main paint block — binary stroke file (`.bin`) + PNG preview |
| `TYPE_COVER_PAINT`| 4     | Cover/thumbnail paint image                                  |
| `PAINT_TEXT`      | 16    | HTR text-layer output file                                   |
| `PAINT_ENT`       | 17    | Entity data `[UNKNOWN — purpose not determined]`            |
| `PAINT_MIXTURE`   | 18    | Mixture/composite layer data                                 |
| `PAINT_SKIN_BG`   | 19    | Skin/background image for the canvas                         |
| `PAINT_CONTENT`   | 20    | Content protobuf blob                                        |

### 5.4 `PaintNoteContent` Protobuf `[VERIFIED]`

Source: `paint_note_content.proto` (recovered from APK assets or jadx string analysis).

```protobuf
syntax = "proto3";  // [INFERRED — syntax version not confirmed]

message PaintNoteContent {
  repeated Paint paints = 1;

  message Paint {
    string paint_id    = 1;  // Primary paint block UUID
    string pic_id      = 2;  // Picture/image attachment ID
    string skin_id     = 3;  // Skin definition ID
    string text_id     = 4;  // HTR text attachment ID
    string mixture_id  = 5;  // Mixture layer attachment ID
    repeated string subs = 6; // Sub-component IDs [INFERRED purpose]
    string skin_pic_id = 7;  // Skin picture attachment ID
  }
}
```

**Serialisation path** `[INFERRED]`: the protobuf binary is stored as the `paint_content` attachment (type=20) or embedded in `paint_notes.content_id`. It is the canonical record of which attachment IDs belong to which paint block within a multi-paint note.

---

## 6. File Storage Layout

### 6.1 File Path Fields and Their Roles

| Field in PaintInfo  | Extension  | Confidence          | Role                                                              |
|---------------------|------------|---------------------|-------------------------------------------------------------------|
| `dataPath`          | `.bin`     | `[VERIFIED path field]` / `[INFERRED format]` | Binary stroke data — consumed by `libinkEngineNative.so` via JNI |
| `imagePath`         | `.png`     | `[STRONGLY SUPPORTED]` | Rasterised PNG preview of the paint canvas                    |
| `textPath`          | `[UNKNOWN]`| `[INFERRED]`        | HTR output: likely plain text or structured JSON from Sunia engine|
| `skinBgPath`        | `.png`/`.jpg` | `[INFERRED]`     | Background/skin image file for the canvas                        |

**Storage root** `[INFERRED]`: files likely reside under `/data/data/com.oplus.note/files/paint/<paintId>/` or an analogous app-private directory. External storage (`/sdcard/Android/data/com.oplus.note/`) is also plausible for larger assets.

### 6.2 Attachment ID Mapping

Each paint block carries four distinct attachment IDs that correlate to rows in `paint_attachments`:

```
PaintInfo.attachId        → type=1  (TYPE_PAINT)     → .bin stroke file + PNG preview
PaintInfo.textId          → type=16 (PAINT_TEXT)     → HTR text layer
PaintInfo.mixtureId       → type=18 (PAINT_MIXTURE)  → mixture/composite layer
PaintInfo.skinBgAttachId  → type=19 (PAINT_SKIN_BG)  → skin/background image
```

> `[VERIFIED]` ID field names and type constant values.
> `[INFERRED]` Mapping of IDs to specific type values (consistent with constants but not directly traced in DB query code).

---

## 7. Native Library Inventory

### 7.1 Group 1 — Ink / Stroke Engine

| Library                  | Size    | Role                                              | Known JNI Entry Points | Cross-Platform Category          |
|--------------------------|---------|---------------------------------------------------|------------------------|----------------------------------|
| `libinkEngineNative.so`  | 785 KB  | Vector ink stroke capture and management          | `[UNKNOWN]` — likely `nativeInit`, `nativeOnTouchEvent`, `nativeRender`, `nativeSave` (INFERRED from naming convention) | ❌ NOT PORTABLE — proprietary OPLUS C++ |
| `libestimatedPathLib.so` | 1.6 MB  | Stroke path estimation / smoothing ahead of input | `[UNKNOWN]`            | ❌ NOT PORTABLE                  |
| `libforecast.so`         | 222 KB  | Stroke prediction / touch-ahead forecasting       | `[UNKNOWN]`            | ❌ NOT PORTABLE                  |

**Assessment:** These three libraries form the real-time ink pipeline: `libforecast.so` predicts where the stylus will be next frame, `libestimatedPathLib.so` smooths the raw path, and `libinkEngineNative.so` records and manages the stroke data. All are closed binaries with no documented API; reimplementation is required.

### 7.2 Group 2 — Canvas Rendering

| Library               | Size    | Role                                             | Known JNI Entry Points | Cross-Platform Category                         |
|-----------------------|---------|--------------------------------------------------|------------------------|-------------------------------------------------|
| `libpaint.so`         | 6.6 MB  | Primary canvas rendering engine                  | `[UNKNOWN]`            | ⚠️ REPLACEABLE — HTML5 Canvas / Skia / WebGL   |
| `libgraphic.so`       | 863 KB  | Graphics rendering utilities / compositing       | `[UNKNOWN]`            | ⚠️ REPLACEABLE                                  |
| `libwatergradient.so` | 223 KB  | Watercolor gradient / wet-ink visual simulation  | `[UNKNOWN]`            | ⚠️ REPLACEABLE — custom WebGL shader or Canvas2D |

**Assessment:** Canvas rendering is the most tractable group for open reimplementation. HTML5 Canvas 2D API handles basic strokes; WebGL or a library like Fabric.js / Konva.js can handle compositing and gradient effects. Watercolor simulation would require a custom shader.

### 7.3 Group 3 — Handwriting Recognition (HTR)

| Library              | Size    | Role                                          | Known JNI Entry Points | Cross-Platform Category                 |
|----------------------|---------|-----------------------------------------------|------------------------|-----------------------------------------|
| `libSuniaEngine.so`  | 14 MB   | Primary HTR engine (Sunia, OPLUS proprietary) | `[UNKNOWN]`            | ❌ NOT PORTABLE                         |
| `libSNHTREngine.so`  | 6.9 MB  | Secondary HTR engine                          | `[UNKNOWN]`            | ❌ NOT PORTABLE                         |
| `libsuniabase.so`    | 2.1 MB  | Sunia base runtime / shared utilities         | `[UNKNOWN]`            | ❌ NOT PORTABLE (paired with Sunia)     |

**Assessment:** HTR is deeply proprietary. Sunia appears to be OPLUS's in-house handwriting engine; 14 MB suggests it bundles its own ML models or lookup tables. An open alternative (Google MLKit on Android, or Apple PencilKit's text recognition on iOS) would be needed for cross-platform reimplementation. HTR is recommended as **out-of-scope for v1**.

### 7.4 Group 4 — Shape, Math, Gesture & Language Recognition

| Library                | Size    | Role                                              | Known JNI Entry Points | Cross-Platform Category               |
|------------------------|---------|---------------------------------------------------|------------------------|---------------------------------------|
| `libmathcaculate.so`   | 1.8 MB  | Math formula recognition and evaluation           | `[UNKNOWN]`            | ❌ NOT PORTABLE                       |
| `libshapereco.so`      | 258 KB  | Shape smoothing / perfect-shape recognition       | `[UNKNOWN]`            | ⚠️ REPLACEABLE — open shape-reco libs |
| `libgesturereco.so`    | 95 KB   | Gesture recognition (scratch-to-erase, etc.)      | `[UNKNOWN]`            | ⚠️ REPLACEABLE — custom heuristics   |
| `libgraphicreco.so`    | 500 KB  | Graphic/diagram element recognition               | `[UNKNOWN]`            | ❌ NOT PORTABLE                       |
| `liblangdetectadapter.so` | 193 KB | Language detection adapter for HTR input        | `[UNKNOWN]`            | ❌ NOT PORTABLE (tied to Sunia)       |

**Assessment:** Math recognition (`libmathcaculate.so`) is proprietary and non-trivially replaceable (Mathpix API or open-source Seshat engine are candidates). Shape recognition is replaceable with open heuristics. Gesture recognition is small enough to re-implement from scratch.

### 7.5 Group 5 — ML Inference Runtime

| Library             | Size    | Role                                                     | Known JNI Entry Points | Cross-Platform Category                    |
|---------------------|---------|----------------------------------------------------------|------------------------|--------------------------------------------|
| `libonnxruntime.so` | 14 MB   | ONNX Runtime — generic ML inference for all AI features  | Standard ONNX C API    | ✅ PORTABLE — open-source (Microsoft, MIT) |
| `libnaiveEngine.so` | 1.3 MB  | Naive/lightweight inference engine `[INFERRED]`          | `[UNKNOWN]`            | `[UNKNOWN]` — may wrap ONNX               |
| `libnaiengine.so`   | 436 KB  | NAI engine — purpose unclear `[UNKNOWN]`                 | `[UNKNOWN]`            | `[UNKNOWN]`                               |
| `libnbiengine.so`   | 1.1 MB  | NBI engine — purpose unclear `[UNKNOWN]`                 | `[UNKNOWN]`            | `[UNKNOWN]`                               |

**Assessment:** `libonnxruntime.so` is open-source and cross-platform; the models it runs are the proprietary component. The three smaller `nai`/`nbi` libraries likely implement thin wrappers or specialised inference paths — their roles are `[UNKNOWN]` without symbol analysis.

### 7.6 Group 6 — AI Visual Features

| Library                  | Size    | Role                                         | Known JNI Entry Points | Cross-Platform Category                        |
|--------------------------|---------|----------------------------------------------|------------------------|------------------------------------------------|
| `libCutoutEffect.so`     | 303 KB  | AI subject/background cutout (image editing) | `[UNKNOWN]`            | ❌ NOT PORTABLE — OPLUS proprietary AI         |
| `libvfxmagicediteffect.so` | 451 KB | Magic Edit visual effects (VFX)             | `[UNKNOWN]`            | ❌ NOT PORTABLE                                |
| `libaiunit_sdk_core.so`  | 13 KB   | AI unit SDK core — likely glue/init layer    | `[UNKNOWN]`            | `[INFERRED]` infrastructure, NOT PORTABLE independently |

**Assessment:** These features depend on OPLUS's proprietary AI model pipelines. They cannot be ported without equivalent models. Open alternatives (Segment Anything for cutout, custom WebGL for VFX) are architecturally possible but out-of-scope for a v1 reimplementation.

### 7.7 Group 7 — Infrastructure / Security

| Library                                         | Size    | Role                                               | Known JNI Entry Points | Cross-Platform Category         |
|-------------------------------------------------|---------|----------------------------------------------------|------------------------|---------------------------------|
| `libopluslog.so`                                | 62 KB   | OPLUS-specific native logging                      | `[UNKNOWN]`            | ❌ NOT PORTABLE (OPLUS infra)   |
| `libsjk.so`                                     | 5.1 MB  | Purpose unclear — possibly security/JNI kit `[UNKNOWN]` | `[UNKNOWN]`        | `[UNKNOWN]`                    |
| `libauthlib.so`                                 | 7.7 MB  | Authentication library (cloud/DRM/license)         | `[UNKNOWN]`            | ❌ NOT PORTABLE                 |
| `libtbljniutils.so`                             | 18 KB   | Table/JNI utility helpers `[INFERRED]`             | `[UNKNOWN]`            | `[UNKNOWN]` — likely trivial   |
| `libwbkit-seckit3.so`                           | 143 KB  | WBKit security kit v3 `[INFERRED]`                 | `[UNKNOWN]`            | ❌ NOT PORTABLE (OPLUS security)|
| `libwb_tables_549543368749780587_1.so`          | 218 KB  | Static lookup tables for WBKit `[INFERRED]`        | None (data-only?) `[INFERRED]` | ❌ NOT PORTABLE          |

**Assessment:** Infrastructure libraries are OPLUS-internal and entirely non-portable. `libsjk.so` at 5.1 MB is anomalously large for a utility; it may embed encrypted resources or a secondary runtime — its purpose is `[UNKNOWN]` and warrants further symbol/string analysis.

---

## 8. Binary `.bin` Stroke File Analysis

### 8.1 What Is Known `[VERIFIED / STRONGLY SUPPORTED]`

- `[VERIFIED]` The field `PaintInfo.dataPath` points to a file on-device storage.
- `[STRONGLY SUPPORTED]` This file is the primary stroke data store consumed by `libinkEngineNative.so` via JNI. The library's name, size (785 KB), and functional description are consistent with it being the sole reader/writer of this format.
- `[STRONGLY SUPPORTED]` The file is not a standard image format — it is referenced separately from `imagePath` (PNG preview), confirming it holds structured stroke/vector data.

### 8.2 Structure Hypothesis `[INFERRED]`

No direct hex dump or format documentation is available. The following is a **plausible structural hypothesis** based on common ink engine conventions:

```
[INFERRED binary layout]
Offset 0x00–0x0F  : Magic header (e.g. 4-byte signature + version uint32 + flags uint32 + stroke_count uint32)
Offset 0x10+      : Canvas metadata block (width float32, height float32, background_type uint8, ...)
Variable          : Stroke records array, one per recorded stroke:
  - stroke_id       : uint32 or UUID bytes
  - point_count     : uint32
  - tool_type       : uint8  (pen, brush, eraser, highlighter, ...)
  - color           : ARGB uint32
  - base_size       : float32
  - Point records   : array of point_count × {
        x           : float32  (canvas-space coordinate)
        y           : float32
        pressure    : float32  (0.0–1.0, stylus pressure)
        tilt_x      : float32  [UNKNOWN — may not be present]
        tilt_y      : float32  [UNKNOWN — may not be present]
        timestamp   : uint32   (ms offset from stroke start)
    }
  - Spline hint     : [UNKNOWN — may store pre-computed Bézier / Catmull-Rom control points]
Tail              : Possible checksum or trailer magic
```

> All sub-fields above are `[INFERRED]`. This hypothesis is derived from industry-standard ink file formats (e.g., ISF, WILL, Apple PKDrawing, Google Ink) and the capabilities implied by the associated libraries (`libforecast.so` implies per-point timestamps; `libestimatedPathLib.so` implies pressure/velocity data is recorded).

### 8.3 What Is UNKNOWN

| Question                                        | Status    |
|-------------------------------------------------|-----------|
| Exact header magic bytes                        | `[UNKNOWN]` |
| Precise record structure (field sizes, order)   | `[UNKNOWN]` |
| Whether coordinates are absolute or delta-encoded | `[UNKNOWN]` |
| Compression (raw, zlib, LZ4, custom)            | `[UNKNOWN]` |
| File versioning scheme and backwards compatibility | `[UNKNOWN]` |
| Whether pre-computed spline data is stored or recomputed on load | `[UNKNOWN]` |
| Encryption (given `encrypted` column in `paint_notes`) | `[UNKNOWN]` |

### 8.4 Feasibility of Independent Parsing

**Verdict:** `[INFERRED]` — **Conditionally feasible, but non-trivial.**

The format is almost certainly a custom binary layout rather than a documented open format. Reversing it would require:

1. Extracting a live device's `.bin` files for several test paint strokes.
2. Correlating file content with known stroke parameters (single dot, single line, known pressure values).
3. Iterative hex analysis to locate magic, record boundaries, and field encoding.

If the format uses standard IEEE 754 floats and no compression, a few hours of analysis should yield a working parser. If it uses custom compression or encryption, the effort increases substantially.

---

## 9. Paint Creation Lifecycle

```
[LIFECYCLE — mixed VERIFIED/INFERRED as noted per step]
```

### Step 1 — User Triggers New Paint `[STRONGLY SUPPORTED]`

User taps "Insert Paint" in the editor (WebView). The JS bridge posts a message to the Android host; `NewPaintPresenter` (`com.oplus.note.app`) handles the intent and launches `HandPaintNoteActivity` or `NewPaintActivity`.

### Step 2 — Native Canvas Initialisation `[INFERRED]`

```java
// [INFERRED JNI call sequence]
libinkEngineNative.nativeInit(canvasWidthPx, canvasHeightPx, dpi, backgroundType);
```

The native layer allocates stroke buffers, initialises the rendering context (`libpaint.so`), and sets up the stroke prediction pipeline (`libforecast.so` + `libestimatedPathLib.so`).

### Step 3 — Touch Event Processing `[INFERRED]`

```java
// [INFERRED — for each MotionEvent]
libinkEngineNative.nativeOnTouchEvent(action, x, y, pressure, tiltX, tiltY, timestampMs);
```

Each raw touch event is fed to the forecaster (predicts next point), the path estimator (smooths), and then committed to the stroke record.

### Step 4 — Frame Rendering `[INFERRED]`

```java
// [INFERRED]
Bitmap frame = libinkEngineNative.nativeRender(dirtyRect);
```

`libpaint.so` rasterises the current stroke state to a bitmap, which is composited with the background and displayed in a `SurfaceView` or `TextureView`.

### Step 5 — Save / Export `[INFERRED]`

On "Done":
1. `libinkEngineNative.nativeSave(dataPath)` — writes stroke data to `.bin` file at `PaintInfo.dataPath`.
2. `libinkEngineNative.nativeExportPng(imagePath, width, height)` — renders final PNG preview to `PaintInfo.imagePath`.
3. If HTR is enabled: `libSuniaEngine` processes the stroke data → writes text output to `PaintInfo.textPath`.

### Step 6 — Database Persistence `[STRONGLY SUPPORTED]`

A `paint_notes` row is created/updated. Attachment rows are inserted into `paint_attachments`:
- `type=1` row: stroke `.bin` + PNG preview (file_name = `PaintInfo.attachId`)
- `type=16` row (if HTR): text layer
- `type=18` row (if mixture): mixture data
- `type=19` row (if skin): background image

`PaintNoteContent` protobuf is serialised and stored (`type=20` attachment or embedded in `content_id`).

### Step 7 — Bridge Return to Editor `[VERIFIED]`

```js
// [VERIFIED — bridge method name; payload shape INFERRED]
callInsertNewPaintFromJava({
  paintId:        "<uuid>",
  imageWidth:     800,
  imageHeight:    600,
  backgroundType: "blank",
  imagePath:      "/data/.../preview.png",
  // ... other PaintInfo fields
});
```

The WebView receives this call, and ProseMirror inserts the `ot(s)` node at the cursor position with the provided attributes.

### Step 8 — Re-edit Flow `[INFERRED]`

On tap of an existing paint node, the editor calls a bridge method (name `[UNKNOWN]`) passing `paintId`. The host re-launches `HandPaintNoteActivity` with `isCreate=false`. On completion, `callUpdatePaintFromJava` is called to update the node's attributes if dimensions changed.

---

## 10. Cross-Platform Portability Assessment

### 10.1 Component-by-Component Verdict

| Component                  | Portability        | Rationale                                                              | Recommended v1 Action                                    |
|----------------------------|--------------------|------------------------------------------------------------------------|----------------------------------------------------------|
| **Core ink engine**        | ❌ NOT PORTABLE    | Proprietary C++, closed binary, no API documentation                   | Reimplement: pressure-sensitive Bézier stroke engine in JS/Canvas |
| **Stroke path estimation** | ❌ NOT PORTABLE    | Proprietary C++                                                         | Use open alternatives: `perfect-freehand`, Catmull-Rom splines |
| **Stroke forecasting**     | ❌ NOT PORTABLE    | Proprietary C++                                                         | Implement linear/quadratic prediction as a lightweight module |
| **Canvas rasterisation**   | ⚠️ REPLACEABLE    | Standard rendering; replaceable with HTML5 Canvas 2D or WebGL          | Use HTML5 Canvas 2D for v1; WebGL for v2 effects         |
| **Watercolor/gradient FX** | ⚠️ REPLACEABLE    | Visual effect only; implementable via custom WebGL shaders              | Defer to v2; basic solid strokes sufficient for v1       |
| **HTR (Sunia)**            | ❌ NOT PORTABLE    | OPLUS proprietary, 14 MB engine + unreleased models                    | Exclude from v1; consider Google MLKit or on-device ONNX models later |
| **Math recognition**       | ❌ NOT PORTABLE    | OPLUS proprietary                                                       | Exclude from v1; consider Mathpix API for v2             |
| **Shape recognition**      | ⚠️ REPLACEABLE    | Heuristic geometry; replaceable with open algorithms                   | Implement basic shape snapping (circle, rect, line) in v1 |
| **Gesture recognition**    | ⚠️ REPLACEABLE    | Small library; gesture logic is re-implementable                       | Implement scratch-to-erase and basic gestures in v1      |
| **ONNX Runtime**           | ✅ PORTABLE        | Open-source (MIT), cross-platform                                       | Available if/when open models are integrated             |
| **AI cutout / VFX**        | ❌ NOT PORTABLE    | OPLUS proprietary AI models required                                   | Exclude entirely from open reimplementation              |
| **Stroke `.bin` format**   | ❓ UNKNOWN         | Format not reversed; may be parseable once analysed                    | Adopt an open format (e.g., extended GeoJSON, WILL SDK) from the start |
| **Authentication**         | ❌ NOT PORTABLE    | OPLUS cloud/DRM auth                                                   | Replace with open auth (OAuth2 / JWT)                   |

### 10.2 Recommended Architecture for Open Reimplementation

```
[INFERRED — architectural recommendation based on portability analysis]

Stroke Layer (JS):
  - Input: PointerEvents with pressure (Web) / UITouch force (iOS)
  - Smoothing: perfect-freehand library or custom Catmull-Rom
  - Storage format: open JSON or binary (e.g., CBOR) with fields:
      { strokeId, tool, color, size, points: [{x,y,pressure,t}, ...] }

Rendering Layer:
  - v1: HTML5 Canvas 2D (OffscreenCanvas for perf)
  - v2: WebGL / WebGPU for watercolor, blend modes

Text Layer:
  - v1: None (no HTR)
  - v2: Platform ML (MLKit Android, Apple VisionKit, or Whisper-style ONNX model)

Persistence:
  - Replace paint_notes / paint_attachments schema with open equivalent
  - Store strokes as open binary or JSON; PNG preview generated client-side
  - No proprietary protobuf dependency (use JSON or open proto schema)

Bridge (WebView ↔ Host):
  - Mirror callInsertNewPaintFromJava / callUpdatePaintFromJava contract
  - Extend ProseMirror schema with same paintid / imageWidth / imageHeight / backgroundType attrs
```

### 10.3 Risk Summary

| Risk                                 | Severity | Likelihood | Mitigation                                                    |
|--------------------------------------|----------|------------|---------------------------------------------------------------|
| `.bin` format is compressed/encrypted | HIGH     | MEDIUM     | Adopt open format from scratch; treat binary as opaque        |
| Sunia HTR has no open equivalent at same quality | MEDIUM | HIGH | Ship without HTR; add MLKit option gated behind feature flag |
| libpaint.so rendering differs subtly from Canvas2D | LOW | HIGH | Acceptable for v1; document visual parity limitations       |
| OPLUS auth API gating paint sync     | HIGH     | HIGH       | Implement fresh cloud sync; no dependency on OPLUS infra      |

---

## 11. Open Questions / Further Investigation Required

| # | Question | Priority | Method |
|---|----------|----------|--------|
| 1 | What are the JNI symbol names exported by `libinkEngineNative.so`? | HIGH | `nm -D` / `readelf -Ws` on extracted `.so` |
| 2 | What is the exact binary layout of the `.bin` stroke file? | HIGH | Hex analysis of live device files + differential testing |
| 3 | What does `libsjk.so` (5.1 MB) do? | MEDIUM | Symbol analysis, string extraction |
| 4 | What is `PAINT_ENT` (type=17) used for? | MEDIUM | Trace `paint_attachments` queries for type=17 in jadx |
| 5 | Are `.bin` files encrypted when `paint_notes.encrypted=1`? | HIGH | Test with an encrypted note on device |
| 6 | What are `topContentInfo` / `bottomContentInfo` serialised as? | LOW | Trace `PaintInfo` construction in jadx |
| 7 | What are `libnaiengine.so`, `libnbiengine.so` used for? | MEDIUM | Symbol analysis |
| 8 | Is `PaintNoteContent` stored as type=20 attachment or inline in `content_id`? | MEDIUM | Trace DB write path in jadx |
| 9 | What bridge method triggers paint re-edit from the WebView? | MEDIUM | Bundle search for `callOpen`, `callEdit`, `startPaint`, etc. |
| 10 | What is the `subs` repeated field in `PaintNoteContent.Paint` used for? | LOW | Trace proto construction |

---

*Document generated by automated reverse-engineering audit pipeline — 2026-11-02. All claims carry explicit confidence labels; treat `[INFERRED]` and `[UNKNOWN]` items as requiring validation before use in engineering decisions.*
