# Compatibility & Portability Report — ColorOS Notes Rebuild

Purpose: separate what is **portable** (self-contained in the APK) from what is **bound to ColorOS/OPPO proprietary services**. This drives the rebuild's substitution list (Phase 6) and tells us exactly which features need a cross-platform replacement vs. can be reused as-is.

Method: static analysis of manifest (`queries`, permissions, components) + code (`import` frequency) + assets. No runtime launch (the APK does not run on the test Vivo device — it is a ColorOS-targeted system app). Failure to launch is **not** evidence that a feature is absent.

## 1. Dependency footprint (import frequency in decompiled source)

| Namespace | Import count | Nature |
|---|---|---|
| `com.oplus.*` | 17,873 | Mixed: app-bundled SDKs (account, cloud, aiwriter, webview, richtext) + framework-only |
| `com.nearme.note.*` | 9,316 | **App's own code** — fully portable |
| `com.heytap.*` | 4,031 | Mostly app-bundled SDK libs (cloudkit, usercenter, speech) shipped inside the APK |
| `com.coloros.*` | 612 | ColorOS framework services (queried, not bundled) |

Critical nuance: a large share of the `com.oplus.*` / `com.heytap.*` code is **bundled SDK source** (shipped inside the APK), not calls into a device framework. Those compile and run anywhere. Only the small set that resolves against **device-resident system services** is truly manufacturer-bound.

## 2. Feature portability classification

### 2.1 Core — fully portable (no manufacturer dependency)
Verified self-contained in the APK:
- **Create / edit / delete / view notes** (`com.nearme.note.*` activities + Room DB v47).
- **Rich-text editing** — the tiptap/ProseMirror WebView editor (`assets/tiptap/`) is bundled entirely. Full formatting set portable as-is.
- **Folders / categories / organization** — local `folders` table, no cloud needed.
- **Local search** — `words` table + FTS-style indexing, on-device.
- **Checklists / todos** — local `todo` table + tiptap taskList.
- **Pinning, sorting, trash/recycle** — local columns (`top_time`, `recycle_time`, `state`, `deleted`).
- **Timestamps, autosave** — local.
- **Handwriting / drawing (basic ink)** — `libinkEngineNative.so`, `libpaint.so` are bundled native libs (arm64). Portable to Android; on desktop the ink pipeline would need a cross-platform substitute (see 2.3).
- **Local SQLite storage** — Room DB v47; directly portable schema.
- **Import/export (local formats)** — PDF export (`ExportPdfActivity`) is client-side; `.doc` export is client-side.

### 2.2 Requires cross-platform substitution (user-facing equivalent exists)
These features depend on ColorOS services but have clear substitutes. Rebuild must implement equivalent UX:

| Original dependency | Feature | Cross-platform substitute |
|---|---|---|
| HeyTap/OPLUS Cloud (`com.heytap.cloud`, `com.coloros.cloud`, `SyncNoteServive`) | Cloud sync | Supabase/Appwrite/self-hosted sync backend (Phase 5) |
| HeyTap Account (`com.oplus.account`, usercenter SDK) | User login | Standard auth (email/OAuth) in chosen backend |
| Font Store (`com.heytap.themestore.action.FONT_FOR_NOTE`) | Downloadable note fonts | Bundle open-licensed fonts / user-supplied fonts |
| OCR service (`com.coloros.ocrscanner/ocrservice`) | Scan text / text recognition | ML Kit on-device OCR / Tesseract |
| Speech assist (`com.coloros.speechassist`) | Voice typing | Web Speech API / platform speech engine |
| System screenshot editor (`com.oplus.screenshot`) | Screenshot editing | In-app image editor |
| File manager (`com.coloros.filemanager`) | File attachment browsing | Standard file picker (SAF / portable file dialog) |
| Interconnect / TouchShare / OShare | Device-to-device share | Standard OS share sheet / network share |
| Card framework (`*.upk`/`*.rpk`, Pantanal seedling cards) | Home-screen cards | Native Android widget (standard `AppWidgetProvider`) |

### 2.3 AI features — server/on-device hybrid (substitute needed)
The APK bundles ONNX runtime + native AI engines (`libonnxruntime.so`, `libnaiengine.so`, `libnbiengine.so`) and AI model assets, so **some AI inference is on-device**. However the AI *service layer* (AI Writer/Summary/Search/Painter, sketch-to-image, smart cutout, enhance) is routed through OPLUS AI SDK + cloud (`com.oplus.aiwriter.sdk`, `com.oplus.ai.assistant`, `com.oplus.aipaint`).

| AI feature | Verified present | Portable path |
|---|---|---|
| AI Summary | Yes | LLM API (backend) or on-device model |
| AI Writer / Rewriter / Polish / Format | Yes | LLM API |
| AI Search (semantic) | Yes (indexing on-device) | Embedding + local vector index, or backend |
| AI Painter | Yes (`libaipaint`, preset guides) | Image-gen API |
| AI Sketch to Image | Yes | Image-gen API |
| Smart Cutout / Enhance | Yes (on-device engines present) | On-device model, portable to Android; lib for desktop TBD |

These are the **most expensive** to reproduce 1:1 and the least portable. Recommendation: keep the core editor fully local, and gate AI features behind a pluggable AI provider (Phase 5) so they work on any platform with an API key.

### 2.4 Genuinely manufacturer-bound (cannot be reproduced outside ColorOS)
No meaningful substitute exists; must be dropped or emulated at the OS level:
- `com.oplus.permission.safe.*`, `OPLUS_COMPONENT_SAFE` — OPLUS security/permission framework.
- `com.oplus.interconnect` / `com.oplus.oshare` — OPLUS cross-device interconnect.
- `com.oplus.metis` fact-data provider — OPPO analytics.
- OPLUS card/Pantanal seedling framework (`com.oplus.pantanal.*`) beyond a standard widget.
- HeyTap payment (`com.oplus.pay`, `AtlasPayFileProvider`).
- Launcher backup/restore via `net.oneplus.launcher` / `com.oppo.launcher` permissions.
- `com.oplus.dmp` (OPPO device management / search index providers).

These affect **system integration depth**, not core note-taking. Dropping them loses home-screen card styling, OPPO account login, and OPPO device share — none of which block a cross-platform notes app.

## 3. Android-manufacturer compatibility of the rebuild

Because the rebuild will use **standard Android APIs only** (per Phase 6), it will run on Samsung, Xiaomi, Pixel, Vivo, etc. The original cannot (it needs ColorOS system services for its AI/cloud/share layers). This is the core value of the rebuild.

Minimum viable port target: **Android 12+ (API 31)**, matching the original's `minSdk`.

## 4. Runtime verification status

### Confirmed via static analysis
Everything in §2 (all component, permission, asset, and code findings above).

### Not yet verified (needs runtime or further static tracing)
- **Exact AI inference location** (on-device vs cloud) per feature — native engines are bundled but the routing logic is partly obfuscated.
- **Sync conflict-resolution algorithm** (`AnchorManager`) — traced only to "local dirty = state 2; server wins = state 1". Full CRDT/anchor rules `[SPECULATIVE]`.
- **Exact `thumb_type` rendering semantics** (0/1/2 = default/touchshare/main-page) — values found, rendering behavior `[PARTIALLY SPECULATIVE]`.
- **Encryption of locked notes** — `encrypted` column + `com.oplus.permission.safe.AUTHENTICATE` present; the exact crypto/key path not traced.

### Environment needed for runtime verification
To verify the manufacturer-bound and cloud features, runtime testing requires:
- A **real OPPO/OnePlus/Realme device running ColorOS/OxygenOS 12+**, on which `com.coloros.note` is the installed system Notes app (or installable as a system-priv app with the OPLUS signature permissions).
- Alternatively, an **ColorOS emulator image** (no official AOSP-like ColorOS emulator exists; a rooted device with the OPLUS framework `services.jar`/`framework.jar` on the classpath is the practical route).

Because these are the *substituted* features anyway, runtime verification on ColorOS is **optional** for the rebuild — the goal is to replace, not to replicate, the proprietary layers. The portable core (§2.1) is fully specified by static analysis + the reusable tiptap editor bundle.

## 5. Bottom line
- **Core note-taking (create/edit/rich-text/folders/todos/pin/search/trash/handwriting/attachments/local storage) is 100% self-contained and portable.** The tiptap editor bundle is directly reusable on desktop and web.
- **Cloud sync, accounts, fonts, OCR, voice, AI, and device-share need cross-platform substitutes** — all have standard equivalents.
- **Only deep OPLUS system integration (permissions, interconnect, cards, pay) is truly non-portable** and can be dropped without degrading the core experience.
