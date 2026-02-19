const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const WebSocket = require('ws');

// --- 設定エリア ---
// Tree of Savior のログパス
const LOG_PATH = "E:\\SteamLibrary\\steamapps\\common\\Tree of Savior (Japanese Ver.)\\data\\log.txt";
const READ_SCRIPT_PATH = path.join(__dirname, 'ReadComment.ps1');

let isEnabled = false; // 最初はOFF
let websocket = null;

// --- 状態管理用の変数（追加） ---
let speechQueue = [];
let isSpeaking = false;

// --- 読み上げロジック ---
function processLine(line) {
    if (!isEnabled) return;
    
    // TOSのログ形式に合わせた正規表現
    const match = line.match(/^\[\d{4}-\d{2}-\d{2}.*\]\s+\[(Normal|Party|Guild)\]\s+(.+)$/);
    if (!match) return;

    // 制御文字の除去と長さ制限
    let msg = match[2].replace(/\{[^}]+\}/g, '');
    if (msg.length > 50) msg = msg.substring(0, 47) + "…以下略";
    if (!msg.trim()) return;

    // 直接実行せず、キューに追加して処理を開始させる
    speechQueue.push(msg);
    if (!isSpeaking) {
        processNext();
    }
}

// 1つずつ取り出して実行する関数（追加）
function processNext() {
    if (speechQueue.length === 0) {
        isSpeaking = false;
        return;
    }

    isSpeaking = true;
    const msg = speechQueue.shift();

    // PowerShellを起動
    const ps = spawn('powershell.exe', [
        '-NoProfile', 
        '-ExecutionPolicy', 'Bypass', 
        '-File', READ_SCRIPT_PATH, 
        '-text', msg
    ]);

    // プロセスが終了（exit）したら、次のメッセージへ
    ps.on('exit', () => {
        // 次を呼ぶ前に 800ms の「間」を作り、CeVIOの多重起動を防ぐ
        setTimeout(() => {
            processNext();
        }, 800);
    });

    ps.on('error', (err) => {
        console.error("PS Launch Error:", err);
        isSpeaking = false;
        processNext();
    });
}

// --- Stream Deck 通信設定 ---
const args = process.argv.slice(2);
const port = args[args.indexOf('-port') + 1];
const uuid = args[args.indexOf('-pluginUUID') + 1];
const registerEvent = args[args.indexOf('-registerEvent') + 1];

websocket = new WebSocket(`ws://127.0.0.1:${port}`);

websocket.on('open', () => {
    // 自分を登録
    websocket.send(JSON.stringify({ event: registerEvent, uuid: uuid }));
});

websocket.on('message', (data) => {
    const jsonObj = JSON.parse(data);
    const event = jsonObj.event;

    if (event === 'keyDown') {
        isEnabled = !isEnabled;
        
        // ボタンの見た目（State）を切り替える
        websocket.send(JSON.stringify({
            event: "setState",
            context: jsonObj.context,
            payload: { state: isEnabled ? 1 : 0 }
        }));

        // OFFにした時はキューをリセットして読み上げを停止
        if (!isEnabled) {
            speechQueue = [];
        }
    }
});

// ファイル監視
if (fs.existsSync(LOG_PATH)) {
    // ignoreInitial: true を追加して、起動時に古いログを読み上げるのを防止
    chokidar.watch(LOG_PATH, { ignoreInitial: true }).on('change', () => {
        try {
            const content = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n');
            const lastLine = content[content.length - 1];
            if (lastLine) processLine(lastLine);
        } catch (e) { console.error(e); }
    });
}