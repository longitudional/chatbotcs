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
    numbers: ["17867468840", "112786294226994"],
  },
  {
    name: "Ibu Sari",
    numbers: ["6282142570378"],
  },
  {
    name: "Bapak Adi",
    numbers: ["10600096755791"],
  },
];

const greetedUsers = {};

// =======================
// HELPER
// =======================
const formatRupiah = (value) =>
  Number(value || 0).toLocaleString("id-ID");

const getDate = (d) => d.toISOString().split("T")[0];

const getUser = (sender) =>
  USERS.find((u) => u.numbers.includes(sender));

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
// QR HANDLER
// =======================
client.on("qr", (qr) => {
  latestQR = qr;
  console.log("QR updated, buka browser!");
  qrcode.generate(qr, { small: true });
});

// =======================
client.on("ready", () => {
  console.log("WhatsApp siap!");
});

// =======================
// WEB SERVER (QR VIEW)
// =======================
app.get("/", (req, res) => {
  if (!latestQR) {
    return res.send("QR belum tersedia / sudah login ✅");
  }

  res.send(`
    <h2>Scan QR WhatsApp</h2>
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
    // LAPORAN HARIAN
    // =======================
    if (textMsg.includes("harian") || textMsg.includes("hari ini")) {
      const [sales, pcs, products, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${today}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${today}&end=${today}`),
        axios.get(`${API_URL}/top_products.php`),
        axios.get(`${API_URL}/variant_sales.php?start=${today}&end=${today}`),
      ]);

      const omzet = Number(sales.data.total || 0);
      const totalPcs = Number(pcs.data.total_pcs || 0);

      const produkText = (products.data || [])
        .slice(0, 3)
        .map(
          (p, i) =>
            `${i + 1}. ${p.product} (${p.total_terjual} pcs)`
        )
        .join("\n");

      const varianText = (variants.data || [])
        .slice(0, 5)
        .map(
          (v, i) =>
            `${i + 1}. ${v.product} (${v.product_des})
→ ${v.total_qty} pcs
→ Rp${formatRupiah(v.total_omzet)}`
        )
        .join("\n\n");

      return msg.reply(
        greeting +
          `📅 *LAPORAN HARI INI*\n\n` +
          `💰 Omzet: Rp${formatRupiah(omzet)}\n` +
          `📦 Total: ${totalPcs} pcs\n\n` +
          `🔥 Produk Terlaris:\n${produkText || "-"}\n\n` +
          `📦 Varian Terlaris:\n${varianText || "-"}`
      );
    }

    // =======================
    // LAPORAN MINGGUAN
    // =======================
    if (textMsg.includes("mingguan")) {
      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${weekStart}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${weekStart}&end=${today}`),
        axios.get(`${API_URL}/variant_sales.php?start=${weekStart}&end=${today}`),
      ]);

      const omzet = Number(sales.data.total || 0);
      const totalPcs = Number(pcs.data.total_pcs || 0);

      const varianText = (variants.data || [])
        .slice(0, 5)
        .map(
          (v, i) =>
            `${i + 1}. ${v.product} (${v.product_des})
→ ${v.total_qty} pcs
→ Rp${formatRupiah(v.total_omzet)}`
        )
        .join("\n\n");

      return msg.reply(
        greeting +
          `📊 *LAPORAN MINGGU INI*\n\n` +
          `💰 Omzet: Rp${formatRupiah(omzet)}\n` +
          `📦 Total: ${totalPcs} pcs\n\n` +
          `🔥 Varian Terlaris:\n${varianText || "-"}`
      );
    }

    // =======================
    // LAPORAN BULANAN
    // =======================
    if (textMsg.includes("bulanan") || textMsg.includes("bulan ini")) {
      const [sales, pcs, variants] = await Promise.all([
        axios.get(`${API_URL}/sales_range.php?start=${monthStart}&end=${today}`),
        axios.get(`${API_URL}/total_items_month.php?start=${monthStart}&end=${today}`),
        axios.get(`${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`),
      ]);

      const omzet = Number(sales.data.total || 0);
      const totalPcs = Number(pcs.data.total_pcs || 0);

      const varianText = (variants.data || [])
        .slice(0, 10)
        .map((v, i) => {
          const stock = Number(v.stock_sisa || 0);
          const warning = stock <= 5 ? " ⚠️ Hampir habis" : "";

          return `${i + 1}. ${v.product} (${v.product_des})
→ ${v.total_qty} pcs
→ Rp${formatRupiah(v.total_omzet)}
→ Stok: ${stock}${warning}`;
        })
        .join("\n\n");

      return msg.reply(
        greeting +
          `📆 *LAPORAN BULAN INI*\n\n` +
          `💰 Omzet: Rp${formatRupiah(omzet)}\n` +
          `📦 Total: ${totalPcs} pcs\n\n` +
          `🔥 Varian Terlaris:\n${varianText || "-"}`
      );
    }

    // =======================
    // DEFAULT
    // =======================
    return msg.reply(
      greeting +
        `Gunakan perintah:\n
- laporan harian
- laporan mingguan
- laporan bulanan
- laporan lengkap`
    );
  } catch (err) {
    console.error(err);
    msg.reply("Terjadi error 🙏");
  }
});

// =======================
client.initialize();
