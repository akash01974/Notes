class NoteEntity {
  final String localId;
  final String? globalId;
  final String title;
  final String? rawTitle;
  final String text;
  final String rawText;
  final String htmlText;
  final String folderId;
  final int timestamp;
  final int createTime;
  final int updateTime;
  final int topTime;
  final int recycleTime;
  final int alarmTime;
  final int state; // 0=New, 1=Synced, 2=Modified
  final int deleted; // 0=Active, 1=Recycled, 2=Purged
  final String skinId;
  final String? attachmentLrc;

  NoteEntity({
    required this.localId,
    this.globalId,
    required this.title,
    this.rawTitle,
    required this.text,
    required this.rawText,
    required this.htmlText,
    required this.folderId,
    required this.timestamp,
    required this.createTime,
    required this.updateTime,
    this.topTime = 0,
    this.recycleTime = 0,
    this.alarmTime = 0,
    this.state = 0,
    this.deleted = 0,
    this.skinId = 'default',
    this.attachmentLrc,
  });

  NoteEntity copyWith({
    String? title,
    String? text,
    String? rawText,
    String? htmlText,
    String? folderId,
    int? updateTime,
    int? topTime,
    int? recycleTime,
    int? state,
    int? deleted,
    String? attachmentLrc,
  }) {
    return NoteEntity(
      localId: localId,
      globalId: globalId,
      title: title ?? this.title,
      rawTitle: rawTitle,
      text: text ?? this.text,
      rawText: rawText ?? this.rawText,
      htmlText: htmlText ?? this.htmlText,
      folderId: folderId ?? this.folderId,
      timestamp: timestamp,
      createTime: createTime,
      updateTime: updateTime ?? this.updateTime,
      topTime: topTime ?? this.topTime,
      recycleTime: recycleTime ?? this.recycleTime,
      alarmTime: alarmTime,
      state: state ?? this.state,
      deleted: deleted ?? this.deleted,
      skinId: skinId,
      attachmentLrc: attachmentLrc ?? this.attachmentLrc,
    );
  }
}
