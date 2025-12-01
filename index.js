// telegram_bot_full_feature.js

const TelegramBot = require('node-telegram-bot-api');

// --- CONFIG ---
const TOKEN = process.env.BOT_TOKEN || '8285944721:AAFCKlsFfVI5mig4-OKdFzHnUl_P3QxkAOU';
const ADMIN_ID = Number(process.env.ADMIN_ID) || 374644337;
const bot = new TelegramBot(TOKEN, { polling: true });

// --- In-memory storage ---
const USERS = {};
const CHANNELS = [];
const BLOCKED_USERS = {};
let replyToUser = null;

// --- Admin session for /elon ---
const ADMIN_SESSIONS = {};
function setSession(key, value) { ADMIN_SESSIONS[key] = value; }
function getSession(key) { return ADMIN_SESSIONS[key]; }
function clearSession() { for (const k in ADMIN_SESSIONS) delete ADMIN_SESSIONS[k]; }

// --- Helpers ---
function escapeHtml(text){
  if(!text) return '';
  return text
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function formatTime(sec){
  const m = Math.floor(sec/60);
  const s = sec % 60;
  return `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function userCardForAdmin(msg) {
  return `📬 <b>Yangi xabar!</b>
━━━━━━━━━━━━━━━━━━
👤 <b>User:</b> ${escapeHtml(msg.from.first_name || 'No name')}
🔗 @${escapeHtml(msg.from.username || 'no_username')}
🆔 <b>ID:</b> ${msg.chat.id}
━━━━━━━━━━━━━━━━━━
💬 <b>Xabar matni:</b>
${escapeHtml(msg.text || '(media)')}
━━━━━━━━━━━━━━━━━━
🔁 <b>Javob berish uchun:</b>
/reply`;
}

function adminReplyCard(text) {
  return `✨ <b>Admin javobi</b>
━━━━━━━━━━━━━━━━━━
💬 <b>Xabar:</b>
${escapeHtml(text)}
━━━━━━━━━━━━━━━━━━
🔔 Bu xabar sizga admin tomonidan yuborildi.`;
}

// --- /start ---
bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  USERS[id] = { id, name: msg.from.first_name || 'No name', username: msg.from.username || '' };

  bot.sendMessage(id, `Salom ${escapeHtml(msg.from.first_name || '')}!
Bu yordamchi bot. Admin bilan bog‘lanish uchun xabar yozing.`, { parse_mode: 'HTML' });
});

// --- /reply ---
bot.onText(/\/reply$/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const buttons = [];
  for (const id in USERS) {
    buttons.push([
      { text: `${USERS[id].name} (${id})`, callback_data: `reply_${id}` }
    ]);
  }

  if (buttons.length === 0)
    return bot.sendMessage(ADMIN_ID, '📭 Hozircha user yozmagan.');

  bot.sendMessage(ADMIN_ID, 'Quyidagi userlardan birini tanlang:', {
    reply_markup: { inline_keyboard: buttons }
  });
});

// --- /elon ---
bot.onText(/\/elon$/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const buttons = [
    [{ text: 'Userlar', callback_data: 'elon_target_users' }],
    [{ text: 'Kanallar', callback_data: 'elon_target_channels' }],
    [{ text: 'Hammaga', callback_data: 'elon_target_everyone' }]
  ];

  await bot.sendMessage(ADMIN_ID, 'Elon kimga yuborilsin?', {
    reply_markup: { inline_keyboard: buttons }
  });
});

// --- /blok_user ---
bot.onText(/\/blok_user/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  bot.sendMessage(ADMIN_ID, 'Bloklash variantini tanlang:', {
    reply_markup: { inline_keyboard: [
      [{ text: 'User', callback_data: 'block_user' }]
    ]}
  });
});

// --- /unblok_user ---
bot.onText(/\/unblok_user/, async (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const blocked = Object.keys(BLOCKED_USERS);
  if (blocked.length === 0) {
    return bot.sendMessage(ADMIN_ID, "📭 Hozircha bloklangan user yo‘q.");
  }

  const buttons = blocked.map(uid => ([
    { text: `${USERS[uid]?.name || 'No name'} (${uid})`, callback_data: `unblock_${uid}` }
  ]));

  bot.sendMessage(ADMIN_ID, "Qaysi userni blokdan chiqarmoqchisiz?", {
    reply_markup: { inline_keyboard: buttons }
  });
});

// --- Callback queries ---
bot.on('callback_query', async (query) => {
  const data = query.data;
  const fromId = query.from.id;

  if (fromId !== ADMIN_ID)
    return bot.answerCallbackQuery(query.id);

  // --- Reply selection ---
  if (data.startsWith('reply_')) {
    replyToUser = data.split('_')[1];
    return bot.sendMessage(
      ADMIN_ID,
      `Siz ${USERS[replyToUser].name} ga javob berishingiz mumkin. Matn yozing:`
    );
  }

  // --- Block user ---
  if (data === 'block_user') {
    const buttons = Object.keys(USERS).map(id => ([
      { text: `${USERS[id].name} (${id})`, callback_data: `block_select_${id}` }
    ]));

    return bot.sendMessage(ADMIN_ID, 'Qaysi userni bloklamoqchisiz?', {
      reply_markup: { inline_keyboard: buttons }
    });
  }

  if (data.startsWith('block_select_')) {
    const userId = data.split('_')[2];
    const now = Date.now();
    const blockedUntil = now + 30 * 60 * 1000;

    BLOCKED_USERS[userId] = { blockedUntil, adminName: 'Admin' };

    try {
      await bot.sendMessage(
        userId,
        "⚠️ Siz admin tomonidan bloklandingiz.\n⏳ 30 minut kuting."
      );
    } catch (e) {}

    return bot.sendMessage(
      ADMIN_ID,
      `${USERS[userId].name} (${userId}) 30 minut bloklandi.`
    );
  }

  // --- Unblock user ---
  if (data.startsWith('unblock_')) {
    const userId = data.split('_')[1];

    if (!BLOCKED_USERS[userId]) {
      return bot.sendMessage(ADMIN_ID, "❗️ Bu user blokda emas.");
    }

    delete BLOCKED_USERS[userId];

    try {
      await bot.sendMessage(userId, "✅ Siz blokdan chiqarildingiz! Endi yozishingiz mumkin.");
    } catch (e) {}

    return bot.sendMessage(
      ADMIN_ID,
      `✔️ User blokdan chiqarildi: ${USERS[userId]?.name || 'No name'} (${userId})`
    );
  }

  // --- Elon target selection ---
  if (data.startsWith('elon_target_')) {
    const target = data.split('_')[2];
    setSession('elon_target', target);
    setSession('expect_announcement', true);

    return bot.sendMessage(
      ADMIN_ID,
      'Xabar matnini yuboring: (text yoki rasm bilan caption)'
    );
  }

  bot.answerCallbackQuery(query.id);
});

// --- Message handler ---
bot.on('message', async (msg) => {
  const userId = msg.chat.id;

  // --- Register USER ---
  if (userId !== ADMIN_ID) {
    USERS[userId] = {
      id: userId,
      name: msg.from.first_name || 'No name',
      username: msg.from.username || ''
    };

    // --- Check blocked ---
    if (BLOCKED_USERS[userId]) {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((BLOCKED_USERS[userId].blockedUntil - now) / 1000));

      if (remaining <= 0) {
        delete BLOCKED_USERS[userId];
        await bot.sendMessage(userId, '✅ Endi yozishingiz mumkin.');
        return;
      }

      await bot.deleteMessage(userId, msg.message_id).catch(() => {});
      return bot.sendMessage(
        userId,
        `⚠️ Siz bloklandingiz.\n⏱️ Qolgan vaqt: ${formatTime(remaining)}`
      );
    }

    return bot.sendMessage(ADMIN_ID, userCardForAdmin(msg), { parse_mode: 'HTML' });
  }

  // --- Admin reply ---
  if (replyToUser && msg.text) {
    try {
      await bot.sendMessage(replyToUser, adminReplyCard(msg.text), { parse_mode: 'HTML' });
      await bot.sendMessage(ADMIN_ID, '✔️ Xabar yuborildi!');
    } catch (e) {
      await bot.sendMessage(ADMIN_ID, '❗️ Xatolik: user start qilmagan.');
    }
    replyToUser = null;
    return;
  }

  // --- Elon sending ---
  if (getSession('expect_announcement')) {
    const target = getSession('elon_target');
    let text = msg.text || '';
    let photoFileId = null;

    if (msg.photo) {
      photoFileId = msg.photo[msg.photo.length - 1].file_id;
      text = msg.caption || text;
    }

    const messageHtml = `📣 <b>E L O N</b>
━━━━━━━━━━━━━━━━━━
${escapeHtml(text)}
━━━━━━━━━━━━━━━━━━
<i>— Admin</i>`;

    // Send to channels
    if (target === 'channels' || target === 'everyone') {
      for (const ch of CHANNELS) {
        try {
          if (photoFileId)
            await bot.sendPhoto(ch, photoFileId, {
              caption: text || undefined,
              parse_mode: 'HTML'
            });
          else
            await bot.sendMessage(ch, messageHtml, { parse_mode: 'HTML' });
        } catch (e) {}
      }
    }

    // Send to users
    if (target === 'users' || target === 'everyone') {
      for (const uid of Object.keys(USERS)) {
        try {
          if (photoFileId)
            await bot.sendPhoto(uid, photoFileId, {
              caption: text || undefined,
              parse_mode: 'HTML'
            });
          else
            await bot.sendMessage(uid, messageHtml, { parse_mode: 'HTML' });
        } catch (e) {}
      }
    }

    clearSession();
    await bot.sendMessage(ADMIN_ID, "📤 Elon yuborildi!");
    return;
  }
});

console.log('Bot ishga tushdi: barcha funksiyalar bilan!');
