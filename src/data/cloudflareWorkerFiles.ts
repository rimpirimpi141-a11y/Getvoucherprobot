export interface WorkerConfigParams {
  botUsername: string;
  adminId: string;
  supportUsername: string;
  forceChannel: string;
  upiId: string;
  kvNamespaceId: string;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfigParams = {
  botUsername: "@Getvoucherprobot",
  adminId: "8838351233",
  supportUsername: "@Tspherez",
  forceChannel: "@GetVoucherUpdates",
  upiId: "ankitsmm@fam",
  kvNamespaceId: "YOUR_KV_NAMESPACE_ID_HERE",
};

export function generatePackageJson(): string {
  return `{
  "name": "getvoucherprobot-worker",
  "version": "1.0.0",
  "description": "Production Telegram Voucher Bot (@Getvoucherprobot) built with grammY on Cloudflare Workers & Cloudflare KV",
  "main": "index.js",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev index.js",
    "deploy": "wrangler deploy index.js",
    "tail": "wrangler tail"
  },
  "dependencies": {
    "grammy": "^1.35.0"
  },
  "devDependencies": {
    "wrangler": "^3.109.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}`;
}

export function generateWranglerToml(cfg: WorkerConfigParams): string {
  return `name = "getvoucherprobot-worker"
main = "index.js"
compatibility_date = "2025-02-01"
workers_dev = true

# ============================================================================
# PURE CLOUDFLARE WORKER CONFIGURATION (NO [assets] BINDING)
# Do NOT add [assets] or [site] blocks—this ensures Cloudflare deploys a
# standard Worker script (main = "index.js") so environment variables ([vars])
# and secrets (BOT_TOKEN) can be added freely without any restrictions.
# ============================================================================

[[kv_namespaces]]
binding = "BOT_KV"
id = "${cfg.kvNamespaceId || "YOUR_KV_NAMESPACE_ID_HERE"}"
preview_id = "${cfg.kvNamespaceId || "YOUR_PREVIEW_KV_NAMESPACE_ID_HERE"}"

[vars]
BOT_USERNAME = "${cfg.botUsername}"
ADMIN_ID = "${cfg.adminId}"
SUPPORT_USERNAME = "${cfg.supportUsername}"
DEFAULT_FORCE_CHANNEL = "${cfg.forceChannel}"
UPI_ID = "${cfg.upiId}"
UPI_MERCHANT_NAME = "GetVoucherPro Official"`;
}

export function generateIndexJs(cfg: WorkerConfigParams): string {
  return `/**
 * ============================================================================
 * ${cfg.botUsername} — Production Telegram Voucher Bot
 * Runtime: Cloudflare Workers (Serverless Edge)
 * Database: Cloudflare Workers KV (Binding: env.BOT_KV)
 * Framework: grammY (https://grammy.dev)
 *
 * Key Constants:
 * - Bot Username: ${cfg.botUsername}
 * - Primary Admin Telegram ID: ${cfg.adminId}
 * - Support Username: ${cfg.supportUsername}
 * ============================================================================
 */

import { Bot, Keyboard, InlineKeyboard, webhookCallback } from "grammy";

// ============================================================================
// 1. BOT CONFIGURATION & CONSTANTS
// ============================================================================
const BOT_CONFIG = {
  BOT_USERNAME: "${cfg.botUsername}",
  PRIMARY_ADMIN_ID: ${Number(cfg.adminId) || 8838351233},
  SUPPORT_USERNAME: "${cfg.supportUsername}",
  SUPPORT_URL: "https://t.me/${cfg.supportUsername.replace(/^@/, "")}",
  UPI_ID: "ankitsmm@fam",
  DEFAULT_QR_IMAGE: "https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=upi://pay?pa=ankitsmm@fam%26pn=GetVoucherPro",
};

// Exact Main Menu Reply Keyboard Button Labels (No Inline Keyboards for Main Menu)
const MENU_BTNS = {
  BUY_VOUCHERS: "🎁 Buy Vouchers",
  MY_ORDERS: "📋 My Orders & History",
  HOW_TO_USE: "📖 How To Use / Guide",
  REVIEWS: "⭐ Reviews & Feedback",
  SUPPORT: "💬 Support",
  ADMIN_PANEL: "⚙️ Admin Panel",
  BACK_MAIN: "🔙 Main Menu",
};

// Sub-Category Reply Keyboard Button Labels for "Buy Vouchers"
const CATEGORY_BTNS = {
  AMAZON: "📦 Amazon",
  FLIPKART: "🛍️ Flipkart",
  MEESHO: "🛒 Meesho",
  BIGBASKET: "🧺 BigBasket",
};

// Admin Panel Dedicated Reply Keyboard Button Labels
const ADMIN_BTNS = {
  ADD_STOCK: "➕ Add Stock / Voucher",
  UPDATE_QR: "📷 Add/Update QR Code",
  USER_LIST: "👥 View User List",
  BROADCAST: "📢 Broadcast",
  FORCE_CHANNEL: "🔗 Manage Force Channel",
  MANAGE_ADMINS: "🛡️ Add/Remove Admin",
  BOT_STATS: "📊 View Bot Stats",
  BACK_MAIN: "🔙 Main Menu",
};

// KV Storage Keys
const KV_KEYS = {
  USERS: "users:registry",          // Array of { id, username, firstName, joinedAt }
  VOUCHERS: "vouchers:catalog",     // Array of { id, category, title, price, codes: string[] }
  ORDERS: "orders:history",         // Array of Order objects
  REVIEWS: "reviews:list",          // Array of { userId, name, text, createdAt }
  FORCE_CHANNEL: "config:channel",  // String e.g. "${cfg.forceChannel}" or ""
  QR_CODE: "config:qr_file_id",     // Telegram photo file_id (or image URL) of Admin-uploaded QR Code
  ADMINS: "config:admins",          // Array of secondary admin IDs (numbers)
  SESSION_PREFIX: "session:",       // session:<userId> -> { step, data }
};

// Default Seed Vouchers (Initialized automatically if KV catalog is empty)
const INITIAL_VOUCHER_CATALOG = [
  {
    id: "amz_500",
    category: "Amazon",
    title: "Amazon Pay Gift Card Rs.500",
    price: 475,
    codes: ["AMZN-500-9K2L-88X1", "AMZN-500-4P7Q-19Z3", "AMZN-500-7M3W-55B9"],
  },
  {
    id: "amz_1000",
    category: "Amazon",
    title: "Amazon Pay Gift Card Rs.1000",
    price: 940,
    codes: ["AMZN-1000-8H4J-22N7", "AMZN-1000-3R9T-61K4"],
  },
  {
    id: "flp_500",
    category: "Flipkart",
    title: "Flipkart E-Gift Voucher Rs.500",
    price: 470,
    codes: ["FLIP-500-6Y2U-90M1", "FLIP-500-2D8F-44P6"],
  },
  {
    id: "msh_500",
    category: "Meesho",
    title: "Meesho Shopping Voucher Rs.500",
    price: 460,
    codes: ["MSHO-500-5G1H-77V2", "MSHO-500-9L3K-12C8"],
  },
  {
    id: "bb_500",
    category: "BigBasket",
    title: "BigBasket Grocery Voucher Rs.500",
    price: 465,
    codes: ["BBKT-500-4W8E-33R5", "BBKT-500-1Z7X-89Q2"],
  },
];

// ============================================================================
// 2. CLOUDFLARE KV HELPER FUNCTIONS
// ============================================================================

async function kvGetJSON(kv, key, fallback) {
  try {
    const raw = await kv.get(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

async function kvPutJSON(kv, key, value, ttlSeconds = null) {
  const options = ttlSeconds ? { expirationTtl: ttlSeconds } : undefined;
  await kv.put(key, JSON.stringify(value), options);
}

async function getCatalog(kv) {
  let catalog = await kvGetJSON(kv, KV_KEYS.VOUCHERS, null);
  if (!catalog || !Array.isArray(catalog)) {
    catalog = INITIAL_VOUCHER_CATALOG;
    await kvPutJSON(kv, KV_KEYS.VOUCHERS, catalog);
  }
  return catalog;
}

async function getAdminList(kv, env) {
  const primaryId = Number(env.ADMIN_ID || BOT_CONFIG.PRIMARY_ADMIN_ID);
  const extraAdmins = await kvGetJSON(kv, KV_KEYS.ADMINS, []);
  const all = new Set([primaryId, BOT_CONFIG.PRIMARY_ADMIN_ID, ...extraAdmins.map(Number)]);
  return Array.from(all);
}

async function isAdminUser(userId, kv, env) {
  if (!userId) return false;
  const admins = await getAdminList(kv, env);
  return admins.includes(Number(userId));
}

async function registerUserIfNew(user, kv) {
  if (!user || !user.id) return;
  const users = await kvGetJSON(kv, KV_KEYS.USERS, []);
  const exists = users.some((u) => Number(u.id) === Number(user.id));
  if (!exists) {
    users.push({
      id: Number(user.id),
      username: user.username ? \`@\${user.username}\` : "No Username",
      firstName: user.first_name || "User",
      joinedAt: new Date().toISOString(),
    });
    await kvPutJSON(kv, KV_KEYS.USERS, users);
  }
}

async function getSession(kv, userId) {
  return await kvGetJSON(kv, \`\${KV_KEYS.SESSION_PREFIX}\${userId}\`, { step: "IDLE", data: {} });
}

async function setSession(kv, userId, step, data = {}) {
  await kvPutJSON(kv, \`\${KV_KEYS.SESSION_PREFIX}\${userId}\`, { step, data }, 86400);
}

async function clearSession(kv, userId) {
  await kv.delete(\`\${KV_KEYS.SESSION_PREFIX}\${userId}\`);
}

// ============================================================================
// 3. REPLY KEYBOARDS (NO INLINE KEYBOARDS FOR MAIN MENU)
// ============================================================================

function buildMainMenuKeyboard(isAdmin) {
  const keyboard = new Keyboard()
    .text(MENU_BTNS.BUY_VOUCHERS)
    .text(MENU_BTNS.MY_ORDERS)
    .row()
    .text(MENU_BTNS.HOW_TO_USE)
    .text(MENU_BTNS.REVIEWS)
    .row()
    .text(MENU_BTNS.SUPPORT);

  // ⚙️ Admin Panel button is visible ONLY to Admin ID ${cfg.adminId} (and secondary admins)
  if (isAdmin) {
    keyboard.text(MENU_BTNS.ADMIN_PANEL);
  }

  return keyboard.resized().persistent();
}

function buildCategoriesReplyKeyboard() {
  return new Keyboard()
    .text(CATEGORY_BTNS.AMAZON)
    .text(CATEGORY_BTNS.FLIPKART)
    .row()
    .text(CATEGORY_BTNS.MEESHO)
    .text(CATEGORY_BTNS.BIGBASKET)
    .row()
    .text(MENU_BTNS.BACK_MAIN)
    .resized()
    .persistent();
}

function buildAdminReplyKeyboard() {
  return new Keyboard()
    .text(ADMIN_BTNS.ADD_STOCK)
    .text(ADMIN_BTNS.UPDATE_QR)
    .row()
    .text(ADMIN_BTNS.USER_LIST)
    .text(ADMIN_BTNS.BROADCAST)
    .row()
    .text(ADMIN_BTNS.FORCE_CHANNEL)
    .text(ADMIN_BTNS.MANAGE_ADMINS)
    .row()
    .text(ADMIN_BTNS.BOT_STATS)
    .text(ADMIN_BTNS.BACK_MAIN)
    .resized()
    .persistent();
}

// ============================================================================
// 4. FORCE CHANNEL MEMBERSHIP VERIFICATION
// ============================================================================

async function checkForceChannelMembership(ctx, kv, isAdmin) {
  if (isAdmin) return { allowed: true, channel: null };

  const forceChannel = await kv.get(KV_KEYS.FORCE_CHANNEL);
  if (!forceChannel || forceChannel.trim() === "" || forceChannel.trim().toLowerCase() === "none") {
    return { allowed: true, channel: null };
  }

  const normalizedChannel = forceChannel.trim().startsWith("@")
    ? forceChannel.trim()
    : \`@\${forceChannel.trim()}\`;

  try {
    const member = await ctx.api.getChatMember(normalizedChannel, ctx.from.id);
    const validStatuses = ["creator", "administrator", "member", "restricted"];
    const isJoined = validStatuses.includes(member.status);
    return { allowed: isJoined, channel: normalizedChannel };
  } catch (err) {
    console.warn("Force channel check error:", err.message);
    return { allowed: false, channel: normalizedChannel, error: err.message };
  }
}

async function sendForceJoinPrompt(ctx, channel) {
  const cleanHandle = channel.replace(/^@/, "");
  const joinKeyboard = new InlineKeyboard()
    .url(\`📢 Join \${channel}\`, \`https://t.me/\${cleanHandle}\`)
    .row()
    .text("✅ Joined / Verify Access", "verify_force_join");

  await ctx.reply(
    \`🔒 *Access Restricted — Channel Verification Required*\\n\\n\` +
      \`Welcome to *\${BOT_CONFIG.BOT_USERNAME}*! Before accessing discounted gift vouchers, you must join our official updates channel:\\n\\n\` +
      \`👉 *Channel:* \${channel}\\n\\n\` +
      \`Click the button below to join, then tap *✅ Joined / Verify Access*.\`,
    {
      parse_mode: "Markdown",
      reply_markup: joinKeyboard,
    }
  );
}

// ============================================================================
// 5. MAIN BOT INITIALIZATION & HANDLERS
// ============================================================================

function createBot(env) {
  const bot = new Bot(env.BOT_TOKEN);
  const kv = env.BOT_KV;
  const upiId = "ankitsmm@fam";

  // Middleware: Register user & check Force Channel membership
  bot.use(async (ctx, next) => {
    if (!ctx.from) return;
    await registerUserIfNew(ctx.from, kv);

    const isAdmin = await isAdminUser(ctx.from.id, kv, env);
    ctx.state = { isAdmin };

    if (ctx.callbackQuery?.data === "verify_force_join") {
      const check = await checkForceChannelMembership(ctx, kv, isAdmin);
      if (check.allowed) {
        await ctx.answerCallbackQuery({ text: "✅ Verification successful! Welcome!" });
        await ctx.reply(
          \`🎉 *Verification Complete!*\\n\\nWelcome to *\${BOT_CONFIG.BOT_USERNAME}*. Use the colourful menu buttons at the bottom of your screen to browse and buy vouchers.\`,
          {
            parse_mode: "Markdown",
            reply_markup: buildMainMenuKeyboard(isAdmin),
          }
        );
      } else {
        await ctx.answerCallbackQuery({
          text: \`❌ You haven't joined \${check.channel} yet! Please join first.\`,
          show_alert: true,
        });
      }
      return;
    }

    const check = await checkForceChannelMembership(ctx, kv, isAdmin);
    if (!check.allowed) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({
          text: \`🔒 Please join \${check.channel} first!\`,
          show_alert: true,
        });
      }
      await sendForceJoinPrompt(ctx, check.channel);
      return;
    }

    await next();
  });

  // /start Command & "🔙 Main Menu"
  async function showMainMenu(ctx) {
    const isAdmin = ctx.state?.isAdmin || false;
    await clearSession(kv, ctx.from.id);

    const welcomeMsg =
      \`✨ *Welcome to \${BOT_CONFIG.BOT_USERNAME}!* ✨\\n\\n\` +
      \`🇮🇳 *India's Most Trusted Instant Voucher Store*\\n\` +
      \`Get genuine, verified gift cards & shopping vouchers for *Amazon, Flipkart, Meesho, and BigBasket* at exclusive discounted prices!\\n\\n\` +
      \`🔹 *100% Verified Voucher Codes*\\n\` +
      \`🔹 *Fast Manual Verification & Direct Dispatch*\\n\` +
      \`🔹 *24/7 Dedicated Support:* \${BOT_CONFIG.SUPPORT_USERNAME}\\n\\n\` +
      \`👇 *Select an option from the bottom menu below:*\`;

    await ctx.reply(welcomeMsg, {
      parse_mode: "Markdown",
      reply_markup: buildMainMenuKeyboard(isAdmin),
    });
  }

  bot.command("start", showMainMenu);
  bot.hears(MENU_BTNS.BACK_MAIN, showMainMenu);

  // 1. 🎁 Buy Vouchers -> Shows Sub-Categories Reply Keyboard
  bot.hears(MENU_BTNS.BUY_VOUCHERS, async (ctx) => {
    await clearSession(kv, ctx.from.id);
    const catalog = await getCatalog(kv);

    const countByCat = (cat) =>
      catalog
        .filter((v) => v.category.toLowerCase() === cat.toLowerCase())
        .reduce((acc, v) => acc + (v.codes?.length || 0), 0);

    const text =
      \`🎁 *Select Voucher Brand / Category*\\n\\n\` +
      \`📦 *Amazon:* \${countByCat("Amazon")} vouchers in stock\\n\` +
      \`🛍️ *Flipkart:* \${countByCat("Flipkart")} vouchers in stock\\n\` +
      \`🛒 *Meesho:* \${countByCat("Meesho")} vouchers in stock\\n\` +
      \`🧺 *BigBasket:* \${countByCat("BigBasket")} vouchers in stock\\n\\n\` +
      \`👇 *Tap a category on the bottom keyboard to view available denominations:*\`;

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: buildCategoriesReplyKeyboard(),
    });
  });

  // Sub-Category Selection (Amazon, Flipkart, Meesho, BigBasket)
  const categoryMap = {
    [CATEGORY_BTNS.AMAZON]: { name: "Amazon", emoji: "📦" },
    [CATEGORY_BTNS.FLIPKART]: { name: "Flipkart", emoji: "🛍️" },
    [CATEGORY_BTNS.MEESHO]: { name: "Meesho", emoji: "🛒" },
    [CATEGORY_BTNS.BIGBASKET]: { name: "BigBasket", emoji: "🧺" },
  };

  for (const [btnLabel, catInfo] of Object.entries(categoryMap)) {
    bot.hears(btnLabel, async (ctx) => {
      const catalog = await getCatalog(kv);
      const items = catalog.filter(
        (v) => v.category.toLowerCase() === catInfo.name.toLowerCase() && v.codes && v.codes.length > 0
      );

      if (items.length === 0) {
        await ctx.reply(
          \`\${catInfo.emoji} *\${catInfo.name} Vouchers*\\n\\n\` +
            \`⚠️ Currently *Out of Stock* in this category.\\n\` +
            \`Please check another category or contact \${BOT_CONFIG.SUPPORT_USERNAME} for restock updates.\`,
          {
            parse_mode: "Markdown",
            reply_markup: buildCategoriesReplyKeyboard(),
          }
        );
        return;
      }

      const voucherReplyKb = new Keyboard();
      let msg = \`\${catInfo.emoji} *Available \${catInfo.name} Vouchers*\\n\\n\`;

      items.forEach((item, idx) => {
        const btnText = \`🎟️ \${item.title} — ₹\${item.price}\`;
        voucherReplyKb.text(btnText).row();

        msg += \`*\${idx + 1}. \${item.title}*\\n\`;
        msg += \`   💰 Discounted Price: *₹\${item.price}*\\n\`;
        msg += \`   📦 Available Stock: *\${item.codes.length} left*\\n\\n\`;
      });

      voucherReplyKb.text(MENU_BTNS.BUY_VOUCHERS).text(MENU_BTNS.BACK_MAIN);
      msg += \`👇 *Tap a voucher on the bottom keyboard to proceed to payment:*\`;

      await ctx.reply(msg, {
        parse_mode: "Markdown",
        reply_markup: voucherReplyKb.resized().persistent(),
      });
    });
  }

  // Handle selecting a voucher via Bottom Reply Keyboard ("🎟️ <Title> — ₹<Price>")
  bot.hears(/^🎟️ (.+) — ₹(\\d+)$/, async (ctx) => {
    const selectedTitle = ctx.match[1].trim();
    const catalog = await getCatalog(kv);
    const voucher = catalog.find(
      (v) => v.title.toLowerCase() === selectedTitle.toLowerCase() && v.codes && v.codes.length > 0
    );

    if (!voucher) {
      await ctx.reply(
        \`❌ Sorry, *\${selectedTitle}* is currently out of stock or no longer available.\`,
        {
          parse_mode: "Markdown",
          reply_markup: buildCategoriesReplyKeyboard(),
        }
      );
      return;
    }

    await initiateVoucherCheckout(ctx, voucher, kv, upiId);
  });

  async function initiateVoucherCheckout(ctx, voucher, kv, upiId) {
    await setSession(kv, ctx.from.id, "AWAITING_PAYMENT_SS", {
      voucherId: voucher.id,
      category: voucher.category,
      title: voucher.title,
      price: voucher.price,
      initiatedAt: new Date().toISOString(),
    });

    const cancelKb = new Keyboard().text(MENU_BTNS.BACK_MAIN).resized().persistent();

    const paymentInstructions =
      \`💳 *Payment Instructions — \${voucher.title}*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`🏷️ *Category:* \${voucher.category}\\n\` +
      \`🎁 *Voucher:* \${voucher.title}\\n\` +
      \`💰 *Amount to Pay:* *₹\${voucher.price}*\\n\` +
      \`🏦 *UPI ID:* \\\`ankitsmm@fam\\\`\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\\n\` +
      \`📌 *How to Complete Your Purchase:*\\n\` +
      \`1️⃣ Scan the QR Code above or pay *₹\${voucher.price}* to UPI ID \\\`ankitsmm@fam\\\`.\\n\` +
      \`2️⃣ Take a clear *Payment Screenshot (SS)* showing the UTR / Transaction ID.\\n\` +
      \`3️⃣ *Upload & send the Payment Screenshot photo directly here in this chat.*\\n\\n\` +
      \`⏳ *Note:* Once you send the photo, our Admin will verify your payment and manually dispatch your voucher code directly to you!\`;

    // Fetch stored QR code image (Telegram file_id or URL) from Cloudflare KV
    const storedQrCode = (await kv.get(KV_KEYS.QR_CODE)) || BOT_CONFIG.DEFAULT_QR_IMAGE;

    try {
      await ctx.replyWithPhoto(storedQrCode, {
        caption: paymentInstructions,
        parse_mode: "Markdown",
        reply_markup: cancelKb,
      });
    } catch (err) {
      console.warn("QR photo send fallback:", err.message);
      await ctx.reply(paymentInstructions, {
        parse_mode: "Markdown",
        reply_markup: cancelKb,
      });
    }
  }

  // CRITICAL: Photo Upload Handler (Admin QR Upload, Admin Broadcast, or User Payment SS)
  bot.on("message:photo", async (ctx) => {
    const userId = ctx.from.id;
    const isAdmin = ctx.state?.isAdmin || false;
    const session = await getSession(kv, userId);

    // 1. Check if Admin is uploading a new UPI QR Code image to store in Cloudflare KV
    if (isAdmin && session.step === "ADMIN_SET_QR_CODE") {
      const photos = ctx.message.photo;
      const qrFileId = photos[photos.length - 1].file_id;

      await kv.put(KV_KEYS.QR_CODE, qrFileId);
      await clearSession(kv, userId);

      await ctx.replyWithPhoto(qrFileId, {
        caption:
          \`✅ *UPI QR Code Saved to Cloudflare KV!*\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
          \`🗄️ *KV Key:* \\\`\${KV_KEYS.QR_CODE}\\\`\\n\` +
          \`🏦 *UPI ID:* \\\`ankitsmm@fam\\\`\\n\\n\` +
          \`Whenever any user selects a voucher to purchase, the bot will now automatically fetch and send this QR code image along with \\\`ankitsmm@fam\\\` and the payment instructions.\`,
        parse_mode: "Markdown",
        reply_markup: buildAdminReplyKeyboard(),
      });
      return;
    }

    // 2. Check if Admin is sending a photo broadcast
    if (isAdmin && session.step === "ADMIN_BROADCAST_INPUT") {
      const users = await kvGetJSON(kv, KV_KEYS.USERS, []);
      const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
      const caption = ctx.message.caption || "📢 *Announcement from @Getvoucherprobot*";

      let sentCount = 0;
      for (const u of users) {
        try {
          await ctx.api.sendPhoto(u.id, photoId, { caption, parse_mode: "Markdown" });
          sentCount++;
        } catch {}
      }

      await clearSession(kv, userId);
      await ctx.reply(
        \`✅ *Photo Broadcast Complete!*\\nSuccessfully delivered to *\${sentCount} / \${users.length}* users.\`,
        { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
      );
      return;
    }

    if (session.step !== "AWAITING_PAYMENT_SS" || !session.data?.voucherId) {
      await ctx.reply(
        \`ℹ️ To buy a voucher, please first tap *\${MENU_BTNS.BUY_VOUCHERS}* from the bottom menu, choose your voucher, and then upload your payment screenshot.\`,
        { parse_mode: "Markdown", reply_markup: buildMainMenuKeyboard(isAdmin) }
      );
      return;
    }

    const photos = ctx.message.photo;
    const highestResPhoto = photos[photos.length - 1];
    const orderId = \`ORD-\${Date.now().toString(36).toUpperCase()}\`;

    const newOrder = {
      orderId,
      userId: Number(userId),
      username: ctx.from.username ? \`@\${ctx.from.username}\` : "No Username",
      firstName: ctx.from.first_name || "Customer",
      voucherId: session.data.voucherId,
      category: session.data.category,
      voucherTitle: session.data.title,
      price: session.data.price,
      status: "PENDING",
      photoFileId: highestResPhoto.file_id,
      userNote: ctx.message.caption || "",
      createdAt: new Date().toISOString(),
      voucherCode: null,
    };

    const orders = await kvGetJSON(kv, KV_KEYS.ORDERS, []);
    orders.unshift(newOrder);
    await kvPutJSON(kv, KV_KEYS.ORDERS, orders);
    await clearSession(kv, userId);

    await ctx.reply(
      \`✅ *Payment Screenshot Received!*\\n\` +
        \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
        \`🆔 *Order ID:* \\\`\${orderId}\\\`\\n\` +
        \`🎁 *Voucher:* \${newOrder.voucherTitle}\\n\` +
        \`💰 *Amount:* ₹\${newOrder.price}\\n\` +
        \`📌 *Status:* ⏳ Pending Admin Verification\\n\` +
        \`━━━━━━━━━━━━━━━━━━━━━━\\n\\n\` +
        \`Your payment proof has been forwarded to our verification team. As soon as the Admin approves it, your *Voucher Code* will be delivered right here in a direct message!\`,
      { parse_mode: "Markdown", reply_markup: buildMainMenuKeyboard(isAdmin) }
    );

    const adminActionKeyboard = new InlineKeyboard()
      .text("✅ Approve & Send Code", \`approve_\${orderId}\`)
      .text("❌ Reject", \`reject_\${orderId}\`);

    const adminCaption =
      \`🔔 *NEW PAYMENT PROOF RECEIVED*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`🆔 *Order ID:* \\\`\${orderId}\\\`\\n\` +
      \`👤 *Customer:* \${newOrder.firstName} (\${newOrder.username})\\n\` +
      \`🔢 *User ID:* \\\`\${newOrder.userId}\\\`\\n\` +
      \`🏷️ *Category:* \${newOrder.category}\\n\` +
      \`🎁 *Voucher:* \${newOrder.voucherTitle}\\n\` +
      \`💰 *Amount:* ₹\${newOrder.price}\\n\` +
      \`🕒 *Time:* \${new Date().toUTCString()}\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`⚠️ *Action Required:* Verify the UPI payment screenshot above and click below to dispatch the voucher code from Cloudflare KV stock.\`;

    const adminIds = await getAdminList(kv, env);
    for (const adminId of adminIds) {
      try {
        await ctx.api.sendPhoto(adminId, highestResPhoto.file_id, {
          caption: adminCaption,
          parse_mode: "Markdown",
          reply_markup: adminActionKeyboard,
        });
      } catch (err) {
        console.error(\`Failed to notify admin \${adminId}:\`, err.message);
      }
    }
  });

  // CRITICAL: Manual Admin Approval & Voucher Dispatch from KV Stock
  bot.callbackQuery(/^approve_(.+)$/, async (ctx) => {
    const isAdmin = await isAdminUser(ctx.from.id, kv, env);
    if (!isAdmin) {
      await ctx.answerCallbackQuery({ text: "⛔ Unauthorized: Admin only.", show_alert: true });
      return;
    }

    const orderId = ctx.match[1];
    const orders = await kvGetJSON(kv, KV_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex((o) => o.orderId === orderId);

    if (orderIndex === -1) {
      await ctx.answerCallbackQuery({ text: "❌ Order not found in KV.", show_alert: true });
      return;
    }

    const order = orders[orderIndex];
    if (order.status !== "PENDING") {
      await ctx.answerCallbackQuery({
        text: \`ℹ️ Order is already marked as \${order.status}.\`,
        show_alert: true,
      });
      return;
    }

    const catalog = await getCatalog(kv);
    const voucherItem = catalog.find((v) => v.id === order.voucherId);

    if (!voucherItem || !voucherItem.codes || voucherItem.codes.length === 0) {
      await ctx.answerCallbackQuery({
        text: \`❌ Out of Stock! Please add stock for "\${order.voucherTitle}" in Admin Panel first.\`,
        show_alert: true,
      });
      return;
    }

    const dispatchedCode = voucherItem.codes.shift();
    await kvPutJSON(kv, KV_KEYS.VOUCHERS, catalog);

    order.status = "APPROVED";
    order.voucherCode = dispatchedCode;
    order.approvedAt = new Date().toISOString();
    order.approvedBy = ctx.from.id;
    orders[orderIndex] = order;
    await kvPutJSON(kv, KV_KEYS.ORDERS, orders);

    try {
      await ctx.api.sendMessage(
        order.userId,
        \`🎉 *Payment Approved — Here is Your Voucher!* 🎉\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
          \`🆔 *Order ID:* \\\`\${order.orderId}\\\`\\n\` +
          \`🏷️ *Category:* \${order.category}\\n\` +
          \`🎁 *Voucher:* \${order.voucherTitle}\\n\` +
          \`💰 *Amount Paid:* ₹\${order.price}\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
          \`🔑 *YOUR VOUCHER CODE:*\\n\` +
          \`\\\`\${dispatchedCode}\\\`\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\\n\` +
          \`💡 *Tip:* Tap the code above to copy it instantly! Thank you for shopping with *\${BOT_CONFIG.BOT_USERNAME}*.\`,
        { parse_mode: "Markdown" }
      );
    } catch (err) {
      console.error("Failed to send voucher DM to user:", err.message);
    }

    await ctx.answerCallbackQuery({
      text: \`✅ Approved! Code \${dispatchedCode} sent to user & 1 stock deducted.\`,
    });

    const updatedCaption =
      \`✅ *ORDER APPROVED & VOUCHER DISPATCHED*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`🆔 *Order ID:* \\\`\${order.orderId}\\\`\\n\` +
      \`👤 *Customer:* \${order.firstName} (\\\`\${order.userId}\\\`)\\n\` +
      \`🎁 *Voucher:* \${order.voucherTitle} (₹\${order.price})\\n\` +
      \`🔑 *Dispatched Code:* \\\`\${dispatchedCode}\\\`\\n\` +
      \`📦 *Remaining Stock:* \${voucherItem.codes.length}\\n\` +
      \`👮 *Approved By:* \\\`\${ctx.from.id}\\\`\`;

    try {
      await ctx.editMessageCaption({ caption: updatedCaption, parse_mode: "Markdown" });
    } catch {}
  });

  // Manual Admin Rejection Handler
  bot.callbackQuery(/^reject_(.+)$/, async (ctx) => {
    const isAdmin = await isAdminUser(ctx.from.id, kv, env);
    if (!isAdmin) {
      await ctx.answerCallbackQuery({ text: "⛔ Unauthorized: Admin only.", show_alert: true });
      return;
    }

    const orderId = ctx.match[1];
    const orders = await kvGetJSON(kv, KV_KEYS.ORDERS, []);
    const orderIndex = orders.findIndex((o) => o.orderId === orderId);

    if (orderIndex === -1) {
      await ctx.answerCallbackQuery({ text: "❌ Order not found in KV.", show_alert: true });
      return;
    }

    const order = orders[orderIndex];
    if (order.status !== "PENDING") {
      await ctx.answerCallbackQuery({
        text: \`ℹ️ Order is already marked as \${order.status}.\`,
        show_alert: true,
      });
      return;
    }

    order.status = "REJECTED";
    order.rejectedAt = new Date().toISOString();
    order.rejectedBy = ctx.from.id;
    orders[orderIndex] = order;
    await kvPutJSON(kv, KV_KEYS.ORDERS, orders);

    try {
      await ctx.api.sendMessage(
        order.userId,
        \`❌ *Payment Verification Failed*\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
          \`🆔 *Order ID:* \\\`\${order.orderId}\\\`\\n\` +
          \`🎁 *Voucher:* \${order.voucherTitle} (₹\${order.price})\\n\` +
          \`📌 *Status:* ❌ Rejected\\n\` +
          \`━━━━━━━━━━━━━━━━━━━━━━\\n\\n\` +
          \`We could not verify your payment screenshot. Please contact our support team at \${BOT_CONFIG.SUPPORT_USERNAME} with your Order ID \\\`\${order.orderId}\\\`.\`,
        { parse_mode: "Markdown" }
      );
    } catch {}

    await ctx.answerCallbackQuery({ text: "❌ Order rejected and user notified." });

    const updatedCaption =
      \`❌ *ORDER REJECTED*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`🆔 *Order ID:* \\\`\${order.orderId}\\\`\\n\` +
      \`👤 *Customer:* \${order.firstName} (\\\`\${order.userId}\\\`)\\n\` +
      \`🎁 *Voucher:* \${order.voucherTitle} (₹\${order.price})\\n\` +
      \`👮 *Rejected By:* \\\`\${ctx.from.id}\\\`\`;

    try {
      await ctx.editMessageCaption({ caption: updatedCaption, parse_mode: "Markdown" });
    } catch {}
  });

  // 2. 📋 My Orders & History
  bot.hears(MENU_BTNS.MY_ORDERS, async (ctx) => {
    const isAdmin = ctx.state?.isAdmin || false;
    const orders = await kvGetJSON(kv, KV_KEYS.ORDERS, []);
    const myOrders = orders.filter((o) => Number(o.userId) === Number(ctx.from.id));

    if (myOrders.length === 0) {
      await ctx.reply(
        \`📋 *My Orders & History*\\n\\nYou haven't placed any voucher orders yet!\\nTap *\${MENU_BTNS.BUY_VOUCHERS}* on the bottom menu to grab your first discounted gift card.\`,
        { parse_mode: "Markdown", reply_markup: buildMainMenuKeyboard(isAdmin) }
      );
      return;
    }

    let msg = \`📋 *Your Voucher Orders (\${myOrders.length})*\\n━━━━━━━━━━━━━━━━━━━━━━\\n\\n\`;
    myOrders.slice(0, 10).forEach((o) => {
      const badge =
        o.status === "APPROVED"
          ? "✅ Approved"
          : o.status === "REJECTED"
          ? "❌ Rejected"
          : "⏳ Pending Verification";
      msg += \`🆔 \\\`\${o.orderId}\\\` — *\${o.voucherTitle}*\\n\`;
      msg += \`💰 Amount: ₹\${o.price} | Status: *\${badge}*\\n\`;
      if (o.status === "APPROVED" && o.voucherCode) {
        msg += \`🔑 Voucher Code: \\\`\${o.voucherCode}\\\`\\n\`;
      }
      msg += \`\\n\`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: buildMainMenuKeyboard(isAdmin) });
  });

  // 3. 📖 How To Use / Guide
  bot.hears(MENU_BTNS.HOW_TO_USE, async (ctx) => {
    const isAdmin = ctx.state?.isAdmin || false;
    const guideText =
      \`📖 *How To Buy & Redeem Vouchers on \${BOT_CONFIG.BOT_USERNAME}*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\\n\` +
      \`*Step 1: Choose Your Brand*\\n\` +
      \`Tap *\${MENU_BTNS.BUY_VOUCHERS}* from the bottom menu and select *Amazon, Flipkart, Meesho, or BigBasket*.\\n\\n\` +
      \`*Step 2: Select Denomination & Pay via UPI*\\n\` +
      \`Pick the voucher value you want. You will receive our official UPI ID (\\\`\${upiId}\\\`) and exact discounted price.\\n\\n\` +
      \`*Step 3: Upload Payment Screenshot (SS)*\\n\` +
      \`After completing the UPI payment, send the *Payment Screenshot photo* directly in this chat.\\n\\n\` +
      \`*Step 4: Instant Admin Verification & Code Delivery*\\n\` +
      \`Our Admin team verifies your payment proof and clicks Approve—your 100% genuine Voucher Code is immediately sent to your chat!\\n\\n\` +
      \`💬 *Need Help?* Contact \${BOT_CONFIG.SUPPORT_USERNAME} anytime.\`;

    await ctx.reply(guideText, {
      parse_mode: "Markdown",
      reply_markup: buildMainMenuKeyboard(isAdmin),
    });
  });

  // 4. ⭐ Reviews & Feedback
  bot.hears(MENU_BTNS.REVIEWS, async (ctx) => {
    const reviews = await kvGetJSON(kv, KV_KEYS.REVIEWS, [
      {
        userId: 512098311,
        name: "Rahul S.",
        text: "Bought Rs.1000 Amazon gift card for Rs.940! Got the code within 2 minutes of sending payment screenshot.",
        createdAt: "2025-02-10",
      },
      {
        userId: 619283744,
        name: "Priya M.",
        text: "Super smooth experience on Flipkart & BigBasket vouchers. Highly trusted!",
        createdAt: "2025-02-12",
      },
    ]);

    await setSession(kv, ctx.from.id, "AWAITING_USER_REVIEW", {});

    let msg = \`⭐ *Customer Reviews & Feedback*\\n━━━━━━━━━━━━━━━━━━━━━━\\n\\n\`;
    reviews.slice(0, 5).forEach((r) => {
      msg += \`🌟 *"\${r.text}"*\\n   — *\${r.name}*\\n\\n\`;
    });
    msg += \`✍️ *Want to share your experience?*\\nType and send your review message below, or tap *\${MENU_BTNS.BACK_MAIN}* to return.\`;

    const backKb = new Keyboard().text(MENU_BTNS.BACK_MAIN).resized().persistent();
    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: backKb });
  });

  // 5. 💬 Support
  bot.hears(MENU_BTNS.SUPPORT, async (ctx) => {
    const supportInline = new InlineKeyboard().url(
      \`💬 Message \${BOT_CONFIG.SUPPORT_USERNAME}\`,
      BOT_CONFIG.SUPPORT_URL
    );

    await ctx.reply(
      \`💬 *Customer Support & Helpdesk*\\n\` +
        \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
        \`Having trouble with a payment, order verification, or bulk voucher inquiry?\\n\\n\` +
        \`👤 *Official Support:* \${BOT_CONFIG.SUPPORT_USERNAME}\\n\` +
        \`🔗 *Direct Chat Link:* \${BOT_CONFIG.SUPPORT_URL}\\n\\n\` +
        \`👇 Tap the button below to open a direct chat with \${BOT_CONFIG.SUPPORT_USERNAME}:\`,
      { parse_mode: "Markdown", reply_markup: supportInline }
    );
  });

  // 6. ⚙️ Admin Panel (ONLY FOR ${cfg.adminId} & SECONDARY ADMINS)
  bot.hears(MENU_BTNS.ADMIN_PANEL, async (ctx) => {
    if (!ctx.state?.isAdmin) {
      await ctx.reply("⛔ Access Denied: This menu is restricted to authorized administrators.");
      return;
    }

    await clearSession(kv, ctx.from.id);
    await ctx.reply(
      \`⚙️ *Admin Control Panel — \${BOT_CONFIG.BOT_USERNAME}*\\n\` +
        \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
        \`👮 *Admin ID:* \\\`\${ctx.from.id}\\\`\\n\` +
        \`🗄️ *Database:* Cloudflare Workers KV (\\\`BOT_KV\\\`)\\n\\n\` +
        \`Select an administrative module from the bottom keyboard:\`,
      { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
    );
  });

  bot.hears(ADMIN_BTNS.ADD_STOCK, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    await setSession(kv, ctx.from.id, "ADMIN_ADD_STOCK", {});

    const instructions =
      \`➕ *Add Stock / New Voucher to Cloudflare KV*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`Send the voucher details in the following pipe-separated format:\\n\\n\` +
      \`\\\`Category | Title | Price | Code1, Code2, Code3\\\`\\n\\n\` +
      \`📌 *Supported Categories:* \\\`Amazon\\\`, \\\`Flipkart\\\`, \\\`Meesho\\\`, \\\`BigBasket\\\`\\n\\n\` +
      \`📝 *Example:*\\n\` +
      \`\\\`Amazon | Amazon Pay Gift Card Rs.500 | 475 | AMZ-500-A1, AMZ-500-B2\\\`\`;

    await ctx.reply(instructions, {
      parse_mode: "Markdown",
      reply_markup: buildAdminReplyKeyboard(),
    });
  });

  bot.hears(ADMIN_BTNS.UPDATE_QR, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    await setSession(kv, ctx.from.id, "ADMIN_SET_QR_CODE", {});

    const existingQr = await kv.get(KV_KEYS.QR_CODE);
    const promptMsg =
      \`📷 *Add / Update UPI Payment QR Code*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`🏦 *Permanent UPI ID:* \\\`ankitsmm@fam\\\`\\n\` +
      \`🗄️ *Current KV QR Status:* \${existingQr ? "✅ Custom QR Stored in KV" : "ℹ️ Using Default Generated QR"}\\n\\n\` +
      \`📤 *How to Update:*\\n\` +
      \`Simply **upload & send the QR Code photo** directly here in this chat. The bot will save its file ID in Cloudflare KV (\\\`\${KV_KEYS.QR_CODE}\\\`) and automatically send it to every user at checkout!\\n\\n\` +
      \`*(Or send \\\`reset\\\` to revert to the default QR code)*\`;

    if (existingQr) {
      try {
        await ctx.replyWithPhoto(existingQr, {
          caption: promptMsg,
          parse_mode: "Markdown",
          reply_markup: buildAdminReplyKeyboard(),
        });
        return;
      } catch {}
    }

    await ctx.reply(promptMsg, {
      parse_mode: "Markdown",
      reply_markup: buildAdminReplyKeyboard(),
    });
  });

  bot.hears(ADMIN_BTNS.USER_LIST, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    const users = await kvGetJSON(kv, KV_KEYS.USERS, []);

    let msg =
      \`👥 *Registered Bot Users*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`📊 *Total Registered Users:* *\${users.length}*\\n\\n\`;

    users.slice(-25).reverse().forEach((u, idx) => {
      msg += \`\${idx + 1}. *\${u.firstName}* (\${u.username}) — ID: \\\`\${u.id}\\\`\\n\`;
    });

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() });
  });

  bot.hears(ADMIN_BTNS.BROADCAST, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    await setSession(kv, ctx.from.id, "ADMIN_BROADCAST_INPUT", {});
    await ctx.reply(
      \`📢 *Broadcast Message to All Users*\\n━━━━━━━━━━━━━━━━━━━━━━\\nSend the *text message* or *photo with caption* you want to broadcast to all registered users.\`,
      { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
    );
  });

  bot.hears(ADMIN_BTNS.FORCE_CHANNEL, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    const currentChannel = (await kv.get(KV_KEYS.FORCE_CHANNEL)) || "None (Disabled)";
    await setSession(kv, ctx.from.id, "ADMIN_SET_FORCE_CHANNEL", {});

    await ctx.reply(
      \`🔗 *Manage Force Join Channel*\\n━━━━━━━━━━━━━━━━━━━━━━\\n📡 *Current Force Channel:* \\\`\${currentChannel}\\\`\\n\\nSend the new channel username (e.g., \\\`@GetVoucherUpdates\\\`) or send \\\`none\\\` to disable.\`,
      { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
    );
  });

  bot.hears(ADMIN_BTNS.MANAGE_ADMINS, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    const admins = await getAdminList(kv, env);
    await setSession(kv, ctx.from.id, "ADMIN_MANAGE_ADMINS", {});

    const msg =
      \`🛡️ *Manage Bot Administrators*\\n━━━━━━━━━━━━━━━━━━━━━━\\n👑 *Primary Root Admin:* \\\`\${BOT_CONFIG.PRIMARY_ADMIN_ID}\\\`\\n👮 *All Active Admins (\${admins.length}):*\\n\` +
      admins.map((id) => \`• \\\`\${id}\\\`\`).join("\\n") +
      \`\\n\\n• Send \\\`add 123456789\\\` to grant admin access\\n• Send \\\`remove 123456789\\\` to revoke admin access\`;

    await ctx.reply(msg, { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() });
  });

  bot.hears(ADMIN_BTNS.BOT_STATS, async (ctx) => {
    if (!ctx.state?.isAdmin) return;
    const users = await kvGetJSON(kv, KV_KEYS.USERS, []);
    const catalog = await getCatalog(kv);
    const orders = await kvGetJSON(kv, KV_KEYS.ORDERS, []);
    const forceChannel = (await kv.get(KV_KEYS.FORCE_CHANNEL)) || "Disabled";

    const totalProducts = catalog.length;
    const totalAvailableCodes = catalog.reduce((sum, item) => sum + (item.codes?.length || 0), 0);
    const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
    const approvedOrders = orders.filter((o) => o.status === "APPROVED").length;
    const rejectedOrders = orders.filter((o) => o.status === "REJECTED").length;
    const totalRevenue = orders
      .filter((o) => o.status === "APPROVED")
      .reduce((sum, o) => sum + Number(o.price || 0), 0);

    const statsMsg =
      \`📊 *\${BOT_CONFIG.BOT_USERNAME} — Live Cloudflare KV Statistics*\\n\` +
      \`━━━━━━━━━━━━━━━━━━━━━━\\n\` +
      \`👥 *Total Registered Users:* \${users.length}\\n\` +
      \`🔗 *Force Join Channel:* \\\`\${forceChannel}\\\`\\n\\n\` +
      \`📦 *Voucher Inventory:*\\n\` +
      \`• Active Voucher Products: *\${totalProducts}*\\n\` +
      \`• Total Ready Codes in Stock: *\${totalAvailableCodes}*\\n\\n\` +
      \`🧾 *Orders & Revenue:*\\n\` +
      \`• Total Orders Submitted: *\${orders.length}*\\n\` +
      \`• ⏳ Pending Verification: *\${pendingOrders}*\\n\` +
      \`• ✅ Approved & Dispatched: *\${approvedOrders}*\\n\` +
      \`• ❌ Rejected Orders: *\${rejectedOrders}*\\n\` +
      \`• 💰 Total Verified Revenue: *₹\${totalRevenue}*\`;

    await ctx.reply(statsMsg, { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() });
  });

  // Stateful Text Input Handler
  bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const isAdmin = ctx.state?.isAdmin || false;
    const session = await getSession(kv, userId);

    if (session.step === "AWAITING_USER_REVIEW") {
      const reviews = await kvGetJSON(kv, KV_KEYS.REVIEWS, []);
      reviews.unshift({
        userId,
        name: ctx.from.first_name || "Verified Buyer",
        text: text.slice(0, 280),
        createdAt: new Date().toISOString().split("T")[0],
      });
      await kvPutJSON(kv, KV_KEYS.REVIEWS, reviews.slice(0, 50));
      await clearSession(kv, userId);

      await ctx.reply(\`🌟 *Thank you for your feedback!*\\nYour review has been saved and published.\`, {
        parse_mode: "Markdown",
        reply_markup: buildMainMenuKeyboard(isAdmin),
      });
      return;
    }

    if (isAdmin && session.step === "ADMIN_ADD_STOCK") {
      const parts = text.split("|").map((p) => p.trim());
      if (parts.length < 4) {
        await ctx.reply(
          \`❌ *Invalid Format!*\\nPlease use:\\n\\\`Category | Title | Price | Code1, Code2\\\`\`,
          { parse_mode: "Markdown" }
        );
        return;
      }

      const [category, title, priceStr, codesRaw] = parts;
      const price = Number(priceStr);
      const newCodes = codesRaw.split(",").map((c) => c.trim()).filter(Boolean);

      if (isNaN(price) || price <= 0 || newCodes.length === 0) {
        await ctx.reply("❌ Please provide a valid numeric price and at least one voucher code.");
        return;
      }

      const catalog = await getCatalog(kv);
      const existing = catalog.find(
        (v) =>
          v.category.toLowerCase() === category.toLowerCase() &&
          v.title.toLowerCase() === title.toLowerCase()
      );

      if (existing) {
        existing.price = price;
        existing.codes = [...(existing.codes || []), ...newCodes];
      } else {
        catalog.push({
          id: \`\${category.toLowerCase().slice(0, 3)}_\${Date.now().toString(36)}\`,
          category,
          title,
          price,
          codes: newCodes,
        });
      }

      await kvPutJSON(kv, KV_KEYS.VOUCHERS, catalog);
      await clearSession(kv, userId);

      await ctx.reply(
        \`✅ *Voucher Stock Saved to Cloudflare KV!*\\n🏷️ *Category:* \${category}\\n🎁 *Title:* \${title}\\n💰 *Price:* ₹\${price}\\n➕ *Codes Added:* \${newCodes.length}\`,
        { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
      );
      return;
    }

    if (isAdmin && session.step === "ADMIN_BROADCAST_INPUT") {
      const users = await kvGetJSON(kv, KV_KEYS.USERS, []);
      let sentCount = 0;
      for (const u of users) {
        try {
          await ctx.api.sendMessage(
            u.id,
            \`📢 *Announcement — \${BOT_CONFIG.BOT_USERNAME}*\\n━━━━━━━━━━━━━━━━━━━━━━\\n\\n\${text}\`,
            { parse_mode: "Markdown" }
          );
          sentCount++;
        } catch {}
      }
      await clearSession(kv, userId);
      await ctx.reply(\`✅ *Broadcast Sent!*\\nDelivered to *\${sentCount} / \${users.length}* users.\`, {
        parse_mode: "Markdown",
        reply_markup: buildAdminReplyKeyboard(),
      });
      return;
    }

    if (isAdmin && session.step === "ADMIN_SET_FORCE_CHANNEL") {
      if (text.toLowerCase() === "none" || text.toLowerCase() === "off") {
        await kv.delete(KV_KEYS.FORCE_CHANNEL);
        await clearSession(kv, userId);
        await ctx.reply("✅ Force Channel requirement has been *disabled*.", {
          parse_mode: "Markdown",
          reply_markup: buildAdminReplyKeyboard(),
        });
        return;
      }
      const formatted = text.startsWith("@") ? text : \`@\${text}\`;
      await kv.put(KV_KEYS.FORCE_CHANNEL, formatted);
      await clearSession(kv, userId);
      await ctx.reply(
        \`✅ *Force Channel Updated!*\\nUsers must now join *\${formatted}* before accessing *\${BOT_CONFIG.BOT_USERNAME}*.\`,
        { parse_mode: "Markdown", reply_markup: buildAdminReplyKeyboard() }
      );
      return;
    }

    if (isAdmin && session.step === "ADMIN_MANAGE_ADMINS") {
      const [action, targetIdStr] = text.split(/\\s+/);
      const targetId = Number(targetIdStr);
      if (!action || isNaN(targetId)) {
        await ctx.reply("❌ Usage: \`add 123456789\` or \`remove 123456789\`", {
          parse_mode: "Markdown",
        });
        return;
      }
      let extraAdmins = await kvGetJSON(kv, KV_KEYS.ADMINS, []);
      if (action.toLowerCase() === "add") {
        if (!extraAdmins.includes(targetId)) extraAdmins.push(targetId);
        await kvPutJSON(kv, KV_KEYS.ADMINS, extraAdmins);
        await clearSession(kv, userId);
        await ctx.reply(\`✅ Added \\\`\${targetId}\\\` as an Administrator.\`, {
          parse_mode: "Markdown",
          reply_markup: buildAdminReplyKeyboard(),
        });
      } else if (action.toLowerCase() === "remove") {
        if (targetId === BOT_CONFIG.PRIMARY_ADMIN_ID) {
          await ctx.reply("⛔ Cannot remove the Primary Root Admin (${cfg.adminId}).");
          return;
        }
        extraAdmins = extraAdmins.filter((id) => Number(id) !== targetId);
        await kvPutJSON(kv, KV_KEYS.ADMINS, extraAdmins);
        await clearSession(kv, userId);
        await ctx.reply(\`✅ Removed \\\`\${targetId}\\\` from Administrators.\`, {
          parse_mode: "Markdown",
          reply_markup: buildAdminReplyKeyboard(),
        });
      }
      return;
    }

    if (isAdmin && session.step === "ADMIN_SET_QR_CODE") {
      if (text.toLowerCase() === "reset" || text.toLowerCase() === "default") {
        await kv.delete(KV_KEYS.QR_CODE);
        await clearSession(kv, userId);
        await ctx.reply(
          "✅ Custom QR Code removed from KV. The bot will use the default QR code for \`ankitsmm@fam\`.",
          {
            parse_mode: "Markdown",
            reply_markup: buildAdminReplyKeyboard(),
          }
        );
        return;
      }
      await ctx.reply(
        "📷 Please **upload a photo** of your UPI QR Code directly in this chat (or send \`reset\` to clear).",
        {
          parse_mode: "Markdown",
          reply_markup: buildAdminReplyKeyboard(),
        }
      );
      return;
    }

    await showMainMenu(ctx);
  });

  return bot;
}

// ============================================================================
// 6. CLOUDFLARE WORKER ENTRYPOINT (FETCH HANDLER)
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response(
        JSON.stringify({
          ok: true,
          bot: BOT_CONFIG.BOT_USERNAME,
          adminId: BOT_CONFIG.PRIMARY_ADMIN_ID,
          support: BOT_CONFIG.SUPPORT_USERNAME,
          kvBound: Boolean(env.BOT_KV),
          webhookSetupUrl: \`\${url.origin}/setup-webhook\`,
        }),
        { headers: { "content-type": "application/json;charset=UTF-8" } }
      );
    }

    if (request.method === "GET" && url.pathname === "/setup-webhook") {
      if (!env.BOT_TOKEN) {
        return new Response("Error: BOT_TOKEN secret is not configured in Cloudflare Worker.", {
          status: 500,
        });
      }
      const webhookUrl = \`\${url.origin}/webhook\`;
      const tgRes = await fetch(
        \`https://api.telegram.org/bot\${env.BOT_TOKEN}/setWebhook?url=\${encodeURIComponent(webhookUrl)}\`
      );
      const result = await tgRes.json();
      return new Response(JSON.stringify({ webhookUrl, telegramResponse: result }, null, 2), {
        headers: { "content-type": "application/json;charset=UTF-8" },
      });
    }

    if (request.method === "POST") {
      try {
        const bot = createBot(env);
        const handleUpdate = webhookCallback(bot, "cloudflare-mod");
        return await handleUpdate(request);
      } catch (err) {
        console.error("Telegram webhook error:", err);
        return new Response("OK", { status: 200 });
      }
    }

    return new Response("Method Not Allowed", { status: 405 });
  },
};`;
}
