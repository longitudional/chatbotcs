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

client.on("qr", async (qr) => {
  qrImage = await QRCode.toDataURL(qr);
});

client.on("ready", () => {
  isReady = true;
  console.log("WhatsApp siap!");
});

// =======================
// WEB (QR only)
// =======================
app.get("/", (req, res) => {
  if (isReady) return res.send("✅ Connected");
  if (!qrImage) return res.send("Menunggu QR...");
  res.send(`<img src="${qrImage}" />`);
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

  // STOK
  if (text === "stok") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
    return msg.reply(
      data.map(v => `${v.product} ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`).join("\n")
    );
  }

  // HARIAN
  if (text === "laporan harian") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`);
    return msg.reply(
      data.map(v => `${v.product}\n${v.total_terjual} pcs\nRp${formatRupiah(v.total_omzet)}`).join("\n\n")
    );
  }

  // MINGGUAN
  if (text === "laporan mingguan") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`);
    return msg.reply(
      data.map(v => `${v.product}\n${v.total_terjual} pcs\nRp${formatRupiah(v.total_omzet)}`).join("\n\n")
    );
  }

  // BULANAN
  if (text === "laporan bulanan") {
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`);

    let totalQty = 0;
    let totalOmzet = 0;

    data.forEach(v => {
      totalQty += Number(v.total_terjual || 0);
      totalOmzet += Number(v.total_omzet || 0);
    });

    const detail = data.map((v, i) =>
      `${i + 1}. ${v.product}
${v.total_terjual} pcs
Rp${formatRupiah(v.total_omzet)}
Stok: ${v.stok_sekarang} (${getStatus(v.stok_sekarang)})`
    ).join("\n\n");

    return msg.reply(
      `📆 BULANAN\n💰 Rp${formatRupiah(totalOmzet)}\n📦 ${totalQty} pcs\n\n${detail}`
    );
  }

  // PREDIKSI
  if (text === "prediksi stok") {
    const start = getDate(new Date(Date.now() - 7 * 86400000));
    const { data } = await axios.get(`${API_URL}/variant_sales.php?start=${start}&end=${today}`);

    return msg.reply(
      data.map(v => {
        const avg = v.total_terjual / 7 || 1;
        return `${v.product} → pesan ${Math.floor(v.stok_sekarang / avg)} hari`;
      }).join("\n")
    );
  }
}

// =======================
// BOT
// =======================
client.on("message", async (msg) => {
  try {
    let sender = msg.from;
    if (msg.from.includes("@g.us")) sender = msg.author;

    sender = normalizeNumber(sender);

    console.log("DETECTED:", sender);

    const isAllowed = USERS.some(u =>
      u.numbers.some(n => normalizeNumber(n) === sender)
    );

    if (!isAllowed) return;

    const text = msg.body.toLowerCase().trim();

    // MENU
    if (text === "menu") {
      userState[sender] = "menu";
      return msg.reply(`📊 MENU

1. Laporan Harian
2. Laporan Mingguan
3. Laporan Bulanan
4. Cek Stok
5. Prediksi Restock
6. Laporan Rentang Tanggal`);
    }

    // HANDLE MENU
    if (userState[sender] === "menu") {
      delete userState[sender];

      switch (text) {
        case "1":
          return handleCommand("laporan harian", msg);
        case "2":
          return handleCommand("laporan mingguan", msg);
        case "3":
          return handleCommand("laporan bulanan", msg);
        case "4":
          return handleCommand("stok", msg);
        case "5":
          return handleCommand("prediksi stok", msg);
        case "6":
          userState[sender] = "range";
          return msg.reply("Format: YYYY-MM-DD YYYY-MM-DD");
        default:
          return msg.reply("❌ Pilihan tidak valid");
      }
    }

    // RANGE
    if (userState[sender] === "range") {
      const m = text.match(/(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})/);
      if (!m) return msg.reply("Format salah");

      delete userState[sender];

      const { data } = await axios.get(
        `${API_URL}/variant_sales.php?start=${m[1]}&end=${m[2]}`
      );

      return msg.reply(
        data.map(v => `${v.product} ${v.total_terjual} Rp${formatRupiah(v.total_omzet)}`).join("\n")
      );
    }

    // FALLBACK
    await handleCommand(text, msg);

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
    data.slice(0, 5).map(v => `${v.product} ${v.total_terjual}`).join("\n")
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
    kritis.map(v => `${v.product} (${v.stok_sekarang})`).join("\n")
  );
}, { timezone: "Asia/Jakarta" });

// =======================
client.initialize();
