const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");
require("dotenv").config();

// =======================
const API_URL = "https://jamuanggerwaras.com/lord/api";

// =======================
// USER MANAGEMENT (MULTI NOMOR)
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
  }
];

// simpan siapa yang sudah disapa
const greetedUsers = {};

// =======================
// HELPER
// =======================
const formatRupiah = (value) => {
  return Number(value || 0).toLocaleString("id-ID");
};

const getDate = (d) => d.toISOString().split("T")[0];

// cari user berdasarkan nomor
const getUser = (sender) => {
  return USERS.find(u => u.numbers.includes(sender));
};

// =======================
// INIT
// =======================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  console.log("WhatsApp siap!");
});

// =======================
// MAIN BOT
// =======================
client.on("message", async (msg) => {
  try {
    // =======================
    // DETEKSI NOMOR PALING AKURAT
    // =======================
    const contact = await msg.getContact();
    const sender = contact.number;

    console.log("DETECTED:", sender);

    const user = getUser(sender);

    // ❌ bukan whitelist
    if (!user) return;

    const userName = user.name;

    // =======================
    // GREETING (1x per USER, bukan nomor)
    // =======================
    let greeting = "";

    if (!greetedUsers[userName]) {
      greeting = `Halo ${userName} 👋\nSelamat datang kembali 😊\n\n`;
      greetedUsers[userName] = true;
    }

    const textMsg = msg.body.toLowerCase();

    // =======================
    // TANGGAL
    // =======================
    const now = new Date();
    const today = getDate(now);

    const startWeek = new Date(now);
    startWeek.setDate(now.getDate() - now.getDay());
    const weekStart = getDate(startWeek);

    const monthStart = getDate(
      new Date(now.getFullYear(), now.getMonth(), 1)
    );

    // =======================
    // 1. CEK PESANAN
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
    // 2. LAPORAN HARIAN
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

    // =======================
    // 3. LAPORAN MINGGUAN
    // =======================
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

    // =======================
    // 4. LAPORAN BULANAN
    // =======================
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

    // =======================
    // 5. LAPORAN LENGKAP
    // =======================
    if (textMsg.includes("laporan lengkap")) {
      const [sales, pcs, products, variants] = await Promise.all([
        axios.get(
          `${API_URL}/sales_range.php?start=${monthStart}&end=${today}`
        ),
        axios.get(
          `${API_URL}/total_items_month.php?start=${monthStart}&end=${today}`
        ),
        axios.get(`${API_URL}/top_products.php`),
        axios.get(
          `${API_URL}/variant_sales.php?start=${monthStart}&end=${today}`
        ),
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
        .map((v, i) => {
          const stock = Number(v.stock_sisa || 0);
          const warning =
            stock <= 5 ? " ⚠️ Stok hampir habis!" : "";

          return `${i + 1}. ${v.product} (${v.product_des})
→ Terjual: ${v.total_qty} pcs
→ Rp${formatRupiah(v.total_omzet)}
→ Stok: ${stock}${warning}`;
        })
        .join("\n\n");

      return msg.reply(
        greeting +
          `📊 *LAPORAN LENGKAP*\n\n` +
          `💰 Omzet: Rp${formatRupiah(omzet)}\n` +
          `📦 Total: ${totalPcs} pcs\n\n` +
          `🔥 Produk Terlaris:\n${produkText || "-"}\n\n` +
          `📦 Varian + Stok:\n${varianText || "-"}`
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

client.initialize();