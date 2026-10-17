# @hsuan741220/tw-einvoice-qr

解析、驗證臺灣電子發票證明聯的 Code 39 一維條碼與左右 QR Code，並提供期別、開獎日、領獎期間及統一發票對獎工具。TypeScript、零執行期依賴，支援 Node.js 20 以上、ESM、CommonJS 與現代瀏覽器。

## 安裝

```sh
npm install @hsuan741220/tw-einvoice-qr
```

## 快速使用

ESM：

```js
import {
  parseBarcode, buildLeftQrPrefix, parseInvoiceQr, safeParseInvoiceQr,
  getDrawDate, getClaimPeriod, checkPrize,
} from '@hsuan741220/tw-einvoice-qr';

const barcode = parseBarcode('11508AB112233449999');
console.log(barcode.period);
// { rocYear: 115, year: 2026, startMonth: 7, endMonth: 8 }

// 以下是合成測試資料；encryption 由呼叫端提供，不會產生或驗證 AES。
const prefix = buildLeftQrPrefix({
  invoiceNumber: 'AB11223344', date: '2026-08-31', randomCode: '9999',
  salesAmount: 324, totalAmount: 340, buyerIdentifier: null,
  sellerIdentifier: '04595252', encryption: 'ydXZt4LAN1UHN/j1juVcRA==',
});
const left = `${prefix}:**********:3:3:1:乾電池:1:105:`;
const right = '**口罩:1:210:牛奶:1:25';
const invoice = parseInvoiceQr(left, right, { barcode: '11508AB112233449999' });
console.log(invoice.items);
// [{ name: '乾電池', quantity: 1, unitPrice: 105 }, ...共三筆 ]

const result = safeParseInvoiceQr(left, right);
if (!result.success) console.error(result.errors); // [{ code, message }]

console.log(getDrawDate(barcode.period)); // '2026-09-25'
console.log(getClaimPeriod(barcode.period));
// { startDate: '2026-10-06', endDate: '2027-01-05' }
console.log(checkPrize(invoice.invoiceNumber, { first: ['11223344'] }));
// { prize: 'first', nameZh: '頭獎', amount: 200000, matched: '11223344' }
```

CommonJS：

```js
const { parseBarcode, getDrawDate } = require('@hsuan741220/tw-einvoice-qr');
const invoice = parseBarcode('11508AB112233449999');
console.log(getDrawDate(invoice.period)); // '2026-09-25'
```

## API 參考

所有公開型別均可使用 `import type { ... }` 匯入，完整宣告附有 JSDoc。

| 函式 | 回傳與用途 |
| --- | --- |
| `parseBarcode(code39String)` | `ParsedBarcode`；嚴格解析 19 字元，不含 Code 39 起訖 `*`。 |
| `parseLeftQr(str)` | `ParsedLeftQr`；解析固定欄位、表頭與現有完整品目，容許右 QR 尚未提供。 |
| `parseRightQr(str)` | `{ itemData: string }`；檢查並移除開頭的 `**`，原樣保留接續資料。 |
| `parseInvoiceQr(left, right?, options?)` | `ParsedInvoiceQr`；先串接原始資料再解析，要求 `itemCount` 筆完整品目。 |
| `safeParseBarcode` / `safeParseLeftQr` / `safeParseRightQr` / `safeParseInvoiceQr` | 參數與對應 `parse*` 相同，回傳 `SafeParseResult<T>`。 |
| `validateInvoice(invoice, barcode)` | 回傳 `ValidationIssue[]`，檢查日期期別、發票號碼及隨機碼；barcode 可為字串或 `ParsedBarcode`。 |
| `isValidBusinessNumber(value)` | `boolean`；本機驗證八碼統編，採 2023 年除以 5 與第七碼為 7 的特例。 |
| `getPeriod(date)` | `InvoicePeriod`；計算日期所屬雙月期別。 |
| `isPeriodMatch(date, period)` | `boolean`；比對日期期別，無效輸入會拋錯。 |
| `getDrawDate(period)` | ISO 日期字串；該期結束後下一個單月 25 日。 |
| `getClaimPeriod(period)` | `{ startDate, endDate }`；含首尾的名義領獎日期。 |
| `checkPrize(invoiceNumberOr8Digits, winning)` | `PrizeResult`；比對並回傳最高單一獎項。 |
| `buildLeftQrPrefix(fields)` | `string`；檢核輸入並產生 77 字元前綴，供測試或資料組裝使用。 |

### 一維條碼與期別

`ParsedBarcode` 為 `{ period, invoiceNumber, track, number, randomCode }`；`track` 為兩碼大寫英文，`number` 為八碼數字字串，保留前導零。`InvoicePeriod` 為 `{ rocYear, year, startMonth, endMonth }`。

期別前五碼是三碼民國年與兩碼**偶數結束月份**：`10404` 是民國 104 年 3–4 月；`11406` 是民國 114 年 5–6 月。月份必須為 `02/04/06/08/10/12`，民國年支援 `001–999`。

`getPeriod` 與 `isPeriodMatch` 的日期接受嚴格 `YYYY-MM-DD` 或 `Date`。`Date` 使用 **UTC** 年月日；臺灣當地日期建議直接傳日期字串。其餘日期輸出皆為字串，不受執行環境時區影響。`period` 接受 `InvoicePeriod`、五碼期別字串，或完整 19 碼一維條碼。`isPeriodMatch` 的參數順序為 `(date, period)`。

### QR 固定欄位

| 欄位 | 長度 | 輸出 |
| --- | --- | --- |
| 發票字軌號碼 | 10 | `invoiceNumber`、`track`、`number` |
| 民國開立日期 | 7 | 原文 `rocDate` 與 ISO `date`，檢查實際日曆及閏年 |
| 隨機碼 | 4 | `randomCode` 字串；B2B 四個空白轉為 `null` |
| 未稅銷售額 | 8 hex | `salesAmount` 數字；全零轉為 `null`，`salesAmountSeparated: false` |
| 含稅總計額 | 8 hex | `totalAmount` 數字 |
| 買方統編 | 8 | `buyerIdentifier`；`00000000` 轉為 `null` |
| 賣方統編 | 8 | `sellerIdentifier`；必須通過格式與檢查碼 |
| 加密驗證資訊 | 24 | `encryption`；檢查標準 Base64 格式及 16-byte 長度，原樣保留 |

零銷售額的欄位無法分辨「真正為零」與「系統未分離稅項」，本函式一律回傳 `null` 與旗標。國內營業人買方有統編時，銷售額必須分離；含稅總額必須大於零且不得小於銷售額。B2B 可讀取四位數字隨機碼，亦支援規格補充說明指定的四個空白；空白只接受於買方有統編的 QR。

### 表頭、品目與跨 QR 接續

77 碼後為 `:營業人自行使用區:完整品目筆數:交易品目總筆數:編碼參數:明細`。`businessUse` 固定十字元，`**********` 轉為 `null`。`itemCount` 是**左右 QR 合計完整記載**的筆數；`totalItemCount` 是整張發票的筆數，可能更大。筆數不等於商品數量總和。

每筆 `InvoiceItem` 為 `{ name, quantity, unitPrice }`。數量與單價支援有限的十進位數字、小數與正負號，拒絕指數表示、空白與超出安全數值範圍的值。名稱保留原有空白。解析完宣告的品目筆數後，其他欄位皆放入 `supplementalNotes`，冒號與換行完整保留，不會誤認為更多品目。

| `encodingParameter` | `encoding` | 行為 |
| --- | --- | --- |
| 0 | `Big5` | 掃描器已解碼的文字原樣保留，不將 JS 字串重新轉碼。 |
| 1 | `UTF-8` | 保留掃描器提供的文字。 |
| 2 | `Base64` | 依官方範例，先接合整段 Base64 明細，再以 UTF-8 解碼並切分品目；亦相容單獨編碼品名的資料。 |
| 3 | `UTF-8-overseas` | 境外電商格式，品目前多兩個十碼金額欄位。 |

`parseLeftQr` 的 `isComplete` 表示目前可讀出宣告的品目及境外金額，缺少的資料放在 `pendingItemData`，原始編碼明細放在 `itemData`。編碼 2 的非空明細若尚無原始冒號，無法區分整段或單獨品名的 Base64；此時保持未完成，`pendingItemData` 保留原始片段。左 QR 結尾恰為數字時，單靠左碼無法知道該數字是否還有後半段；即使左碼的 `isComplete` 為 true，仍應將掃到的右碼交給 `parseInvoiceQr`。後者永遠重新接合原始字串，**不會自動補冒號**。

```js
import { parseInvoiceQr } from '@hsuan741220/tw-einvoice-qr';
// prefix 為上例的 77 碼前綴。右碼可能從數字、中文或 Base64 字元中間開始。
const leftBase64 = `${prefix}:**********:3:3:2:5Lm+6Zu75rGg`;
const rightBase64 = '**OjE6MTA1OuWPo+e9qToxOjIxMDrniZvlpbY6MToyNQ==';
const decoded = parseInvoiceQr(leftBase64, rightBase64);
console.log(decoded.items[0].name); // '乾電池'
```

### 境外電商

參數 3 要求固定欄位銷售額、總計額皆為 `00000000`，買方為一般消費者。編碼參數後依序放境外銷售額、境外總計額，再接品目。境外銷售額須為 `0000000000`；總計額前八碼是整數的十六進位，後兩碼是小數百分位的十六進位，後兩碼最大為 `63`（十進位 99）。例如 `0000016B63` 為 `363.99`。

回傳 `variant: 'overseas'`，`totalAmount` 是延伸欄位的實際總額，`prefixTotalAmount` 保留固定欄位的 0，`overseasAmounts` 保留原始十六進位與解碼後金額。規格沒有幣別欄位，不推測幣別。國內格式為 `variant: 'domestic'`、`overseasAmounts: null`。

### 結構化錯誤與跨條碼檢核

```ts
import { safeParseBarcode, InvoiceParseError, parseBarcode } from '@hsuan741220/tw-einvoice-qr';

const result = safeParseBarcode('invalid');
if (result.success) console.log(result.data.invoiceNumber);
else console.log(result.errors[0]?.code); // INVALID_BARCODE

try { parseBarcode('invalid'); }
catch (error) {
  if (error instanceof InvoiceParseError) console.log(error.code, error.errors);
}
```

`SafeParseResult<T>` 為 `{ success: true, data: T } | { success: false, errors: { code, message }[] }`。`parse*` 的資料驗證失敗一律拋出 `InvoiceParseError`，內含 `code` 與 `errors`；通常在第一個錯誤停止。`parseInvoiceQr(left, right, { barcode })` 另可同時回報 `PERIOD_MISMATCH`、`INVOICE_NUMBER_MISMATCH`、`RANDOM_CODE_MISMATCH`。B2B 隨機碼為 `null` 時略過該碼比對。單獨解析 QR 時沒有一維條碼可供比對，不會推測其期別。

錯誤碼還包括 `INVALID_INPUT`、`INVALID_BARCODE`、`INVALID_PERIOD`、`INVALID_INVOICE_NUMBER`、`INVALID_DATE`、`INVALID_RANDOM_CODE`、`INVALID_AMOUNT`、`TOTAL_BELOW_SALES`、`INVALID_BUSINESS_NUMBER`、`INVALID_ENCRYPTION`、`INVALID_QR_PREFIX`、`INVALID_QR_METADATA`、`INVALID_ITEM_COUNT`、`INVALID_ENCODING`、`INVALID_BASE64`、`INVALID_ITEM`、`INCOMPLETE_ITEMS`、`INVALID_RIGHT_QR`、`INVALID_OVERSEAS_AMOUNT`、`INVALID_WINNING_NUMBER`。以 `code` 判斷行為；英文 `message` 用於說明原因。

### 對獎、開獎與領獎

`checkPrize` 接受完整十碼發票號碼或八碼數字，以及 `{ special?, grand?, first: string[], additionalSixth?: string[] }`。一般中獎號碼皆為八碼，增開六獎為三碼，必須使用字串以保留前導零。結果為 `{ prize, nameZh, amount, matched }`；`matched` 為命中的完整中獎號碼，頭獎衍生的末碼獎也保留八碼來源，未中獎為 `null`。

| `prize` | 中文 | 比對方式 | 獎金（TWD） |
| --- | --- | --- | ---: |
| `special` | 特別獎 | 特別獎八碼完全相同 | 10,000,000 |
| `grand` | 特獎 | 特獎八碼完全相同 | 2,000,000 |
| `first` | 頭獎 | 任一頭獎八碼完全相同 | 200,000 |
| `second` | 二獎 | 頭獎末七碼 | 40,000 |
| `third` | 三獎 | 頭獎末六碼 | 10,000 |
| `fourth` | 四獎 | 頭獎末五碼 | 4,000 |
| `fifth` | 五獎 | 頭獎末四碼 | 1,000 |
| `sixth` | 六獎 | 頭獎末三碼 | 200 |
| `additionalSixth` | 增開六獎 | 選填增開號碼末三碼 | 200 |
| `none` | 未中獎 | 無符合 | 0 |

只回傳最高單一獎項；特別獎與特獎不衍生末碼獎，同額六獎優先回傳一般六獎。增開六獎可以省略。呼叫端負責提供正確期別的中獎號碼。

規則於 **2026-10-17** 核對：7–8 月期於 9 月 25 日開獎，11–12 月期於翌年 1 月 25 日開獎。領獎期間從開獎次月 6 日起三個月，例如 2026 年 7–8 月期為 `2026-10-06` 至 `2027-01-05`。函式回傳名義日曆期間，未套用末日逢假日順延、特別公告或營業時間。

### 77 碼產生器

`LeftQrPrefixFields` 的全部必要欄位如快速使用範例：`invoiceNumber`、ISO `date`、`randomCode`、`salesAmount`、`totalAmount`、`buyerIdentifier`、`sellerIdentifier`、`encryption`。`salesAmount` 可為 `null` 或 0，買方 `null` 表一般消費者，B2B 隨機碼 `null` 產生四個空白。金額須為 `0–4294967295` 整數；產生器容許總額 0 以組裝境外資料，國內 QR 解析仍檢查正總額。產生器不產生 QR 圖檔或 AES 密文，亦不產生可直接開立的合法發票。

## 限制

- 輸入是掃描器已辨識的字串，不包含相機辨識、圖片解碼或 Big5 原始位元組轉碼。
- 不驗證 AES 真偽、不查詢發票存證、不確認統編是否已配賦，亦不驗證商品加總、稅額計算或字軌配號。
- 冒號是明細分隔符；無法復原不依規格將冒號放進品名的資料。領獎資格、作廢狀態、稅款與雲端專屬獎未納入數字對獎。
- JavaScript 數字可能有小數浮點誤差；需精確帳務計算時，請另以適當的小數／整數分表示法處理。
- 瀏覽器需提供 `atob`、`btoa`、`TextDecoder`；執行期程式不依賴 Node `Buffer`。

## 資料來源與授權

- [財政部電子發票證明聯一維及二維條碼規格說明 Ver. 1.9（111-05-10）](https://www.einvoice.nat.gov.tw/static/ptl/ein_upload/download/20.pdf)：Code 39、77 碼欄位、左右 QR、Base64 範例、B2B 空白隨機碼與境外電商格式。
- [財政資訊中心：營利事業統一編號檢查碼邏輯修正說明](https://www.fia.gov.tw/singlehtml/3?cntId=c4d9cff38c8642ef8872774ee9987283)及[新版統編測試範例](https://www.fia.gov.tw/singlehtml/3?cntId=4246ca18578e45deaa884285d6863d41)：2023 年除以 5 的檢查規則。
- [統一發票給獎辦法第 3、8 條](https://law-out.mof.gov.tw/LawContent.aspx?id=FL006085)及[財政部統一發票中獎號碼公告](https://invoice.etax.nat.gov.tw/)：獎項、開獎及領獎日期，核對日期 2026-10-17。

程式碼採 [MIT](./LICENSE) 授權，Copyright (c) 2026 neohsuan。政府規格及公告的權利與使用條件依各原始來源；本專案提供獨立實作與合成測試資料，未將官方規格文件收錄進套件。官方範例的示意統編不一定通過檢查碼，測試中的 QR 使用可通過檢查的替代統編。

## Related projects

- [tw-utils](https://github.com/neohsuan/tw-utils)：臺灣常用資料驗證工具。
- [tw-holidays](https://github.com/neohsuan/tw-holidays)：臺灣假日工具。
- [tw-address](https://github.com/neohsuan/tw-address)：臺灣地址工具。

## 開發

```sh
npm ci
npm run typecheck
npm test
npm run attw
```

測試涵蓋真實格式的合成資料、所有 QR 明細切點、三種國內編碼、境外電商、統編例外、日期、各獎項、異常資料，以及使用套件本名的 Node ESM／CJS 匯入。CI 使用 Node 20.x 與 22.x。詳見 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## English

Parse and validate Taiwan electronic invoice proof-slip Code 39 barcodes and paired QR codes. Includes invoice periods, draw dates, nominal claim windows, and uniform-invoice lottery matching. Written in strict TypeScript with zero runtime dependencies. Supports Node.js 20+, ESM, CommonJS, and modern browsers.

### Installation

```sh
npm install @hsuan741220/tw-einvoice-qr
```

### ESM example

```js
import {
  parseBarcode, buildLeftQrPrefix, parseInvoiceQr, safeParseInvoiceQr,
  getDrawDate, getClaimPeriod, checkPrize,
} from '@hsuan741220/tw-einvoice-qr';

const barcode = parseBarcode('11508AB112233449999');
// period: { rocYear: 115, year: 2026, startMonth: 7, endMonth: 8 }

const prefix = buildLeftQrPrefix({
  invoiceNumber: 'AB11223344', date: '2026-08-31', randomCode: '9999',
  salesAmount: 324, totalAmount: 340, buyerIdentifier: null,
  sellerIdentifier: '04595252', encryption: 'ydXZt4LAN1UHN/j1juVcRA==',
});
const left = `${prefix}:**********:3:3:1:乾電池:1:105:`;
const right = '**口罩:1:210:牛奶:1:25';
const invoice = parseInvoiceQr(left, right, { barcode: '11508AB112233449999' });
console.log(invoice.items[0]); // { name: '乾電池', quantity: 1, unitPrice: 105 }
const result = safeParseInvoiceQr(left, right);
if (!result.success) console.error(result.errors);

console.log(getDrawDate(barcode.period)); // '2026-09-25'
console.log(getClaimPeriod(barcode.period));
// { startDate: '2026-10-06', endDate: '2027-01-05' }
console.log(checkPrize(invoice.invoiceNumber, { first: ['11223344'] }));
// { prize: 'first', nameZh: '頭獎', amount: 200000, matched: '11223344' }
```

The prefix example is synthetic. The caller supplies encryption; the builder does not encrypt or authenticate it.

### CommonJS example

```js
const { parseBarcode, getDrawDate } = require('@hsuan741220/tw-einvoice-qr');
console.log(getDrawDate(parseBarcode('11508AB112233449999').period));
// '2026-09-25'
```

### API reference

| Function | Result and behavior |
| --- | --- |
| `parseBarcode(code39String)` | `ParsedBarcode`: `{ period, invoiceNumber, track, number, randomCode }`. Requires exactly 19 payload characters without framing asterisks. |
| `parseLeftQr(str)` | `ParsedLeftQr`: fixed fields, metadata, available complete items, and a completeness flag. Missing continuation data is allowed. |
| `parseRightQr(str)` | `{ itemData }`: requires and removes `**`, preserving the remaining text verbatim. |
| `parseInvoiceQr(left, right?, options?)` | `ParsedInvoiceQr`: concatenates raw continuations before decoding and requires all declared QR items. Optional `{ barcode }` accepts a string or `ParsedBarcode` and cross-checks period, number, and random code. |
| `safeParseBarcode` / `safeParseLeftQr` / `safeParseRightQr` / `safeParseInvoiceQr` | Same arguments and behavior as the corresponding parser, returning `SafeParseResult<T>`. |
| `validateInvoice(invoice, barcode)` | `ValidationIssue[]`: cross-field discrepancies; barcode may be raw or a `ParsedBarcode`. Invalid inputs, including malformed parsed barcode fields, are reported as issues. |
| `isValidBusinessNumber(value)` | `boolean`: eight-digit syntax and the 2023 divisor-5 checksum, including the seventh-digit-7 exception. The all-zero sentinel is excluded. |
| `getPeriod(date)` | `{ rocYear, year, startMonth, endMonth }`: two-month invoice period. |
| `isPeriodMatch(date, period)` | `boolean`: compare date and period. Invalid inputs throw. |
| `getDrawDate(period)` | ISO date of the following odd month's 25th. |
| `getClaimPeriod(period)` | Inclusive `{ startDate, endDate }` nominal calendar window. |
| `checkPrize(invoiceNumberOr8Digits, winning)` | Highest single `PrizeResult`, described below. |
| `buildLeftQrPrefix(fields)` | Validated 77-character fixture prefix; supplied encryption is preserved. |

All public interfaces and unions are available as named TypeScript type exports and have JSDoc. `InvoiceParseError` is a runtime export.

### Barcode periods and dates

The first five barcode characters contain a three-digit ROC year and the **even ending month**, followed by a ten-character invoice number (two uppercase ASCII letters plus eight digits) and four random digits. `10404` means March–April 2015; `11406` means May–June 2025. Supported ROC years are 001–999. `track`, `number`, and `randomCode` retain leading zeroes.

`getPeriod` and `isPeriodMatch` accept a strict `YYYY-MM-DD` string or a `Date`. Dates use **UTC calendar fields**; pass a calendar string for a Taiwan local invoice date. Leap years and actual month lengths are validated. Period arguments accept an `InvoicePeriod`, a five-character ROC period code, or a full 19-character barcode. `isPeriodMatch` takes `(date, period)`. Date outputs are ISO calendar strings without timezone conversions.

### QR fields and continuations

The fixed prefix is 77 characters: invoice number (10), ROC date (7), random code (4), sales amount (8 hex), total (8 hex), buyer identifier (8), seller identifier (8), encryption (24 Base64).

The result includes `invoiceNumber`, `track`, `number`, ISO `date`, raw `rocDate`, `randomCode`, `salesAmount`, `salesAmountSeparated`, `totalAmount`, `buyerIdentifier`, `sellerIdentifier`, and `encryption`. Buyer `00000000` becomes `null`; other buyer and all seller identifiers must pass checksum validation. Four random-code spaces become `null` for business buyers only. Four numeric random digits are also accepted for B2B.

Sales `00000000` becomes `salesAmount: null` and `salesAmountSeparated: false`: the field cannot distinguish actual zero sales from tax not being separated. Domestic business-buyer invoices must state sales separately. Domestic totals must be positive and at least sales. Encryption must be canonical Base64 representing 16 bytes and is preserved without AES verification.

The suffix is `:businessUse:itemCount:totalItemCount:encodingParameter:itemData`. `businessUse` has ten characters; `**********` becomes `null`. `itemCount` counts complete items across **both QR codes**, while `totalItemCount` may include additional invoice items omitted from the QR. Counts are item entries, not the sum of quantities.

Each item is `{ name, quantity, unitPrice }`. Names retain spaces. Quantities and prices accept finite signed decimals in the safe numeric range, including fractional quantities and discount prices; exponent notation and whitespace are rejected. Extra fields after the declared item triplets become `supplementalNotes` with their colons and newlines preserved.

| Parameter | Exposed encoding | Interpretation |
| --- | --- | --- |
| 0 | `Big5` | Scanner text is already decoded; preserve it unchanged. |
| 1 | `UTF-8` | Preserve scanner text. |
| 2 | `Base64` | Concatenate the full Base64 payload, decode UTF-8, then split item fields, as in the official example. Independently encoded names are also supported for compatibility. |
| 3 | `UTF-8-overseas` | Overseas e-commerce format with two extended amount fields before items. |

`parseLeftQr` returns `isComplete`, raw `itemData`, and an unparsed `pendingItemData` remainder. Nonempty encoding-2 data without a raw colon is ambiguous between whole-payload and name-only Base64, so it stays incomplete with the raw fragment in `pendingItemData`. Other remainders are decoded. A split within a price can make the left fragment look complete; always provide any scanned right QR to `parseInvoiceQr`. That function recomputes the result from the concatenated raw payload and never inserts colons. Splits inside names, decimal values, Base64 quartets, and UTF-8 bytes are supported. Standalone right QR data cannot be interpreted into items without left metadata.

For an official-layout Base64 example using the prefix above:

```js
const decoded = parseInvoiceQr(
  `${prefix}:**********:3:3:2:5Lm+6Zu75rGg`,
  '**OjE6MTA1OuWPo+e9qToxOjIxMDrniZvlpbY6MToyNQ==',
);
console.log(decoded.items[0].name); // '乾電池'
```

### Overseas e-commerce

Parameter 3 requires both fixed amounts to be zero and the buyer to be a consumer. The encoding parameter is followed by ten-character sales and total fields, then item triplets. Extended sales must be `0000000000`. For the total, the first eight hex digits encode the integer part and the final two independently encode hundredths (00–63 hex, or 0–99 decimal). `0000016B63` therefore means 363.99.

The result has `variant: 'overseas'`, effective `totalAmount`, `prefixTotalAmount: 0`, and `overseasAmounts: { salesAmount: null, totalAmount, salesAmountHex, totalAmountHex }`. No currency is inferred because the format has no currency field. Domestic results have `variant: 'domestic'` and `overseasAmounts: null`.

### Error handling

`SafeParseResult<T>` is `{ success: true, data: T } | { success: false, errors: { code, message }[] }`. Data validation errors from `parse*` throw `InvoiceParseError` with `code` and `errors`. Most parsing stops at the first failure; barcode cross-checks can report all three discrepancies together. English messages explain the failure; use stable codes for program logic.

```ts
import { safeParseBarcode, parseBarcode, InvoiceParseError } from '@hsuan741220/tw-einvoice-qr';
const result = safeParseBarcode('invalid');
if (!result.success) console.log(result.errors[0]?.code); // INVALID_BARCODE
try { parseBarcode('invalid'); }
catch (error) {
  if (error instanceof InvoiceParseError) console.log(error.errors);
}
```

Validation codes are `INVALID_INPUT`, `INVALID_BARCODE`, `INVALID_PERIOD`, `INVALID_INVOICE_NUMBER`, `INVALID_DATE`, `INVALID_RANDOM_CODE`, `INVALID_AMOUNT`, `TOTAL_BELOW_SALES`, `INVALID_BUSINESS_NUMBER`, `INVALID_ENCRYPTION`, `INVALID_QR_PREFIX`, `INVALID_QR_METADATA`, `INVALID_ITEM_COUNT`, `INVALID_ENCODING`, `INVALID_BASE64`, `INVALID_ITEM`, `INCOMPLETE_ITEMS`, `INVALID_RIGHT_QR`, `INVALID_OVERSEAS_AMOUNT`, and `INVALID_WINNING_NUMBER`. Cross-check codes are `PERIOD_MISMATCH`, `INVOICE_NUMBER_MISMATCH`, and `RANDOM_CODE_MISMATCH`. B2B null random codes skip that comparison. QR-only parsing has no barcode period to cross-check. All codes are available in the exported `InvoiceErrorCode` union.

### Lottery and calendar helpers

`winning` is `{ special?: string, grand?: string, first: string[], additionalSixth?: string[] }`. Standard winning numbers have eight digits; optional extra sixth-prize numbers have three. Strings preserve leading zeroes. Provide numbers from the correct invoice period.

`checkPrize` accepts an eight-digit number or full invoice number and returns `{ prize, nameZh, amount, matched }`. It returns the highest single prize: `special` (特別獎, TWD 10,000,000), `grand` (特獎, 2,000,000), `first` (頭獎, 200,000), `second` (二獎, 40,000), `third` (三獎, 10,000), `fourth` (四獎, 4,000), `fifth` (五獎, 1,000), `sixth` (六獎, 200), `additionalSixth` (增開六獎, 200), or `none` (未中獎, 0).

Special, grand, and first require eight-digit equality. Second through sixth match the last 7/6/5/4/3 digits of any **first-prize** winning number. Extra sixth prizes match their three digits. Special and grand numbers do not produce suffix prizes. Ordinary sixth wins ties with additional sixth. `matched` is the originating winning number, including all eight digits for suffix prizes, or `null` for no match.

Rules were checked on **2026-10-17**. July–August is drawn September 25; November–December is drawn January 25 of the next year. Claims start on the 6th of the month after drawing and last three months: July–August 2026 yields `2026-10-06` through `2027-01-05`, inclusive. These are nominal calendar dates; holiday deadline extensions, special announcements, and business hours are not applied.

### Fixture prefix builder

All `LeftQrPrefixFields` are required: `invoiceNumber`, ISO `date`, `randomCode`, `salesAmount`, `totalAmount`, `buyerIdentifier`, `sellerIdentifier`, and `encryption`. Sales may be `null` or zero; a null buyer means consumer; null random code generates four spaces for B2B. Amounts must be integers from 0 through 4294967295. Zero total is allowed by the builder for overseas fixtures; domestic QR parsing still requires a positive total. The builder validates fields, preserves supplied encryption, and creates no image, AES ciphertext, or legally issued invoice.

### Limitations

- Input is scanner-decoded text; camera scanning, image decoding, and raw Big5 byte decoding are outside scope.
- No AES authentication, invoice registration lookup, issued-business-number lookup, track allocation check, line-item sum, or tax calculation validation is performed.
- Colons are delimiters; invalid names containing them cannot be recovered. Prize checks do not establish redemption eligibility, cancellation status, tax withholding, or cloud-only prizes.
- Decimal amounts use JavaScript numbers and can have floating-point rounding; use a suitable decimal or integer-cent representation for accounting.
- Browser runtimes need `atob`, `btoa`, and `TextDecoder`. Runtime code does not use Node `Buffer`.

### Sources and licensing

- [Ministry of Finance electronic invoice barcode specification v1.9, 2022-05-10](https://www.einvoice.nat.gov.tw/static/ptl/ein_upload/download/20.pdf): barcode layout, fixed fields, QR continuations, Base64 examples, B2B blank random codes, and overseas format.
- [Fiscal Information Agency checksum revision](https://www.fia.gov.tw/singlehtml/3?cntId=c4d9cff38c8642ef8872774ee9987283) and [new-number examples](https://www.fia.gov.tw/singlehtml/3?cntId=4246ca18578e45deaa884285d6863d41): the 2023 divisor-5 rule.
- [Uniform Invoice Award Regulations, articles 3 and 8](https://law-out.mof.gov.tw/LawContent.aspx?id=FL006085) and [official winning-number and claim-window announcements](https://invoice.etax.nat.gov.tw/), checked 2026-10-17.

Code is [MIT licensed](./LICENSE), Copyright (c) 2026 neohsuan. Official documents and announcements retain their source-specific rights and terms. This package contains an independent implementation and synthetic fixtures, without a copy of the official specification. Illustrative business numbers in official QR examples may fail checksums; the tests use valid replacement identifiers.

### Related projects

- [tw-utils](https://github.com/neohsuan/tw-utils): Taiwan identifier and date utilities.
- [tw-holidays](https://github.com/neohsuan/tw-holidays): Taiwan holiday utilities.
- [tw-address](https://github.com/neohsuan/tw-address): Taiwan address utilities.

### Development

```sh
npm ci
npm run typecheck
npm test
npm run attw
```

Tests cover realistic synthetic fixtures, every payload split position, all domestic encodings, overseas amounts, checksum exceptions, dates, lottery tiers, malformed inputs, and native Node import/require self-references. CI runs Node 20.x and 22.x. See [CONTRIBUTING.md](./CONTRIBUTING.md).
