import 'package:drift/drift.dart';

// Generated file produced by: dart run build_runner build
part 'drift_database.g.dart';

@DriftDatabase(include: {'tables.drift'})
class ColorOsNotesDatabase extends _$ColorOsNotesDatabase {
  ColorOsNotesDatabase(QueryExecutor e) : super(e);

  @override
  int get schemaVersion => 47;

  @override
  MigrationStrategy get migration {
    return MigrationStrategy(
      onCreate: (Migrator m) async {
        await m.createAll();
      },
      onUpgrade: (Migrator m, int from, int to) async {
        // Incremental migrations from v47 upward will be defined here
      },
      beforeOpen: (details) async {
        await customStatement('PRAGMA foreign_keys = ON;');
        await customStatement('PRAGMA journal_mode = WAL;');
        await customStatement('PRAGMA synchronous = NORMAL;');
        await customStatement('PRAGMA busy_timeout = 5000;');
      },
    );
  }
}
