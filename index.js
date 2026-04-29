require("dotenv").config();

const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const axios = require("axios");
const express = require("express");
const cron = require("node-cron");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");

const API_URL = "https://jamuanggerwaras.com/lord/api";
const app = express();

let qrImage = "";
let isReady = false;

// =======================
// USER
// =======================
const USERS = [
  { name: "Owner", numbers: ["17867468840", "6282142570378"] },
];

const userState = {};

// =======================
// HELPER
// =======================
const formatRupiah = (v) => Number(v || 0).toLocaleString("id-ID");
const getDate = (d) => new Date(d).toISOString().split("T")[0];

const getStatus = (stock) => {
  if (stock <= 10) return "❌ Kritis";
  if (stock <= 50) return "⚠️ Menipis";
  if (stock <= 100) return "🟡 Perlu perhatian";
  return "✅ Aman";
};

const sendToAll = async (msg) => {
  for (const u of USERS) {
    for (const n of u.numbers) {
      const id = n.includes("@") ? n : n + "@c.us";
      await client.sendMessage(id, msg).catch(() => {});
    }
  }
};

// =======================
// CHART
// =======================
const chart = new ChartJSNodeCanvas({ width: 800, height: 400 });

const generateChart = async (data) => {
  return await chart.renderToBuffer({
    type: "bar",
    data: {
      labels: data.map((v) => v.product),
      datasets: [
        {
          label: "Penjualan",
          data: data.map((v) => Number(v.total_terjual)),
        },
      ],
    },
  });
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
// WEB
// =======================
app.get("/", (req, res) => {
  if (isReady) return res.send("✅ Connected");
  if (!qrImage) return res.send("Menunggu QR...");
  res.send(`<img src="${qrImage}" />`);
});

app.get("/api/data", async (req, res) => {
  const today = getDate(new Date());
  const { data } = await axios.get(
    `${API_URL}/variant_sales.php?start=${today}&end=${today}`
  );
  res.json(data);
});

app.get("/dashboard", (req, res) => {
  res.send(`
  <html>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <body>
  <h2>Dashboard</h2>
  <canvas id="c"></canvas>
  <script>
  fetch('/api/data').then(r=>r.json()).then(d=>{
    new Chart(document.getElementById('c'),{
      type:'bar',
      data:{
        labels:d.map(x=>x.product),
        datasets:[{data:d.map(x=>Number(x.total_terjual))}]
      }
    })
  })
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

    if (!USERS.some((u) => u.numbers.includes(sender))) return;

    const text = msg.body.toLowerCase().trim();

    const now = new Date();
    const today = getDate(now);
    const weekStart = getDate(new Date(Date.now() - 7 * 86400000));
    const monthStart = getDate(new Date(now.getFullYear(), now.getMonth(), 1));

    // =======================
    // MENU
    // =======================
    if (text === "menu") {
      userState[sender] = "menu";
      return msg.reply(`📊 MENU

1. Harian
2. Mingguan
3. Bulanan
4. Stok
5. Prediksi
6. Rentang
7. Grafik`);
    }

    // =======================
    // PILIHAN MENU
    // =======================
    if (userState[sender] === "menu") {
      delete userState[sender];

      if (text === "1") msg.body = "laporan harian";
      else if (text === "2") msg.body = "laporan mingguan";
      else if (text === "3") msg.body = "laporan bulanan";
      else if (text === "4") msg.body = "stok";
      else if (text === "5") msg.body = "prediksi stok";
      else if (text === "6") {
        userState[sender] = "range";
        return msg.reply("Format: YYYY-MM-DD YYYY-MM-DD");
      } else if (text === "7") msg.body = "grafik";
      else return msg.reply("❌ Salah");

    }

    // =======================
    // RANGE
    // =======================
    if (userState[sender] === "range") {
      const m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
      if (!m) return msg.reply("Format salah");

      delete userState[sender];

      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${m[1]}&end=${m[2]}`
      );

      return msg.reply(
        data
          .map((v) => `${v.product} ${v.total_terjual} Rp${formatRupiah(v.total_omzet)}`)
          .join("\n")
      );
    }

    // =======================
    // STOK
    // =======================
    if (text === "stok") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${today}&end=${today}`
      );

      return msg.reply(
        data.map(v => `${v.product} ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`).join("\n")
      );
    }

    // =======================
    // HARIAN
    // =======================
    if (text === "laporan harian") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${today}&end=${today}`
      );

      return msg.reply(
        data.map(v => `${v.product}\n${v.total_terjual} pcs\nRp${formatRupiah(v.total_omzet)}`).join("\n\n")
      );
    }

    // =======================
    // MINGGUAN
    // =======================
    if (text === "laporan mingguan") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`
      );

      return msg.reply(
        data.map(v => `${v.product}\n${v.total_terjual} pcs\nRp${formatRupiah(v.total_omzet)}`).join("\n\n")
      );
    }

    // =======================
    // BULANAN + TOTAL
    // =======================
    if (text === "laporan bulanan") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`
      );

      let totalQty = 0;
      let totalOmzet = 0;

      data.forEach(v => {
        totalQty += Number(v.total_terjual || 0);
        totalOmzet += Number(v.total_omzet || 0);
      });

      const detail = data.map((v,i)=>
        `${i+1}. ${v.product}
${v.total_terjual} pcs
Rp${formatRupiah(v.total_omzet)}
Stok: ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`
      ).join("\n\n");

      return msg.reply(
        `📆 BULANAN\n💰 Rp${formatRupiah(totalOmzet)}\n📦 ${totalQty} pcs\n\n${detail}`
      );
    }

    // =======================
    // PREDIKSI
    // =======================
    if (text === "prediksi stok") {
      const start = getDate(new Date(Date.now()-7*86400000));

      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${start}&end=${today}`
      );

      return msg.reply(
        data.map(v=>{
          const avg = v.total_terjual/7 || 1;
          return `${v.product} → pesan ${Math.floor(v.stok_sekarang/avg)} hari`;
        }).join("\n")
      );
    }

    // =======================
    // GRAFIK
    // =======================
    if (text === "grafik") {
      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${today}&end=${today}`
      );

      const buffer = await generateChart(data.slice(0,10));

      const media = new MessageMedia(
        "image/png",
        buffer.toString("base64"),
        "chart.png"
      );

      return msg.reply(media);
    }

  } catch (err) {
    console.error(err);
    msg.reply("Error");
  }
});

// =======================
// AUTO REPORT 18:00 WIB
// =======================
cron.schedule("0 18 * * *", async () => {
  const today = getDate(new Date());

  const { data } = await axios.get(
    `${API_URL}/variant_sales.php?start=${today}&end=${today}`
  );

  await sendToAll(
    "📊 AUTO REPORT\n" +
    data.slice(0,5).map(v=>`${v.product} ${v.total_terjual}`).join("\n")
  );
}, { timezone: "Asia/Jakarta" });

// =======================
// ALERT RABU 11:00 WIB
// =======================
cron.schedule("0 11 * * 3", async () => {
  const today = getDate(new Date());

  const { data } = await axios.get(
    `${API_URL}/variant_sales.php?start=${today}&end=${today}`
  );

  const kritis = data.filter(v => v.stok_sekarang <= 50);

  if (!kritis.length) return;

  await sendToAll(
    "🚨 STOK MENIPIS\n" +
    kritis.map(v=>`${v.product} (${v.stok_sekarang})`).join("\n")
  );
}, { timezone: "Asia/Jakarta" });

// =======================
client.initialize();
