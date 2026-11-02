import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'editor_bridge_host.dart';
import 'tiptap_content_info.dart';

/// Flutter InAppWebView Host for TipTap Production Editor
class EditorView extends StatefulWidget {
  final EditorBridgeHost bridgeHost;
  final TiptapContentInfo initialContent;
  final VoidCallback? onReady;

  const EditorView({
    Key? key,
    required this.bridgeHost,
    required this.initialContent,
    this.onReady,
  }) : super(key: key);

  @override
  State<EditorView> createState() => _EditorViewState();
}

class _EditorViewState extends State<EditorView> {
  InAppWebViewController? _webViewController;

  @override
  Widget build(BuildContext context) {
    return InAppWebView(
      initialFile: 'assets/tiptap/index.html',
      initialSettings: InAppWebViewSettings(
        useHybridComposition: true,
        transparentBackground: true,
        supportZoom: false,
        javaScriptEnabled: true,
        allowFileAccessFromFileURLs: true,
        allowUniversalAccessFromFileURLs: true,
      ),
      initialUserScripts: UnmodifiableListView<UserScript>([
        UserScript(
          source: _generateHostShimScript(),
          injectionTime: UserScriptInjectionTime.AT_DOCUMENT_START,
        ),
      ]),
      onWebViewCreated: (controller) {
        _webViewController = controller;
        widget.bridgeHost.evaluateJavascript = (script) async {
          return await controller.evaluateJavascript(source: script);
        };

        // Register handlers for JS -> Native bridge calls
        _registerJsHandlers(controller);
      },
      onLoadStop: (controller, url) async {
        // Once page loads, notify host
        widget.onReady?.call();
      },
    );
  }

  void _registerJsHandlers(InAppWebViewController controller) {
    controller.addJavaScriptHandler(
      handlerName: 'onJsBridgeCall',
      callback: (args) {
        if (args.isNotEmpty && args[0] is String) {
          final method = args[0] as String;
          final methodArgs = args.length > 1 ? args.sublist(1) : [];
          widget.bridgeHost.handleJsMethodCall(method, methodArgs);
        }
      },
    );
  }

  static String _generateHostShimScript() {
    return '''
      window._bridgeHandlers = {};
      window.WebViewJavascriptBridge = {
        registerHandler: function(name, fn) {
          window._bridgeHandlers[name] = fn;
        },
        callHandler: function(name, data, cb) {
          window.flutter_inappwebview.callHandler('onJsBridgeCall', name, data);
        },
        _handleMessageFromJava: function(jsonStr) {
          try {
            var msg = JSON.parse(jsonStr);
            if (msg.handlerName && window._bridgeHandlers[msg.handlerName]) {
              window._bridgeHandlers[msg.handlerName](msg.data, function() {});
            }
          } catch (e) {
            console.error('Bridge dispatch error', e);
          }
        }
      };

      window.injectedObject = new Proxy({}, {
        get: function(target, prop) {
          return function(...args) {
            window.flutter_inappwebview.callHandler('onJsBridgeCall', prop, ...args);
          };
        }
      });

      // ColorOS TBL Polyfill
      window.Gc = window.Gc || {
        showHandles: function() {},
        hideHandles: function() {}
      };
    ''';
  }
}
