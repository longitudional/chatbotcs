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
    numbers: ["6282142570378", "205419830055064@lid", "205419830055064"],
  },
  {
    name: "Bapak Adi",
    numbers: ["10600096755791", "10600096755791@lid", "10600096755791"],
  },
];

// =======================
// HELPER
// =======================
const formatRupiah = (v) =>
  Number(v || 0).toLocaleString("id-ID");

const getDate = (d) =>
  d.toISOString().split("T")[0];

const getStatus = (stock) => {
  if (stock <= 10) return "❌ Kritis";
  if (stock <= 50) return "⚠️ Menipis";
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

client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
});

client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp siap!");
});

// =======================
// WEB (QR + DASHBOARD)
// =======================
app.get("/", (req, res) => {
  if (isReady) return res.send("✅ Connected");
  if (!qrImage) return res.send("Menunggu QR...");
  res.send(`<img src="${qrImage}" />`);
});

// API data
app.get("/api/data", async (req, res) => {
  const today = getDate(new Date());
  const { data } = await axios.get(
    `${API_URL}/variant_sales.php?start=${today}&end=${today}`
  );
  res.json(data.slice(0, 10));
});

// DASHBOARD WEB
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

        const labels = data.map(d=>d.product);
        const values = data.map(d=>Number(d.total_terjual));

        new Chart(document.getElementById('chart'), {
          type:'bar',
          data:{
            labels,
            datasets:[{label:'Penjualan', data:values}]
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
  const sender = (await msg.getContact()).number;
  if (!USERS.some(u => u.numbers.includes(sender))) return;

  const text = msg.body.toLowerCase();
  const now = new Date();
  const today = getDate(now);

  const startWeek = getDate(new Date(now.setDate(now.getDate()-7)));
  const monthStart = getDate(new Date(now.getFullYear(), now.getMonth(),1));

  // =======================
  // LAPORAN HARIAN
  // =======================
  if (text === "laporan harian") {
    const [sales, pcs] = await Promise.all([
      axios.get(`${API_URL}/sales_range.php?start=${today}&end=${today}`),
      axios.get(`${API_URL}/total_items_month.php?start=${today}&end=${today}`)
    ]);

    return msg.reply(
      `📅 HARIAN\n💰 Rp${formatRupiah(sales.data.total)}\n📦 ${pcs.data.total_pcs}`
    );
  }

  // =======================
  // MINGGUAN
  // =======================
  if (text === "laporan mingguan") {
    const [sales, pcs] = await Promise.all([
      axios.get(`${API_URL}/sales_range.php?start=${startWeek}&end=${today}`),
      axios.get(`${API_URL}/total_items_month.php?start=${startWeek}&end=${today}`)
    ]);

    return msg.reply(
      `📊 MINGGUAN\n💰 Rp${formatRupiah(sales.data.total)}\n📦 ${pcs.data.total_pcs}`
    );
  }

  // =======================
  // BULANAN
  // =======================
  if (text === "laporan bulanan") {
    const [sales, pcs] = await Promise.all([
      axios.get(`${API_URL}/sales_range.php?start=${monthStart}&end=${today}`),
      axios.get(`${API_URL}/total_items_month.php?start=${monthStart}&end=${today}`)
    ]);

    return msg.reply(
      `📆 BULANAN\n💰 Rp${formatRupiah(sales.data.total)}\n📦 ${pcs.data.total_pcs}`
    );
  }

  // =======================
  // PREDIKSI RESTOCK
  // =======================
  if (text === "prediksi stok") {
    const start = getDate(new Date(Date.now()-7*86400000));
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${start}&end=${today}`);

    const result = data.slice(0,5).map(v=>{
      const avg = v.total_terjual/7;
      const days = Math.floor(v.stok_sekarang/avg);

      return `${v.product}
Stok: ${v.stok_sekarang}
⚠️ Pesan dalam: ${days} hari`;
    }).join("\n\n");

    return msg.reply("📉 PREDIKSI\n\n"+result);
  }

  msg.reply("Perintah: laporan harian | mingguan | bulanan | prediksi stok");
});

// =======================
// AUTO REPORT JAM 09
// =======================
cron.schedule("0 9 * * *", async () => {
  const today = getDate(new Date());

  const [sales, pcs] = await Promise.all([
    axios.get(`${API_URL}/sales_range.php?start=${today}&end=${today}`),
    axios.get(`${API_URL}/total_items_month.php?start=${today}&end=${today}`)
  ]);

  await sendToAll(
    `📅 AUTO REPORT 09:00\n💰 Rp${formatRupiah(sales.data.total)}\n📦 ${pcs.data.total_pcs}`
  );
});

// =======================
// ALERT STOK
// =======================
cron.schedule("*/30 * * * *", async () => {
  const today = getDate(new Date());
  const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);

  const kritis = data.filter(v=>Number(v.stok_sekarang)<=50);
  if (!kritis.length) return;

  await sendToAll(
    "🚨 STOK < 50\n" +
    kritis.map(v=>`${v.product} (${v.stok_sekarang})`).join("\n")
  );
});

// =======================
client.initialize();
