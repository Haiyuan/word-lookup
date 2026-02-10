# word-lookup

`word-lookup` 是一個以 Electron 實作的桌面查詞工具，支援：
- GUI 直接輸入查詞
- CLI 推詞到正在運行的 App（或自動喚起）

預設本機通訊位址為 `127.0.0.1:5050`。

## 環境需求

- Node.js 20+
- npm
- macOS / Linux / Windows

## 快速開始

```bash
cd /Applications/word-lookup
npm install
npm run check
npm start
```

## 日常使用

### 1. GUI 查詞

1. 執行 `npm start`
2. 在輸入框輸入單字或片語
3. 按 `Enter` 或點擊 `Go`
4. 需要時可從下拉選單切換詞典來源

### 2. CLI 推詞

```bash
node triggerLookup.js hello
node triggerLookup.js "hash browns"
```

若 App 尚未啟動，`triggerLookup.js` 會嘗試啟動後再重送一次查詞內容。

## Sources 管理

App 內菜單：
- `Sources -> Manage…`：新增 / 修改 / 刪除來源模板
- `Sources -> Reload sources`：重新載入來源配置

模板佔位符支援：
- `{word}`
- `%s`

## 資料儲存位置

來源配置存於 Electron `userData` 下的 `sources.json`。

macOS 常見路徑：
`~/Library/Application Support/word-lookup/sources.json`

## 可用腳本

```bash
npm start      # 啟動桌面 App
npm run check  # 語法檢查
npm test       # 同 check
npm run make   # electron-builder 打包
```

打包產物預設輸出至 `dist/`（已加入 `.gitignore`）。

## 可選 Python 版本

專案含 `word-lookup-py/`（PyQt 版本）。

注意：
- `word-lookup-py/run_lookup.sh`
- `word-lookup-py/trigger_lookup.py`

兩者含機器相關絕對路徑，換機後需先調整再用。

## 常見問題

### 1. `EADDRINUSE`（5050 端口已被占用）

表示已有其他程序占用 `127.0.0.1:5050`。請關閉舊程序或釋放端口。

macOS 可查：
```bash
lsof -nP -iTCP:5050 -sTCP:LISTEN
```

### 2. `npm run make` 失敗

- 確認已安裝依賴：`npm install`
- 確認網路可下載 Electron 發行包
- 若僅見 `description/author` 缺失，屬警告，非致命
