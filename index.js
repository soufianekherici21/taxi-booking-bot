const { Telegraf } = require("telegraf");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const binId = process.env.JSONBIN_BOOKINGS_ID;
const apiKey = process.env.JSONBIN_API_KEY;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  }),
);
app.use(express.json());

app.post("/api/booking", async (req, res) => {
  const data = req.body;
  console.log("📦 البيانات المستلمة من النموذج:", data);

  const message = `🚖 تم تسجيل حجز جديد

🆔 رقم الحجز: ${data.bookingId}
📍 مكان الركوب: ${data.pickup}
🎯 الوجهة: ${data.destination}
📅 التاريخ: ${data.date}
⏰ الوقت: ${data.time}
🚗 نوع السيارة: ${data.car}
💰 السعر: ${data.price} دج
👤 الاسم: ${data.name}
📞 الهاتف: ${data.phone}
👥 عدد الركاب: ${data.passengers}`;

  try {
    await bot.telegram.sendMessage(telegramChatId, message, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ قبول", callback_data: `accept_${data.bookingId}` },
            { text: "❌ رفض", callback_data: `reject_${data.bookingId}` },
          ],
        ],
      },
    });

    const resBin = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": apiKey },
    });
    const json = await resBin.json();
    const current = Array.isArray(json.record) ? json.record : [];

    current.push({
      ...data,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(current),
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ فشل في الحفظ أو الإرسال:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data.startsWith("accept_")) {
    const bookingId = data.split("_")[1];

    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: { "X-Master-Key": apiKey },
      });
      const json = await res.json();
      const bookings = json.record;

      const index = bookings.findIndex((b) => b.bookingId === bookingId);
      if (index === -1) return ctx.reply("❌ لم يتم العثور على الحجز.");

      const booking = bookings[index];
      bookings[index].status = "accepted";
      bookings[index].driverChatId = ctx.from.id;

      await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Master-Key": apiKey,
        },
        body: JSON.stringify(bookings),
      });

      async function getUserChatIdByPhone(phone) {
        try {
          const res = await fetch(`https://api.jsonbin.io/v3/b/${usersBin}/latest`, {
            headers: { "X-Master-Key": apiKey },
          });
          const json = await res.json();
          const users = json.record;
          const user = users.find((u) => u.phone === phone);
          return user?.chatId || null;
        } catch (err) {
          console.error("❌ فشل في جلب usersBin:", err);
          return null;
        }
      }
      const userChatId = await getUserChatIdByPhone(booking.phone);

      if (userChatId) {
        const message = `🚖 تم قبول حجزك بنجاح!\n\n🆔 رقم الحجز: ${booking.bookingId}\n📍 من: ${booking.pickup}\n🎯 إلى: ${booking.destination}\n⏰ الوقت: ${booking.time}`;
        await bot.telegram.sendMessage(userChatId, message);
      } else {
        console.warn("⚠️ لم يتم العثور على chatId للعميل.");
      }

      return ctx.reply("✅ تم قبول الحجز وتم إشعار العميل.");
    } catch (err) {
      console.error("❌ خطأ أثناء قبول الحجز:", err);
      return ctx.reply("❌ حدث خطأ أثناء معالجة القبول.");
    }
  }

  if (data.startsWith("reject_")) {
    return ctx.reply("❌ تم رفض الحجز.");
  }
});

bot.on("text", async (ctx) => {
  console.log("📩 عميل جديد:", ctx.chat.id, ctx.message.text);
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  if (text === "/register") {
    const registerState = {};
    registerState[chatId] = { step: "awaiting_name" };
    return ctx.reply("👋 من فضلك أرسل اسمك الكامل:");
  }

  const registerState = {};
  if (registerState[chatId]) {
    const state = registerState[chatId];

    if (state.step === "awaiting_name") {
      registerState[chatId].name = text;
      registerState[chatId].step = "awaiting_phone";
      return ctx.reply("📞 الآن أرسل رقم هاتفك:");
    }

    if (state.step === "awaiting_phone") {
      const phone = text;
      const name = state.name;

      try {
        const driversBin = process.env.JSONBIN_DRIVERS_ID;
        const apiKey = process.env.JSONBIN_API_KEY;
        const res = await fetch(
          `https://api.jsonbin.io/v3/b/${driversBin}/latest`,
          {
            headers: { "X-Master-Key": apiKey },
          },
        );
        const json = await res.json();
        const current = Array.isArray(json.record) ? json.record : [];

        current.push({ chatId, name, phone });

        await fetch(`https://api.jsonbin.io/v3/b/${driversBin}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Master-Key": apiKey,
          },
          body: JSON.stringify(current),
        });

        delete registerState[chatId];
        return ctx.reply("✅ تم تسجيلك كسائق بنجاح.");
      } catch (err) {
        console.error(err);
        return ctx.reply("❌ حدث خطأ أثناء حفظ بياناتك.");
      }
    }
    return;
  }

  const userMessage = text.toUpperCase();
  if (userMessage === "/START") {
    return ctx.reply(
      "👋 أهلًا بك! من فضلك أرسل رقم الحجز الذي وصلك (مثلاً: TXI123456)",
    );
  }

  if (/^TXI\d{6}$/.test(userMessage)) {
    try {
      const binId = process.env.JSONBIN_BOOKINGS_ID;
      const apiKey = process.env.JSONBIN_API_KEY;
      const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: { "X-Master-Key": apiKey },
      });
      const data = await res.json();
      const bookings = data.record;
      const booking = bookings.find((b) => b.bookingId === userMessage);

      if (!booking) return ctx.reply("❌ لم يتم العثور على حجز بهذا الرقم.");

      const usersBin = process.env.JSONBIN_USERS_ID;
      if (usersBin) {
        try {
          const usersRes = await fetch(
            `https://api.jsonbin.io/v3/b/${usersBin}/latest`,
            {
              headers: { "X-Master-Key": apiKey },
            },
          );
          const usersData = await usersRes.json();
          const users = usersData.record;

          const chatId = ctx.chat.id;
          const alreadyExists = users.some(
            (u) => u.phone === booking.phone || u.chatId === chatId,
          );

          if (!alreadyExists) {
            users.push({ phone: booking.phone, chatId });

            await fetch(`https://api.jsonbin.io/v3/b/${usersBin}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "X-Master-Key": apiKey,
              },
              body: JSON.stringify(users),
            });

            console.log(`✅ تم ربط رقم ${booking.phone} بـ chatId: ${chatId}`);
          }
        } catch (e) {
          console.error("❌ فشل في تحديث Bin المستخدمين:", e);
        }
      }

      const baseMsg = `✅ تفاصيل حجزك:

🆔 رقم الحجز: ${booking.bookingId}
📍 مكان الركوب: ${booking.pickup}
🎯 الوجهة: ${booking.destination}
📅 التاريخ: ${booking.date}
⏰ الوقت: ${booking.time}
🚗 نوع السيارة: ${booking.car}
💰 السعر: ${booking.price} دج
👤 الاسم: ${booking.name}
📞 الهاتف: ${booking.phone}
👥 عدد الركاب: ${booking.passengers}`;

      if (booking.status === "confirmed") {
        return ctx.reply(`${baseMsg}\n\n✅ تم تأكيد هذا الحجز مسبقًا.`);
      } else if (booking.status === "cancelled") {
        return ctx.reply(`${baseMsg}\n\n❌ تم إلغاء هذا الحجز مسبقًا.`);
      } else {
        const Markup = require('telegraf').Markup
        return ctx.reply(
          `${baseMsg}\n\n⚠️ حجزك قيد الانتظار. يمكنك الإلغاء في أي وقت.`,
          Markup.inlineKeyboard([
            Markup.button.callback(
              "❌ إلغاء الحجز",
              `cancel_${booking.bookingId}`,
            ),
          ]),
        );
      }
    } catch (err) {
      console.error(err);
      return ctx.reply("⚠️ حدث خطأ أثناء جلب بيانات الحجز.");
    }
  }

  return ctx.reply(
    "❓ لم أفهم رسالتك. أرسل /start أو رقم الحجز مثل: TXI123456",
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 السيرفر شغال على المنفذ ${PORT}`);
});