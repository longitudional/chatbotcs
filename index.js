const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
const express = require("express");
require("dotenv").config();

// =======================
// CONFIG
// =======================
const API_URL = "https://jamuanggerwaras.com/lord/api";
const app = express();

let latestQR = "";

// =======================
// USER MANAGEMENT
// =======================
const USERS = [
   {
    name: "Bapak Hasan",
    numbers: ["17867468840", "112786294226994"]
  },
  {
    name: "Ibu Sari",
    numbers: ["6282142570378"]
  },
  {
    name: "Bapak Adi",
    numbers: ["10600096755791"]
  },
];

const greetedUsers = {};

// =======================
// HELPER
// =======================
const formatRupiah = (value) => {
  return Number(value || 0).toLocaleString("id-ID");
};

const getDate = (d) => d.toISOString().split("T")[0];

const getUser = (sender) => {
  return USERS.find((u) => u.numbers.includes(sender));
};

// =======================
// INIT WHATSAPP
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  },
});

// =======================
// QR HANDLER (WEB + LOG)
// =======================
client.on("qr", (qr) => {
  latestQR = qr;
  console.log("QR updated, buka browser!");
  qrcode.generate(qr, { small: true });
});

// =======================
// READY
// =======================
client.on("ready", () => {
  console.log("WhatsApp siap!");
});

// =======================
// WEB SERVER (UNTUK QR)
// =======================
app.get("/", (req, res) => {
  if (!latestQR) {
    return res.send("QR belum tersedia atau sudah login ✅");
  }

  res.send(`
    <h2>Scan QR WhatsApp</h2>
    <p>Scan sekali saja</p>
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${latestQR}" />
  `);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Web server aktif");
});

// =======================
// MAIN BOT
// =======================
client.on("message", async (msg) => {
  try {
    const contact = await msg.getContact();
    const sender = contact.number;

    const user = getUser(sender);
    if (!user) return;

    const userName = user.name;

    let greeting = "";
    if (!greetedUsers[userName]) {
      greeting = `Halo ${userName} 👋\nSelamat datang kembali 😊\n\n`;
      greetedUsers[userName] = true;
    }

    const textMsg = msg.body.toLowerCase();

    const now = new Date();
    const today = getDate(now);

    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - now.getDay());
    const weekStart = getDate(startWeek);

    const monthStart = getDate(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );

    // =======================
    // CEK INVOICE
    // =======================
    const match = msg.body.match(/INV-\d+/i);

    if (match) {
      const invoice = match[0];

      const res = await axios.get(
        `${API_URL}/order.php?invoice=${invoice}`
      );

      if (res.data.error) {
        return msg.reply(greeting + "Pesanan tidak ditemukan 🙏");
      }

      let total = 0;

      const detail = res.data
        .map((i) => {
          const subtotal =
            Number(i.qty || 0) * Number(i.price || 0);
          total += subtotal;

          return `- ${i.product} (${i.product_des}) x${i.qty} → Rp${formatRupiah(
            subtotal
          )}`;
        })
        .join("\n");

      return msg.reply(
        greeting +
          `📦 Detail pesanan ${invoice}:\n\n${detail}\n\n💰 Total: Rp${formatRupiah(
            total
          )}`
      );
    }

    // =======================
    // LAPORAN
    // =======================
    if (textMsg.includes("harian") || textMsg.includes("hari ini")) {
      const res = await axios.get(
        `${API_URL}/sales_range.php?start=${today}&end=${today}`
      );

      return msg.reply(
        greeting +
          `📅 *LAPORAN HARI INI*\n\n💰 Omzet: Rp${formatRupiah(
            res.data.total
          )}`
      );
    }

    if (textMsg.includes("mingguan")) {
      const res = await axios.get(
        `${API_URL}/sales_range.php?start=${weekStart}&end=${today}`
      );

      return msg.reply(
        greeting +
          `📊 *LAPORAN MINGGU INI*\n\n💰 Omzet: Rp${formatRupiah(
            res.data.total
          )}`
      );
    }

    if (textMsg.includes("bulanan") || textMsg.includes("bulan ini")) {
      const res = await axios.get(
        `${API_URL}/sales_range.php?start=${monthStart}&end=${today}`
      );

      return msg.reply(
        greeting +
          `📆 *LAPORAN BULAN INI*\n\n💰 Omzet: Rp${formatRupiah(
            res.data.total
          )}`
      );
    }

    if (textMsg.includes("laporan lengkap")) {
      const [sales, pcs] = await Promise.all([
        axios.get(
          `${API_URL}/sales_range.php?start=${monthStart}&end=${today}`
        ),
        axios.get(
          `${API_URL}/total_items_month.php?start=${monthStart}&end=${today}`
        ),
      ]);

      return msg.reply(
        greeting +
          `📊 *LAPORAN LENGKAP*\n\n💰 Omzet: Rp${formatRupiah(
            sales.data.total
          )}\n📦 Total: ${pcs.data.total_pcs} pcs`
      );
    }

    return msg.reply(
      greeting +
        `Gunakan perintah:\n- laporan harian\n- laporan mingguan\n- laporan bulanan\n- laporan lengkap`
    );
  } catch (err) {
    console.error(err);
    msg.reply("Terjadi error 🙏");
  }
});

// =======================
client.initialize();
