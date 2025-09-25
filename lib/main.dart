import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:async/async.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(MyApp());
}

class MyApp extends StatefulWidget {
  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  HttpServer? _server;
  String? _serverUrl;
  bool _ready = false;
  String _log = '';

  void _appendLog(String s) {
    debugPrint(s);
    setState(() {
      _log = '$_log\n$s';
    });
  }

  @override
  void initState() {
    super.initState();
    _startHost()
        .then((url) {
          setState(() {
            _serverUrl = url;
            _ready = true;
          });
        })
        .catchError((e, st) {
          _appendLog('Erreur démarrage serveur: $e');
          _appendLog(st.toString());
          setState(() => _ready = false);
        });
  }

  @override
  void dispose() {
    try {
      _server?.close(force: true);
    } catch (e) {}
    super.dispose();
  }

  /// ------------- serveur local -------------
  Future<String> _startHost() async {
    _appendLog('Préparation: extraction des assets...');
    final tempDir = await getTemporaryDirectory();
    final wwwDir = Directory(p.join(tempDir.path, 'www'));
    if (await wwwDir.exists()) {
      await wwwDir.delete(recursive: true);
    }
    await wwwDir.create(recursive: true);

    // AssetManifest.json contient la liste des assets packagés
    final manifestContent = await rootBundle.loadString('AssetManifest.json');
    final Map<String, dynamic> manifestMap = json.decode(manifestContent);

    // Copier les assets qui commencent par assets/frontend/
    final assets =
        manifestMap.keys
            .where((k) => k.startsWith('assets/frontend/'))
            .toList();
    _appendLog('Found ${assets.length} frontend asset(s).');

    for (final assetPath in assets) {
      final relative = assetPath.replaceFirst('assets/frontend/', '');
      final outFile = File(p.join(wwwDir.path, relative));
      // ensure parent dir exists
      await outFile.parent.create(recursive: true);
      final bytes = await rootBundle.load(assetPath);
      final buffer = bytes.buffer.asUint8List();
      await outFile.writeAsBytes(buffer);
    }

    _appendLog('Extraction terminée : ${wwwDir.path}');

    // init shared prefs for persist endpoints
    final prefs = await SharedPreferences.getInstance();

    // start HttpServer on 127.0.0.1 with desired port
    // Try port 5000, fallback to any free port
    int port = 5000;
    HttpServer? server;
    for (int attempt = 0; attempt < 3; attempt++) {
      try {
        server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
        break;
      } catch (e) {
        _appendLog('port $port non disponible, retrying...');
        port = (attempt == 0) ? 8080 : 0; // 0 means auto-assign
      }
    }
    if (server == null) {
      server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    }
    _server = server;
    final boundAddress = server.address.address;
    final boundPort = server.port;
    final baseUrl = 'http://$boundAddress:$boundPort';
    _appendLog('Server listening at $baseUrl');

    // Serve requests
    server.listen((HttpRequest req) async {
      try {
        // CORS headers (allow frontend to fetch freely)
        req.response.headers.add('Access-Control-Allow-Origin', '*');
        req.response.headers.add(
          'Access-Control-Allow-Methods',
          'GET,POST,OPTIONS',
        );
        req.response.headers.add(
          'Access-Control-Allow-Headers',
          'Content-Type,Authorization,X-CSRF-Token',
        );

        final path =
            req.uri.path; // ex: /frontend/login.html or /__persist_read

        // handle preflight
        if (req.method == 'OPTIONS') {
          req.response.statusCode = HttpStatus.ok;
          await req.response.close();
          return;
        }

        // Persist endpoints
        if (path == '/__persist_read') {
          final token = prefs.getString('.emballage_bi_persist') ?? '';
          if (token.isEmpty) {
            req.response.statusCode = HttpStatus.noContent; // 204
            await req.response.close();
            return;
          } else {
            req.response.headers.contentType = ContentType(
              'text',
              'plain',
              charset: 'utf-8',
            );
            req.response.write(token);
            await req.response.close();
            return;
          }
        } else if (path == '/__persist_write' && req.method == 'POST') {
          final content = await utf8.decoder.bind(req).join();
          String token = '';
          try {
            final j = json.decode(content);
            token =
                (j is Map && (j['token'] ?? j['t'] ?? '') is String)
                    ? (j['token'] ?? j['t'] ?? '')
                    : '';
          } catch (_) {
            token = content;
          }
          await prefs.setString('.emballage_bi_persist', token);
          req.response.headers.contentType = ContentType(
            'text',
            'plain',
            charset: 'utf-8',
          );
          req.response.write('OK');
          await req.response.close();
          return;
        } else if (path == '/__persist_delete' && req.method == 'POST') {
          await prefs.remove('.emballage_bi_persist');
          req.response.headers.contentType = ContentType(
            'text',
            'plain',
            charset: 'utf-8',
          );
          req.response.write('OK');
          await req.response.close();
          return;
        }

        // Serve static files from wwwDir
        // Map root "/" to /frontend/login.html or /frontend/index.html? we will fallback to /frontend/login.html
        String requestedPath = req.uri.path;
        if (requestedPath == '/' || requestedPath == '') {
          requestedPath = '/frontend/login.html';
        }

        // Normalize and prevent path traversal
        final fsPath = p.normalize(p.join(wwwDir.path, requestedPath));
        if (!fsPath.startsWith(wwwDir.path)) {
          // path escape attempt
          req.response.statusCode = HttpStatus.forbidden;
          await req.response.close();
          return;
        }

        final file = File(fsPath);
        if (await file.exists()) {
          final mimeType = lookupMimeType(fsPath) ?? 'application/octet-stream';
          final parts = mimeType.split('/');
          req.response.headers.contentType = ContentType(
            parts[0],
            parts[1],
            charset: 'utf-8',
          );
          await req.response.addStream(file.openRead());
          await req.response.close();
          return;
        } else {
          // If not found, 404
          req.response.statusCode = HttpStatus.notFound;
          req.response.headers.contentType = ContentType.text;
          req.response.write('404 Not Found: $requestedPath');
          await req.response.close();
          return;
        }
      } catch (err, st) {
        _appendLog('Request handling error: $err');
        try {
          req.response.statusCode = HttpStatus.internalServerError;
          req.response.write('Internal server error');
          await req.response.close();
        } catch (e) {}
      }
    });

    return baseUrl;
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EmballageBI',
      home: Scaffold(
        appBar: AppBar(title: Text('EmballageBI')),
        body:
            _ready && _serverUrl != null
                ? WebViewWidget(
                  controller:
                      WebViewController()
                        ..setJavaScriptMode(JavaScriptMode.unrestricted)
                        ..loadRequest(
                          Uri.parse('$_serverUrl/frontend/login.html'),
                        ),
                )
                : _buildLoading(),
      ),
    );
  }

  Widget _buildLoading() {
    return Padding(
      padding: const EdgeInsets.all(12.0),
      child: Column(
        children: [
          Text('Démarrage du serveur local...', style: TextStyle(fontSize: 16)),
          SizedBox(height: 8),
          Expanded(child: SingleChildScrollView(child: Text(_log))),
        ],
      ),
    );
  }
}
