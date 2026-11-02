/// Verified 10-field content initialization model matching ColorOS Notes
/// Decompiled from `com.oplus.notes.webview.container.api.TiptapContentInfo`
class TiptapContentInfo {
  final String guid;
  final String titleHintText;
  final String title;
  final String content;
  final List<dynamic> subAttachments;
  final List<dynamic> pageResults;
  final Map<String, dynamic> pictureAttrs;
  final dynamic tiptapTitleJson;
  final dynamic tiptapContentJson;
  final bool isDoingSummary;

  TiptapContentInfo({
    required this.guid,
    this.titleHintText = 'Title',
    this.title = '',
    this.content = '',
    this.subAttachments = const [],
    this.pageResults = const [],
    this.pictureAttrs = const {},
    this.tiptapTitleJson,
    this.tiptapContentJson,
    this.isDoingSummary = false,
  });

  Map<String, dynamic> toJson() {
    return {
      'guid': guid,
      'titleHintText': titleHintText,
      'title': title,
      'content': content,
      'subAttachments': subAttachments,
      'pageResults': pageResults,
      'pictureAttrs': pictureAttrs,
      'tiptapTitleJson': tiptapTitleJson,
      'tiptapContentJson': tiptapContentJson,
      'isDoingSummary': isDoingSummary,
    };
  }

  factory TiptapContentInfo.fromNote({
    required String localId,
    required String title,
    required String htmlContent,
    dynamic contentJson,
  }) {
    return TiptapContentInfo(
      guid: localId,
      title: title,
      content: htmlContent,
      tiptapContentJson: contentJson,
    );
  }
}
