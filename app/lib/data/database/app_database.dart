import 'package:sqlite3/sqlite3.dart';
import 'schema_room_v47.dart';
import '../../domain/entities/note.dart';
import '../../domain/entities/attachment.dart';
import '../../domain/entities/folder.dart';

/// Database Manager wrapping SQLite3 with Room v47 Schema Fidelity
class AppDatabase {
  final Database db;

  AppDatabase(this.db);

  /// Factory constructor to initialize database file with PRAGMA settings & Schema
  factory AppDatabase.open(String path) {
    final db = sqlite3.open(path);
    db.execute('PRAGMA foreign_keys = ON;');
    db.execute('PRAGMA journal_mode = WAL;');
    db.execute('PRAGMA synchronous = NORMAL;');
    db.execute('PRAGMA busy_timeout = 5000;');

    // Execute Room v47 DDL tables
    db.execute(SchemaRoomV47.createFoldersTable);
    db.execute(SchemaRoomV47.createRichNotesTable);
    db.execute(SchemaRoomV47.createAttachmentsTable);
    db.execute(SchemaRoomV47.createSpeechLogInfoTable);
    db.execute(SchemaRoomV47.createTodoTable);
    db.execute(SchemaRoomV47.createPaintNotesTable);
    db.execute(SchemaRoomV47.createPaintAttachmentsTable);

    // Execute Indices
    for (final indexSql in SchemaRoomV47.createIndices) {
      db.execute(indexSql);
    }

    // Ensure default folder exists
    final check = db.select('SELECT count(*) as c FROM folders WHERE guid = ?', ['00000000_0000_0000_0000_000000000000']);
    if (check.first['c'] == 0) {
      db.execute('''
        INSERT INTO folders (guid, name, created_time, modify_time)
        VALUES ('00000000_0000_0000_0000_000000000000', 'Notes', ?, ?)
      ''', [DateTime.now().millisecondsSinceEpoch, DateTime.now().millisecondsSinceEpoch]);
    }

    return AppDatabase(db);
  }

  /// Note Operations
  List<NoteEntity> getActiveNotes({String? folderId}) {
    final ResultSet results;
    if (folderId != null) {
      results = db.select(
        'SELECT * FROM rich_notes WHERE deleted = 0 AND folder_id = ? ORDER BY top_time DESC, update_time DESC',
        [folderId],
      );
    } else {
      results = db.select(
        'SELECT * FROM rich_notes WHERE deleted = 0 ORDER BY top_time DESC, update_time DESC',
      );
    }
    return results.map(_rowToNote).toList();
  }

  NoteEntity? getNoteById(String localId) {
    final results = db.select('SELECT * FROM rich_notes WHERE local_id = ?', [localId]);
    if (results.isEmpty) return null;
    return _rowToNote(results.first);
  }

  void insertNote(NoteEntity note) {
    db.execute('''
      INSERT INTO rich_notes (
        local_id, global_id, text, raw_text, html_text, folder_id,
        timestamp, create_time, update_time, top_time, recycle_time, alarm_time,
        state, deleted, skin_id, title, raw_title, attachment_lrc,
        summary_attachment_size, summary_speech_flag, summary_speech_type,
        summary_show_icon, summary_note_type_flag, is_cover_paint_not_char_count,
        is_summary_edit, is_paint_pic, summary_version, sys_protocol_version,
        file_download_time
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        0, 0, 0,
        0, 0, 0,
        0, 0, 0, 1,
        0
      )
    ''', [
      note.localId, note.globalId, note.text, note.rawText, note.htmlText, note.folderId,
      note.timestamp, note.createTime, note.updateTime, note.topTime, note.recycleTime, note.alarmTime,
      note.state, note.deleted, note.skinId, note.title, note.rawTitle, note.attachmentLrc
    ]);
  }

  void updateNote(NoteEntity note) {
    db.execute('''
      UPDATE rich_notes SET
        text = ?, raw_text = ?, html_text = ?, folder_id = ?,
        update_time = ?, top_time = ?, recycle_time = ?, state = ?,
        deleted = ?, title = ?, attachment_lrc = ?
      WHERE local_id = ?
    ''', [
      note.text, note.rawText, note.htmlText, note.folderId,
      note.updateTime, note.topTime, note.recycleTime, note.state,
      note.deleted, note.title, note.attachmentLrc,
      note.localId
    ]);
  }

  void deleteNote(String localId, {bool permanent = false}) {
    if (permanent) {
      db.execute('DELETE FROM rich_notes WHERE local_id = ?', [localId]);
    } else {
      db.execute('UPDATE rich_notes SET deleted = 1, recycle_time = ?, state = 2 WHERE local_id = ?', [
        DateTime.now().millisecondsSinceEpoch,
        localId,
      ]);
    }
  }

  /// Attachment Operations
  List<AttachmentEntity> getAttachmentsForNote(String richNoteId) {
    final results = db.select('SELECT * FROM attachments WHERE rich_note_id = ?', [richNoteId]);
    return results.map(_rowToAttachment).toList();
  }

  void insertAttachment(AttachmentEntity attachment) {
    db.execute('''
      INSERT INTO attachments (
        attachment_id, rich_note_id, type, state, md5, url,
        file_name, cloud_metadata, extra, width, height, associate_attachment_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', [
      attachment.attachmentId, attachment.richNoteId, attachment.type, attachment.state,
      attachment.md5, attachment.url, attachment.fileName, attachment.cloudMetadata,
      attachment.extra, attachment.width, attachment.height, attachment.associateAttachmentId
    ]);
  }

  void deleteAttachment(String attachmentId) {
    db.execute('DELETE FROM attachments WHERE attachment_id = ?', [attachmentId]);
  }

  /// Folder Operations
  List<FolderEntity> getFolders() {
    final results = db.select('SELECT * FROM folders ORDER BY _id ASC');
    return results.map(_rowToFolder).toList();
  }

  void insertFolder(FolderEntity folder) {
    db.execute('''
      INSERT INTO folders (guid, name, state, created_time, modify_time, encrypted)
      VALUES (?, ?, ?, ?, ?, ?)
    ''', [folder.guid, folder.name, folder.state, folder.createdTime, folder.modifyTime, folder.encrypted]);
  }

  void close() {
    db.dispose();
  }

  static NoteEntity _rowToNote(Row row) {
    return NoteEntity(
      localId: row['local_id'] as String,
      globalId: row['global_id'] as String?,
      title: (row['title'] as String?) ?? '',
      rawTitle: row['raw_title'] as String?,
      text: row['text'] as String,
      rawText: row['raw_text'] as String,
      htmlText: row['html_text'] as String,
      folderId: row['folder_id'] as String,
      timestamp: row['timestamp'] as int,
      createTime: row['create_time'] as int,
      updateTime: row['update_time'] as int,
      topTime: (row['top_time'] as int?) ?? 0,
      recycleTime: (row['recycle_time'] as int?) ?? 0,
      alarmTime: (row['alarm_time'] as int?) ?? 0,
      state: (row['state'] as int?) ?? 0,
      deleted: (row['deleted'] as int?) ?? 0,
      skinId: (row['skin_id'] as String?) ?? 'default',
      attachmentLrc: row['attachment_lrc'] as String?,
    );
  }

  static AttachmentEntity _rowToAttachment(Row row) {
    return AttachmentEntity(
      attachmentId: row['attachment_id'] as String,
      richNoteId: row['rich_note_id'] as String,
      type: row['type'] as int,
      state: (row['state'] as int?) ?? 0,
      md5: row['md5'] as String?,
      url: row['url'] as String?,
      fileName: row['file_name'] as String?,
      cloudMetadata: row['cloud_metadata'] as String?,
      extra: row['extra'] as String?,
      width: (row['width'] as int?) ?? 0,
      height: (row['height'] as int?) ?? 0,
      associateAttachmentId: row['associate_attachment_id'] as String?,
    );
  }

  static FolderEntity _rowToFolder(Row row) {
    return FolderEntity(
      id: row['_id'] as int?,
      guid: row['guid'] as String,
      name: row['name'] as String,
      state: (row['state'] as int?) ?? 0,
      createdTime: (row['created_time'] as int?) ?? 0,
      modifyTime: (row['modify_time'] as int?) ?? 0,
      encrypted: (row['encrypted'] as int?) ?? 0,
    );
  }
}
