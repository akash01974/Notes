class FolderEntity {
  final int? id;
  final String guid;
  final String name;
  final int state;
  final int createdTime;
  final int modifyTime;
  final int encrypted;

  FolderEntity({
    this.id,
    required this.guid,
    required this.name,
    this.state = 0,
    required this.createdTime,
    required this.modifyTime,
    this.encrypted = 0,
  });
}
