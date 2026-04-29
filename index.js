require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const axios = require("axios");
const express = require("express");
const https = require("https");

const app = express();
const API_URL = "https://jamuanggerwaras.com/lord/api";

let qrImage = "";
let isReady = false;

// =======================
// MONITORING
// =======================
let botState = {
  status: "STARTING",
  startTime: Date.now(),
  lastReadyTime: Date.now(),
  totalMessages: 0,
  lastMessage: null,
};

let hasNotifiedOnline = false;
let hasSentDownAlert = false;

// =======================
// WHITELIST
// =======================
const USERS = [
  {
    name: "Bapakku",
    numbers: ["17867468840", "17867468840@lid", "112786294226994", "112786294226994@lid"],
  },
  {
    name: "Ibu Sari",
    numbers: ["6282142570378", "205419830055064", "205419830055064@lid"],
  },
];

// =======================
// HELPER
// =======================
const normalizeNumber = (num) =>
  num.replace("@c.us", "").replace("@lid", "");

const formatRupiah = (v) =>
  Number(v || 0).toLocaleString("id-ID");

const getDate = (d) =>
  new Date(d).toISOString().split("T")[0];

const sendToAll = async (text) => {
  for (const u of USERS) {
    for (const n of u.numbers) {
      const id = n.includes("@") ? n : n + "@c.us";
      await client.sendMessage(id, text).catch(() => {});
    }
  }
};

const sendToBapakku = async (text) => {
  const bapak = USERS.find(u => u.name === "Bapakku");
  if (!bapak) return;

  for (const n of bapak.numbers) {
    const id = n.includes("@") ? n : n + "@c.us";
    await client.sendMessage(id, text).catch(() => {});
  }
};

// =======================
// WHATSAPP
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox"],
  },
});

const startClient = () => {
  console.log("🚀 Starting WA...");
  client.initialize();
};

client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
});

client.on("ready", async () => {
  isReady = true;
  botState.status = "READY";
  botState.startTime = Date.now();
  botState.lastReadyTime = Date.now();

  console.log("✅ WhatsApp READY");

  if (!hasNotifiedOnline) {
    await sendToAll("✅ Bot ONLINE");
    hasNotifiedOnline = true;
  }

  hasSentDownAlert = false;
});

client.on("disconnected", () => {
  isReady = false;
  botState.status = "DISCONNECTED";
  setTimeout(startClient, 5000);
});

// =======================
// WEB
// =======================
app.get("/", (req, res) => {
  if (isReady) return res.send("✅ Connected");
  if (!qrImage) return res.send("Scan QR...");
  res.send(`<img src="${qrImage}" />`);
});

app.get("/status", (req, res) => {
  res.json(botState);
});

// =======================
// ANALYTICS API
// =======================
app.get("/analytics", async (req, res) => {
  try {
    const now = new Date();

    const today = getDate(now);
    const week = getDate(new Date(Date.now() - 7 * 86400000));
    const month = getDate(new Date(now.getFullYear(), now.getMonth(), 1));

    const daily = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
    const weekly = await axios.get(`${API_URL}/variant_sales.php?start=${week}&end=${today}`);
    const monthly = await axios.get(`${API_URL}/variant_sales.php?start=${month}&end=${today}`);

    res.json({
      daily: daily.data,
      weekly: weekly.data,
      monthly: monthly.data
    });

  } catch {
    res.json({ daily: [], weekly: [], monthly: [] });
  }
});

// =======================
// DASHBOARD
// =======================
app.get("/monitor", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
body{background:#0f172a;color:#fff;font-family:Arial;padding:20px}
canvas{background:#1e293b;border-radius:10px;padding:10px}
</style>
</head>
<body>

<h2>📊 Dashboard</h2>
<div id="status"></div>

<h3>Harian</h3><canvas id="d"></canvas>
<h3>Mingguan</h3><canvas id="w"></canvas>
<h3>Bulanan</h3><canvas id="m"></canvas>

<script>
let charts={};

function draw(id, labels, data){
  if(!charts[id]){
    charts[id]=new Chart(document.getElementById(id),{
      type:'bar',
      data:{labels:labels,datasets:[{data:data}]}
    });
  }else{
    charts[id].data.labels=labels;
    charts[id].data.datasets[0].data=data;
    charts[id].update();
  }
}

async function load(){
  const s=await fetch('/status').then(r=>r.json());
  document.getElementById('status').innerHTML =
    (s.status==='READY'?'🟢 ONLINE':'🔴 OFFLINE')+" | Msg:"+s.totalMessages;

  const a=await fetch('/analytics').then(r=>r.json());

  draw("d",a.daily.map(x=>x.product),a.daily.map(x=>Number(x.total_terjual)));
  draw("w",a.weekly.map(x=>x.product),a.weekly.map(x=>Number(x.total_terjual)));
  draw("m",a.monthly.map(x=>x.product),a.monthly.map(x=>Number(x.total_terjual)));
}

setInterval(load,5000); load();
</script>

</body>
</html>
  `);
});

// =======================
// BOT MESSAGE (FIXED)
// =======================
client.on("message", async (msg) => {
  try {
    botState.totalMessages++;
    botState.lastMessage = new Date().toLocaleString("id-ID");

    let sender = msg.from;
    if (msg.from.includes("@g.us")) sender = msg.author;
    sender = normalizeNumber(sender);

    const isAllowed = USERS.some(u =>
      u.numbers.some(n => normalizeNumber(n) === sender)
    );

    if (!isAllowed) return;

    const text = msg.body.toLowerCase().trim();

    const now = new Date();
    const today = getDate(now);
    const weekStart = getDate(new Date(Date.now() - 7 * 86400000));
    const monthStart = getDate(new Date(now.getFullYear(), now.getMonth(), 1));

    // MENU
    if (text === "menu" || text === "0") {
      return msg.reply(
`📊 MENU
1️⃣ Harian
2️⃣ Mingguan
3️⃣ Bulanan
4️⃣ Stok
5️⃣ Prediksi
6️⃣ Rentang`
      );
    }

    // OPSI
    if (text === "1") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
      return msg.reply("📅 HARIAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

    if (text === "2") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
      return msg.reply("📊 MINGGUAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

    if (text === "3") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`);
      return msg.reply("📆 BULANAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

    if (text === "4") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
      return msg.reply("📦 STOK\n\n" + data.map(v => `${v.product} ${v.stok_sekarang}`).join("\n"));
    }

    if (text === "5") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
      return msg.reply("📉 PREDIKSI\n\n" + data.map(v => v.product).join("\n"));
    }

    if (text === "6") {
      return msg.reply("📅 Format: YYYY-MM-DD YYYY-MM-DD");
    }

    // RANGE
    const m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${m[1]}&end=${m[2]}`
      );

      return msg.reply("📊 LAPORAN\n\n" +
        data.map(v => `${v.product} ${v.total_terjual}`).join("\n")
      );
    }

  } catch (err) {
    console.log(err);
    msg.reply("❌ Error");
  }
});

// =======================
// SMART MONITORING
// =======================
setInterval(async () => {
  const now = Date.now();

  if (!isReady && (now - botState.lastReadyTime > 30 * 60 * 1000)) {
    if (!hasSentDownAlert) {
      await sendToBapakku("🚨 Bot mati >30 menit");
      hasSentDownAlert = true;
    }
  }

}, 10 * 60 * 1000);

// =======================
// AUTO PING
// =======================
setInterval(() => {
  if (process.env.APP_URL) {
    https.get(process.env.APP_URL);
  }
}, 30 * 60 * 1000);

// =======================
app.listen(process.env.PORT || 3000);
startClient();
