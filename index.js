const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const WebSocket = require('ws');

// --- 設定エリア ---
const LOG_PATH = "E:\\SteamLibrary\\steamapps\\common\\Tree of Savior (Japanese Ver.)\\data\\log.txt";
const READ_SCRIPT_PATH = path.join(__dirname, 'ReadComment.ps1');

let isEnabled = false;
let messageQueue = []; // メッセージを貯める箱
let isSpeaking = false; // 今しゃべっているかどうかのフラグ

// --- 読み上げ実行関数 (順番に処理する) ---
function speakNext() {
    if (messageQueue.length === 0 || isSpeaking) return;

    isSpeaking = true;
    const msg = messageQueue.shift();

    const ps = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', READ_SCRIPT_PATH,
        '-text', msg
    ]);

    ps.on('close', () => {
        isSpeaking = false;
        // 次のメッセージがあれば実行
        setTimeout(speakNext, 100); 
    });
}

// --- ログ監視ロジック ---
function processLine(line) {
    if (!isEnabled) return;
    const match = line.match(/^\[\d{4}-\d{2}-\d{2}.*\]\s+\[(Normal|Party|Guild)\]\s+(.+)$/);
    if (!match) return;

    let msg = match[2].replace(/\{[^}]+\}/g, '');
    if (msg.length > 50) msg = msg.substring(0, 47) + "…以下略";
    if (!msg.trim()) return;

    // キューに追加して実行を促す
    messageQueue.push(msg);
    speakNext();
}

// --- 以下、Stream Deck 通信部分はそのまま ---
// (省略していますが、今お使いの WebSocket のコードをそのまま下に続けてください)

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

    // ボタンが押されたとき
    if (event === 'keyDown') {
        isEnabled = !isEnabled;
        
        // タイトルを直接書き換えて「動いていること」を証明する
        const statusText = isEnabled ? "ON" : "OFF";
        websocket.send(JSON.stringify({
            event: "setTitle",
            context: jsonObj.context,
            payload: { title: statusText, target: 0 }
        }));

        // ついでにStateも切り替える
        websocket.send(JSON.stringify({
            event: "setState",
            context: jsonObj.context,
            payload: { state: isEnabled ? 1 : 0 }
        }));
    }
});

// ファイル監視
if (fs.existsSync(LOG_PATH)) {
    chokidar.watch(LOG_PATH).on('change', () => {
        try {
            const content = fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n');
            const lastLine = content[content.length - 1];
            if (lastLine) processLine(lastLine);
        } catch (e) { console.error(e); }
    });
}