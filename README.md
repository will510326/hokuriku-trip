# Trip World — 冬季北陸・飛驒 自駕行程

由「北陸飛驒冬季自駕行程_v19.pptx」轉成的 3D 互動行程網站。

## 開啟

直接雙擊 `index.html` 即可（已打包成單一 `app.js`，不需伺服器）。
要分享給同行者：把整個資料夾（`index.html`、`app.js`、`styles.css`、`img/`）放到任何靜態網站空間即可。

## 修改行程

1. 改 `src/data.js`（住宿、每日行程、預算、美食都在這裡）
2. `npm install`（第一次）
3. `npm run build` 重新產生 `app.js`

## 結構

- `src/data.js` — 所有行程資料
- `src/scene.js` — 3D 雪景地圖（three.js）：地形、地點模型、路線、自駕車動畫、下雪
- `src/main.js` — 左側面板、搜尋、底部狀態列、行前任務（勾選存在瀏覽器 localStorage）
- `img/routes/` — 從簡報擷取的 Google 地圖路線截圖
