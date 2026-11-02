/// Exact Room v47 SQLite DDL extracted from ColorOS Notes APK v16.7.5
/// Verified against `AppDatabase_Impl.java`
class SchemaRoomV47 {
  static const int schemaVersion = 47;

  /// Folders Table
  static const String createFoldersTable = '''
CREATE TABLE IF NOT EXISTS `folders` (
    `_id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    `name` TEXT NOT NULL,
    `guid` TEXT NOT NULL UNIQUE,
    `state` INTEGER NOT NULL DEFAULT 0,
    `created_time` INTEGER,
    `modify_device` TEXT,
    `data1` TEXT,
    `data2` TEXT,
    `encrypted` INTEGER NOT NULL DEFAULT 0,
    `encrypted_pre` INTEGER NOT NULL DEFAULT 0,
    `modify_time` INTEGER,
    `extra` TEXT,
    `sysVersion` INTEGER NOT NULL DEFAULT 0,
    `encryptSysVersion` INTEGER NOT NULL DEFAULT 0
);
''';

  /// Rich Notes Table — EXACTLY 49 columns verified from AppDatabase_Impl.java
  static const String createRichNotesTable = '''
CREATE TABLE IF NOT EXISTS `rich_notes` (
    `local_id` TEXT NOT NULL,
    `global_id` TEXT,
    `text` TEXT NOT NULL,
    `raw_text` TEXT NOT NULL,
    `html_text` TEXT NOT NULL,
    `folder_id` TEXT NOT NULL DEFAULT '00000000_0000_0000_0000_000000000000',
    `timestamp` INTEGER NOT NULL,
    `create_time` INTEGER NOT NULL,
    `update_time` INTEGER NOT NULL,
    `top_time` INTEGER NOT NULL DEFAULT 0,
    `recycle_time` INTEGER NOT NULL DEFAULT 0,
    `alarm_time` INTEGER NOT NULL DEFAULT 0,
    `state` INTEGER NOT NULL DEFAULT 0,
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `skin_id` TEXT NOT NULL DEFAULT 'default',
    `title` TEXT,
    `raw_title` TEXT,
    `recycle_time_pre` INTEGER DEFAULT 0,
    `alarm_time_pre` INTEGER DEFAULT 0,
    `skin_id_pre` TEXT,
    `extra` TEXT,
    `version` INTEGER NOT NULL DEFAULT 1,
    `is_local` INTEGER NOT NULL DEFAULT 1,
    `is_preset` INTEGER NOT NULL DEFAULT 0,
    `from_package` TEXT,
    `web_notes` TEXT,
    `sysVersion` INTEGER DEFAULT 1,
    `encrypted` INTEGER NOT NULL DEFAULT 0,
    `encrypted_pre` INTEGER NOT NULL DEFAULT 0,
    `encryptSysVersion` INTEGER,
    `attachment_extra` TEXT,
    `summary_title` TEXT,
    `summary_content` TEXT,
    `summary_phone_name` TEXT,
    `summary_phone_number` TEXT,
    `summary_attachment` TEXT,
    `summary_attachment_size` INTEGER NOT NULL DEFAULT 0,
    `summary_speech_flag` INTEGER NOT NULL DEFAULT 0,
    `summary_speech_type` INTEGER NOT NULL DEFAULT 0,
    `summary_show_icon` INTEGER NOT NULL DEFAULT 0,
    `summary_note_type_flag` INTEGER NOT NULL DEFAULT 0,
    `is_cover_paint_not_char_count` INTEGER NOT NULL DEFAULT 0,
    `is_summary_edit` INTEGER NOT NULL DEFAULT 0,
    `is_paint_pic` INTEGER NOT NULL DEFAULT 0,
    `summary_version` INTEGER NOT NULL DEFAULT 0,
    `all_attachment_file_name` TEXT,
    `attachment_lrc` TEXT,
    `sys_protocol_version` INTEGER NOT NULL DEFAULT 1,
    `file_download_time` INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(`local_id`),
    FOREIGN KEY(`folder_id`) REFERENCES `folders`(`guid`) ON UPDATE CASCADE ON DELETE SET DEFAULT
);
''';

  /// Attachments Table — With Foreign Key ON DELETE CASCADE
  static const String createAttachmentsTable = '''
CREATE TABLE IF NOT EXISTS `attachments` (
    `attachment_id` TEXT NOT NULL,
    `rich_note_id` TEXT NOT NULL,
    `type` INTEGER NOT NULL,
    `state` INTEGER NOT NULL DEFAULT 0,
    `md5` TEXT,
    `url` TEXT,
    `checkPayload` TEXT,
    `file_name` TEXT,
    `cloud_metadata` TEXT,
    `extra` TEXT,
    `width` INTEGER DEFAULT 0,
    `height` INTEGER DEFAULT 0,
    `associate_attachment_id` TEXT,
    PRIMARY KEY(`attachment_id`),
    FOREIGN KEY(`rich_note_id`) REFERENCES `rich_notes`(`local_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
''';

  /// Speech Log Info Table
  static const String createSpeechLogInfoTable = '''
CREATE TABLE IF NOT EXISTS `speech_log_info` (
    `summary_id` TEXT NOT NULL,
    `rich_note_id` TEXT NOT NULL,
    `speech_log_id` TEXT NOT NULL,
    `contact_cover` TEXT,
    `contact_number` TEXT,
    `contact_name` TEXT,
    `entity` TEXT,
    `voice_id` TEXT,
    `voice_url` TEXT,
    `voice_lrc_id` TEXT,
    `voice_lrc_url` TEXT,
    `flag` INTEGER NOT NULL DEFAULT 0,
    `speech_create_time` INTEGER NOT NULL DEFAULT 0,
    `speech_type` INTEGER NOT NULL DEFAULT 0,
    `pic_id` TEXT,
    `speech_mark` TEXT,
    `combined_card` TEXT,
    `extra_info` TEXT,
    PRIMARY KEY(`summary_id`),
    FOREIGN KEY(`rich_note_id`) REFERENCES `rich_notes`(`local_id`) ON UPDATE CASCADE ON DELETE CASCADE
);
''';

  /// Todo Items Table
  static const String createTodoTable = '''
CREATE TABLE IF NOT EXISTS `todo` (
    `local_id` TEXT NOT NULL PRIMARY KEY,
    `parent_id` TEXT,
    `global_id` TEXT,
    `content` TEXT,
    `alarm_time` INTEGER DEFAULT 0,
    `alarm_next_time` INTEGER DEFAULT 0,
    `create_time` INTEGER DEFAULT 0,
    `update_time` INTEGER DEFAULT 0,
    `finish_time` INTEGER DEFAULT 0,
    `status` INTEGER DEFAULT 0,
    `is_delete` INTEGER DEFAULT 0,
    `timestamp` INTEGER DEFAULT 0,
    `extra` TEXT,
    `is_local` INTEGER DEFAULT 1,
    `is_reminded` INTEGER DEFAULT 0,
    `force_reminder_pre` INTEGER DEFAULT 0,
    `repeat_rule_pre` TEXT,
    `alarm_time_pre` INTEGER DEFAULT 0,
    `from_package` TEXT,
    `sysVersion` INTEGER NOT NULL DEFAULT 0,
    `color_index` INTEGER NOT NULL DEFAULT -1
);
''';

  /// Paint Notes Table
  static const String createPaintNotesTable = '''
CREATE TABLE IF NOT EXISTS `paint_notes` (
    `id` TEXT NOT NULL PRIMARY KEY,
    `title` TEXT,
    `text` TEXT,
    `content_id` TEXT,
    `folder_id` TEXT NOT NULL DEFAULT '00000000_0000_0000_0000_000000000000',
    `timestamp` INTEGER NOT NULL DEFAULT 0,
    `create_time` INTEGER NOT NULL DEFAULT 0,
    `update_time` INTEGER NOT NULL DEFAULT 0,
    `top_time` INTEGER NOT NULL DEFAULT 0,
    `recycle_time` INTEGER NOT NULL DEFAULT 0,
    `recycle_time_pre` INTEGER DEFAULT 0,
    `state` INTEGER NOT NULL DEFAULT 0,
    `deleted` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 1,
    `sysVersion` INTEGER DEFAULT 1,
    `encrypted` INTEGER NOT NULL DEFAULT 0,
    `extra` TEXT,
    `first_img` TEXT,
    `feature_list` TEXT,
    `sys_protocol_version` INTEGER NOT NULL DEFAULT 1,
    `file_download_time` INTEGER NOT NULL DEFAULT 0
);
''';

  /// Paint Attachments Table
  static const String createPaintAttachmentsTable = '''
CREATE TABLE IF NOT EXISTS `paint_attachments` (
    `id` TEXT NOT NULL,
    `paint_note_id` TEXT NOT NULL,
    `type` INTEGER NOT NULL DEFAULT 0,
    `file_name` TEXT NOT NULL,
    `state` INTEGER NOT NULL DEFAULT 0,
    `md5` TEXT,
    `url` TEXT,
    `checkPayload` TEXT,
    `extra` TEXT,
    PRIMARY KEY(`id`, `paint_note_id`),
    FOREIGN KEY(`paint_note_id`) REFERENCES `paint_notes`(`id`) ON UPDATE CASCADE ON DELETE CASCADE
);
''';

  /// Indices for high-frequency queries
  static const List<String> createIndices = [
    'CREATE INDEX IF NOT EXISTS `index_rich_notes_update_time` ON `rich_notes` (`update_time`);',
    'CREATE INDEX IF NOT EXISTS `index_rich_notes_folder_id` ON `rich_notes` (`folder_id`);',
    'CREATE INDEX IF NOT EXISTS `index_rich_notes_deleted` ON `rich_notes` (`deleted`);',
    'CREATE INDEX IF NOT EXISTS `index_rich_notes_state` ON `rich_notes` (`state`);',
    'CREATE INDEX IF NOT EXISTS `index_attachments_rich_note_id` ON `attachments` (`rich_note_id`);',
    'CREATE INDEX IF NOT EXISTS `index_attachments_state` ON `attachments` (`state`);',
    'CREATE INDEX IF NOT EXISTS `index_speech_log_info_rich_note_id` ON `speech_log_info` (`rich_note_id`);',
  ];
}
