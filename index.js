require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const axios = require("axios");
const express = require("express");
const cron = require("node-cron");
const https = require("https");

const API_URL = "https://jamuanggerwaras.com/lord/api";
const app = express();

let qrImage = "";
let isReady = false;

// =======================
// MONITORING STATE
// =======================
let botState = {
  status: "STARTING",
  startTime: Date.now(),
  lastReadyTime: Date.now(),
  totalMessages: 0,
  lastMessage: null,
};

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
  {
    name: "Bapak Adi",
    numbers: ["10600096755791", "10600096755791@lid"],
  },
];

const userState = {};

// =======================
// HELPER
// =======================
const normalizeNumber = (num) =>
  num.replace("@c.us", "").replace("@lid", "");

const formatRupiah = (v) =>
  Number(v || 0).toLocaleString("id-ID");

const getDate = (d) =>
  new Date(d).toISOString().split("T")[0];

const getStatus = (stock) => {
  if (stock <= 10) return "❌ Kritis";
  if (stock <= 50) return "⚠️ Menipis";
  if (stock <= 100) return "🟡 Perhatian";
  return "✅ Aman";
};

// kirim ke semua user
const sendToAll = async (text) => {
  for (const u of USERS) {
    for (const n of u.numbers) {
      const id = n.includes("@") ? n : n + "@c.us";
      await client.sendMessage(id, text).catch(() => {});
    }
  }
};

// kirim khusus ke Bapakku
const sendToBapakku = async (text) => {
  const bapak = USERS.find(u => u.name === "Bapakku");
  if (!bapak) return;

  for (const n of bapak.numbers) {
    const id = n.includes("@") ? n : n + "@c.us";
    await client.sendMessage(id, text).catch(() => {});
  }
};

// =======================
// WHATSAPP CLIENT
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// START / RECONNECT
const startClient = () => {
  console.log("🚀 Starting WhatsApp...");
  client.initialize();
};

// EVENT
client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
});

client.on("ready", () => {
  isReady = true;
  botState.status = "READY";
  botState.startTime = Date.now();
  botState.lastReadyTime = Date.now();

  console.log("✅ WhatsApp siap!");
  sendToAll("✅ Bot ONLINE");
});

client.on("disconnected", (reason) => {
  isReady = false;
  botState.status = "DISCONNECTED";

  console.log("❌ Disconnected:", reason);

  setTimeout(() => startClient(), 5000);
});

client.on("auth_failure", (msg) => {
  console.log("❌ AUTH FAILURE:", msg);
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

app.listen(process.env.PORT || 3000);

// =======================
// COMMAND HANDLER
// =======================
async function handleCommand(text, msg) {
  const now = new Date();
  const today = getDate(now);
  const weekStart = getDate(new Date(Date.now() - 7 * 86400000));
  const monthStart = getDate(new Date(now.getFullYear(), now.getMonth(), 1));

  if (text === "stok") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
    return msg.reply(
      "📦 *STOK*\n\n" +
      data.map(v => `• ${v.product} → ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`).join("\n")
    );
  }

  if (text === "laporan harian") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
    return msg.reply(
      "📅 *HARIAN*\n\n" +
      data.map(v => `${v.product} → ${v.total_terjual} pcs (Rp${formatRupiah(v.total_omzet)})`).join("\n")
    );
  }

  if (text === "laporan mingguan") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
    return msg.reply(
      "📊 *MINGGUAN*\n\n" +
      data.map(v => `${v.product} → ${v.total_terjual} pcs (Rp${formatRupiah(v.total_omzet)})`).join("\n")
    );
  }

  if (text === "laporan bulanan") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`);

    let totalQty = 0, totalOmzet = 0;
    data.forEach(v => {
      totalQty += Number(v.total_terjual);
      totalOmzet += Number(v.total_omzet);
    });

    return msg.reply(
`📆 *BULANAN*
💰 Rp${formatRupiah(totalOmzet)}
📦 ${totalQty}

` +
data.map(v =>
`• ${v.product}
  📦 ${v.total_terjual}
  💰 Rp${formatRupiah(v.total_omzet)}
  📊 ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`
).join("\n\n")
    );
  }

  if (text === "prediksi stok") {
    const start = getDate(new Date(Date.now() - 7 * 86400000));
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${start}&end=${today}`);

    return msg.reply(
      "📉 *PREDIKSI*\n\n" +
      data.map(v => {
        const avg = v.total_terjual / 7 || 1;
        return `${v.product} → order ${Math.floor(v.stok_sekarang / avg)} hari`;
      }).join("\n")
    );
  }
}

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
    const isNumber = ["1","2","3","4","5","6"].includes(text);

    if (text === "menu" || text === "0") {
      userState[sender] = "menu";
      return msg.reply(
`📊 *MENU*
1️⃣ Harian
2️⃣ Mingguan
3️⃣ Bulanan
4️⃣ Stok
5️⃣ Prediksi
6️⃣ Rentang`
      );
    }

    if (userState[sender] === "menu" || isNumber) {
      if (userState[sender]) delete userState[sender];

      switch (text) {
        case "1": return handleCommand("laporan harian", msg);
        case "2": return handleCommand("laporan mingguan", msg);
        case "3": return handleCommand("laporan bulanan", msg);
        case "4": return handleCommand("stok", msg);
        case "5": return handleCommand("prediksi stok", msg);
        case "6":
          userState[sender] = "range";
          return msg.reply("📅 Format: YYYY-MM-DD YYYY-MM-DD");
      }
    }

    if (userState[sender] === "range") {
      const m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
      if (!m) return msg.reply("❌ Format salah");

      delete userState[sender];

      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${m[1]}&end=${m[2]}`
      );

      return msg.reply(
        "📊 *LAPORAN*\n\n" +
        data.map(v =>
          `${v.product} → ${v.total_terjual} pcs (Rp${formatRupiah(v.total_omzet)})`
        ).join("\n")
      );
    }

  } catch (err) {
    console.error(err);
  }
});

// =======================
// SMART MONITORING
// =======================
setInterval(async () => {
  const now = Date.now();

  if (!isReady && (now - botState.lastReadyTime > 30 * 60 * 1000)) {
    console.log("🚨 BOT DOWN > 30 MENIT");
    await sendToBapakku("🚨 Bot mati lebih dari 30 menit!");
    botState.lastReadyTime = now;
  }

}, 10 * 60 * 1000);

// =======================
// AUTO PING (30 menit)
// =======================
const APP_URL = process.env.APP_URL;

setInterval(() => {
  if (!APP_URL) return;
  https.get(APP_URL, () => console.log("🔄 Ping OK"));
}, 30 * 60 * 1000);

// =======================
startClient();
