/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  Copy,
  Check,
  Download,
  Send,
  Image as ImageIcon,
  ShieldCheck,
  Database,
  Code2,
  Smartphone,
  BookOpen,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Lock,
  Unlock,
} from "lucide-react";
import {
  DEFAULT_WORKER_CONFIG,
  WorkerConfigParams,
  generateIndexJs,
  generatePackageJson,
  generateWranglerToml,
} from "./data/cloudflareWorkerFiles";

// ============================================================================
// TYPES FOR LIVE CLOUDFLARE KV & TELEGRAM BOT SIMULATOR
// ============================================================================

interface VoucherProduct {
  id: string;
  category: "Amazon" | "Flipkart" | "Meesho" | "BigBasket";
  title: string;
  price: number;
  codes: string[];
}

interface OrderRecord {
  orderId: string;
  userId: number;
  username: string;
  firstName: string;
  voucherId: string;
  category: string;
  voucherTitle: string;
  price: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  screenshotUrl: string;
  utrNumber: string;
  createdAt: string;
  voucherCode?: string;
}

interface BotUser {
  id: number;
  username: string;
  firstName: string;
  joinedAt: string;
}

interface ReviewItem {
  userId: number;
  name: string;
  text: string;
  createdAt: string;
}

interface ChatMessage {
  id: string;
  sender: "bot" | "user";
  text: string;
  timestamp: string;
  screenshotUrl?: string;
  utrNumber?: string;
  qrCodeLabel?: string;
  qrImageSrc?: string | null;
  inlineButtons?: Array<{
    label: string;
    action: string;
    variant?: "approve" | "reject" | "link" | "verify";
    url?: string;
    disabled?: boolean;
  }>;
  orderIdRef?: string;
}

type ReplyKeyboardMode =
  | "USER_MAIN"
  | "USER_CATEGORIES"
  | "USER_CATEGORY_VOUCHERS"
  | "USER_AWAITING_SS"
  | "USER_AWAITING_REVIEW"
  | "ADMIN_MAIN"
  | "ADMIN_PANEL";

const INITIAL_VOUCHERS: VoucherProduct[] = [
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

const INITIAL_USERS: BotUser[] = [
  {
    id: 8838351233,
    username: "@AdminRoot",
    firstName: "Primary Admin",
    joinedAt: "2025-02-01 09:00",
  },
  {
    id: 591028411,
    username: "@arjun_sharma",
    firstName: "Arjun Sharma",
    joinedAt: "2025-02-14 14:22",
  },
  {
    id: 619283744,
    username: "@priya_verma",
    firstName: "Priya Verma",
    joinedAt: "2025-02-15 18:05",
  },
];

const INITIAL_REVIEWS: ReviewItem[] = [
  {
    userId: 591028411,
    name: "Arjun Sharma",
    text: "Bought Rs.1000 Amazon gift card for Rs.940! Got the code right after Admin approved my UPI screenshot.",
    createdAt: "2025-02-14",
  },
  {
    userId: 619283744,
    name: "Priya Verma",
    text: "Super smooth experience on Flipkart & BigBasket vouchers. Highly trusted bot!",
    createdAt: "2025-02-15",
  },
];

function nowTime(): string {
  const d = new Date();
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  // Active Top Navigation Section
  const [activeSection, setActiveSection] = useState<
    "codebase" | "simulator" | "kv" | "deploy"
  >("codebase");

  // Codebase File Selector & Config
  const [selectedFile, setSelectedFile] = useState<
    "index.js" | "wrangler.toml" | "package.json"
  >("index.js");
  const [workerConfig, setWorkerConfig] = useState<WorkerConfigParams>(
    DEFAULT_WORKER_CONFIG
  );
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // Simulated Cloudflare KV State (`env.BOT_KV`)
  const [kvVouchers, setKvVouchers] =
    useState<VoucherProduct[]>(INITIAL_VOUCHERS);
  const [kvOrders, setKvOrders] = useState<OrderRecord[]>([]);
  const [kvUsers, setKvUsers] = useState<BotUser[]>(INITIAL_USERS);
  const [kvReviews, setKvReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS);
  const [kvForceChannel, setKvForceChannel] =
    useState<string>("@GetVoucherUpdates");
  const [kvQrCode, setKvQrCode] = useState<string>(
    "AgACAgUAAxkBAAIC_ankitsmm_fam_qr_v1"
  );
  const [kvQrImageDataUrl, setKvQrImageDataUrl] = useState<string | null>(null);
  const [kvSecondaryAdmins, setKvSecondaryAdmins] = useState<number[]>([]);

  // Simulated Customer State (User ID: 591028411)
  const [userJoinedChannel, setUserJoinedChannel] = useState<boolean>(true);
  const [userKbMode, setUserKbMode] = useState<ReplyKeyboardMode>("USER_MAIN");
  const [selectedCategory, setSelectedCategory] = useState<
    VoucherProduct["category"] | null
  >(null);
  const [pendingCheckoutVoucher, setPendingCheckoutVoucher] =
    useState<VoucherProduct | null>(null);
  const [userInputText, setUserInputText] = useState("");

  // Simulated Admin State (Admin ID: 8838351233)
  const [adminKbMode, setAdminKbMode] =
    useState<ReplyKeyboardMode>("ADMIN_MAIN");
  const [adminSessionStep, setAdminSessionStep] = useState<
    | "IDLE"
    | "ADMIN_ADD_STOCK"
    | "ADMIN_SET_QR_CODE"
    | "ADMIN_BROADCAST_INPUT"
    | "ADMIN_SET_FORCE_CHANNEL"
    | "ADMIN_MANAGE_ADMINS"
  >("IDLE");
  const [adminInputText, setAdminInputText] = useState("");
  const qrFileInputRef = useRef<HTMLInputElement>(null);

  // KV Quick Add Stock Form State
  const [newStockCat, setNewStockCat] =
    useState<VoucherProduct["category"]>("Amazon");
  const [newStockTitle, setNewStockTitle] = useState(
    "Amazon Pay Gift Card Rs.500"
  );
  const [newStockPrice, setNewStockPrice] = useState("475");
  const [newStockCodes, setNewStockCodes] = useState(
    "AMZN-500-NEW1, AMZN-500-NEW2"
  );

  // Customer Chat Messages
  const [userMessages, setUserMessages] = useState<ChatMessage[]>([
    {
      id: "u-init-1",
      sender: "bot",
      timestamp: "10:00 AM",
      text:
        `✨ Welcome to ${DEFAULT_WORKER_CONFIG.botUsername}! ✨\n\n` +
        `🇮🇳 India's Most Trusted Instant Voucher Store\n` +
        `Get genuine, verified gift cards & shopping vouchers for Amazon, Flipkart, Meesho, and BigBasket at exclusive discounted prices!\n\n` +
        `🔹 100% Verified Voucher Codes\n` +
        `🔹 Fast Manual Verification & Direct Dispatch\n` +
        `🔹 24/7 Dedicated Support: ${DEFAULT_WORKER_CONFIG.supportUsername}\n\n` +
        `👇 Select an option from the colourful bottom Reply Keyboard below:`,
    },
  ]);

  // Admin Chat Messages (8838351233)
  const [adminMessages, setAdminMessages] = useState<ChatMessage[]>([
    {
      id: "a-init-1",
      sender: "bot",
      timestamp: "10:00 AM",
      text:
        `⚙️ Welcome Root Admin (8838351233)!\n\n` +
        `Because your Telegram ID matches 8838351233, your bottom Main Menu Reply Keyboard includes the exclusive "⚙️ Admin Panel" button.\n\n` +
        `When a customer uploads a Payment Screenshot (SS), it will be forwarded directly here with [ ✅ Approve & Send Code ] and [ ❌ Reject ] inline buttons.`,
    },
  ]);

  const userChatEndRef = useRef<HTMLDivElement>(null);
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    userChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [userMessages]);

  useEffect(() => {
    adminChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [adminMessages]);

  // ==========================================================================
  // CODE COPY & DOWNLOAD HANDLERS
  // ==========================================================================
  const getFileContent = (
    fileName: "index.js" | "wrangler.toml" | "package.json"
  ) => {
    if (fileName === "package.json") return generatePackageJson();
    if (fileName === "wrangler.toml")
      return generateWranglerToml(workerConfig);
    return generateIndexJs(workerConfig);
  };

  const handleCopyCode = (
    fileName: "index.js" | "wrangler.toml" | "package.json"
  ) => {
    navigator.clipboard.writeText(getFileContent(fileName));
    setCopiedFile(fileName);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleDownloadFile = (
    fileName: "index.js" | "wrangler.toml" | "package.json"
  ) => {
    const content = getFileContent(fileName);
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllFiles = () => {
    (["package.json", "wrangler.toml", "index.js"] as const).forEach(
      (file, index) => {
        setTimeout(() => handleDownloadFile(file), index * 250);
      }
    );
  };

  // ==========================================================================
  // CUSTOMER SIMULATOR LOGIC (Mirroring index.js grammY handlers)
  // ==========================================================================

  const appendUserMessage = (msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setUserMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `u-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowTime(),
      },
    ]);
  };

  const appendAdminMessage = (msg: Omit<ChatMessage, "id" | "timestamp">) => {
    setAdminMessages((prev) => [
      ...prev,
      {
        ...msg,
        id: `a-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: nowTime(),
      },
    ]);
  };

  const checkForceChannelGate = (): boolean => {
    if (
      kvForceChannel &&
      kvForceChannel.trim() !== "" &&
      kvForceChannel.toLowerCase() !== "none" &&
      !userJoinedChannel
    ) {
      appendUserMessage({
        sender: "bot",
        text:
          `🔒 Access Restricted — Channel Verification Required\n\n` +
          `Welcome to ${workerConfig.botUsername}! Before accessing discounted gift vouchers, you must join our official updates channel:\n\n` +
          `👉 Channel: ${kvForceChannel}\n\n` +
          `Click the button below to join, then tap "✅ Joined / Verify Access".`,
        inlineButtons: [
          {
            label: `📢 Join ${kvForceChannel}`,
            action: "join_channel_sim",
            variant: "link",
          },
          {
            label: "✅ Joined / Verify Access",
            action: "verify_force_join",
            variant: "verify",
          },
        ],
      });
      return false;
    }
    return true;
  };

  const handleUserReplyButtonClick = (label: string) => {
    appendUserMessage({ sender: "user", text: label });

    if (!checkForceChannelGate()) return;

    if (label === "🔙 Main Menu" || label === "/start") {
      setPendingCheckoutVoucher(null);
      setSelectedCategory(null);
      setUserKbMode("USER_MAIN");
      appendUserMessage({
        sender: "bot",
        text:
          `✨ Welcome to ${workerConfig.botUsername}! ✨\n\n` +
          `Select an option from the bottom menu below:`,
      });
      return;
    }

    if (label === "🎁 Buy Vouchers") {
      setPendingCheckoutVoucher(null);
      setSelectedCategory(null);
      setUserKbMode("USER_CATEGORIES");

      const countCat = (cat: string) =>
        kvVouchers
          .filter((v) => v.category.toLowerCase() === cat.toLowerCase())
          .reduce((acc, v) => acc + v.codes.length, 0);

      appendUserMessage({
        sender: "bot",
        text:
          `🎁 Select Voucher Brand / Category\n\n` +
          `📦 Amazon: ${countCat("Amazon")} vouchers in stock\n` +
          `🛍️ Flipkart: ${countCat("Flipkart")} vouchers in stock\n` +
          `🛒 Meesho: ${countCat("Meesho")} vouchers in stock\n` +
          `🧺 BigBasket: ${countCat("BigBasket")} vouchers in stock\n\n` +
          `👇 Tap a category on the bottom Reply Keyboard to view available denominations:`,
      });
      return;
    }

    const catMap: Record<
      string,
      { name: VoucherProduct["category"]; emoji: string }
    > = {
      "📦 Amazon": { name: "Amazon", emoji: "📦" },
      "🛍️ Flipkart": { name: "Flipkart", emoji: "🛍️" },
      "🛒 Meesho": { name: "Meesho", emoji: "🛒" },
      "🧺 BigBasket": { name: "BigBasket", emoji: "🧺" },
    };

    if (catMap[label]) {
      const { name, emoji } = catMap[label];
      const available = kvVouchers.filter(
        (v) => v.category === name && v.codes.length > 0
      );

      if (available.length === 0) {
        appendUserMessage({
          sender: "bot",
          text:
            `${emoji} ${name} Vouchers\n\n` +
            `⚠️ Currently Out of Stock in this category.\n` +
            `Please check another category or contact ${workerConfig.supportUsername} for restock updates.`,
        });
        return;
      }

      setSelectedCategory(name);
      setUserKbMode("USER_CATEGORY_VOUCHERS");

      let text = `${emoji} Available ${name} Vouchers\n\n`;
      available.forEach((v, idx) => {
        text += `${idx + 1}. ${v.title}\n   💰 Discounted Price: ₹${v.price}\n   📦 Available Stock: ${v.codes.length} left\n\n`;
      });
      text += `👇 Tap a voucher on the bottom Reply Keyboard to proceed to payment:`;

      appendUserMessage({ sender: "bot", text });
      return;
    }

    // Check if user clicked a specific voucher button "🎟️ <Title> — ₹<Price>"
    if (label.startsWith("🎟️ ")) {
      const titlePart = label.replace(/^🎟️\s+/, "").split(" — ₹")[0].trim();
      const voucher = kvVouchers.find(
        (v) =>
          v.title.toLowerCase() === titlePart.toLowerCase() &&
          v.codes.length > 0
      );

      if (!voucher) {
        appendUserMessage({
          sender: "bot",
          text: `❌ Sorry, "${titlePart}" is currently out of stock.`,
        });
        return;
      }

      setPendingCheckoutVoucher(voucher);
      setUserKbMode("USER_AWAITING_SS");

      appendUserMessage({
        sender: "bot",
        qrCodeLabel: kvQrCode || "DEFAULT_QR (ankitsmm@fam)",
        qrImageSrc: kvQrImageDataUrl,
        text:
          `💳 Payment Instructions — ${voucher.title}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏷️ Category: ${voucher.category}\n` +
          `🎁 Voucher: ${voucher.title}\n` +
          `💰 Amount to Pay: ₹${voucher.price}\n` +
          `🏦 UPI ID: ankitsmm@fam\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `📌 How to Complete Your Purchase:\n` +
          `1️⃣ Scan the QR Code above or pay ₹${voucher.price} to UPI ID ankitsmm@fam.\n` +
          `2️⃣ Take a clear Payment Screenshot (SS) showing the UTR ID.\n` +
          `3️⃣ Click the "📸 Send Payment Screenshot (SS)" button below to upload your proof!\n\n` +
          `⏳ Note: Once you send the photo, our Admin (${workerConfig.adminId}) will verify your payment and manually dispatch your voucher code directly to you!`,
      });
      return;
    }

    if (label === "📋 My Orders & History") {
      const myOrders = kvOrders.filter((o) => o.userId === 591028411);
      if (myOrders.length === 0) {
        appendUserMessage({
          sender: "bot",
          text:
            `📋 My Orders & History\n\n` +
            `You haven't placed any voucher orders yet!\n` +
            `Tap "🎁 Buy Vouchers" on the bottom menu to grab your first discounted gift card.`,
        });
        return;
      }

      let msg = `📋 Your Voucher Orders (${myOrders.length})\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      myOrders.forEach((o) => {
        const statusLabel =
          o.status === "APPROVED"
            ? "✅ Approved"
            : o.status === "REJECTED"
            ? "❌ Rejected"
            : "⏳ Pending Verification";
        msg += `🆔 ${o.orderId} — ${o.voucherTitle}\n`;
        msg += `💰 Amount: ₹${o.price} · Status: ${statusLabel}\n`;
        if (o.status === "APPROVED" && o.voucherCode) {
          msg += `🔑 Voucher Code: ${o.voucherCode}\n`;
        }
        msg += `\n`;
      });

      appendUserMessage({ sender: "bot", text: msg.trim() });
      return;
    }

    if (label === "📖 How To Use / Guide") {
      appendUserMessage({
        sender: "bot",
        text:
          `📖 How To Buy & Redeem Vouchers on ${workerConfig.botUsername}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Step 1: Choose Your Brand\n` +
          `Tap "🎁 Buy Vouchers" from the bottom menu and select Amazon, Flipkart, Meesho, or BigBasket.\n\n` +
          `Step 2: Select Denomination & Pay via UPI\n` +
          `Pick the voucher value you want. Pay the exact discounted amount to ${workerConfig.upiId}.\n\n` +
          `Step 3: Upload Payment Screenshot (SS)\n` +
          `Send the Payment Screenshot photo directly in this chat.\n\n` +
          `Step 4: Manual Admin Verification & Code Delivery\n` +
          `Admin (${workerConfig.adminId}) verifies your screenshot and clicks Approve — 1 stock is deducted from Cloudflare KV and your Voucher Code is delivered directly here!`,
      });
      return;
    }

    if (label === "⭐ Reviews & Feedback") {
      setUserKbMode("USER_AWAITING_REVIEW");
      let msg = `⭐ Customer Reviews & Feedback\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
      kvReviews.slice(0, 4).forEach((r) => {
        msg += `🌟 "${r.text}"\n   — ${r.name}\n\n`;
      });
      msg += `✍️ Type your review in the message box below and hit Send, or tap "🔙 Main Menu".`;
      appendUserMessage({ sender: "bot", text: msg });
      return;
    }

    if (label === "💬 Support") {
      appendUserMessage({
        sender: "bot",
        text:
          `💬 Customer Support & Helpdesk\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Having trouble with a payment, order verification, or bulk voucher inquiry?\n\n` +
          `👤 Official Support: ${workerConfig.supportUsername}\n` +
          `🔗 Direct Chat: https://t.me/${workerConfig.supportUsername.replace(/^@/, "")}`,
        inlineButtons: [
          {
            label: `💬 Message ${workerConfig.supportUsername}`,
            action: "open_support",
            variant: "link",
            url: `https://t.me/${workerConfig.supportUsername.replace(/^@/, "")}`,
          },
        ],
      });
      return;
    }
  };

  // Handle Customer Uploading Payment Screenshot (SS)
  const handleSendPaymentScreenshot = () => {
    if (!pendingCheckoutVoucher) return;

    const orderId = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;
    const utrNumber = `4048${Math.floor(10000000 + Math.random() * 90000000)}`;

    const newOrder: OrderRecord = {
      orderId,
      userId: 591028411,
      username: "@arjun_sharma",
      firstName: "Arjun Sharma",
      voucherId: pendingCheckoutVoucher.id,
      category: pendingCheckoutVoucher.category,
      voucherTitle: pendingCheckoutVoucher.title,
      price: pendingCheckoutVoucher.price,
      status: "PENDING",
      screenshotUrl: "simulated_upi_receipt",
      utrNumber,
      createdAt: nowTime(),
    };

    setKvOrders((prev) => [newOrder, ...prev]);

    // 1. Show photo sent in User Chat
    appendUserMessage({
      sender: "user",
      text: `📸 Payment Screenshot Uploaded (${pendingCheckoutVoucher.title} — ₹${pendingCheckoutVoucher.price})`,
      screenshotUrl: "simulated_upi_receipt",
      utrNumber,
    });

    // 2. Bot responds to Customer (DOES NOT auto-send voucher code or deduct stock)
    appendUserMessage({
      sender: "bot",
      text:
        `✅ Payment Screenshot Received!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 Order ID: ${orderId}\n` +
        `🎁 Voucher: ${newOrder.voucherTitle}\n` +
        `💰 Amount: ₹${newOrder.price}\n` +
        `📌 Status: ⏳ Pending Admin Verification\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Your payment proof has been forwarded to Admin (${workerConfig.adminId}). As soon as the Admin clicks "✅ Approve & Send Code", your voucher code will be delivered right here!`,
    });

    // 3. Forward Photo + Details + Inline Buttons to Admin (8838351233)
    appendAdminMessage({
      sender: "bot",
      orderIdRef: orderId,
      screenshotUrl: "simulated_upi_receipt",
      utrNumber,
      text:
        `🔔 NEW PAYMENT PROOF RECEIVED\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🆔 Order ID: ${orderId}\n` +
        `👤 Customer: ${newOrder.firstName} (${newOrder.username})\n` +
        `🔢 User ID: ${newOrder.userId}\n` +
        `🏷️ Category: ${newOrder.category}\n` +
        `🎁 Voucher: ${newOrder.voucherTitle}\n` +
        `💰 Amount: ₹${newOrder.price}\n` +
        `🧾 UPI UTR: ${utrNumber}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `⚠️ Action Required: Verify the payment screenshot above and click Approve to deduct 1 stock from Cloudflare KV and dispatch the voucher code.`,
      inlineButtons: [
        {
          label: "✅ Approve & Send Code",
          action: `approve_${orderId}`,
          variant: "approve",
        },
        {
          label: "❌ Reject",
          action: `reject_${orderId}`,
          variant: "reject",
        },
      ],
    });

    setPendingCheckoutVoucher(null);
    setUserKbMode("USER_MAIN");
  };

  // ==========================================================================
  // ADMIN (8838351233) APPROVAL / REJECTION & PANEL HANDLERS
  // ==========================================================================

  const handleAdminInlineAction = (action: string) => {
    if (action.startsWith("approve_")) {
      const orderId = action.replace("approve_", "");
      const targetOrder = kvOrders.find((o) => o.orderId === orderId);
      if (!targetOrder || targetOrder.status !== "PENDING") return;

      const voucherProduct = kvVouchers.find(
        (v) => v.id === targetOrder.voucherId
      );
      if (!voucherProduct || voucherProduct.codes.length === 0) {
        appendAdminMessage({
          sender: "bot",
          text: `❌ Cannot Approve ${orderId}: "${targetOrder.voucherTitle}" is Out of Stock in Cloudflare KV! Add stock via "➕ Add Stock / Voucher" first.`,
        });
        return;
      }

      // Pop 1 voucher code from Cloudflare KV stock
      const dispatchedCode = voucherProduct.codes[0];
      const remainingCodes = voucherProduct.codes.slice(1);

      setKvVouchers((prev) =>
        prev.map((v) =>
          v.id === voucherProduct.id ? { ...v, codes: remainingCodes } : v
        )
      );

      setKvOrders((prev) =>
        prev.map((o) =>
          o.orderId === orderId
            ? { ...o, status: "APPROVED", voucherCode: dispatchedCode }
            : o
        )
      );

      // Update the Admin message inline buttons to show completed state
      setAdminMessages((prev) =>
        prev.map((m) =>
          m.orderIdRef === orderId
            ? {
                ...m,
                text:
                  `✅ ORDER APPROVED & VOUCHER DISPATCHED\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🆔 Order ID: ${orderId}\n` +
                  `👤 Customer: ${targetOrder.firstName} (${targetOrder.userId})\n` +
                  `🎁 Voucher: ${targetOrder.voucherTitle} (₹${targetOrder.price})\n` +
                  `🔑 Dispatched Code: ${dispatchedCode}\n` +
                  `📦 Remaining KV Stock: ${remainingCodes.length}\n` +
                  `👮 Approved By: 8838351233`,
                inlineButtons: [],
              }
            : m
        )
      );

      // Dispatch the Voucher Code directly to the Customer's Telegram chat!
      appendUserMessage({
        sender: "bot",
        text:
          `🎉 Payment Approved — Here is Your Voucher! 🎉\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 Order ID: ${orderId}\n` +
          `🏷️ Category: ${targetOrder.category}\n` +
          `🎁 Voucher: ${targetOrder.voucherTitle}\n` +
          `💰 Amount Paid: ₹${targetOrder.price}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🔑 YOUR VOUCHER CODE:\n` +
          `${dispatchedCode}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `Thank you for shopping with ${workerConfig.botUsername}! Your code is also saved in "📋 My Orders & History".`,
      });
      return;
    }

    if (action.startsWith("reject_")) {
      const orderId = action.replace("reject_", "");
      const targetOrder = kvOrders.find((o) => o.orderId === orderId);
      if (!targetOrder || targetOrder.status !== "PENDING") return;

      setKvOrders((prev) =>
        prev.map((o) =>
          o.orderId === orderId ? { ...o, status: "REJECTED" } : o
        )
      );

      setAdminMessages((prev) =>
        prev.map((m) =>
          m.orderIdRef === orderId
            ? {
                ...m,
                text:
                  `❌ ORDER REJECTED (NO KV STOCK DEDUCTED)\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `🆔 Order ID: ${orderId}\n` +
                  `👤 Customer: ${targetOrder.firstName} (${targetOrder.userId})\n` +
                  `🎁 Voucher: ${targetOrder.voucherTitle} (₹${targetOrder.price})\n` +
                  `👮 Rejected By: 8838351233`,
                inlineButtons: [],
              }
            : m
        )
      );

      appendUserMessage({
        sender: "bot",
        text:
          `❌ Payment Verification Failed\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🆔 Order ID: ${orderId}\n` +
          `🎁 Voucher: ${targetOrder.voucherTitle} (₹${targetOrder.price})\n` +
          `📌 Status: ❌ Rejected\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `We could not verify your payment screenshot. Please contact ${workerConfig.supportUsername} with your Order ID ${orderId}.`,
      });
    }
  };

  const handleAdminReplyButtonClick = (label: string) => {
    appendAdminMessage({ sender: "user", text: label });

    if (label === "⚙️ Admin Panel") {
      setAdminKbMode("ADMIN_PANEL");
      setAdminSessionStep("IDLE");
      appendAdminMessage({
        sender: "bot",
        text:
          `⚙️ Admin Control Panel — ${workerConfig.botUsername}\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👮 Admin ID: ${workerConfig.adminId}\n` +
          `🗄️ Database: Cloudflare Workers KV (BOT_KV)\n\n` +
          `Select an administrative module from the bottom keyboard:`,
      });
      return;
    }

    if (label === "🔙 Main Menu") {
      setAdminKbMode("ADMIN_MAIN");
      setAdminSessionStep("IDLE");
      appendAdminMessage({
        sender: "bot",
        text: `Returned to Main Menu. Note how "⚙️ Admin Panel" is visible on your Main Menu because your ID is ${workerConfig.adminId}.`,
      });
      return;
    }

    if (label === "➕ Add Stock / Voucher") {
      setAdminSessionStep("ADMIN_ADD_STOCK");
      appendAdminMessage({
        sender: "bot",
        text:
          `➕ Add Stock / New Voucher to Cloudflare KV\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Send the voucher details in the pipe-separated format below:\n\n` +
          `Category | Title | Price | Code1, Code2\n\n` +
          `Example (type below or click Send):\n` +
          `Amazon | Amazon Pay Gift Card Rs.500 | 475 | AMZN-500-X99, AMZN-500-Y88`,
      });
      setAdminInputText(
        "Amazon | Amazon Pay Gift Card Rs.500 | 475 | AMZN-500-X99, AMZN-500-Y88"
      );
      return;
    }

    if (label === "📷 Add/Update QR Code") {
      setAdminSessionStep("ADMIN_SET_QR_CODE");
      appendAdminMessage({
        sender: "bot",
        qrCodeLabel: kvQrCode || "DEFAULT_QR (ankitsmm@fam)",
        qrImageSrc: kvQrImageDataUrl,
        text:
          `📷 Add / Update UPI Payment QR Code\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🏦 Permanent UPI ID: ankitsmm@fam\n` +
          `🗄️ Current KV Key (config:qr_file_id): ${kvQrCode || "Default"}\n\n` +
          `📤 How to Update:\n` +
          `Click the "📷 Upload New QR Code Image to KV" button below (or choose an image file) to upload a QR code photo directly into Cloudflare KV. Whenever any user selects a voucher to buy, the bot will automatically fetch and send this stored QR code image along with ankitsmm@fam!`,
      });
      return;
    }

    if (label === "👥 View User List") {
      setAdminSessionStep("IDLE");
      let msg =
        `👥 Registered Bot Users\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `📊 Total Registered Users: ${kvUsers.length}\n\n`;
      kvUsers.forEach((u, i) => {
        msg += `${i + 1}. ${u.firstName} (${u.username}) — ID: ${u.id}\n`;
      });
      appendAdminMessage({ sender: "bot", text: msg.trim() });
      return;
    }

    if (label === "📢 Broadcast") {
      setAdminSessionStep("ADMIN_BROADCAST_INPUT");
      setAdminInputText(
        "🔥 Flash Sale! Flat 6% OFF on Amazon & Flipkart Gift Vouchers for the next 2 hours!"
      );
      appendAdminMessage({
        sender: "bot",
        text:
          `📢 Broadcast Message to All Users\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Type the message you want to broadcast to all ${kvUsers.length} registered users in the input box below and press Send:`,
      });
      return;
    }

    if (label === "🔗 Manage Force Channel") {
      setAdminSessionStep("ADMIN_SET_FORCE_CHANNEL");
      setAdminInputText("@GetVoucherOfficial");
      appendAdminMessage({
        sender: "bot",
        text:
          `🔗 Manage Force Join Channel\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `📡 Current Force Channel: ${kvForceChannel || "None (Disabled)"}\n\n` +
          `Send the new channel username (e.g. @GetVoucherOfficial) or send "none" to disable mandatory channel verification:`,
      });
      return;
    }

    if (label === "🛡️ Add/Remove Admin") {
      setAdminSessionStep("ADMIN_MANAGE_ADMINS");
      setAdminInputText("add 7748291022");
      const allAdmins = [Number(workerConfig.adminId), ...kvSecondaryAdmins];
      appendAdminMessage({
        sender: "bot",
        text:
          `🛡️ Manage Bot Administrators\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👑 Primary Root Admin: ${workerConfig.adminId}\n` +
          `👮 Active Admins (${allAdmins.length}): ${allAdmins.join(", ")}\n\n` +
          `• Send "add <TelegramID>" to grant admin access\n` +
          `• Send "remove <TelegramID>" to revoke admin access`,
      });
      return;
    }

    if (label === "📊 View Bot Stats") {
      setAdminSessionStep("IDLE");
      const totalCodes = kvVouchers.reduce((s, v) => s + v.codes.length, 0);
      const pending = kvOrders.filter((o) => o.status === "PENDING").length;
      const approved = kvOrders.filter((o) => o.status === "APPROVED").length;
      const rejected = kvOrders.filter((o) => o.status === "REJECTED").length;
      const revenue = kvOrders
        .filter((o) => o.status === "APPROVED")
        .reduce((s, o) => s + o.price, 0);

      appendAdminMessage({
        sender: "bot",
        text:
          `📊 ${workerConfig.botUsername} — Live Cloudflare KV Statistics\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `👥 Total Registered Users: ${kvUsers.length}\n` +
          `🔗 Force Join Channel: ${kvForceChannel || "Disabled"}\n\n` +
          `📦 Voucher Inventory:\n` +
          `• Active Voucher Products: ${kvVouchers.length}\n` +
          `• Total Ready Codes in Stock: ${totalCodes}\n\n` +
          `🧾 Orders & Revenue:\n` +
          `• Total Orders Submitted: ${kvOrders.length}\n` +
          `• ⏳ Pending Verification: ${pending}\n` +
          `• ✅ Approved & Dispatched: ${approved}\n` +
          `• ❌ Rejected Orders: ${rejected}\n` +
          `• 💰 Total Verified Revenue: ₹${revenue}`,
      });
      return;
    }

    // If Admin clicks standard user buttons on their Main Menu
    handleUserReplyButtonClick(label);
  };

  const handleAdminTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = adminInputText.trim();
    if (!text) return;

    appendAdminMessage({ sender: "user", text });
    setAdminInputText("");

    if (adminSessionStep === "ADMIN_ADD_STOCK") {
      const parts = text.split("|").map((p) => p.trim());
      if (parts.length < 4) {
        appendAdminMessage({
          sender: "bot",
          text: `❌ Invalid Format! Use: Category | Title | Price | Code1, Code2`,
        });
        return;
      }
      const [catRaw, title, priceRaw, codesRaw] = parts;
      const price = Number(priceRaw) || 500;
      const newCodes = codesRaw
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      const normalizedCat =
        (["Amazon", "Flipkart", "Meesho", "BigBasket"] as const).find(
          (c) => c.toLowerCase() === catRaw.toLowerCase()
        ) || "Amazon";

      setKvVouchers((prev) => {
        const existing = prev.find(
          (v) =>
            v.category.toLowerCase() === normalizedCat.toLowerCase() &&
            v.title.toLowerCase() === title.toLowerCase()
        );
        if (existing) {
          return prev.map((v) =>
            v.id === existing.id
              ? { ...v, price, codes: [...v.codes, ...newCodes] }
              : v
          );
        }
        return [
          ...prev,
          {
            id: `${normalizedCat.toLowerCase().slice(0, 3)}_${Date.now().toString(36)}`,
            category: normalizedCat,
            title,
            price,
            codes: newCodes,
          },
        ];
      });

      setAdminSessionStep("IDLE");
      appendAdminMessage({
        sender: "bot",
        text:
          `✅ Voucher Stock Saved to Cloudflare KV!\n` +
          `🏷️ Category: ${normalizedCat}\n` +
          `🎁 Title: ${title}\n` +
          `💰 Price: ₹${price}\n` +
          `➕ Codes Added: ${newCodes.length}`,
      });
      return;
    }

    if (adminSessionStep === "ADMIN_BROADCAST_INPUT") {
      setAdminSessionStep("IDLE");
      appendUserMessage({
        sender: "bot",
        text: `📢 Announcement — ${workerConfig.botUsername}\n━━━━━━━━━━━━━━━━━━━━━━\n\n${text}`,
      });
      appendAdminMessage({
        sender: "bot",
        text: `✅ Broadcast Sent!\nDelivered to ${kvUsers.length} / ${kvUsers.length} registered users (check Customer chat on the left!).`,
      });
      return;
    }

    if (adminSessionStep === "ADMIN_SET_FORCE_CHANNEL") {
      setAdminSessionStep("IDLE");
      if (text.toLowerCase() === "none" || text.toLowerCase() === "off") {
        setKvForceChannel("");
        appendAdminMessage({
          sender: "bot",
          text: `✅ Force Channel requirement has been disabled in Cloudflare KV.`,
        });
      } else {
        const formatted = text.startsWith("@") ? text : `@${text}`;
        setKvForceChannel(formatted);
        appendAdminMessage({
          sender: "bot",
          text: `✅ Force Channel Updated in KV!\nUsers must now join ${formatted} before accessing ${workerConfig.botUsername}.`,
        });
      }
      return;
    }

    if (adminSessionStep === "ADMIN_MANAGE_ADMINS") {
      setAdminSessionStep("IDLE");
      const [cmd, idStr] = text.split(/\s+/);
      const numId = Number(idStr);
      if (!cmd || isNaN(numId)) {
        appendAdminMessage({
          sender: "bot",
          text: `❌ Usage: "add 123456789" or "remove 123456789"`,
        });
        return;
      }
      if (cmd.toLowerCase() === "add") {
        setKvSecondaryAdmins((prev) =>
          prev.includes(numId) ? prev : [...prev, numId]
        );
        appendAdminMessage({
          sender: "bot",
          text: `✅ Added ${numId} as a Secondary Administrator in Cloudflare KV.`,
        });
      } else if (cmd.toLowerCase() === "remove") {
        if (String(numId) === workerConfig.adminId) {
          appendAdminMessage({
            sender: "bot",
            text: `⛔ Cannot remove Primary Root Admin (${workerConfig.adminId}).`,
          });
          return;
        }
        setKvSecondaryAdmins((prev) => prev.filter((id) => id !== numId));
        appendAdminMessage({
          sender: "bot",
          text: `✅ Removed ${numId} from Administrators.`,
        });
      }
      return;
    }

    appendAdminMessage({
      sender: "bot",
      text: `ℹ️ Select an action from the bottom Reply Keyboard.`,
    });
  };

  const handleUserTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = userInputText.trim();
    if (!text) return;

    appendUserMessage({ sender: "user", text });
    setUserInputText("");

    if (!checkForceChannelGate()) return;

    if (userKbMode === "USER_AWAITING_REVIEW") {
      setKvReviews((prev) => [
        {
          userId: 591028411,
          name: "Arjun Sharma",
          text,
          createdAt: new Date().toISOString().split("T")[0],
        },
        ...prev,
      ]);
      setUserKbMode("USER_MAIN");
      appendUserMessage({
        sender: "bot",
        text: `🌟 Thank you for your feedback! Your review has been saved to Cloudflare KV.`,
      });
      return;
    }

    handleUserReplyButtonClick(text);
  };

  // Compute current Reply Keyboard buttons for Customer Simulator
  const getCustomerKeyboardRows = (): string[][] => {
    if (userKbMode === "USER_CATEGORIES") {
      return [
        ["📦 Amazon", "🛍️ Flipkart"],
        ["🛒 Meesho", "🧺 BigBasket"],
        ["🔙 Main Menu"],
      ];
    }
    if (userKbMode === "USER_CATEGORY_VOUCHERS" && selectedCategory) {
      const items = kvVouchers.filter(
        (v) => v.category === selectedCategory && v.codes.length > 0
      );
      const rows = items.map((v) => [`🎟️ ${v.title} — ₹${v.price}`]);
      rows.push(["🎁 Buy Vouchers", "🔙 Main Menu"]);
      return rows;
    }
    if (
      userKbMode === "USER_AWAITING_SS" ||
      userKbMode === "USER_AWAITING_REVIEW"
    ) {
      return [["🔙 Main Menu"]];
    }
    // Default USER_MAIN (Notice: NO Admin Panel button for regular users!)
    return [
      ["🎁 Buy Vouchers", "📋 My Orders & History"],
      ["📖 How To Use / Guide", "⭐ Reviews & Feedback"],
      ["💬 Support"],
    ];
  };

  // Compute current Reply Keyboard buttons for Admin Simulator (8838351233)
  const getAdminKeyboardRows = (): string[][] => {
    if (adminKbMode === "ADMIN_PANEL") {
      return [
        ["➕ Add Stock / Voucher", "📷 Add/Update QR Code"],
        ["👥 View User List", "📢 Broadcast"],
        ["🔗 Manage Force Channel", "🛡️ Add/Remove Admin"],
        ["📊 View Bot Stats", "🔙 Main Menu"],
      ];
    }
    // Admin Main Menu (Includes 6th button: ⚙️ Admin Panel)
    return [
      ["🎁 Buy Vouchers", "📋 My Orders & History"],
      ["📖 How To Use / Guide", "⭐ Reviews & Feedback"],
      ["💬 Support", "⚙️ Admin Panel"],
    ];
  };

  // Handler for Admin uploading a new QR Code photo to Cloudflare KV
  const handleAdminUploadQrCode = (customDataUrl?: string | null) => {
    const newFileId = `AgACAgUAAxkBAAIC_qr_${Date.now().toString(36)}`;
    setKvQrCode(newFileId);
    if (customDataUrl !== undefined) {
      setKvQrImageDataUrl(customDataUrl);
    }

    appendAdminMessage({
      sender: "user",
      text: `📷 Uploaded New QR Code Photo (file_id: ${newFileId})`,
      qrCodeLabel: newFileId,
      qrImageSrc: customDataUrl ?? kvQrImageDataUrl,
    });

    appendAdminMessage({
      sender: "bot",
      qrCodeLabel: newFileId,
      qrImageSrc: customDataUrl ?? kvQrImageDataUrl,
      text:
        `✅ UPI QR Code Saved to Cloudflare KV!\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🗄️ KV Key: config:qr_file_id\n` +
        `🆔 Stored File ID: ${newFileId}\n` +
        `🏦 UPI ID: ankitsmm@fam\n\n` +
        `Whenever any user selects a voucher to purchase, the bot will now automatically fetch and send this QR code image along with ankitsmm@fam and the payment instructions.`,
    });

    setAdminSessionStep("IDLE");
  };

  // Summary metrics
  const totalStockCodes = kvVouchers.reduce(
    (sum, item) => sum + item.codes.length,
    0
  );
  const pendingOrdersCount = kvOrders.filter(
    (o) => o.status === "PENDING"
  ).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* ====================================================================
          TOP BAR CONTRACT: 1 Row, 3 Zones separated by gap-8
          Zone 1: Brand wordmark (1 line)
          Zone 2: 4 single-line nav links
          Zone 3: 1 primary CTA button
      ==================================================================== */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-3.5 bg-slate-950/95 backdrop-blur border-b border-slate-800">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection("codebase");
          }}
          className="text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          GetVoucherPro Studio
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-400">
          <button
            onClick={() => setActiveSection("codebase")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === "codebase"
                ? "text-white border-sky-500"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Worker Codebase
          </button>
          <button
            onClick={() => setActiveSection("simulator")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === "simulator"
                ? "text-white border-sky-500"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Telegram Simulator{" "}
            {pendingOrdersCount > 0 ? `(${pendingOrdersCount} Pending)` : ""}
          </button>
          <button
            onClick={() => setActiveSection("kv")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === "kv"
                ? "text-white border-sky-500"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Cloudflare KV Store
          </button>
          <button
            onClick={() => setActiveSection("deploy")}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeSection === "deploy"
                ? "text-white border-sky-500"
                : "border-transparent hover:text-slate-200"
            }`}
          >
            Deployment Guide
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            onClick={handleDownloadAllFiles}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Worker Files
          </button>
        </div>
      </header>

      {/* ====================================================================
          HERO / SUMMARY BAR WITH UNBOXED METADATA (ZERO-PILL DISCIPLINE)
      ==================================================================== */}
      <section className="border-b border-slate-800/80 bg-slate-900/40 px-6 py-5">
        <div className="max-w-[1380px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mb-1.5 font-mono tabular-nums">
              <span className="text-sky-400 font-medium">
                {workerConfig.botUsername}
              </span>
              <span aria-hidden="true">·</span>
              <span>Admin ID: {workerConfig.adminId}</span>
              <span aria-hidden="true">·</span>
              <span>Support: {workerConfig.supportUsername}</span>
              <span aria-hidden="true">·</span>
              <span>Framework: grammY v1.35 + Cloudflare KV</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight text-balance">
              Serverless Telegram Voucher Bot & Manual Payment Dispatch Engine
            </h1>
          </div>

          {/* Mobile & Quick Mode Switcher */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-900 border border-slate-800 rounded-lg self-start">
            <button
              onClick={() => setActiveSection("codebase")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "codebase"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              1. Codebase (3 Files)
            </button>
            <button
              onClick={() => setActiveSection("simulator")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "simulator"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              2. Live Bot Simulator
            </button>
            <button
              onClick={() => setActiveSection("kv")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "kv"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <Database className="w-3.5 h-3.5" />
              3. KV Database ({totalStockCodes} Codes)
            </button>
            <button
              onClick={() => setActiveSection("deploy")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeSection === "deploy"
                  ? "bg-sky-500 text-slate-950 font-semibold"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              4. GitHub + Cloudflare Setup
            </button>
          </div>
        </div>
      </section>

      {/* ====================================================================
          MAIN VIEWPORT CONTAINER
      ==================================================================== */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-6">
        {/* ==================================================================
            VIEW 1: PRODUCTION CLOUDFLARE WORKER CODEBASE
        ================================================================== */}
        {activeSection === "codebase" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Sidebar: Bot Configuration & Architecture Checklist */}
            <div className="lg:col-span-4 space-y-6">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-white mb-1">
                  Bot Configuration Constants
                </h2>
                <p className="text-xs text-slate-400 mb-4">
                  Pre-configured with your exact constants. Editing any field
                  below dynamically updates <code className="text-sky-300">wrangler.toml</code> and{" "}
                  <code className="text-sky-300">index.js</code>.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Bot Username
                    </label>
                    <input
                      type="text"
                      value={workerConfig.botUsername}
                      onChange={(e) =>
                        setWorkerConfig({
                          ...workerConfig,
                          botUsername: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Primary Admin ID
                      </label>
                      <input
                        type="text"
                        value={workerConfig.adminId}
                        onChange={(e) =>
                          setWorkerConfig({
                            ...workerConfig,
                            adminId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Support Handle
                      </label>
                      <input
                        type="text"
                        value={workerConfig.supportUsername}
                        onChange={(e) =>
                          setWorkerConfig({
                            ...workerConfig,
                            supportUsername: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Default Force Channel
                      </label>
                      <input
                        type="text"
                        value={workerConfig.forceChannel}
                        onChange={(e) =>
                          setWorkerConfig({
                            ...workerConfig,
                            forceChannel: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Merchant UPI ID
                      </label>
                      <input
                        type="text"
                        value={workerConfig.upiId}
                        onChange={(e) =>
                          setWorkerConfig({
                            ...workerConfig,
                            upiId: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Cloudflare KV Namespace ID (<code className="text-sky-300">BOT_KV</code>)
                    </label>
                    <input
                      type="text"
                      value={workerConfig.kvNamespaceId}
                      onChange={(e) =>
                        setWorkerConfig({
                          ...workerConfig,
                          kvNamespaceId: e.target.value,
                        })
                      }
                      placeholder="Paste your Cloudflare KV ID..."
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setActiveSection("simulator")}
                    className="w-full py-2 px-3 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                  >
                    Test This Flow in Live Simulator →
                  </button>
                </div>
              </div>

              {/* Specification Compliance Summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold text-white">
                  Implemented Requirements
                </h3>
                <ul className="space-y-2.5 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Bottom Reply Keyboards Only:</strong>{" "}
                      Uses <code className="font-mono text-sky-300">new Keyboard().resized().persistent()</code>{" "}
                      for Main Menu, Sub-Categories (Amazon, Flipkart, Meesho, BigBasket), and Admin Panel.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Admin-Exclusive 6th Button:</strong>{" "}
                      <code className="font-mono text-sky-300">⚙️ Admin Panel</code> is rendered only for Telegram ID{" "}
                      <code className="font-mono text-sky-300">8838351233</code> (and secondary admins in KV).
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Force Channel Verification:</strong>{" "}
                      Middleware calls <code className="font-mono text-sky-300">getChatMember</code> and blocks unverified users until they join. Configurable live from Admin Panel.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-white">Manual Screenshot Verification:</strong>{" "}
                      Uploading a payment screenshot forwards the photo + Order ID + User ID to{" "}
                      <code className="font-mono text-sky-300">8838351233</code> with{" "}
                      <code className="font-mono text-emerald-300">[ ✅ Approve & Send Code ]</code> and{" "}
                      <code className="font-mono text-rose-300">[ ❌ Reject ]</code>. Stock is deducted from KV only on approval.
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Area: Code Viewer for package.json, wrangler.toml, index.js */}
            <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-950/60 border-b border-slate-800">
                <div className="flex items-center gap-1.5">
                  {(["index.js", "wrangler.toml", "package.json"] as const).map(
                    (file) => (
                      <button
                        key={file}
                        onClick={() => setSelectedFile(file)}
                        className={`px-3.5 py-1.5 text-xs font-mono font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedFile === file
                            ? "bg-sky-500 text-slate-950 font-semibold"
                            : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                        }`}
                      >
                        {file}
                      </button>
                    )
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyCode(selectedFile)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedFile === selectedFile ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy {selectedFile}</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDownloadFile(selectedFile)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              <div className="px-4 py-2 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>cloudflare-worker/{selectedFile}</span>
                <span>
                  {selectedFile === "index.js"
                    ? "grammY Webhook + Cloudflare KV Engine"
                    : selectedFile === "wrangler.toml"
                    ? "Cloudflare Worker + BOT_KV Binding"
                    : "Dependencies (grammy ^1.35.0)"}
                </span>
              </div>

              <pre className="p-5 text-xs font-mono leading-relaxed text-slate-200 overflow-x-auto max-h-[680px] overflow-y-auto selection:bg-sky-500/30">
                <code>{getFileContent(selectedFile)}</code>
              </pre>
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 2: DUAL-CLIENT INTERACTIVE TELEGRAM SIMULATOR
        ================================================================== */}
        {activeSection === "simulator" && (
          <div className="space-y-5">
            {/* Simulator Controls Bar */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Dual-Client Interactive Telegram Sandbox (Customer vs. Admin{" "}
                  <span className="font-mono">{workerConfig.adminId}</span>)
                </h2>
                <p className="text-xs text-slate-400">
                  Test the Bottom Reply Keyboards, Force Channel verification,
                  Payment Screenshot upload, and Admin manual code dispatch
                  side-by-side.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {/* Toggle Force Channel Join Status for Customer */}
                <button
                  onClick={() => setUserJoinedChannel(!userJoinedChannel)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    userJoinedChannel
                      ? "bg-emerald-950/60 border-emerald-700/60 text-emerald-300"
                      : "bg-amber-950/60 border-amber-700/60 text-amber-300"
                  }`}
                >
                  {userJoinedChannel ? (
                    <>
                      <Unlock className="w-3.5 h-3.5" />
                      <span>
                        Customer Joined {kvForceChannel || "Channel"}: YES
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>
                        Customer Joined {kvForceChannel || "Channel"}: NO (Test Gate)
                      </span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    setUserKbMode("USER_MAIN");
                    setAdminKbMode("ADMIN_MAIN");
                    setPendingCheckoutVoucher(null);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset Keyboards
                </button>
              </div>
            </div>

            {/* Two Side-by-Side Telegram Clients */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              {/* ============================================================
                  LEFT CLIENT: CUSTOMER TELEGRAM VIEW (ID: 591028411)
              ============================================================ */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[700px] overflow-hidden">
                {/* Telegram App Header */}
                <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sm font-bold text-sky-300">
                      GV
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-tight">
                        {workerConfig.botUsername}
                      </div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums">
                        Customer View · Arjun Sharma (ID: 591028411)
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    ReplyKeyboardMarkup
                  </span>
                </div>

                {/* Chat Messages Viewport */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0c1322]">
                  {userMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.sender === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.sender === "user"
                            ? "bg-sky-600 text-white rounded-br-xs"
                            : "bg-slate-800/95 text-slate-100 border border-slate-700/80 rounded-bl-xs"
                        }`}
                      >
                        {msg.qrCodeLabel && (
                          <div className="mb-2.5 p-3 rounded-lg bg-white text-slate-900 border border-slate-300 flex items-center gap-3">
                            {msg.qrImageSrc ? (
                              <img
                                src={msg.qrImageSrc}
                                alt="UPI QR Code for ankitsmm@fam"
                                referrerPolicy="no-referrer"
                                className="w-20 h-20 object-contain rounded border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-20 h-20 bg-slate-950 text-white rounded p-1.5 flex flex-col items-center justify-between shrink-0 font-mono text-[9px] leading-none select-none">
                                <div className="w-full flex justify-between">
                                  <span className="w-3.5 h-3.5 border-2 border-white inline-block" />
                                  <span className="text-[7px] text-sky-400">UPI</span>
                                  <span className="w-3.5 h-3.5 border-2 border-white inline-block" />
                                </div>
                                <div className="text-center font-bold tracking-tighter text-[8px] text-emerald-400">
                                  SCAN & PAY
                                </div>
                                <div className="w-full flex justify-between items-end">
                                  <span className="w-3.5 h-3.5 border-2 border-white inline-block" />
                                  <span className="text-[7px] text-slate-300">QR</span>
                                  <span className="w-2 h-2 bg-white inline-block" />
                                </div>
                              </div>
                            )}
                            <div className="text-xs leading-snug">
                              <div className="font-bold text-slate-900">
                                Official UPI QR Code
                              </div>
                              <div className="font-mono text-[11px] text-sky-700 font-semibold">
                                UPI ID: ankitsmm@fam
                              </div>
                              <div className="font-mono text-[10px] text-slate-500 mt-0.5 truncate max-w-[180px]">
                                KV: {msg.qrCodeLabel}
                              </div>
                            </div>
                          </div>
                        )}
                        {msg.screenshotUrl && (
                          <div className="mb-2 p-3 rounded-lg bg-slate-950/90 border border-slate-700 text-slate-200 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-emerald-400 font-semibold mb-1">
                              <span>✓ UPI PAYMENT SUCCESSFUL</span>
                              <span>ankitsmm@fam</span>
                            </div>
                            <div className="text-slate-400">
                              UTR Ref: {msg.utrNumber} · Verified Screenshot
                            </div>
                          </div>
                        )}
                        <div>{msg.text}</div>

                        {/* Inline Buttons (Only used for Force Channel Join or Support Link) */}
                        {msg.inlineButtons && msg.inlineButtons.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-slate-700/70 flex flex-col gap-1.5">
                            {msg.inlineButtons.map((btn, i) => (
                              <button
                                key={i}
                                onClick={() => {
                                  if (btn.action === "join_channel_sim") {
                                    setUserJoinedChannel(true);
                                  } else if (
                                    btn.action === "verify_force_join"
                                  ) {
                                    if (userJoinedChannel) {
                                      appendUserMessage({
                                        sender: "bot",
                                        text: `🎉 Verification Complete! Welcome to ${workerConfig.botUsername}. Use the bottom Reply Keyboard below to browse vouchers.`,
                                      });
                                    } else {
                                      appendUserMessage({
                                        sender: "bot",
                                        text: `❌ You haven't joined ${kvForceChannel} yet! Click "📢 Join ${kvForceChannel}" above first.`,
                                      });
                                    }
                                  } else if (btn.url) {
                                    appendUserMessage({
                                      sender: "bot",
                                      text: `🔗 Direct Support Link: ${btn.url} (${workerConfig.supportUsername})`,
                                    });
                                  }
                                }}
                                className="w-full py-1.5 px-3 rounded-md bg-slate-900 hover:bg-slate-950 text-sky-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={`text-[10px] mt-1 text-right font-mono tabular-nums ${
                            msg.sender === "user"
                              ? "text-sky-200"
                              : "text-slate-400"
                          }`}
                        >
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={userChatEndRef} />
                </div>

                {/* Payment Screenshot Upload CTA Banner (when in AWAITING_PAYMENT_SS) */}
                {pendingCheckoutVoucher && (
                  <div className="px-4 py-2.5 bg-emerald-950/80 border-t border-emerald-700/60 flex items-center justify-between gap-3">
                    <div className="text-xs text-emerald-200">
                      <span className="font-semibold">Awaiting Screenshot:</span>{" "}
                      {pendingCheckoutVoucher.title} (₹
                      {pendingCheckoutVoucher.price})
                    </div>
                    <button
                      onClick={handleSendPaymentScreenshot}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      📸 Send Payment Screenshot (SS)
                    </button>
                  </div>
                )}

                {/* Input Bar */}
                <form
                  onSubmit={handleUserTextSubmit}
                  className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
                >
                  {pendingCheckoutVoucher && (
                    <button
                      type="button"
                      onClick={handleSendPaymentScreenshot}
                      title="Upload Payment Screenshot"
                      className="p-2 text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4" />
                    </button>
                  )}
                  <input
                    type="text"
                    value={userInputText}
                    onChange={(e) => setUserInputText(e.target.value)}
                    placeholder={
                      userKbMode === "USER_AWAITING_REVIEW"
                        ? "Write your customer review here..."
                        : "Tap a bottom Reply Keyboard button or type /start..."
                    }
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

                {/* BOTTOM REPLY KEYBOARD (ReplyKeyboardMarkup - Colourful Interactive App Buttons) */}
                <div className="p-2.5 bg-slate-950 border-t border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-mono text-slate-400 px-1 flex items-center justify-between">
                    <span>BOTTOM REPLY KEYBOARD (Customer — 5 Main Buttons)</span>
                    <span>{userKbMode}</span>
                  </div>
                  {getCustomerKeyboardRows().map((row, rIdx) => (
                    <div
                      key={rIdx}
                      className={`grid gap-1.5 ${
                        row.length === 2 ? "grid-cols-2" : "grid-cols-1"
                      }`}
                    >
                      {row.map((btnLabel) => (
                        <button
                          key={btnLabel}
                          onClick={() => handleUserReplyButtonClick(btnLabel)}
                          className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 active:scale-[0.99] border border-slate-700/80 text-xs font-semibold text-slate-100 text-center transition-all whitespace-nowrap truncate cursor-pointer"
                        >
                          {btnLabel}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>

              {/* ============================================================
                  RIGHT CLIENT: ADMIN TELEGRAM VIEW (ID: 8838351233)
              ============================================================ */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-[700px] overflow-hidden">
                {/* Telegram App Header */}
                <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-sm font-bold text-amber-300">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white leading-tight">
                        Admin Console Chat ({workerConfig.botUsername})
                      </div>
                      <div className="text-xs text-amber-400 font-mono tabular-nums">
                        Admin Telegram ID: {workerConfig.adminId} (6th Button Unlocked)
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    Admin Mode
                  </span>
                </div>

                {/* Admin Chat Messages Viewport */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0c1322]">
                  {adminMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.sender === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.sender === "user"
                            ? "bg-amber-600 text-white rounded-br-xs"
                            : "bg-slate-800/95 text-slate-100 border border-slate-700/80 rounded-bl-xs"
                        }`}
                      >
                        {/* Admin Stored QR Code Preview */}
                        {msg.qrCodeLabel && (
                          <div className="mb-2.5 p-2.5 rounded-lg bg-slate-950 border border-sky-500/40 text-slate-200 font-mono text-[11px] flex items-center gap-3">
                            {msg.qrImageSrc ? (
                              <img
                                src={msg.qrImageSrc}
                                alt="Stored KV QR Code"
                                referrerPolicy="no-referrer"
                                className="w-14 h-14 object-contain bg-white rounded p-0.5 shrink-0"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded bg-white text-slate-950 flex items-center justify-center font-bold text-[10px] shrink-0">
                                QR
                              </div>
                            )}
                            <div className="overflow-hidden">
                              <div className="text-sky-300 font-semibold">
                                📷 KV Stored QR Image (ankitsmm@fam)
                              </div>
                              <div className="text-slate-400 truncate">
                                file_id: {msg.qrCodeLabel}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Forwarded Payment Screenshot Preview in Admin Chat */}
                        {msg.screenshotUrl && (
                          <div className="mb-2.5 p-3 rounded-lg bg-slate-950 border border-amber-500/40 text-slate-200 font-mono text-[11px]">
                            <div className="flex items-center justify-between text-amber-300 font-semibold mb-1">
                              <span>📸 FORWARDED UPI SCREENSHOT PROOF</span>
                              <span>UTR: {msg.utrNumber}</span>
                            </div>
                            <div className="text-slate-400">
                              Paid to: ankitsmm@fam · Status: Verified
                              Image Attachment
                            </div>
                          </div>
                        )}

                        <div>{msg.text}</div>

                        {/* Inline Approval / Rejection Buttons on Forwarded Order */}
                        {msg.inlineButtons && msg.inlineButtons.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-slate-700 grid grid-cols-2 gap-2">
                            {msg.inlineButtons.map((btn, i) => (
                              <button
                                key={i}
                                onClick={() =>
                                  handleAdminInlineAction(btn.action)
                                }
                                className={`py-2 px-3 rounded-lg font-semibold text-xs transition-colors cursor-pointer ${
                                  btn.variant === "approve"
                                    ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950"
                                    : "bg-rose-600 hover:bg-rose-500 text-white"
                                }`}
                              >
                                {btn.label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={`text-[10px] mt-1 text-right font-mono tabular-nums ${
                            msg.sender === "user"
                              ? "text-amber-200"
                              : "text-slate-400"
                          }`}
                        >
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={adminChatEndRef} />
                </div>

                {/* Admin QR Code Upload Action Bar when in ADMIN_SET_QR_CODE */}
                {adminSessionStep === "ADMIN_SET_QR_CODE" && (
                  <div className="px-4 py-2.5 bg-amber-950/80 border-t border-amber-700/60 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-amber-200 font-medium">
                      Upload QR Image to Cloudflare KV (<code className="font-mono">config:qr_file_id</code>):
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        ref={qrFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === "string") {
                              handleAdminUploadQrCode(reader.result);
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => qrFileInputRef.current?.click()}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-amber-500/40 text-xs font-medium rounded-lg transition-colors cursor-pointer"
                      >
                        Choose Image File...
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAdminUploadQrCode()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        <ImageIcon className="w-3.5 h-3.5" />
                        📷 Upload QR Code to KV
                      </button>
                    </div>
                  </div>
                )}

                {/* Admin Input Bar (for Add Stock, Broadcast, Force Channel, Manage Admins) */}
                <form
                  onSubmit={handleAdminTextSubmit}
                  className="px-3 py-2 bg-slate-950 border-t border-slate-800 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={adminInputText}
                    onChange={(e) => setAdminInputText(e.target.value)}
                    placeholder={
                      adminSessionStep !== "IDLE"
                        ? `Active Wizard (${adminSessionStep}): Enter input & press Send...`
                        : "Enter admin command or tap a bottom Reply Keyboard button..."
                    }
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>

                {/* ADMIN BOTTOM REPLY KEYBOARD */}
                <div className="p-2.5 bg-slate-950 border-t border-slate-800 space-y-1.5">
                  <div className="text-[10px] font-mono text-amber-400/90 px-1 flex items-center justify-between">
                    <span>
                      BOTTOM REPLY KEYBOARD (Admin {workerConfig.adminId})
                    </span>
                    <span>{adminKbMode}</span>
                  </div>
                  {getAdminKeyboardRows().map((row, rIdx) => (
                    <div
                      key={rIdx}
                      className={`grid gap-1.5 ${
                        row.length === 2 ? "grid-cols-2" : "grid-cols-1"
                      }`}
                    >
                      {row.map((btnLabel) => {
                        const isSpecialAdminBtn =
                          btnLabel === "⚙️ Admin Panel" ||
                          adminKbMode === "ADMIN_PANEL";
                        return (
                          <button
                            key={btnLabel}
                            onClick={() =>
                              handleAdminReplyButtonClick(btnLabel)
                            }
                            className={`py-2 px-3 rounded-lg active:scale-[0.99] border text-xs font-semibold text-center transition-all whitespace-nowrap truncate cursor-pointer ${
                              isSpecialAdminBtn
                                ? "bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/40 text-amber-200"
                                : "bg-slate-800 hover:bg-slate-700 border-slate-700/80 text-slate-100"
                            }`}
                          >
                            {btnLabel}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 3: CLOUDFLARE KV DATABASE EXPLORER & STOCK MANAGER
        ================================================================== */}
        {activeSection === "kv" && (
          <div className="space-y-6">
            {/* Top KV Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">
                  KV Binding · <code className="text-sky-400">vouchers:catalog</code>
                </div>
                <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                  {totalStockCodes} Codes
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Across {kvVouchers.length} active voucher products
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">
                  KV Key · <code className="text-sky-400">orders:history</code>
                </div>
                <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                  {kvOrders.length} Orders
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {pendingOrdersCount} Pending ·{" "}
                  {kvOrders.filter((o) => o.status === "APPROVED").length}{" "}
                  Approved
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">
                  KV Key · <code className="text-sky-400">users:registry</code>
                </div>
                <div className="text-2xl font-bold text-white font-mono tabular-nums mt-1">
                  {kvUsers.length} Users
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Root Admin: {workerConfig.adminId}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400">
                  KV Key · <code className="text-sky-400">config:channel</code>
                </div>
                <div className="text-lg font-bold text-white font-mono truncate mt-1">
                  {kvForceChannel || "Disabled"}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Checked via Telegram getChatMember
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Add Voucher Stock Directly to KV */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white">
                  Add Stock to <code className="text-sky-400">BOT_KV</code>
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Category
                    </label>
                    <select
                      value={newStockCat}
                      onChange={(e) =>
                        setNewStockCat(
                          e.target.value as VoucherProduct["category"]
                        )
                      }
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                    >
                      <option value="Amazon">📦 Amazon</option>
                      <option value="Flipkart">🛍️ Flipkart</option>
                      <option value="Meesho">🛒 Meesho</option>
                      <option value="BigBasket">🧺 BigBasket</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Voucher Title
                    </label>
                    <input
                      type="text"
                      value={newStockTitle}
                      onChange={(e) => setNewStockTitle(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Discounted Price (₹)
                    </label>
                    <input
                      type="number"
                      value={newStockPrice}
                      onChange={(e) => setNewStockPrice(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono tabular-nums bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Voucher Codes (Comma-separated)
                    </label>
                    <textarea
                      rows={3}
                      value={newStockCodes}
                      onChange={(e) => setNewStockCodes(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-950 border border-slate-800 rounded-lg text-white"
                    />
                  </div>

                  <button
                    onClick={() => {
                      const codes = newStockCodes
                        .split(",")
                        .map((c) => c.trim())
                        .filter(Boolean);
                      const price = Number(newStockPrice) || 500;
                      if (!newStockTitle || codes.length === 0) return;

                      setKvVouchers((prev) => {
                        const existing = prev.find(
                          (v) =>
                            v.category === newStockCat &&
                            v.title.toLowerCase() ===
                              newStockTitle.toLowerCase()
                        );
                        if (existing) {
                          return prev.map((v) =>
                            v.id === existing.id
                              ? { ...v, price, codes: [...v.codes, ...codes] }
                              : v
                          );
                        }
                        return [
                          ...prev,
                          {
                            id: `${newStockCat.toLowerCase().slice(0, 3)}_${Date.now().toString(36)}`,
                            category: newStockCat,
                            title: newStockTitle,
                            price,
                            codes,
                          },
                        ];
                      });
                      setNewStockCodes("");
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Save Voucher Codes to KV
                  </button>
                </div>
              </div>

              {/* Voucher Inventory & Order Tables */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Live Voucher Stock (<code className="text-sky-400">vouchers:catalog</code>)
                    </h3>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      Auto-decrements on Admin Approval
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                          <th className="py-2.5 px-4 font-medium">Category</th>
                          <th className="py-2.5 px-4 font-medium">Title</th>
                          <th className="py-2.5 px-4 font-medium text-right">
                            Price
                          </th>
                          <th className="py-2.5 px-4 font-medium text-right">
                            Qty
                          </th>
                          <th className="py-2.5 px-4 font-medium">
                            Available Codes in KV
                          </th>
                          <th className="py-2.5 px-4 font-medium text-right">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {kvVouchers.map((v) => (
                          <tr
                            key={v.id}
                            className="hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-medium text-white">
                              {v.category}
                            </td>
                            <td className="py-2.5 px-4 text-slate-200">
                              {v.title}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                              ₹{v.price}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums font-semibold">
                              {v.codes.length}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 max-w-xs truncate">
                              {v.codes.length > 0
                                ? v.codes.join(", ")
                                : "OUT OF STOCK"}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                onClick={() =>
                                  setKvVouchers((prev) =>
                                    prev.filter((item) => item.id !== v.id)
                                  )
                                }
                                className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
                                title="Delete Voucher Product"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Orders History Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Orders & Manual Dispatch Log (<code className="text-sky-400">orders:history</code>)
                    </h3>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">
                      {kvOrders.length} Total Records
                    </span>
                  </div>
                  {kvOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No payment screenshots submitted yet. Go to the{" "}
                      <button
                        onClick={() => setActiveSection("simulator")}
                        className="text-sky-400 underline cursor-pointer"
                      >
                        Telegram Simulator
                      </button>{" "}
                      to test uploading a Payment Screenshot and approving it as
                      Admin!
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/50">
                            <th className="py-2.5 px-4 font-medium">
                              Order ID
                            </th>
                            <th className="py-2.5 px-4 font-medium">User ID</th>
                            <th className="py-2.5 px-4 font-medium">Voucher</th>
                            <th className="py-2.5 px-4 font-medium text-right">
                              Amount
                            </th>
                            <th className="py-2.5 px-4 font-medium">Status</th>
                            <th className="py-2.5 px-4 font-medium">
                              Dispatched Code
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/70 font-mono tabular-nums">
                          {kvOrders.map((o) => (
                            <tr key={o.orderId} className="hover:bg-slate-800/40">
                              <td className="py-2.5 px-4 text-sky-300">
                                {o.orderId}
                              </td>
                              <td className="py-2.5 px-4 text-slate-300">
                                {o.userId}
                              </td>
                              <td className="py-2.5 px-4 font-sans text-slate-200">
                                {o.voucherTitle}
                              </td>
                              <td className="py-2.5 px-4 text-right text-slate-200">
                                ₹{o.price}
                              </td>
                              <td className="py-2.5 px-4 font-sans">
                                {o.status === "APPROVED" && (
                                  <span className="text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Approved
                                  </span>
                                )}
                                {o.status === "REJECTED" && (
                                  <span className="text-rose-400 flex items-center gap-1">
                                    <XCircle className="w-3.5 h-3.5" />
                                    Rejected
                                  </span>
                                )}
                                {o.status === "PENDING" && (
                                  <span className="text-amber-400">
                                    ⏳ Pending Admin
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-emerald-300">
                                {o.voucherCode || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================================================================
            VIEW 4: GITHUB + CLOUDFLARE WORKERS DEPLOYMENT GUIDE
        ================================================================== */}
        {activeSection === "deploy" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Step-by-Step Deployment via GitHub & Cloudflare Workers
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Follow these 5 steps to deploy{" "}
                  <code className="text-sky-400">{workerConfig.botUsername}</code>{" "}
                  with Cloudflare KV persistence in under 3 minutes.
                </p>
              </div>

              <div className="space-y-4 text-xs leading-relaxed text-slate-300">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    01. Push the 3 Files to a GitHub Repository
                  </h3>
                  <p className="text-slate-400 mb-2">
                    Download or copy <code className="text-sky-300">package.json</code>,{" "}
                    <code className="text-sky-300">wrangler.toml</code>, and{" "}
                    <code className="text-sky-300">index.js</code> into the root of your
                    GitHub repository.
                  </p>
                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-slate-200 overflow-x-auto">
                    {`git init
git add package.json wrangler.toml index.js
git commit -m "Deploy @Getvoucherprobot Cloudflare Worker"
git push -u origin main`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    02. Create the Cloudflare KV Namespace (<code className="text-sky-300">BOT_KV</code>)
                  </h3>
                  <p className="text-slate-400 mb-2">
                    In your Cloudflare Dashboard, go to{" "}
                    <strong className="text-white">Storage & Databases → KV → Create a Namespace</strong>{" "}
                    named <code className="text-sky-300">BOT_KV</code>. Copy the Namespace ID and paste it into{" "}
                    <code className="text-sky-300">wrangler.toml</code> (or run via CLI):
                  </p>
                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-slate-200 overflow-x-auto">
                    {`npx wrangler kv namespace create BOT_KV`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    03. Connect GitHub to Cloudflare Workers & Set <code className="text-sky-300">BOT_TOKEN</code>
                  </h3>
                  <p className="text-slate-400 mb-2">
                    In Cloudflare Dashboard → <strong className="text-white">Workers & Pages → Create Application → Connect to Git</strong>, select your repository. Then go to{" "}
                    <strong className="text-white">Settings → Variables and Secrets</strong> and add your BotFather token:
                  </p>
                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-slate-200 overflow-x-auto">
                    {`npx wrangler secret put BOT_TOKEN`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    04. Register the Telegram Webhook with 1 Click
                  </h3>
                  <p className="text-slate-400 mb-2">
                    We built an automatic <code className="text-sky-300">/setup-webhook</code> route right inside{" "}
                    <code className="text-sky-300">index.js</code>! Once your Worker is deployed, simply open this URL in your browser once:
                  </p>
                  <pre className="p-3 bg-slate-900 rounded border border-slate-800 font-mono text-emerald-300 overflow-x-auto">
                    {`https://getvoucherprobot-worker.<your-subdomain>.workers.dev/setup-webhook`}
                  </pre>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-white mb-1">
                    05. Make <code className="text-sky-300">{workerConfig.botUsername}</code> an Admin in Your Force Channel
                  </h3>
                  <p className="text-slate-400">
                    When you set a Force Join Channel from the Admin Panel (<code className="text-sky-300">🔗 Manage Force Channel</code>), add{" "}
                    <code className="text-sky-300">{workerConfig.botUsername}</code> as an Administrator in that channel so Telegram allows <code className="text-sky-300">bot.api.getChatMember</code> to verify user membership.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          QUIET FOOTER
      ==================================================================== */}
      <footer className="border-t border-slate-900 px-6 py-4 text-xs text-slate-500">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            {workerConfig.botUsername} · Primary Admin ID: {workerConfig.adminId}{" "}
            · Support: {workerConfig.supportUsername}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveSection("codebase")}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Source Files
            </button>
            <button
              onClick={() => setActiveSection("simulator")}
              className="hover:text-slate-300 transition-colors cursor-pointer"
            >
              Simulator
            </button>
            <a
              href={`https://t.me/${workerConfig.supportUsername.replace(/^@/, "")}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 hover:text-slate-300 transition-colors"
            >
              <span>Support ({workerConfig.supportUsername})</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
