import 'dart:async';
import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import '../../domain/entities/note.dart';
import '../../domain/repositories/note_repository.dart';
import '../../editor_host/editor_bridge_host.dart';
import '../../editor_host/editor_view.dart';
import '../../editor_host/tiptap_content_info.dart';
import '../../core/coui_colors.dart';

class NoteEditorScreen extends StatefulWidget {
  final NoteRepository repository;
  final NoteEntity? initialNote;

  const NoteEditorScreen({
    Key? key,
    required this.repository,
    this.initialNote,
  }) : super(key: key);

  @override
  State<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends State<NoteEditorScreen> {
  late final EditorBridgeHost _bridgeHost;
  late final String _noteId;
  String _currentTitle = '';
  String _currentHtml = '';
  String _currentRawText = '';
  Timer? _debounceSaveTimer;
  bool _canUndo = false;
  bool _canRedo = false;

  @override
  void initState() {
    super.initState();
    _noteId = widget.initialNote?.localId ?? const Uuid().v4();
    _currentTitle = widget.initialNote?.title ?? '';
    _currentHtml = widget.initialNote?.htmlText ?? '';
    _currentRawText = widget.initialNote?.text ?? '';

    _bridgeHost = EditorBridgeHost();

    // Hook bridge callbacks
    _bridgeHost.onEditorLoaded = _handleEditorLoaded;
    _bridgeHost.onTitleChanged = (title) {
      _currentTitle = title;
      _scheduleAutoSave();
    };
    _bridgeHost.onContentJsonUpdated = (jsonContent) {
      _currentHtml = jsonContent; // Or extracted HTML
      _scheduleAutoSave();
    };
    _bridgeHost.onUndoStateChanged = (canUndo, canRedo) {
      setState(() {
        _canUndo = canUndo;
        _canRedo = canRedo;
      });
    };
  }

  void _handleEditorLoaded() {
    final info = TiptapContentInfo(
      guid: _noteId,
      title: _currentTitle,
      content: _currentHtml,
    );
    _bridgeHost.initContent(info);
  }

  void _scheduleAutoSave() {
    _debounceSaveTimer?.cancel();
    _debounceSaveTimer = Timer(const Duration(milliseconds: 500), _saveNote);
  }

  Future<void> _saveNote() async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final note = NoteEntity(
      localId: _noteId,
      title: _currentTitle,
      text: _currentRawText,
      rawText: _currentRawText,
      htmlText: _currentHtml,
      folderId: widget.initialNote?.folderId ?? '00000000_0000_0000_0000_000000000000',
      timestamp: widget.initialNote?.timestamp ?? now,
      createTime: widget.initialNote?.createTime ?? now,
      updateTime: now,
      state: 2, // Modified
    );

    final existing = await widget.repository.getNoteById(_noteId);
    if (existing == null) {
      await widget.repository.insertNote(note);
    } else {
      await widget.repository.updateNote(note);
    }
  }

  @override
  void dispose() {
    _debounceSaveTimer?.cancel();
    _saveNote();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.undo, color: _canUndo ? CouiColors.textPrimaryLight : Colors.grey.shade400),
            onPressed: _canUndo ? () => _bridgeHost.undo() : null,
          ),
          IconButton(
            icon: Icon(Icons.redo, color: _canRedo ? CouiColors.textPrimaryLight : Colors.grey.shade400),
            onPressed: _canRedo ? () => _bridgeHost.redo() : null,
          ),
          IconButton(
            icon: const Icon(Icons.check),
            onPressed: () async {
              await _saveNote();
              if (mounted) Navigator.of(context).pop();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: EditorView(
              bridgeHost: _bridgeHost,
              initialContent: TiptapContentInfo(
                guid: _noteId,
                title: _currentTitle,
                content: _currentHtml,
              ),
            ),
          ),
          _buildToolbar(),
        ],
      ),
    );
  }

  Widget _buildToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).cardColor,
        border: Border(top: BorderSide(color: Colors.grey.shade300, width: 0.5)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          IconButton(
            icon: const Icon(Icons.format_bold),
            tooltip: 'Bold',
            onPressed: () => _bridgeHost.setBold(true),
          ),
          IconButton(
            icon: const Icon(Icons.format_italic),
            tooltip: 'Italic',
            onPressed: () => _bridgeHost.setItalic(true),
          ),
          IconButton(
            icon: const Icon(Icons.title),
            tooltip: 'Heading',
            onPressed: () => _bridgeHost.setHeading(1),
          ),
          IconButton(
            icon: const Icon(Icons.format_list_bulleted),
            tooltip: 'Bullet List',
            onPressed: () => _bridgeHost.toggleBulletList(),
          ),
          IconButton(
            icon: const Icon(Icons.table_chart_outlined),
            tooltip: 'Insert Table',
            onPressed: () => _bridgeHost.insertTable(),
          ),
        ],
      ),
    );
  }
}
