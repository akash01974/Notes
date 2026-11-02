import 'package:flutter/material.dart';
import '../../domain/entities/note.dart';
import '../../domain/repositories/note_repository.dart';
import '../../core/coui_colors.dart';
import 'note_editor_screen.dart';

class NotesListScreen extends StatefulWidget {
  final NoteRepository repository;

  const NotesListScreen({Key? key, required this.repository}) : super(key: key);

  @override
  State<NotesListScreen> createState() => _NotesListScreenState();
}

class _NotesListScreenState extends State<NotesListScreen> {
  late Future<List<NoteEntity>> _notesFuture;

  @override
  void initState() {
    super.initState();
    _loadNotes();
  }

  void _loadNotes() {
    setState(() {
      _notesFuture = widget.repository.getActiveNotes();
    });
  }

  void _openNote([NoteEntity? note]) async {
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => NoteEditorScreen(
          repository: widget.repository,
          initialNote: note,
        ),
      ),
    );
    _loadNotes();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notes'),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () {},
          ),
        ],
      ),
      body: FutureBuilder<List<NoteEntity>>(
        future: _notesFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator(color: CouiColors.primaryGreen));
          }
          final notes = snapshot.data ?? [];
          if (notes.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.note_alt_outlined, size: 72, color: Colors.grey.shade400),
                  const SizedBox(height: 16),
                  Text('No notes yet', style: TextStyle(fontSize: 16, color: Colors.grey.shade600)),
                ],
              ),
            );
          }

          return ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: notes.length,
            separatorBuilder: (_, __) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final note = notes[index];
              return Dismissible(
                key: Key(note.localId),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  decoration: BoxDecoration(
                    color: CouiColors.accentRed,
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: const Icon(Icons.delete_outline, color: Colors.white),
                ),
                onDismissed: (_) async {
                  await widget.repository.deleteNote(note.localId);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('Note deleted: ${note.title.isEmpty ? "Untitled" : note.title}')),
                  );
                },
                child: Card(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => _openNote(note),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (note.title.isNotEmpty) ...[
                            Text(
                              note.title,
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            const SizedBox(height: 6),
                          ],
                          Text(
                            note.text.isEmpty ? 'Empty note' : note.text,
                            style: TextStyle(
                              fontSize: 14,
                              color: note.text.isEmpty ? CouiColors.textSecondaryLight : CouiColors.textPrimaryLight,
                            ),
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 12),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                DateTime.fromMillisecondsSinceEpoch(note.updateTime)
                                    .toLocal()
                                    .toString()
                                    .substring(0, 16),
                                style: const TextStyle(fontSize: 12, color: CouiColors.textSecondaryLight),
                              ),
                              if (note.topTime > 0)
                                const Icon(Icons.push_pin, size: 14, color: CouiColors.primaryGreen),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _openNote(),
        child: const Icon(Icons.add, size: 28),
      ),
    );
  }
}
