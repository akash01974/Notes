class AttachmentEntity {
  final String attachmentId;
  final String richNoteId;
  final int type; // 0=Pic, 1=Paint, 2=Voice, 10=File, 13=Video
  final int state; // 0=New, 1=Synced, 2=Modified
  final String? md5;
  final String? url;
  final String? fileName;
  final String? cloudMetadata;
  final String? extra;
  final int width;
  final int height;
  final String? associateAttachmentId;

  AttachmentEntity({
    required this.attachmentId,
    required this.richNoteId,
    required this.type,
    this.state = 0,
    this.md5,
    this.url,
    this.fileName,
    this.cloudMetadata,
    this.extra,
    this.width = 0,
    this.height = 0,
    this.associateAttachmentId,
  });
}
