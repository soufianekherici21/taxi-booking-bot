const { Telegraf } = require("telegraf");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const binId = process.env.JSONBIN_BOOKINGS_ID;
const apiKey = process.env.JSONBIN_API_KEY;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

// ✅ عند إرسال رسالة في البوت
bot.on("text", async (ctx) => {
  const userMessage = ctx.message.text.trim().toUpperCase();

  if (userMessage === "/START") {
    return ctx.reply(
      "👋 أهلًا بك! من فضلك أرسل رقم الحجز الذي وصلك (مثلاً: TXI123456)",
    );
  }

  if (/^TXI\d{6}$/.test(userMessage)) {
    try {
      const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
        headers: { "X-Master-Key": apiKey },
      });

      const data = await res.json();
      const bookings = data.record;
      const booking = bookings.find((b) => b.bookingId === userMessage);

      if (booking) {
        let statusText = "";
        if (booking.status === "confirmed")
          statusText = "\n✅ تم تأكيد هذا الحجز مسبقًا.";
        if (booking.status === "cancelled")
          statusText = "\n❌ تم إلغاء هذا الحجز مسبقًا.";

        const msg = `✅ تفاصيل حجزك:\n
🆔 رقم الحجز: ${booking.bookingId}
📍 مكان الركوب: ${booking.pickup}
🎯 الوجهة: ${booking.destination}
📅 التاريخ: ${booking.date}
⏰ الوقت: ${booking.time}
🚗 نوع السيارة: ${booking.car}
💰 السعر: ${booking.price} دج
👤 الاسم: ${booking.name}
📞 الهاتف: ${booking.phone}
👥 عدد الركاب: ${booking.passengers}${statusText}`;

        const buttons =
          booking.status === "pending"
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "✅ تأكيد الحجز",
                        callback_data: `confirm_${booking.bookingId}`,
                      },
                      {
                        text: "❌ إلغاء الحجز",
                        callback_data: `cancel_${booking.bookingId}`,
                      },
                    ],
                  ],
                },
              }
            : {};

        return ctx.reply(msg, buttons);
      } else {
        return ctx.reply("❌ لم يتم العثور على حجز بهذا الرقم. تأكد من صحته.");
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

// ✅ استقبال التفاعل مع الأزرار
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const [action, bookingId] = data.split("_");

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": apiKey },
    });
    const json = await res.json();
    const bookings = json.record;
    const index = bookings.findIndex((b) => b.bookingId === bookingId);

    if (index === -1) return ctx.answerCbQuery("❌ لم يتم العثور على الحجز.");

    const currentStatus = bookings[index].status;

    if (currentStatus === "confirmed") {
      return ctx.answerCbQuery("✅ تم تأكيد هذا الحجز مسبقًا.", {
        show_alert: true,
      });
    }
    if (currentStatus === "cancelled") {
      return ctx.answerCbQuery("❌ هذا الحجز ملغى مسبقًا.", {
        show_alert: true,
      });
    }

    // ✅ تحديث الحالة
    bookings[index].status = action === "confirm" ? "confirmed" : "cancelled";

    await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Master-Key": apiKey,
      },
      body: JSON.stringify(bookings),
    });

    await ctx.editMessageReplyMarkup(); // ❌ حذف الأزرار بعد الضغط
    await ctx.reply(
      action === "confirm"
        ? "✅ تم تأكيد حجزك بنجاح!"
        : "❌ تم إلغاء حجزك. نأمل أن نخدمك في وقت لاحق.",
    );
  } catch (err) {
    console.error("❌ خطأ أثناء تحديث الحجز:", err);
    return ctx.reply("⚠️ حدث خطأ أثناء تحديث الحجز.");
  }
});

// ✅ إبقاء السيرفر شغال
const express = require("express");
const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("🚕 بوت الحجز شغال 👋"));

// ✅ استقبال الحجوزات من الموقع
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
    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramChatId,
          text: message,
        }),
      },
    );

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
      },
      body: JSON.stringify(current),
    });

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("❌ فشل في الحفظ أو الإرسال:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

bot.launch();
app.listen(3000, () =>
  console.log("✅ السيرفر يعمل على http://localhost:3000"),
);
