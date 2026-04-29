require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const axios = require("axios");
const express = require("express");
const cron = require("node-cron");

const API_URL = "https://jamuanggerwaras.com/lord/api";
const app = express();

let qrImage = "";
let isReady = false;

// =======================
// USER
// =======================
const USERS = [
    {
    name: "Bapakku",
    numbers: ["17867468840", "112786294226994", "112786294226994@lid"],
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

// =======================
// HELPER
// =======================
const formatRupiah = (v) =>
  Number(v || 0).toLocaleString("id-ID");

const getDate = (d) =>
  new Date(d).toISOString().split("T")[0];

const getStatus = (stock) => {
  if (stock <= 10) return "❌ Kritis";
  if (stock <= 50) return "⚠️ Menipis";
  if (stock <= 100) return "🟡 Perlu perhatian";
  return "✅ Aman";
};

const sendToAll = async (text) => {
  for (const u of USERS) {
    for (const n of u.numbers) {
      const id = n.includes("@") ? n : n + "@c.us";
      await client.sendMessage(id, text).catch(() => {});
    }
  }
};

// =======================
// WHATSAPP
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// =======================
// QR
// =======================
client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
});

client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp siap!");
});

// =======================
// WEB
// =======================
app.get("/", (req, res) => {
  if (isReady) return res.send("✅ Connected");
  if (!qrImage) return res.send("Menunggu QR...");
  res.send(`<img src="${qrImage}" />`);
});

// API dashboard
app.get("/api/data", async (req, res) => {
  const today = getDate(new Date());
  const { data } = await axios.get(
    `${API_URL}/variant_sales.php?start=${today}&end=${today}`
  );
  res.json(data);
});

// dashboard web
app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <head>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  </head>
  <body>
    <h2>📊 Dashboard Penjualan</h2>
    <canvas id="chart"></canvas>

    <script>
      async function load(){
        const res = await fetch('/api/data');
        const data = await res.json();

        new Chart(document.getElementById('chart'), {
          type:'bar',
          data:{
            labels: data.map(d=>d.product),
            datasets:[{
              label:'Qty Terjual',
              data: data.map(d=>Number(d.total_terjual))
            }]
          }
        });
      }
      load();
    </script>
  </body>
  </html>
  `);
});

app.listen(process.env.PORT || 3000);

// =======================
// BOT
// =======================
client.on("message", async (msg) => {
  try {
    let sender = msg.from;
    if (msg.from.includes("@g.us")) sender = msg.author;

    sender = sender.replace("@c.us", "").replace("@lid", "");

    if (!USERS.some(u => u.numbers.includes(sender))) return;

    const text = msg.body.toLowerCase();

    const now = new Date();
    const today = getDate(now);

    const weekStart = getDate(new Date(Date.now() - 7 * 86400000));
    const monthStart = getDate(new Date(now.getFullYear(), now.getMonth(), 1));

    // =======================
    // CEK STOK
    // =======================
    if (text === "stok") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${today}&end=${today}`
      );

      const result = data.map(v =>
        `${v.product} → ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`
      ).join("\n");

      return msg.reply("📦 STOK\n\n" + result);
    }

    // =======================
    // HARIAN (DETAIL)
    // =======================
    if (text === "laporan harian") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${today}&end=${today}`
      );

      const result = data.map(v =>
        `${v.product}
Qty: ${v.total_terjual}
Rp: ${formatRupiah(v.total_omzet)}`
      ).join("\n\n");

      return msg.reply("📅 HARIAN\n\n" + result);
    }

    // =======================
    // MINGGUAN
    // =======================
    if (text === "laporan mingguan") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`
      );

      const result = data.map(v =>
        `${v.product}
Qty: ${v.total_terjual}
Rp: ${formatRupiah(v.total_omzet)}`
      ).join("\n\n");

      return msg.reply("📊 MINGGUAN\n\n" + result);
    }

    // =======================
    // BULANAN + STOK
    // =======================
    if (text === "laporan bulanan") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`
      );

      const result = data.map(v =>
        `${v.product}
Qty: ${v.total_terjual}
Rp: ${formatRupiah(v.total_omzet)}
Stok: ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`
      ).join("\n\n");

      return msg.reply("📆 BULANAN\n\n" + result);
    }

    // =======================
    // PREDIKSI RESTOCK
    // =======================
    if (text === "prediksi stok") {
      const start = getDate(new Date(Date.now() - 7 * 86400000));

      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${start}&end=${today}`
      );

      const result = data.map(v => {
        const avg = v.total_terjual / 7 || 1;
        const days = Math.floor(v.stok_sekarang / avg);

        return `${v.product}
Stok: ${v.stok_sekarang}
⚠️ Pesan dalam: ${days} hari`;
      }).join("\n\n");

      return msg.reply("📉 PREDIKSI\n\n" + result);
    }

    msg.reply("Perintah: laporan harian | mingguan | bulanan | stok | prediksi stok");

  } catch (err) {
    console.error(err);
    msg.reply("Error 🙏");
  }
});

// =======================
// AUTO REPORT JAM 09
// =======================
cron.schedule("0 18 * * *", async () => {
  console.log("AUTO REPORT 18:00 WIB");

  const today = getDate(new Date());

  try {
    const { data } = await axios.get(
      `${API_URL}/variant_sales.php?start=${today}&end=${today}`
    );

    const result = data.slice(0, 5).map(v =>
      `${v.product} → ${v.total_terjual} pcs (Rp${formatRupiah(v.total_omzet)})`
    ).join("\n");

    await sendToAll(
      `📅 *AUTO REPORT HARIAN (18:00)*\n\n` +
      result
    );

  } catch (err) {
    console.error("ERROR AUTO REPORT:", err.message);
  }
}, {
  timezone: "Asia/Jakarta"
});
// =======================
// ALERT STOK
// =======================
cron.schedule("0 11 * * 3", async () => {
  console.log("JALAN ALERT STOK RABU 11 SIANG");

  const today = getDate(new Date());

  try {
    const { data } = await axios.get(
      `${API_URL}/variant_sales.php?start=${today}&end=${today}`
    );

    const kritis = data.filter(v => Number(v.stok_sekarang) <= 50);

    if (!kritis.length) return;

    await sendToAll(
      "🚨 *ALERT STOK RABU*\n\n" +
      kritis.map(v => `${v.product} (${v.stok_sekarang})`).join("\n")
    );

  } catch (err) {
    console.error("ERROR ALERT:", err.message);
  }
});

// =======================
client.initialize();
