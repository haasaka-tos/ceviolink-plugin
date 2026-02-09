const { exec } = require('child_process');
const path = require('path');

// 設定：PowerShellスクリプトのパス
const psScriptPath = path.join(__dirname, 'ReadComment.ps1');

// 「喋り中」かどうかを管理するフラグ（ロック用）
let isSpeaking = false;

/**
 * CeVIO AIでテキストを読み上げる関数
 * 前の処理が完了していない場合は、命令を送らずにスキップします
 */
function speak(text) {
    // テキストが空、または現在「喋り中」ならスキップ
    if (!text || isSpeaking) {
        console.warn(`CeVIO is busy. Skipping message: ${text}`);
        return;
    }

    // ロックをかける
    isSpeaking = true;

    // 引数名を現在のReadComment.ps1に合わせて -text に設定
    const safeText = text.replace(/"/g, '""');
    const command = `powershell -ExecutionPolicy Bypass -File "${psScriptPath}" -text "${safeText}"`;

    try {
        // PowerShellを実行
        exec(command, (error, stdout, stderr) => {
            // 処理が完了したら（成功・失敗に関わらず）ロックを解除
            isSpeaking = false;

            if (error) {
                // ここでのエラーはログのみ出力し、プラグインは継続させる
                console.error(`PowerShell Exec Error: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`PowerShell Stderr: ${stderr}`);
            }
        });
    } catch (e) {
        // 予期せぬ実行エラーが発生した場合もロックを解除
        isSpeaking = false;
        console.error("Critical execution error in index.js:", e);
    }
}

// 起動確認ログ
console.log("CeVIO Link Plugin: Locked-mode started to prevent dialogs.");


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