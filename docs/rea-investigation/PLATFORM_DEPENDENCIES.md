# Platform and Manufacturer Dependencies

Status: static investigation of the editor bundle plus selected Android host sources and manifest. Labels: `[VERIFIED]`, `[INFERRED]`, `[UNKNOWN]`.

## Executive Finding

- [VERIFIED] The extracted TipTap bundle contains the product UI identity and proprietary-looking resources (for example `oppo-ai-logo.svg`, the `OPPOSerif-Regular` font name, and Chinese sample text mentioning OPPO), but a targeted search did not identify `com.oplus`, `com.heytap`, or `com.coloros` namespace/API references or a vendor service URL in the bundle. This is not a full dynamic network audit.
- [VERIFIED] The browser bundle does invoke `fetch()` in the generated Vite module-preload helper to load local chunks (`assets/index.js:1`, source offset near 2866). The HTML references chunk paths under `./assets/` (`index.html:8-31`). This is static asset loading, not evidence of a backend API.
- [VERIFIED] The Android host is manufacturer-bound in ways the editor bundle is not. `WVJBWebView` imports `com.heytap.tbl.webkit` and exposes `WVJBInterface`; the manifest declares OPPO/ColorOS/HeyTap permissions and package queries. The proprietary engine can be replaced only after WebView behavior is tested against standard Android System WebView.
- [UNKNOWN] Runtime requests, dynamically assembled endpoints, redirect handling, WebView origin policy, and whether remote card preview fetching is required for editor startup have not been tested.

## Dependency Classification

| Dependency / feature | Class | Evidence and replacement boundary |
|---|---|---|
| TipTap/ProseMirror editing, marks, lists, tables, document serialization | Fully self-contained JavaScript | Bundled chunks; verified handler bodies in `assets/index.js:362` include commands and callbacks. No native service is required for these document mutations. Runtime startup is still unverified. |
| Vue components and node-view display for image/file/contact/schedule/record/paint cards | Fully self-contained JavaScript for rendering; payload/provider split | 21 component names in `rea-tools/editor_components_inventory.json`; insert handlers build nodes. Card data, files, playback, native drawing, and click actions are provided or handled by the host. |
| DOM, ES modules, CSS, selection, layout, timers, `fetch` for local preloads | Standard browser API | The HTML is a module-based page. `fetch` is present in the Vite preload helper. Serve from HTTP(S); do not assume `file://` works for module loading. |
| Local durable note persistence | Custom host / storage adapter | Editor reports TipTap JSON through `onContentJsonUpdate`; no `localStorage`, `sessionStorage`, or IndexedDB reference was found in the targeted bundle scan. Native app stores note state outside the editor. A desktop host needs its own local persistence. |
| WVJB message transport | Custom cross-platform adapter | JS uses `WebViewJavascriptBridge`; Android implements it in `com/oplus/notes/webview/container/web/WVJBWebView.java:114-120, 437, 703-722`. A browser host must provide compatible injected globals and message dispatch. |
| Android IME, Android strings/version, haptics, touch interception, over-scroll | Standard Android API through a custom adapter | Proxy methods include `hideSoftInput`, `isImeVisible`, `getAndroidString`, `getAndroidVersion`, `performVibrate`, scrolling/gesture callbacks (`com/oplus/notes/webview/cache/a.java:18-1090`). Desktop implementations can be browser-specific; exact parity requires runtime testing. |
| System file picker, file path/URI checks, open file, image import/export | Standard Android API through a custom adapter | `pathExists`, `findFirstPngFileWithPrefix`, `onDocumentFileClick(path,fileName)` are host methods. Fragment callback at `WVNoteViewEditFragment.java:17964`; filesystem semantics cannot be reused as desktop paths. |
| Contact actions / telephony | Standard Android API through a custom adapter | `onContactCallClick` and `onContactSaveClick` are exposed callbacks; fragment contains contact handlers (`WVNoteViewEditFragment.java:17247` and adjacent source). On desktop/web, require OS integration or a graceful unsupported state. |
| Schedule/calendar actions | Standard Android API through a custom adapter | `onScheduleAddClick` exists in the proxy and fragment (`WVNoteViewEditFragment.java:18684`). Calendar insertion and permissions are host responsibilities. |
| Speech input, voice recording, audio playback | Standard Android API or browser media API through an adapter | Manifest includes `RECORD_AUDIO` (`apk-work/manifest.xml:390`). JS `callStartSpeechRecognizeFromJava` only calls back `"done"` (`index.js:362`, offset 600347); it does not implement speech recognition. Record-node rendering does not prove recording/playback portability. |
| Block drag/drop and cross-app attachment drag | Custom platform adapter | JS notifies host through `startBlockDragFromJs`; Android fragment starts a host drag flow (`WVNoteViewEditFragment.java:22916-22940`). Use browser drag/drop on desktop or platform drag APIs on Android. |
| Paint/doodle editing | Custom native adapter; desktop replacement unknown | Android fragment handles paint edit/save lifecycle; APK has native paint libraries and `paint_note_content.proto`. Web node-view presence is not proof the drawing engine is browser-only. |
| Cloud sync and accounts | Requires independent backend | Manifest includes cloud/sync permissions (`manifest.xml:285-303`); prior APK analysis identifies HeyTap/OPLUS cloud/account SDKs in the native application. The editor itself does not own sync. Replace these with a user-selected independent service. |
| AI/AIGC/AiKit | Requires independent backend or separately validated local models | JS includes AI node views and bridge protocols, while native AI service routes belong to the host app. Specific online endpoints, model execution per feature, and offline behavior are `[UNKNOWN]` here. |
| URL preview/card enrichment | Requires network capability / service or browser fetch, exact endpoint unknown | `getUrlTitle` is a host interface and `UrlContentGetter` exists in Android sources; native fragment references it. No endpoint was identified in the editor bundle. Respect user privacy and offline mode in a replacement. |
| Bundled custom WebView implementation | Vendor engine/runtime dependency | `WVJBWebView.java` imports `com.heytap.tbl.webkit.WebView`, `WebChromeClient`, and related classes. Editor HTML uses standard web assets, but WebView engine differences need cross-device validation. |

## Manifest Evidence

`apk-work/manifest.xml:285-408` includes standard permissions such as `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`, foreground service/data sync, boot, wake lock, exact alarms, overlay, vibration, notifications, and `RECORD_AUDIO`. The same section includes `com.coloros.cloud.ACCESS_SYNC_SERVICE`, `com.coloros.speechassist.permission.SPEECH_SERVICE`, OPPO/HeyTap cloud permissions, `oppo.permission.OPPO_COMPONENT_SAFE`, and multiple `com.oplus.permission.safe.*` permissions. This inventory is app-wide; it does not prove each permission is required by the editor.

The targeted permission search did not find `READ_CONTACTS` or `WRITE_CONTACTS` declarations. This should not be read as proof the host never uses contacts: it may delegate to another component or an intent, and the complete call path was not exhaustively audited.

## Manufacturer Dependency Summary

- [VERIFIED] Proprietary namespaces, permissions, and `com.heytap.tbl.webkit` belong to the native host/runtime layer, not a direct import in the Vue editor bundle.
- [VERIFIED] OPPO product styling remains in the bundle (brand icons/font names), even where platform integration is absent. Removing a framework dependency does not remove the 1:1 visual requirement.
- [INFERRED] The format/list/table/body serialization core is the most portable editor slice. Native callback features should be implemented behind a platform-neutral adapter interface, not by carrying the original Android proxy class across platforms.
- [UNKNOWN] Exact services, endpoints, and runtime checks behind all native SDK integrations require a separate host application investigation and runtime tracing.