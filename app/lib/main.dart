import 'dart:io';
import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;
import 'core/coui_theme.dart';
import 'data/database/app_database.dart';
import 'data/repositories/note_repository_impl.dart';
import 'presentation/screens/notes_list_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Local SQLite Database
  final appDocDir = await getApplicationDocumentsDirectory();
  final dbPath = p.join(appDocDir.path, 'coloros_notes.db');
  final database = AppDatabase.open(dbPath);
  final repository = NoteRepositoryImpl(database);

  runApp(ColorOsNotesApp(repository: repository));
}

class ColorOsNotesApp extends StatelessWidget {
  final NoteRepositoryImpl repository;

  const ColorOsNotesApp({Key? key, required this.repository}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Notes',
      debugShowCheckedModeBanner: false,
      theme: CouiTheme.lightTheme(),
      darkTheme: CouiTheme.darkTheme(),
      themeMode: ThemeMode.system,
      home: NotesListScreen(repository: repository),
    );
  }
}
