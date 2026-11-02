import '../entities/note.dart';
import '../entities/attachment.dart';
import '../entities/folder.dart';

abstract class NoteRepository {
  // Notes
  Future<List<NoteEntity>> getActiveNotes({String? folderId});
  Future<NoteEntity?> getNoteById(String localId);
  Future<void> insertNote(NoteEntity note);
  Future<void> updateNote(NoteEntity note);
  Future<void> deleteNote(String localId, {bool permanent = false});
  Stream<List<NoteEntity>> watchActiveNotes({String? folderId});

  // Folders
  Future<List<FolderEntity>> getFolders();
  Future<void> insertFolder(FolderEntity folder);

  // Attachments
  Future<List<AttachmentEntity>> getAttachmentsForNote(String richNoteId);
  Future<void> insertAttachment(AttachmentEntity attachment);
  Future<void> deleteAttachment(String attachmentId);
}
