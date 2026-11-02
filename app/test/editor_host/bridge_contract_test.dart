import 'package:flutter_test/flutter_test.dart';
import 'package:coloros_notes/editor_host/tiptap_content_info.dart';
import 'package:coloros_notes/editor_host/editor_bridge_host.dart';

void main() {
  group('TiptapContentInfo & Bridge Protocol Tests', () {
    test('TiptapContentInfo serializes exactly 10 fields', () {
      final info = TiptapContentInfo(
        guid: 'test-guid',
        title: 'Title',
        content: '<p>Content</p>',
      );

      final json = info.toJson();
      expect(json.keys.length, equals(10));
      expect(json['guid'], equals('test-guid'));
      expect(json['title'], equals('Title'));
      expect(json['content'], equals('<p>Content</p>'));
      expect(json['subAttachments'], isEmpty);
      expect(json['pageResults'], isEmpty);
      expect(json['pictureAttrs'], isEmpty);
      expect(json['isDoingSummary'], isFalse);
    });

    test('EditorBridgeHost receives and routes onTitleChange', () {
      final host = EditorBridgeHost();
      String? receivedTitle;
      host.onTitleChanged = (t) => receivedTitle = t;

      host.handleJsMethodCall('onTitleChange', ['My New Title']);
      expect(receivedTitle, equals('My New Title'));
    });

    test('EditorBridgeHost receives and routes onContentJsonUpdate', () {
      final host = EditorBridgeHost();
      String? receivedContent;
      host.onContentJsonUpdated = (c) => receivedContent = c;

      host.handleJsMethodCall('onContentJsonUpdate', ['{"type":"doc"}']);
      expect(receivedContent, equals('{"type":"doc"}'));
    });

    test('EditorBridgeHost receives and routes onUndoStateChange', () {
      final host = EditorBridgeHost();
      bool? undo, redo;
      host.onUndoStateChanged = (u, r) {
        undo = u;
        redo = r;
      };

      host.handleJsMethodCall('onUndoStateChange', [true, false]);
      expect(undo, isTrue);
      expect(redo, isFalse);
    });
  });
}
