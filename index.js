require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const axios = require("axios");
const express = require("express");

const API_URL = "https://jamuanggerwaras.com/lord/api";
const app = express();

let qrImage = "";
let isReady = false;

// =======================
// WHITELIST
// =======================
const USERS = [
  { name: "Bapakku", numbers: ["17867468840", "112786294226994"] },
  { name: "Ibu Sari", numbers: ["6282142570378"] },
  { name: "Bapak Adi", numbers: ["10600096755791"] },
];

const greetedUsers = {};

// =======================
// HELPER
// =======================
const formatRupiah = (v) =>
  Number(v || 0).toLocaleString("id-ID");

const getDate = (d) =>
  d.toISOString().split("T")[0];

const getUser = (sender) =>
  USERS.find((u) => u.numbers.includes(sender));

const getStatus = (stock) => {
  if (stock <= 10) return "❌ Kritis";
  if (stock <= 50) return "⚠️ Hampir habis";
  if (stock <= 100) return "🟡 Perlu perhatian";
  return "✅ Aman";
};

const formatVarian = (data, limit = 5) => {
  if (!data || data.length === 0) return "Tidak ada data";

  return data
    .slice(0, limit)
    .map((v, i) => {
      const stock = Number(v.stok_sekarang || 0);
      return `${i + 1}. ${v.product}
→ Terjual: ${v.total_terjual || v.total_qty} pcs
→ Omzet: Rp${formatRupiah(v.total_omzet)}
→ Stok: ${stock} (${getStatus(stock)})`;
    })
    .join("\n\n");
};

// =======================
// WHATSAPP CLIENT (RAILWAY SAFE)
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});

// =======================
// QR
// =======================
client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
  console.log("QR siap - buka web Railway kamu");
});

client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp siap!");
});

// =======================
// WEB (UNTUK QR)
// =======================
app.get("/", (req, res) => {
  if (isReady) {
    return res.send("<h2>✅ WhatsApp Connected</h2>");
  }

  if (!qrImage) {
    return res.send("<h2>Menunggu QR...</h2>");
  }

  res.send(`<h2>Scan QR</h2><img src="${qrImage}" />`);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server jalan di port:", PORT);
});

// =======================
// BOT
// =======================
client.on("message", async (msg) => {
  try {
    const contact = await msg.getContact();
    const sender = contact.number;

    const user = getUser(sender);
    if (!user) return;

    let greeting = "";
    if (!greetedUsers[user.name]) {
      greeting = `Halo ${user.name} 👋\n\n`;
      greetedUsers[user.name] = true;
    }

    const text = msg.body.trim().toLowerCase();

    const now = new Date();
    const today = getDate(now);

    const startWeek = new Date(now);
    const day = now.getDay() || 7;
    if (day !== 1) startWeek.setHours(-24 * (day - 1));
    const weekStart = getDate(startWeek);

    const monthStart = getDate(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );

    // =======================
    // CUSTOM RANGE
    // =======================
    const range = text.match(
      /laporan\s+(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/
    );

    if (range) {
      const start = range[1];
      const end = range[2];

      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${start}&end=${end}`),
        axios.get(`${API_URL}/total_items_month.php?start=${start}&end=${end}`),
        axios.get(`${API_URL}/variant_sales.php?start=${start}&end=${end}`),
      ]);

      return msg.reply(
        greeting +
          `📊 ${start} s/d ${end}\n\n` +
          `💰 Rp${formatRupiah(sales.data.total)}\n` +
          `📦 ${pcs.data.total_pcs} pcs\n\n` +
          formatVarian(variants.data, 10)
      );
    }

    // =======================
    // HARIAN
    // =======================
    if (text === "laporan harian") {
      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${today}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${today}&end=${today}`),
        axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`),
      ]);

      return msg.reply(
        greeting +
          `📅 LAPORAN HARI INI\n\n` +
          `💰 Rp${formatRupiah(sales.data.total)}\n` +
          `📦 ${pcs.data.total_pcs} pcs\n\n` +
          formatVarian(variants.data)
      );
    }

    // =======================
    // MINGGUAN
    // =======================
    if (text === "laporan mingguan") {
      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${weekStart}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${weekStart}&end=${today}`),
        axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`),
      ]);

      return msg.reply(
        greeting +
          `📊 LAPORAN MINGGU INI\n\n` +
          `💰 Rp${formatRupiah(sales.data.total)}\n` +
          `📦 ${pcs.data.total_pcs} pcs\n\n` +
          formatVarian(variants.data)
      );
    }

    // =======================
    // BULANAN
    // =======================
    if (text === "laporan bulanan") {
      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${monthStart}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${monthStart}&end=${today}`),
        axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`),
      ]);

      return msg.reply(
        greeting +
          `📆 LAPORAN BULAN INI\n\n` +
          `💰 Rp${formatRupiah(sales.data.total)}\n` +
          `📦 ${pcs.data.total_pcs} pcs\n\n` +
          formatVarian(variants.data, 10)
      );
    }

    return msg.reply(
      greeting +
        `Perintah:\n
- laporan harian
- laporan mingguan
- laporan bulanan
- laporan YYYY-MM-DD YYYY-MM-DD`
    );
  } catch (err) {
    console.error(err);
    msg.reply("Terjadi error 🙏");
  }
});

client.initialize();
