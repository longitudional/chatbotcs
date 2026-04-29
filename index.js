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
// STATE
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

  console.log("✅ READY");

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
// ANALYTICS
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
      monthly: monthly.data,
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
  <html>
  <body style="background:#111;color:#fff;font-family:Arial">
  <h2>📊 Dashboard</h2>
  <div id="status"></div>
  <script>
    setInterval(async ()=>{
      const s = await fetch('/status').then(r=>r.json());
      document.getElementById('status').innerText =
        (s.status==="READY"?"🟢":"🔴")+" Msg:"+s.totalMessages;
    },2000);
  </script>
  </body>
  </html>
  `);
});

// =======================
// BOT MESSAGE
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
      return msg.reply(`📊 MENU
1️⃣ Harian
2️⃣ Mingguan
3️⃣ Bulanan
4️⃣ Stok
5️⃣ Prediksi
6️⃣ Rentang`);
    }

    // HARIAN
    if (text === "1") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
      return msg.reply("📅 HARIAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

    // MINGGUAN
    if (text === "2") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
      return msg.reply("📊 MINGGUAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

    // BULANAN (FULL)
    if (text === "3") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`);

      let total = 0;
      let omzet = 0;

      const detail = data.map((v,i)=>{
        total += Number(v.total_terjual||0);
        omzet += Number(v.total_omzet||0);

        return `${i+1}️⃣ ${v.product}
📦 ${v.total_terjual}
💰 Rp${formatRupiah(v.total_omzet)}
📊 ${v.stok_sekarang}`;
      }).join("\n\n");

      return msg.reply(`📆 BULANAN

💰 Rp${formatRupiah(omzet)}
📦 ${total}

${detail}`);
    }

    // STOK
    if (text === "4") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
      return msg.reply("📦 STOK\n\n" + data.map(v => `${v.product} ${v.stok_sekarang}`).join("\n"));
    }

    // PREDIKSI
    if (text === "5") {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
      return msg.reply("📉 PREDIKSI\n\n" + data.map(v => v.product).join("\n"));
    }

    // RENTANG
    if (text === "6") {
      return msg.reply("📅 Format: YYYY-MM-DD YYYY-MM-DD");
    }

    const m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
    if (m) {
      const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${m[1]}&end=${m[2]}`);
      return msg.reply("📊 LAPORAN\n\n" + data.map(v => `${v.product} ${v.total_terjual}`).join("\n"));
    }

  } catch (err) {
    console.log(err);
    msg.reply("❌ Error");
  }
});

// =======================
// MONITORING
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
