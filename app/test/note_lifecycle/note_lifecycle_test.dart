import 'package:flutter_test/flutter_test.dart';
import 'package:coloros_notes/domain/entities/note.dart';

void main() {
  group('Note Entity & State Transitions', () {
    test('Initial note creation has default active state', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final note = NoteEntity(
        localId: 'note-001',
        title: 'Initial Title',
        text: 'Initial Text',
        rawText: 'Initial Text',
        htmlText: '<p>Initial Text</p>',
        folderId: '00000000_0000_0000_0000_000000000000',
        timestamp: now,
        createTime: now,
        updateTime: now,
      );

      expect(note.state, equals(0)); // New
      expect(note.deleted, equals(0)); // Active
      expect(note.skinId, equals('default'));
    });

    test('Note copyWith preserves fields and updates state', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final note = NoteEntity(
        localId: 'note-001',
        title: 'Initial Title',
        text: 'Initial Text',
        rawText: 'Initial Text',
        htmlText: '<p>Initial Text</p>',
        folderId: '00000000_0000_0000_0000_000000000000',
        timestamp: now,
        createTime: now,
        updateTime: now,
      );

      final updated = note.copyWith(
        title: 'Updated Title',
        state: 2, // Modified
        updateTime: now + 5000,
      );

      expect(updated.title, equals('Updated Title'));
      expect(updated.state, equals(2));
      expect(updated.updateTime, equals(now + 5000));
      expect(updated.localId, equals(note.localId));
    });

    test('Soft delete marks note as recycled', () {
      final now = DateTime.now().millisecondsSinceEpoch;
      final note = NoteEntity(
        localId: 'note-001',
        title: 'Initial Title',
        text: 'Initial Text',
        rawText: 'Initial Text',
        htmlText: '<p>Initial Text</p>',
        folderId: '00000000_0000_0000_0000_000000000000',
        timestamp: now,
        createTime: now,
        updateTime: now,
      );

      final recycled = note.copyWith(
        deleted: 1,
        recycleTime: now + 10000,
        state: 2,
      );

      expect(recycled.deleted, equals(1));
      expect(recycled.recycleTime, equals(now + 10000));
    });
  });
}
