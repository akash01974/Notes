import 'dart:async';
import 'dart:convert';
import 'tiptap_content_info.dart';

typedef NativeHandlerCallback = void Function(dynamic data);

/// Clean Host WVJB Bridge Dispatcher for TipTap Editor
class EditorBridgeHost {
  // Callback handlers registered by Flutter shell
  void Function()? onEditorLoaded;
  void Function(String title)? onTitleChanged;
  void Function(String jsonContent)? onContentJsonUpdated;
  void Function(Map<String, dynamic> formatState)? onFormatStateChanged;
  void Function(bool canUndo, bool canRedo)? onUndoStateChanged;

  // Generic message sender delegate to WebView
  Future<dynamic> Function(String script)? evaluateJavascript;

  EditorBridgeHost();

  /// Handle incoming message from JavaScript `window.injectedObject.*`
  void handleJsMethodCall(String method, List<dynamic> args) {
    switch (method) {
      case 'notifyEditorLoaded':
        onEditorLoaded?.call();
        break;
      case 'onTitleChange':
        if (args.isNotEmpty && args[0] is String) {
          onTitleChanged?.call(args[0] as String);
        }
        break;
      case 'onContentJsonUpdate':
        if (args.isNotEmpty && args[0] is String) {
          onContentJsonUpdated?.call(args[0] as String);
        }
        break;
      case 'onFormatStateChange':
        if (args.isNotEmpty) {
          try {
            final raw = args[0];
            final map = raw is String ? jsonDecode(raw) : (raw as Map<String, dynamic>);
            onFormatStateChanged?.call(map as Map<String, dynamic>);
          } catch (_) {}
        }
        break;
      case 'onUndoStateChange':
        if (args.length >= 2) {
          final canUndo = args[0] == true || args[0] == 'true';
          final canRedo = args[1] == true || args[1] == 'true';
          onUndoStateChanged?.call(canUndo, canRedo);
        }
        break;
      default:
        // Other methods handled safely without crash
        break;
    }
  }

  /// Native -> JS: Initialize Content
  Future<void> initContent(TiptapContentInfo contentInfo) async {
    final payload = jsonEncode(contentInfo.toJson());
    await _dispatchToJs('callInitContentFromJava', payload);
  }

  /// Native -> JS: Update Content
  Future<void> updateContent(String htmlOrJson) async {
    await _dispatchToJs('callUpdateContentFromJava', htmlOrJson);
  }

  /// Native -> JS: Formatting commands
  Future<void> setBold(bool active) async {
    await _dispatchToJs('callSetBoldFromJava', active ? 'true' : 'false');
  }

  Future<void> setItalic(bool active) async {
    await _dispatchToJs('callSetItalicFromJava', active ? 'true' : 'false');
  }

  Future<void> setHeading(int level) async {
    await _dispatchToJs('callSetTitleStyleFromJava', level.toString());
  }

  Future<void> toggleBulletList() async {
    await _dispatchToJs('callToggleBulletListFromJava', null);
  }

  Future<void> toggleOrderedList() async {
    await _dispatchToJs('callToggleOrderedListFromJava', null);
  }

  Future<void> undo() async {
    await _dispatchToJs('callUndoFromJava', null);
  }

  Future<void> redo() async {
    await _dispatchToJs('callRedoFromJava', null);
  }

  Future<void> insertTable({int rows = 3, int cols = 3}) async {
    final payload = jsonEncode({'rows': rows, 'cols': cols});
    await _dispatchToJs('callInsertTableFromJava', payload);
  }

  Future<void> _dispatchToJs(String handlerName, dynamic data) async {
    if (evaluateJavascript == null) return;
    final dataString = data == null ? 'null' : (data is String ? jsonEncode(data) : jsonEncode(data));
    final script = '''
      if (window._bridgeHandlers && window._bridgeHandlers['$handlerName']) {
        window._bridgeHandlers['$handlerName']($dataString, function() {});
      } else if (window.WebViewJavascriptBridge && window.WebViewJavascriptBridge._messageHandler) {
        window.WebViewJavascriptBridge._handleMessageFromJava(JSON.stringify({
          handlerName: '$handlerName',
          data: $dataString
        }));
      }
    ''';
    await evaluateJavascript!(script);
  }
}
