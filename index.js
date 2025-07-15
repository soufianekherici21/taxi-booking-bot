const { Telegraf, Markup } = require("telegraf");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
require("dotenv").config();

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const binId = process.env.JSONBIN_BOOKINGS_ID;
const apiKey = process.env.JSONBIN_API_KEY;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

// ✅ استقبال رسالة نصية من المستخدم
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

      if (!booking) {
        return ctx.reply("❌ لم يتم العثور على حجز بهذا الرقم.");
      }

      const msg = `✅ تفاصيل حجزك:

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
        return ctx.reply(
          msg + "\n\n✅ تم تأكيد هذا الحجز مسبقًا. لا يمكن تغييره.",
        );
      }

      if (booking.status === "cancelled") {
        return ctx.reply(msg + "\n\n❌ هذا الحجز ملغى ولا يمكن تعديله.");
      }

      return ctx.reply(
        msg,
        Markup.inlineKeyboard([
          Markup.button.callback("✅ تأكيد", `confirm_${booking.bookingId}`),
          Markup.button.callback("❌ إلغاء", `cancel_${booking.bookingId}`),
        ]),
      );
    } catch (err) {
      console.error(err);
      return ctx.reply("⚠️ حدث خطأ أثناء جلب بيانات الحجز.");
    }
  }

  return ctx.reply(
    "❓ لم أفهم رسالتك. أرسل /start أو رقم الحجز مثل: TXI123456",
  );
});

// ✅ أزرار التأكيد والإلغاء
bot.on("callback_query", async (ctx) => {
  const action = ctx.callbackQuery.data;
  const [type, bookingId] = action.split("_");

  try {
    const res = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": apiKey },
    });
    const data = await res.json();
    const bookings = data.record;

    const index = bookings.findIndex((b) => b.bookingId === bookingId);
    if (index === -1) return ctx.reply("❌ لم يتم العثور على الحجز.");

    const booking = bookings[index];

    if (booking.status === "confirmed") {
      return ctx.reply("✅ تم تأكيد هذا الحجز مسبقًا.");
    }

    if (booking.status === "cancelled") {
      return ctx.reply("❌ هذا الحجز ملغى ولا يمكن تغييره.");
    }

    if (type === "confirm") {
      bookings[index].status = "confirmed";
      await saveToJsonBin(bookings);
      return ctx.editMessageText("✅ تم تأكيد الحجز بنجاح.");
    }

    if (type === "cancel") {
      bookings[index].status = "cancelled";
      await saveToJsonBin(bookings);
      return ctx.editMessageText("❌ تم إلغاء الحجز بنجاح.");
    }
  } catch (err) {
    console.error(err);
    return ctx.reply("⚠️ حدث خطأ أثناء تحديث حالة الحجز.");
  }
});

// ✅ دالة لحفظ البيانات في JSONBin
async function saveToJsonBin(data) {
  await fetch(`https://api.jsonbin.io/v3/b/${binId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": apiKey,
    },
    body: JSON.stringify(data),
  });
}

// ✅ سيرفر Express
const express = require("express");
const app = express();
app.use(express.json());

app.get("/", (req, res) => res.send("🚕 بوت الحجز شغال 👋"));

// ✅ استقبال الحجوزات من الموقع
app.post("/api/booking", async (req, res) => {
  const data = req.body;
  console.log("📦 تم استقبال حجز جديد:", data);

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

    // جلب البيانات الحالية
    const resBin = await fetch(`https://api.jsonbin.io/v3/b/${binId}/latest`, {
      headers: { "X-Master-Key": apiKey },
    });
    const json = await resBin.json();
    const current = Array.isArray(json.record) ? json.record : [];

    // إضافة الحجز الجديد
    current.push({
      ...data,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    // حفظ في JSONBin
    await saveToJsonBin(current);

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
