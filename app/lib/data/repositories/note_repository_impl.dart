import 'dart:async';
import '../../domain/entities/note.dart';
import '../../domain/entities/attachment.dart';
import '../../domain/entities/folder.dart';
import '../../domain/repositories/note_repository.dart';
import '../database/app_database.dart';

class NoteRepositoryImpl implements NoteRepository {
  final AppDatabase database;
  final _notesStreamController = StreamController<List<NoteEntity>>.broadcast();

  NoteRepositoryImpl(this.database) {
    _refreshStream();
  }

  void _refreshStream() {
    _notesStreamController.add(database.getActiveNotes());
  }

  @override
  Future<List<NoteEntity>> getActiveNotes({String? folderId}) async {
    return database.getActiveNotes(folderId: folderId);
  }

  @override
  Future<NoteEntity?> getNoteById(String localId) async {
    return database.getNoteById(localId);
  }

  @override
  Future<void> insertNote(NoteEntity note) async {
    database.insertNote(note);
    _refreshStream();
  }

  @override
  Future<void> updateNote(NoteEntity note) async {
    database.updateNote(note);
    _refreshStream();
  }

  @override
  Future<void> deleteNote(String localId, {bool permanent = false}) async {
    database.deleteNote(localId, permanent: permanent);
    _refreshStream();
  }

  @override
  Stream<List<NoteEntity>> watchActiveNotes({String? folderId}) {
    return _notesStreamController.stream;
  }

  @override
  Future<List<FolderEntity>> getFolders() async {
    return database.getFolders();
  }

  @override
  Future<void> insertFolder(FolderEntity folder) async {
    database.insertFolder(folder);
  }

  @override
  Future<List<AttachmentEntity>> getAttachmentsForNote(String richNoteId) async {
    return database.getAttachmentsForNote(richNoteId);
  }

  @override
  Future<void> insertAttachment(AttachmentEntity attachment) async {
    database.insertAttachment(attachment);
  }

  @override
  Future<void> deleteAttachment(String attachmentId) async {
    database.deleteAttachment(attachmentId);
  }

  void dispose() {
    _notesStreamController.close();
  }
}
