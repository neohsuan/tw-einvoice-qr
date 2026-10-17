# 參與貢獻

需要 Node.js 20 以上與 npm。請先閱讀 README 的資料來源與解析限制。

```sh
npm ci
npm run typecheck
npm test
npm run attw
```

修改規格行為時，請在議題或 PR 提供財政部原始資料連結與對應章節，並補上可重現的測試。請使用合成資料，避免加入真實顧客資訊、加密金鑰或交易個資。品目跨 QR 接續應先接合原始字串再解析；修改此行為時請保留所有切點測試。執行期程式不可加入依賴或 Node 專用 API，以維持瀏覽器相容性。

公開 API 請附 JSDoc；新增行為請同步更新繁體中文與英文文件及 CHANGELOG。PR 請說明問題、修正後的行為與驗證結果。貢獻以本專案 MIT 授權提供。

## English

Use Node.js 20 or newer and npm. Read the README sources and limitations before changing behavior.

```sh
npm ci
npm run typecheck
npm test
npm run attw
```

For specification changes, link the official source and relevant section in the issue or PR and add reproducible tests. Use synthetic fixtures without customer data, encryption keys, or private transactions. Preserve raw concatenation before parsing QR continuations and retain the tests covering every split position. Runtime code must remain dependency-free and avoid Node-specific APIs so browser use continues to work.

Document public APIs with JSDoc and update both README languages and CHANGELOG for new behavior. Describe the problem, resulting behavior, and validation in the PR. Contributions are provided under this project's MIT license.
