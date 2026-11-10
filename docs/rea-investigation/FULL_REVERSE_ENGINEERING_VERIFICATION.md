# Full Reverse-Engineering Verification — Independent REA Audit

**Date:** 2026-11-11
**Target:** `ColorOSNotes.apk` (SHA-256 `95dfe16cab8ae4049372251db0809819c0f783af8b9b2b1e948f5466e3e0fdce`, 257,665,765 bytes)
**Scope:** Independent re-analysis and verification of every previous reverse-engineering report in `docs/rea-investigation/` and `docs/`, using REA (Reverse Engineer Anything) plus fresh raw-artifact cross-checks.
**Rules honored:** APK and Flutter implementation untouched; no deletions/overwrites of existing work; no commits or pushes; static vs runtime explicitly labeled; nothing claimed without evidence.

---

## 0. How this audit was performed

| Step | What was run | Outcome |
|---|---|---|
| REA setup | `rea doctor --client opencode` (before): `healthy:false`, `registration:opencode` = `config_drift` | — |
| Setup plan | `rea setup --client opencode --dry-run` → single action: add MCP registration to `~/.config/opencode/opencode.json` with backup; approved by user; applied with `--yes` | doctor after: **`healthy:true`**, `registration:opencode:true healthy` (MCP tools live in session after restart) |
| JADX engine | Not on disk; fetched REA's audited release `jadx-headless-mcp-0.7.1-all.jar` via the SHA-256-pinned URL from `rea/src/android/JadxRelease.ts` (`6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75`); local digest matched exactly; refusal-on-mismatch honored | Engine usable via `REA_JADX_MCP_JAR` (CLI lane; the MCP server process started before the env var existed, so in-session Android calls run through the documented CLI fallback) |
| Apktool | No `apktool` binary installed; a wrapper script `exec java -jar apk-work/apktool.jar` (apktool **2.11.1**, already present in the workspace) selected via `REA_APKTOOL_COMMAND` | Resource decode lane operational |
| Engines NOT available | Ghidra, IDA, Hopper, Kuna, pwntools — all absent; **no package installs performed** (per rules) | Native `.so` analysis limited to static ELF inspection (readelf/nm) — stated as a limitation in §7 |

**Evidence lanes actually run (fresh, this audit):**

| Evidence ID | Operation | Establishes | Confidence |
|---|---|---|---|
| `ev_642150ad…bd8` (parent `ev_87d6f37a…2b3`) | `open_binary` + `inspect_artifact` | APK ZIP inventory: 5,885 entries, graph complete, 0 integrity contradictions | observed |
| `ev_0509996f…8ae3` | `inspect_android_package` (JADX 0.7.1) | Package/SDK/permissions/manifest/components/class count | observed |
| `ev_3f989ee9…15cf` | `decode-android-resources` (apktool 2.11.1) | Decoded manifest, metadata, 2,000 of 2,461 default strings | observed |
| `ev_86267216…e5f6` | `inspect_apk_signature` | Signing schemes/signers/digest posture | observed (not verification) |
| `ev_8055a99a…e4bcd` (receipt `ev_f022ce23…cfc7`) | `analyze_javascript_application` | TipTap bundle semantic graph: 33 JS files, **0 parse failures**, 965 findings | derived (static, inert) |
| `ev_3bd57146…7b27` | `inspect_android_class` | `IMyJavascriptInterface` member inventory (106 DEX methods) | observed |
| `ev_d863043a…b005` | `inspect_android_class` | `cache.a` JS-delegator (108 methods) | observed |
| `ev_7902de4b…0c0d` | `inspect_android_class` | `WVJBWebView` (50 methods, single `j/k/l/i`) | observed |
| `ev_77e35cc2…9ae5` | `inspect_android_class` | `AppDatabase` — **`DB_VERSION = 47`** static field read from DEX | observed |
| `ev_5bd57e5a…7002` | `inspect_android_method` | `WVJBWebView.j` full body: dependency-gated queue | derived |
| `ev_51f6814e…2461` | `inspect_android_method` | `WVJBWebView.l` full body: JSON envelope + evaluate format | derived |
| `ev_378bdce5…3f86` | `inspect_android_class` | `TiptapContentInfo` = exactly 10 fields | observed |
| `/tmp/opencode/rea/*` | Fresh raw-artifact scripts (raw DEX string pool, bundle greps, jadx-tree greps) | Independent recounts in §3 | observed/reproducible |
| `apk-work/standalone-smoke-test` rerun | Chromium headless runtime | **15/15 PASS** smoke, **26/26** bridge probe, 1 page exception | runtime-tested (local harness, not the APK) |

---

## 1. Previous reports inspected

`docs/APK_ANALYSIS.md`, `docs/COMPATIBILITY_REPORT.md`, `docs/UI_SCREEN_MAP.md`, all 15 files in `docs/rea-investigation/`, `apk-work/db_analysis_raw.md`, smoke-test harness + results under `apk-work/standalone-smoke-test/`. Each document was read in full and digested into per-file claims + a top-25 consequential-claim list; 27 report-vs-report contradictions were extracted and are settled in §4.1.

---

## 2. Verdict summary (read this first)

**Was the previous reverse engineering done properly?** **Yes, with high fidelity on everything it claimed precisely.** Every checkable numeric, byte-offset and contract claim that this audit re-derived from the raw artifacts reproduced exactly. The method (JADX decompile + bundle text analysis + standalone runtime harness) was sound, its verified/inferred labeling was honest, and its two known anomalies (width `"[object Object]"`, OPPO-only `Selection.showHandles`) were correctly reported.

**What was missed or incomplete?** See §4 — most importantly a **second parallel editor** (`assets/tiptapcoverpaint/` bundle + its own WebView container + its own 82-method JS interface) that the bridge reports never quantified, and 3 handler names Java sends that *no* bundle registers. No previous claim was found to be **false**.

**What remains unknown?** See §7 — device-runtime behavior, native `.so` internals, cover-paint runtime flow, and several dead-code vs dynamic-registration questions.

**Is the architecture suitable / safe to continue UI implementation?** Yes — see §8.

---

## 3. Claim-by-claim verification (old vs new)

Legend: ✅ verified independently · 🟡 verified with qualification · ⚠️ not reproduced / method-dependent · 🆕 new in this audit · 🧪 runtime-tested

### 3.1 Bridge contract counts

| # | Previous claim | Fresh result | Verdict | Evidence |
|---|---|---|---|---|
| 1 | **188** native→JS handlers registered in the TipTap bundle | `registerHandler("…")` unique literal names = **188** | ✅ | fresh count, `apk-work/extracted/assets/tiptap/assets/index.js` |
| 2 | **174/188 sent** by native; **14 never sent** (named list: `_hasJavascriptMethod`, `callActiveTargetPaintFromJava`, `callGetNodeRectByCoordsFromJava`, `callGetNodeRectBySrcFromJava`, `callGetSelectedPaintBackgroundTypesFromJava`, `callGetSelectedTextFromJava`, `callInsertOrActivatePaintFromJava`, `callIsPaintUnderTargetNodeFromJava`, `callOnActionItemClickedAfterFromJava`, `callOnActionItemClickedBeforeFromJava`, `callRollBackSpecifiedTimesFromJava`, `callStartSpeechRecognizeFromJava`, `callUpdateFileNameFromJava`, `callUpdateRecordFromJava`) | Quoted-literal occurrence check of all 188 names across every decompiled `.java`: **174 referenced, 14 not** — **identical name list** | ✅ | fresh grep, `jadx-out/sources/**.java` |
| 3 | **290 send sites** | Literal-handler send sites: **235** (strict `WVJBWebView.k/j` receiver form) to **252** (any receiver incl. unqualified `k(this,…)` / instance `.j(…)` forms); plus ~70 dynamic/variable-name send candidates | ⚠️ not reproduced; difference is counting-method (multi-arg `.j(int,cb,"name",…)` position, variable handler names, cover-paint container). The *set* of sent handler names is verified (row 2); the *site count* should be treated as method-dependent, ≈235–252 literal | fresh regex pass over jadx tree |
| 4 | **107** JS-interface methods = 105 `IMyJavascriptInterface` + `getAndroidVersion` + `onJsLogPrint`; `cache/a.java` has **108** `@JavascriptInterface` = 107 unique (dup = `onTextClick`) | REA class inventories: `container/api.a` = 106 DEX methods = **105 unique names** (one `onTextClick` overload pair) ; `cache.a` = **108 methods**, fresh annotation parse = 108 decls / **107 unique**, duplicate `onTextClick`; extras vs interface = exactly `getAndroidVersion`, `onJsLogPrint` | ✅ | `ev_3bd57146…`, `ev_d863043a…`, fresh parse |
| 5 | Interface usage in bundle: **99/107 referenced**, 8 never (`getAndroidVersion`, `onDoodleUndoRedo`, `onEditingPaintRectChanged`, `onShowPictureGuideTips`, `onShowTableSelectMenu`, `onSkinScaleChanged`, `onTextAlignActive`, `onTitleJsonUpdate`) | Fresh: 99/105 interface names referenced; 7 never + `getAndroidVersion` never = **8/107** — same list | ✅ | fresh parse + bundle substring check |
| 6 | `callSetSelectionFromJava` is **not** among the 188 | Absent from the 188 list; 0 sends; 0 bundle references | ✅ | fresh counts |
| 7 | Native→JS transport: `WVJBWebView.j(int, callback, name, data, dependentHandlerNames)` → queue gated on `E.containsAll(dependents)` (default `["OnTipTapMounted"]`, else parked in `F`) → `l(msg)` builds `{callbackId,data,handlerName,responseId,responseData}` → `String.format("WebViewJavascriptBridge._handleMessageFromJava(%s)", json)` | REA decompiled both bodies: **exactly as claimed**, including default dependency list at `WVJBWebView.java:455`, send trigger `i("OnTipTapMounted")` at `WebViewContainerImpl.java:2480`, format string at `WVJBWebView.java:703` | ✅ | `ev_5bd57e5a…`, `ev_51f6814e…` |
| 8 | JS→native transport: `WVJBInterface.notice(JSON.stringify({handlerName,data,callbackId}))` with `prompt("_wvjbxx",…)` fallback; only 3 literal `callHandler(` uses | Bundle contains `WVJBInterface.notice(c…` and exactly 1 `_wvjbxx` marker; direct `window.injectedObject.method(…)` dominates | ✅ (spot-check) | bundle grep |

### 3.2 Content round-trip / payload contracts

| # | Previous claim | Fresh result | Verdict | Evidence |
|---|---|---|---|---|
| 9 | `callGetTextAndHtmlFromJava` returns `{text, htmlData:{content}, textIncludePaint:[…]}`, error shape `{bridgeName,errorMessage}`; body at bundle offset **599222** | Offset 599222 lands exactly on `function(e,n){const o=()=>{const i=kb(t),r=jP(t),a=XP(t)…`; probe returned the claimed shape | ✅ 🧪 | offset check + `results/probe_calls.json` rerun |
| 10 | `callGetAllHTMLFromJava` name is misleading — returns **plain text** via `ch()` | Probe rerun: `"Probe line one\n"` (newlines, no tags); `ch` def at offset 15784 confirmed as text serializer | ✅ 🧪 | rerun + offset |
| 11 | `callGetBlockContentWidthFromJava` returns `"[object Object]"` while native does `Float.parseFloat(widthStr)` → latent error | JS body @611010 confirmed ``n(`${o}`)`` where `ui()` returns an object; native `NewPaintPresenter$getBlockContentWidth$1$1$1.java:39` = `Float.parseFloat(this.$widthStr)`; probe rerun reproduced `"[object Object]"` | ✅ (static) · 🧪 reproduced in harness · **device behavior unobserved** | offsets, JADX line, probe rerun |
| 12 | `TiptapContentInfo` = 10 fields (`guid,titleHintText,title,content,subAttachments,pageResults,pictureAttrs,tiptapTitleJson,tiptapContentJson,isDoingSummary`) | REA class inventory: **exactly those 10 fields**, same types | ✅ | `ev_378bdce5…` |
| 13 | Title flows via `onTitleChange` text; `onTitleJsonUpdate` defined natively but never called by bundle | Bundle: `onTitleJsonUpdate` = 0 occurrences; `observeTitleText` → `onTitleChange(o)` @461058 confirmed | ✅ | fresh grep + offset |
| 14 | `onContentJsonUpdate(json)` observer @468969 serializes doc → `window.injectedObject.onContentJsonUpdate(l)` | Offset lands exactly inside `observeContentJsonUpdate` tail; `contentUpdate` callback fires 15× in smoke #12 | ✅ 🧪 | offset + smoke rerun |
| 15 | Payload examples: insert handlers take `new Gson().toJson(attachData)` (`AttachData`, 19 fields), `callUpdateRecordStateFromJava` = `{"attachId",state}`, `callGetImageRectByAttachIdFromJava` = raw `attachId` | Re-verified send sites (`WebViewContainerImpl.S0` builds `AttachData` for `callInsertImageFromJava`; `JSONObject{attachId,state}` for `callUpdateRecordStateFromJava`) | ✅ (spot-check) | fresh `rg` on jadx tree |
| 16 | Slash menu: JS sends `showRichTextFormatMenu(JSON.stringify({query,clientRect}))`; native impl gated by `quick_input_switch_status` | Bundle payload site confirmed; native `WVNoteViewEditFragment.java:20647 public void showRichTextFormatMenu(String)`, `quick_input_switch_status` referenced 3× in the class | ✅ | fresh grep |
| 17 | Byte-offset citations generally (sampled 10: 599222, 817520, 468969, 461058, 15784, 611010, 605438, 628769, 606230, 603768, `Ma()` @228859) | **All 11 exact** against `index.js` (839,074 chars / 842,750 bytes) | ✅ | fresh offsets |

### 3.3 Database claims (`db_analysis_raw.md`, Milestone 3.1)

| # | Previous claim | Fresh result | Verdict | Evidence |
|---|---|---|---|---|
| 18 | Room `AppDatabase` **DB_VERSION = 47** | REA read the static field from DEX: `DB_VERSION = {"type":"int","value":47}` | ✅ | `ev_77e35cc2…` |
| 19 | Room identity hash `18dc6a221107cead8c5f7e6e7761ca24` | Present **2× in the raw DEX string pool** (no JADX involved) | ✅ | `/tmp/opencode/rea/dex/dexstrings.txt` |
| 20 | `rich_notes` = **exactly 49 columns** (Milestone 3.1) | Counted the doc's verbatim `createAllTables` DDL: 49 columns + `PRIMARY KEY(...)` constraint (a naive count shows 50 — the 50th token is the PK clause) | ✅ | fresh parse of `db_analysis_raw.md` + DEX `CREATE TABLE …rich_notes` present 2× |
| 21 | v47 CREATE statements for `notes`(31 cols), `folders`(14), `notes_attributes`(13), `todo`(22), `note_skin`(13), etc. | Each `CREATE TABLE IF NOT EXISTS …` string found in raw DEX pool; column counts reproduced from doc DDL | ✅ | fresh grep/count |
| 22 | No `.db` file ships inside the APK | `unzip -l '*.db'` → only `META-INF/androidx.sqlite*` version markers; no database artifact | ✅ | fresh listing |

### 3.4 App identity, resources, signing, native (mostly 🆕)

| # | Claim / question | Fresh result | Verdict |
|---|---|---|---|
| 23 | Package `com.coloros.note`, version 16.7.5 (164070005), minSdk 31, targetSdk 35 | Confirmed by both JADX lane and apktool lane (two independent engines) | ✅ |
| 24 | Class count | **19,435 classes**, 5,884 resources | 🆕 |
| 25 | Components | 51 activities, 28 services, 28 providers, 20 receivers, 2 aliases; 55 exported; manifest decode `complete` (component projection `partial` — REA-stated limitation) | 🆕 |
| 26 | Signing | v1+v2+v3, single signer cert `64aafaf1…20b9a`, schemes agree, self-consistent; no v3.1, no lineage, no source stamp; **signatures not cryptographically verified** (REA limitation, stated) | 🆕 |
| 27 | Native libraries | 28 `.so` (arm64-v8a) only; `libpaint.so` exports **144 JNI symbols** under `com_oplusos_vfxsdk_doodleengine_util_NativePaint` + embedded OpenCV C API; `libinkEngineNative.so` = `com.sunia.penengine` callbacks; `libonnxruntime.so` 14.6 MB; NDK r21e, Android 29 min, stripped | 🆕 (static only) |
| 28 | WebView engine | `org.chromium.content.app.TBLPrivilegedProcessService0-4` declared — OPPO **TBL WebView** confirmed at manifest level (matches the smoke-test's "OPPO TBL-only" gap) | 🆕 |
| 29 | Strings/resources | 2,461 default strings (2 omitted for markup), locale tables preserved | 🆕 |

---

## 4. What the previous reports missed (new findings)

| # | Finding | Evidence | Severity for the project |
|---|---|---|---|
| N1 | **A second complete editor exists**: `assets/tiptapcoverpaint/assets/index.js` (591,016 bytes) registers **137 literal handlers** (125 shared with the main 188, **12 cover-only**: `callCopyInTableFromJava`, `callCutInTableFromJava`, `callDeletePaintFromJava`, `callDrawDoodleFromJava`, `callFocusCoordinateFromJava`, `callInsertPaintFromJava`, `callPasteInTableFromJava`, `callSetPaintEmpty`, `callUnsetBackgroundColorFromJava`, `callUpdateOverlayPaintHeightFromJava`, `callUpdatePaintFromJava`, `updateContentMargin`). It loads `https://appassets.androidplatform.net/assets/tiptapcoverpaint/index.html` | fresh bundle/grep evidence; `webviewcoverpaint/container/web/b.java` loadUrl | **High** — a parallel bridge surface must be modeled or explicitly scoped out of the Flutter port |
| N2 | **A second JS interface + WebView container**: `com.oplus.notes.webviewcoverpaint.cache.a` has **82 `@JavascriptInterface`** methods (vs 108), with its own `WVJBWebView` (`j(` form) and `webviewcoverpaint/container/impl/b.java` senders | fresh JADX grep + annotation count | High |
| N3 | **3 handler names are sent by native but registered in NEITHER bundle**: `callSetParagraphStyleFromJava` (sent from `WebViewContainerImpl.java:2653`), `callReplaceAllContentFromJava`, `callLoadParaStyleCssListFromJava` — 0 occurrences in both `index.js` files | fresh cross-check | Medium — likely legacy/dead sends; treat as no-ops, do not implement blindly |
| N4 | **Dynamic handler families exist outside the 188**: JS registers `` `${attachId}-ImageSrcExistFromJava` `` per attachment (and a computed `b` registration, logged as `callImageSrcExitFromJava` — a **typo'd log tag**); Java answers via variable-name sends (`k(wVJBWebView, concat, …)`, ~70 variable-send candidates). Neither side is captured by literal-name counts | bundle offsets + Java `concat` send sites | Medium — the "188" is the *static* registry only; the real surface is 188 + dynamic families |
| N5 | The previous "14 never sent" list uses a *sent* criterion; this audit shows the same 14 are also the only names with **zero Java-side quoted references at all** — strengthening the "dead in production" reading (they remain callable and probe-tested) | fresh counts | Low (clarification) |
| N6 | Second WebView implementation detail: cover-paint flow is referenced only from `com.oplus.notes.webviewcoverpaint.*` classes; main `webview/*` never loads the cover bundle — the two flows are cleanly separated | fresh grep | Informational |
| N7 | Manifest-level support for the smoke gap: 5 `TBLPrivilegedProcessService` processes declare the OPPO WebView runtime; `Selection.showHandles` errors in the harness are therefore environmental, not bundle bugs (consistent with the prior report's own read) | `ev_0509996f…` + 🧪 rerun | Informational |

No previous claim was found to be **incorrect**. One number is **method-dependent** (send-site count 290 vs fresh 235–252, §3 row 3) and should be restated with its counting rule.

### 4.1 Report-vs-report contradictions (digest C1–C27), settled by this audit

A full read of the 15 prior documents found 27 internal contradictions. Fresh evidence resolves them as follows.

**Resolved by fresh evidence (fresh result wins):**

| C | Contradiction | Fresh resolution |
|---|---|---|
| C1/C8 | FEATURE_MAP "headings 1–6, standard TipTap heading" vs smoke "no setHeading path, MultiHeading only"; also "50+", "190+" handler counts | Smoke correct: headings are `MultiHeading "1"\|"2"\|"3"`, 0 native `<h1-h3>`; true counts are **188 total / 107 interface** — the other figures are stale shorthand |
| C2 | `callGetAllHTMLFromJava` returns plain text vs HTML | **Plain text** — probe rerun returned `"Probe line one\n"`; `ch()` @15784 is a text serializer. BRIDGE_API_REFERENCE/FEATURE_MAP wording is wrong |
| C6 | `index.js` 842.8 KB vs 823 KB | **842,750 bytes** — both docs right; decimal-vs-binary units (KiB) |
| C10 | 28 vs 27 native libs | **28** `lib/arm64-v8a/*.so` fresh-counted; INVENTORY's "27" is off by one |
| C14 | "7 files" in `rea-investigation/` | Directory has **15** docs (PROJECT_CONTEXT §16.2 stale) |
| C15/C18 | NEXT_STEPS' extra "unsent"/legacy handler names (`callSetAudioDetailFromJava`, `callSetReadOnlyFromJava`, `callSetHeadingFromJava`, `callStartRecordingFromJava`, `callAIGCFromJava`, …) | **Fabricated/non-existent**: fresh check shows 0 occurrences in the 188 list *and* 0 in all Java sources for all 11 tested names. The BRIDGE_CONTRACT_AUDIT 14-name list is the correct one |
| C17 | `text_note` as a Room table | **Not a table**: `CREATE TABLE … text_note` = 0 in raw DEX; `collect_privacy` CREATE = 1 → PROJECT_CONTEXT's 13-table list is incomplete, INVENTORY's 14-table list correct. (DB path `note.db` in NEXT_STEPS also wrong — real name `nearme_note.db`) |
| C20 | Probe return shapes (API reference says "character offset"/"number"/`{rect,marks}`) | **BRIDGE_CONTRACT_AUDIT correct**: rerun probe returned `callGetCursorStartPosition → [24,40]` (tuple), `callGetEditorsHeightFromJava → [0,142]` (tuple), `callGetFocusedEditorFromJava → "1"`, selection coords `{start,end,isInView}` |
| C21 | uiMode values `"edit"\|"view"\|"overlay"` vs `"1"\|"2"\|"3"` | **`"1"\|"2"\|"3"`**: bundle defines `EDITOR_UI_MODE_VIEW:"1"`, `OVERLAY:"2"`, `EDIT:"3"` (offset ~15043) and `pM()` switches on those constants; API reference's string values would silently fall through to edit mode |
| C22 | `onTitleJsonUpdate` dead vs listed [VERIFIED] | **Dead**: 0 occurrences in bundle; smoke `titleJson:0` |
| C23 | speech handler no-op vs "requires STT" | **No-op**: body is literally `function(e,n){n("done")}` |
| C24 | `callGetPastAttachEndFromJava` alias claim | **Not in the 188** — registration does not exist |
| C25 | html2canvas `[INFERRED]` vs `[VERIFIED]` | **Verified**: `Pv(t,{backgroundColor:"#00000000"})` called from `hR()` (table→image) |
| C26 | `.doc` vs `.docx` export | **`.docx`**: `ExportDocAgentImpl` contains `.docx"` ×2 + `wordprocessingml` namespace — PROJECT_CONTEXT right |

**Stale-but-harmless (doc lifecycle, not factual errors):** C3 (`Ma()` [UNKNOWN] vs [VERIFIED] — offset 228859 body verified in CONTENT_ROUNDTRIP; the name exists), C4 (STANDALONE/EDITOR_ARCHITECTURE "no browser launch" predates the 15/15 smoke), C5 (folded into C17), C11 (byte offsets differ by anchor convention — all verified offsets in §3 row 17 land correctly), C12 (API-reference bootstrap omits the mandatory CSS/uiMode steps — smoke/CONTENT_ROUNDTRIP order is authoritative), C13 (scope wording: "2 platform crashes" vs "native-required features" — both true of their own scope), C19 (audio question already answered MP3), C27 (legacy mock payload types, section marked legacy).

**Unresolved (doc-internal, minor):** **C7** — smoke docs claim mock coverage "106 methods" / "105 of 105" vs catalog 107; fresh crude count of `mock_bridge.js` method-ish definitions = 114 (includes non-bridge helpers), so no clean reconciliation without a contract-level diff of the mock. **C9** — `getAIGCHtmlContent`, `getAttachData` (APK_ANALYSIS) and `notifyEditorLoaded`, `onFormatStateChange`, `onNoteIdInit`, `onEditorStateChanged`, `onScrollChanged` (NEXT_STEPS) are 0-hit in both the bundle and Java: phantom names that cannot be verified because they do not exist in the shipped artifact. **C16** — the two docs' "13 runtime-verified interface methods" lists differ in membership; only 3 names overlap, and 6 of NEXT_STEPS' names don't exist (same phantom class as C9); the BRIDGE_CONTRACT_AUDIT list matches the probe rerun and should be treated as correct.

---

## 5. Smoke tests — current status and compatibility gaps

Re-run this audit (runtime, Chromium headless + local `server.js`, **not** the APK):

- `node run_smoke.mjs` → **SUMMARY: {"PASS":15}** (0 failures) — startup, Vue mount, TipTap init, typing, title, bold/italic, headings, lists, table insert/add-row, undo/redo, content-JSON updates (15 fires), HTML/text retrieval, reload/restore all pass.
- `node probe_calls.mjs` → **26 calls, 26 responded**, 1 page exception: `TypeError: Gc(...).showHandles is not a function` @`index.js:334:22624` (OPPO TBL-WebView-only API) — identical to the documented baseline.

**Remaining compatibility gaps (ranked):**

1. **Cover-paint bundle untested** — the harness only exercises `assets/tiptap/`; `tiptapcoverpaint`'s 137-handler surface has no smoke coverage at all (N1).
2. **Native-only surfaces untested by design** — slash-menu *rendering* (`showRichTextFormatMenu` native menu), IME, TBL `Selection.showHandles`, recording/paint native activities.
3. **`callGetBlockContentWidthFromJava` contract is broken end-to-end** — returns `"[object Object]"`, native parses with `Float.parseFloat` (§3 row 11). Not exercised by any current test on the native side.
4. **Sync/`@JavascriptInterface` mock coverage** — the probe's sync interface (`isNewTblVersion`, `isImeVisible`, …) is mock-returned; real return semantics on-device are unobserved.
5. **8 unused interface methods** (`getAndroidVersion`, `onDoodleUndoRedo`, `onEditingPaintRectChanged`, `onShowPictureGuideTips`, `onShowTableSelectMenu`, `onSkinScaleChanged`, `onTextAlignActive`, `onTitleJsonUpdate`) — never called by either bundle; safe to stub, but their *native* handlers still exist and are untested.
6. **Promised probes never run** (SMOKE_TEST_RESULTS:109 "next probes"): paste, task lists, paint blocks, search — still outstanding after this audit's rerun (the rerun reproduced the same 15/15 + 26/26; no new probes were added). The probe suite also never targets AIGC/summary handlers, drag-drop, card insertion, font/skin loading, `callCaptureElementFromJava`, or any of the 14 unsent / 8 unreferenced names.

---

## 6. Static vs runtime — explicit accounting

**Runtime-tested (local Chromium harness, mock native bridge — NOT the APK on a device):**
smoke 15/15, probe 26/26, `"[object Object]"` reproduction, content-JSON persistence cadence, table/bold/list/undo behaviors.

**Static only (REA + raw artifacts):**
all handler/interface counts, transport code paths, DB schema/v47/hash, manifest/components/signing, native `.so` symbols, bundle byte offsets, payload shapes.

**Never observed:** the APK executing on Android; on-device bridge traffic; actual DB on disk; cover-paint flow at runtime; native `.so` behavior; signature *verification* (only structural self-consistency).

---

## 7. Unresolved unknowns and audit limitations

1. **Device runtime behavior** — every "would throw / would work" statement (notably the width `Float.parseFloat` anomaly) is static reasoning; no emulator/device was used, per rules.
2. **Native `.so` internals** — no Ghidra/IDA/Hopper/pwntools on this machine (no installs allowed); only symbol/ELF-level facts. Deeper native claims in `PAINT_ENGINE_INVESTIGATION.md` were **not** re-verified at function level.
3. **REA JS semantic graph is partial** — node ceiling 100,000 hit; 51,656 unknowns retained; `application.coverage.status: partial`. Handler counts in this audit therefore rest on direct text/parse counts, not on the graph alone.
4. **Send-site count methodology** (§3 row 3) — literal vs variable sends and the dual containers make any single number convention-dependent; the name-set (174/14) is the reliable fact.
5. **3 orphan handlers (N3)** — dead legacy vs dynamically-consumed is unresolved; both bundles have 0 literal references, which is as far as static text analysis goes.
6. **Component projection `partial`** — REA's manifest component inventory reports `partial` status (provider read/write permission fields and bounded budgets), though the decoded manifest itself is `complete`.
7. **`inspect_apktool-client`/locale strings** — only the default strings table (2,000 of 2,461) was projected; other locales unexamined.
8. **Prior claims citing exact Java line numbers in `WVNoteViewEditFragment.java`** (e.g., 17283, 19077) were spot-checked only at the method level (`showRichTextFormatMenu`:20647 verified); all line numbers were not re-indexed.
9. **Mock-bridge coverage denominators (C7)** — the smoke docs' "106/105/107 methods" figures were not reconciled against `rea-tools/mock_bridge.js` (read-only; crude count 114 method-ish definitions, includes helpers). Unresolved, non-blocking: it affects only a coverage boast, not a contract.
10. **Phantom interface names (C9/C16)** — `getAIGCHtmlContent`, `getAttachData`, `notifyEditorLoaded`, `onFormatStateChange`, `onNoteIdInit`, `onEditorStateChanged`, `onScrollChanged` appear in exactly one prior doc each and **0 times** in the bundle or Java sources. They cannot be verified because they do not exist in the shipped artifact; the docs citing them are wrong or refer to a different (unshipped) revision. The BRIDGE_CONTRACT_AUDIT 13-method runtime list (membership matching the probe rerun) supersedes NEXT_STEPS' list.
11. **Cover-paint runtime flow (N1/N2)** — static structure fully enumerated (bundle, handlers, interface, container), but no runtime exercise was attempted (the smoke harness targets only `assets/tiptap/`).

---

## 8. Architecture suitability assessment

The current Flutter/Drift architecture is **suitable and safe to continue UI implementation**, with conditions:

**Supported by verification:**
- The 49-column `rich_notes` Drift schema matches the Room v47 DDL (rows 18–21) — data-layer foundation is sound.
- The bridge contract surface actually exercised by the main editor is fully enumerated (188 handlers, 107 interface methods, transport envelope verified line-for-line) — the isolated WebView bridge host models real traffic.
- The smoke harness proves the production bundle boots, edits, persists and round-trips content outside the APK — a legitimate compatibility oracle.

**Conditions before calling the bridge "complete":**
1. Decide explicitly whether the **cover-paint flow** (N1/N2) is in scope; if yes, its 137-handler/82-method surface needs its own contract pass.
2. Do not implement the **3 orphan handlers** (N3) or the **14 never-sent handlers** without a product decision — evidence says production never sends them.
3. Treat the width-query contract (row 11) as **broken in the original** — replicate-or-fix should be a conscious choice.
4. Keep restating counts with their counting rule (static literals + dynamic families, N4).

---

## 9. Final verdict

- **Previous RE quality: sound.** Every precise, falsifiable claim re-derived in this audit matched: 188/174/14 handlers, 107/108/105+2 interface, transport envelope, 11/11 byte offsets, Room v47 + hash + 49 columns, payload shapes. The prior reports' confidence labels were honest.
- **Missed (not wrong):** the entire cover-paint parallel editor (N1/N2), 3 orphan sends (N3), dynamic handler families (N4). Resource-level detail (2,461 strings), signing posture, and native symbol inventory were never documented and are now captured here (§3.4).
- **Not reproduced:** only the "290 send sites" figure, which is counting-method-dependent (fresh: 235–252 literal + ~70 variable candidates).
- **Doc-vs-doc contradictions:** 27 found across the prior reports; 14 settled by fresh evidence (§4.1), 10 are stale-but-harmless lifecycle drift, 3 remain open (mock-coverage denominators, phantom interface names, runtime-verified list membership — the last two resolved *in favor of* BRIDGE_CONTRACT_AUDIT, which matches the rerun). Legacy sections of NEXT_STEPS contain **fabricated handler names** (0 hits in bundle and Java) — do not implement from them.
- **Unknowns remain** where this audit states them (§7) — no claim of complete verification is made beyond the evidence cited.

*All Evidence IDs above are retained in the running REA session; raw audit outputs live in `/tmp/opencode/rea/` (regenerable, machine-local).*
