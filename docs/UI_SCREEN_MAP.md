# UI & Screen Map — ColorOS Notes Rebuild

Consolidated from static analysis: decoded layouts (`apktool-out/res/layout/`, 719 files), menus, activities, the tiptap editor bundle, and the design-token sheet (`design_tokens_raw.md`).
Runtime screenshots of the running app are **not available** — the APK requires a ColorOS device (see `COMPATIBILITY_REPORT.md`). All spatial/layout claims are from layout XML + dimens, not pixels.

## 1. Navigation architecture

`MainActivity` is the hub, hosting a two-tab experience (Notes ↔ To-dos) with a top app bar (search + view-mode + overflow menu) and a floating "+" to create.

```
MainActivity
├── Tab: Notes list  (fragment_main / RecyclerView, Grid⇄List view)
│     ├── tap note      → NoteViewRichEditActivity (WebView/tiptap editor)
│     ├── long-press     → contextual action mode (multi-select)
│     └── "+"            → create → editor (blank note)
├── Tab: To-do list   (activity_todo_list)
│     ├── tap item      → activity_todo_detail
│     └── reminder      → dialog_set_reminder_time_todo
├── Folders           → folder list → filtered note list
├── Search            → content_search_result_layout (results over notes + todos)
└── Overflow menu     → menu_note_list.xml
      ├── View mode (Grid/List)
      ├── Sort by
      ├── Selection mode
      └── Settings → SettingsActivity
            ├── SettingsSyncSwitchActivity  (cloud sync)
            ├── NotebookSyncSwitchActivity  (per-notebook sync)
            ├── SettingsAboutActivity / SettingsInformationActivity
            ├── SettingPrivacyActivity / PrivacyPolicyActivity
            └── Font (delegated to HeyTap Font Store)
```

### Editor sub-navigation (rich note)
```
NoteViewRichEditActivity (WVJBWebView hosting assets/tiptap)
├── Formatting toolbar  (menu_note_edit_bar.xml)
├── Attachment picker   (image / camera / voice / file)
├── Skin / template picker (note_skin table)
├── AI panel            (menu_panel_edit.xml, menu_panel_aigc_text.xml, menu_panel_convert.xml)
├── Voice typing        (menu_recorder_voice.xml + RECORD_AUDIO)
├── Handwriting entry   → HandPaintNoteActivity / NewPaintActivity
└── Share / export      (menu_share.xml → ShareActivity / ExportPdfActivity / SaveImageAndShare)
```

### Handwriting sub-navigation
```
HandPaintNoteActivity / NewPaintActivity
├── fragment_hand_paint_toolbar (pen/eraser/colors/skin)
├── Skin windows  (fragment_hand_paint_skin_window*)
├── CropActivity  (crop export)
└── AI graffiti   → QuickNoteAIGraffitiActivity → AIGraffitiResultActivity
```

## 2. Screen inventory (decoded layouts → purpose)

| Layout file | Screen |
|---|---|
| `fragment_main.xml` | Notes list container (tab host) |
| `activity_note_view_rich_edit.xml` | Rich-text editor (WebView host) |
| `activity_todo_list.xml` / `activity_todo_detail.xml` | To-do list & detail |
| `activity_setting*.xml` | Settings, About, Privacy, Sync switch, Information |
| `fragment_hand_paint*.xml`, `activity_hand_paint.xml`, `activity_new_paint.xml` | Handwriting/drawing |
| `ai_ask_layout_main.xml`, `ai_ask_item_note_result.xml` | AI assistant / AI search Q&A |
| `content_search_result_layout.xml` | Search results |
| `dialog_set_reminder_time_todo.xml` | Reminder time picker |
| `dialog_hand_paint_note.xml` | Handwriting note dialog |
| `floating_popup_menu_*.xml` | Contextual popups (text select, image cutout, paint) |
| `editor_layer_paint_view.xml` | In-editor drawing overlay |

## 3. Interaction patterns (from menus)

### Note list — long-press / action mode (`menu_note_list_edit.xml`, `menu_note_all_delete.xml`)
Multi-select; actions: **Delete (→ trash), Move to folder, (Set reminder), Share, Archive?**. Trash is soft-delete (`recycled_time`), recoverable.

### Editor — formatting (`menu_note_edit_bar.xml`, `menu_panel_edit.xml`)
Rich-text toolbar; AI panel actions (`menu_panel_aigc_text.xml`, `menu_panel_convert.xml`): AI Summary, AI Rewrite/Polish, AI Format, handwriting-to-text convert.

### View modes & sort
Grid view / List view toggle (`Grid view`, `List view` strings); `Sort by` (by created/updated). Pinned notes (`top_time`) float to top of list.

## 4. Design tokens (summary — full sheet in `design_tokens_raw.md`)

- **Design system:** COUI (OPPO's Material-based system), light + `-night` dark via `Theme.COUI` + accent variant.
- **Accent:** COUI Blue `#0066FF` / `#247CFF` (default). A Yellow variant exists but default install is Blue.
- **Radii:** resource-driven `coui_round_corner_*` scale (not hard-coded) — key for 1:1 card/list rounding.
- **Typography:** **no bundled fonts** — uses system sans; note-content fonts come from HeyTap Font Store (substitute needed). Text sizes cataloged per context.
- **Surfaces:** light/night background, surface, text primary/secondary/tertiary/quaternary, divider, scrim pairs — all present in `design_tokens_raw.md` §1.
- **Icons:** 226 `ic_*` vectors grouped by feature (pin, delete, checklist, folder, paint, AI, voice, rich-text).
- **Motion:** 188 anims + 40 Lottie JSONs (cloud sync states, AI, loading) in light/dark pairs — directly reusable for the rebuild's status animations.

## 5. Rebuild notes (Phase 3)
1. **Reuse `assets/tiptap/`** for the editor — guarantees 1:1 editing behavior and HTML serialization.
2. **Map COUI tokens** into the Flutter/theme layer; drive radii from a token table, not constants.
3. **Reuse Lottie assets** for sync/AI status animations.
4. **Adapt responsively:** mobile = bottom tabs + FAB; desktop (Linux/Windows/macOS/web) = persistent side rail (folders + tabs) with the same list/editor, per Phase 3 requirement to keep the mobile feel while adding desktop navigation.
5. **Substitute** HeyTap fonts with bundled open fonts; keep the skin/template concept (`note_skin`) but host assets locally.
