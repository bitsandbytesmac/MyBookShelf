import { chromium } from "playwright"; import fs from "fs";
const uri = "data:image/svg+xml," + encodeURIComponent(fs.readFileSync(process.argv[2], "utf8"));
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 420, height: 220 } });
await p.setContent(`<body style="margin:0;background:#f4efe4;display:flex;gap:20px;padding:20px">
<img src="${uri}" width="180">
<div style="width:180px;height:180px;background:#5f7348;opacity:.3;-webkit-mask:url('${uri}') center/contain no-repeat"></div></body>`);
await p.waitForTimeout(300); await p.screenshot({ path: process.argv[3] }); await b.close();
