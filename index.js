// index.js
require('dotenv').config();
const fs = require('fs');

const TelegramBot = require('node-telegram-bot-api');

// --- CONFIG ---
const TOKEN = process.env.BOT_TOKEN || '';
const ADMIN_ID = Number(process.env.ADMIN_ID) || 0;

if (!TOKEN || !ADMIN_ID) {
  console.error('ERROR: BOT_TOKEN yoki ADMIN_ID .env faylida aniqlanmagan!');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// --- In-memory storage (soddalashtirilgan) ---
const USERS = {};          // { userId: { id, name, username, firstSeen } }
const CHANNELS = [];       // array of channel ids or usernames
const BLOCKED_USERS = {};  // { userId: { blockedUntil, adminName } }
let replyToUser = null;

// admin session for multi-step actions
const ADMIN_SESSIONS = {}; // { key: value }
function setSession(key, value) { ADMIN_SESSIONS[key] = value; }
function getSession(key) { return ADMIN_SESSIONS[key]; }
function clearSession() { for (const k in ADMIN_SESSIONS) delete ADMIN_SESSIONS[k]; }

// last messages log (keeps last 10)
const LAST_MESSAGES = []; // { fromId, fromName, text, date }
function pushMessageLog(entry) {
  LAST_MESSAGES.unshift(entry);
  if (LAST_MESSAGES.length > 10) LAST_MESSAGES.pop();
}

// --- Helpers ---
function escapeHtml(text){
  if(!text) return '';
  return String(text)
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
🕒 <b>Vaqt:</b> ${new Date(msg.date * 1000).toLocaleString()}
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
${escapeHtml(text)}
━━━━━━━━━━━━━━━━━━
🔔 Bu xabar sizga admin tomonidan yuborildi.`;
}

function sendAdminPanel(adminId) {
  const statsText = `🧾 <b>Admin Panel</b>
━━━━━━━━━━━━━━━━━━
👥 Foydalanuvchilar: <b>${Object.keys(USERS).length}</b>
📺 Kanallar: <b>${CHANNELS.length}</b>
🛑 Bloklanganlar: <b>${Object.keys(BLOCKED_USERS).length}</b>
━━━━━━━━━━━━━━━━━━
Tanlang:`;
  const keyboard = [
    [{ text: '📝 So‘nggi xabarlar', callback_data: 'panel_last_msgs' }],
    [{ text: '👥 Userlar ro‘yxati', callback_data: 'panel_list_users' }],
    [{ text: '📢 Elon (Broadcast)', callback_data: 'panel_elon' }],
    [{ text: '🔒 Bloklash', callback_data: 'panel_block' }, { text: '🔓 Blokdan chiqarish', callback_data: 'panel_unblock' }],
    [{ text: '➕ Kanal qo‘shish', callback_data: 'panel_add_channel' }, { text: '➖ Kanal o‘chirish', callback_data: 'panel_remove_channel' }],
    [{ text: '📋 Kanallar ro‘yxati', callback_data: 'panel_list_channels' }],
    [{ text: '📊 Statistikalar', callback_data: 'panel_stats' }]
  ];
  bot.sendMessage(adminId, statsText, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } });
}

// --- Commands ---

// /start
bot.onText(/\/start/, (msg) => {
  const id = String(msg.chat.id);
  USERS[id] = USERS[id] || {
    id: id,
    name: msg.from.first_name || 'No name',
    username: msg.from.username || '',
    firstSeen: Date.now()
  };

  // log message to LAST_MESSAGES
  pushMessageLog({ fromId: id, fromName: USERS[id].name, text: msg.text || '(media)', date: Date.now() });

  bot.sendMessage(id, `Salom ${escapeHtml(msg.from.first_name || '')}!\nBu yordamchi bot. Admin bilan bog'lanish uchun xabar yozing.`, { parse_mode: 'HTML' });

  // notify admin
  bot.sendMessage(ADMIN_ID, userCardForAdmin(msg), { parse_mode: 'HTML' }).catch(()=>{});
});

// /panel (admin shortcut)
bot.onText(/\/panel/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  sendAdminPanel(ADMIN_ID);
});

// /reply - admin starts reply flow
bot.onText(/\/reply$/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;

  const buttons = Object.keys(USERS).map(id => ([{ text: `${USERS[id].name} (${id})`, callback_data: `reply_${id}` }]));
  if (buttons.length === 0) {
    return bot.sendMessage(ADMIN_ID, '📭 Hozircha user yozmagan.');
  }

  return bot.sendMessage(ADMIN_ID, 'Quyidagi userlardan birini tanlang:', { reply_markup: { inline_keyboard: buttons } });
});

// /stats (admin)
bot.onText(/\/stats$/, (msg) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const text = `📊 <b>Statistikalar</b>
━━━━━━━━━━━━━━━━━━
👥 Foydalanuvchilar: <b>${Object.keys(USERS).length}</b>
📺 Kanallar: <b>${CHANNELS.length}</b>
🛑 Bloklanganlar: <b>${Object.keys(BLOCKED_USERS).length}</b>
📨 Oxirgi xabarlar: <b>${LAST_MESSAGES.length}</b>`;
  bot.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' });
});

// /add_channel (admin quick)
bot.onText(/\/add_channel (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const ch = match[1].trim();
  if (!ch) return bot.sendMessage(ADMIN_ID, 'Kanal identifikatorini yuboring (username yoki id).');
  if (!CHANNELS.includes(ch)) CHANNELS.push(ch);
  bot.sendMessage(ADMIN_ID, `✅ Kanal qo‘shildi: ${ch}`);
});

// /remove_channel
bot.onText(/\/remove_channel (.+)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) return;
  const ch = match[1].trim();
  const idx = CHANNELS.indexOf(ch);
  if (idx === -1) return bot.sendMessage(ADMIN_ID, `❗ Kanal topilmadi: ${ch}`);
  CHANNELS.splice(idx, 1);
  bot.sendMessage(ADMIN_ID, `✅ Kanal o‘chirildi: ${ch}`);
});

// --- Callback queries (admin inline panel and flows) ---
bot.on('callback_query', async (query) => {
  const data = query.data;
  const fromId = query.from.id;
  const qid = query.id;

  if (fromId !== ADMIN_ID) return bot.answerCallbackQuery(qid, { text: 'Faqat admin uchun.' });

  // reply selection
  if (data.startsWith('reply_')) {
    const uid = data.split('_')[1];
    replyToUser = uid;
    await bot.sendMessage(ADMIN_ID, `Siz ${USERS[uid]?.name || uid} ga javob berishingiz mumkin. Matn yozing:`);
    return bot.answerCallbackQuery(qid);
  }

  // admin panel actions
  if (data === 'panel_last_msgs') {
    if (LAST_MESSAGES.length === 0) {
      await bot.sendMessage(ADMIN_ID, 'Hech qanday xabar yo‘q.');
    } else {
      const text = LAST_MESSAGES.map((m, i) => `${i+1}. ${escapeHtml(m.fromName)} (${m.fromId}) — ${escapeHtml(m.text)} — ${new Date(m.date).toLocaleString()}`).join('\n\n');
      await bot.sendMessage(ADMIN_ID, `<b>So‘nggi xabarlar:</b>\n\n${text}`, { parse_mode: 'HTML' });
    }
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_list_users') {
    const ids = Object.keys(USERS);
    if (ids.length === 0) return bot.sendMessage(ADMIN_ID, 'Hozircha user yo‘q.');
    const text = ids.map(id => `${USERS[id].name} — <code>${id}</code>`).join('\n');
    await bot.sendMessage(ADMIN_ID, `<b>Userlar ro‘yxati (${ids.length}):</b>\n\n${text}`, { parse_mode: 'HTML' });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_elon') {
    // show elon target options
    const kb = [
      [{ text: 'Userlarga', callback_data: 'elon_target_users' }],
      [{ text: 'Kanallarga', callback_data: 'elon_target_channels' }],
      [{ text: 'Hammaga', callback_data: 'elon_target_everyone' }],
      [{ text: 'Bekor', callback_data: 'panel_cancel' }]
    ];
    await bot.sendMessage(ADMIN_ID, 'Elon kimga yuborilsin?', { reply_markup: { inline_keyboard: kb } });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_block') {
    // list users to block
    const buttons = Object.keys(USERS).map(id => ([ { text: `${USERS[id].name} (${id})`, callback_data: `block_select_${id}` } ]));
    if (buttons.length === 0) return bot.sendMessage(ADMIN_ID, 'Hozircha userlar yo‘q.');
    await bot.sendMessage(ADMIN_ID, 'Qaysi userni bloklamoqchisiz?', { reply_markup: { inline_keyboard: buttons } });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_unblock') {
    const blocked = Object.keys(BLOCKED_USERS);
    if (blocked.length === 0) return bot.sendMessage(ADMIN_ID, 'Hozircha bloklangan user yo‘q.');
    const buttons = blocked.map(uid => ([ { text: `${USERS[uid]?.name || uid} (${uid})`, callback_data: `unblock_${uid}` } ]));
    await bot.sendMessage(ADMIN_ID, 'Qaysi userni blokdan chiqarmoqchisiz?', { reply_markup: { inline_keyboard: buttons } });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_add_channel') {
    setSession('expect_add_channel', true);
    await bot.sendMessage(ADMIN_ID, 'Kanal username yoki ID yuboring (masalan: @kanal_yoki -1001234567890):');
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_remove_channel') {
    if (CHANNELS.length === 0) return bot.sendMessage(ADMIN_ID, 'Hozircha kanal yo‘q.');
    const buttons = CHANNELS.map(ch => ([ { text: ch, callback_data: `remove_channel_${ch}` } ]));
    await bot.sendMessage(ADMIN_ID, 'Qaysi kanalni o‘chirmoqchisiz?', { reply_markup: { inline_keyboard: buttons } });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_list_channels') {
    if (CHANNELS.length === 0) return bot.sendMessage(ADMIN_ID, 'Hozircha kanal yo‘q.');
    const text = CHANNELS.map((c,i) => `${i+1}. ${c}`).join('\n');
    await bot.sendMessage(ADMIN_ID, `<b>Kanallar ro‘yxati:</b>\n\n${text}`, { parse_mode: 'HTML' });
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_stats') {
    const text = `📊 <b>Statistikalar</b>
━━━━━━━━━━━━━━━━━━
👥 Foydalanuvchilar: <b>${Object.keys(USERS).length}</b>
📺 Kanallar: <b>${CHANNELS.length}</b>
🛑 Bloklanganlar: <b>${Object.keys(BLOCKED_USERS).length}</b>
📨 Oxirgi xabarlar: <b>${LAST_MESSAGES.length}</b>`;
    await bot.sendMessage(ADMIN_ID, text, { parse_mode: 'HTML' });
    return bot.answerCallbackQuery(qid);
  }

  if (data.startsWith('block_select_')) {
    const userId = data.split('_')[2];
    const now = Date.now();
    const blockedUntil = now + 30 * 60 * 1000; // 30 minutes
    BLOCKED_USERS[userId] = { blockedUntil, adminName: query.from.first_name || 'Admin' };
    try { await bot.sendMessage(userId, "⚠️ Siz admin tomonidan bloklandingiz.\n⏳ 30 minut kuting."); } catch(e){}
    await bot.sendMessage(ADMIN_ID, `${USERS[userId]?.name || userId} (${userId}) 30 minut bloklandi.`);
    return bot.answerCallbackQuery(qid);
  }

  if (data.startsWith('unblock_')) {
    const userId = data.split('_')[1];
    if (!BLOCKED_USERS[userId]) return bot.sendMessage(ADMIN_ID, "❗️ Bu user blokda emas.");
    delete BLOCKED_USERS[userId];
    try { await bot.sendMessage(userId, "✅ Siz blokdan chiqarildingiz! Endi yozishingiz mumkin."); } catch(e){}
    await bot.sendMessage(ADMIN_ID, `✔️ User blokdan chiqarildi: ${USERS[userId]?.name || 'No name'} (${userId})`);
    return bot.answerCallbackQuery(qid);
  }

  if (data.startsWith('remove_channel_')) {
    const ch = data.replace('remove_channel_', '');
    const idx = CHANNELS.indexOf(ch);
    if (idx !== -1) CHANNELS.splice(idx, 1);
    await bot.sendMessage(ADMIN_ID, `✅ Kanal o‘chirildi: ${ch}`);
    return bot.answerCallbackQuery(qid);
  }

  // elon target selects
  if (data.startsWith('elon_target_')) {
    const target = data.split('_')[2]; // users, channels, everyone
    setSession('elon_target', target);
    setSession('expect_announcement', true);
    await bot.sendMessage(ADMIN_ID, 'Xabar matnini yuboring: (text yoki rasm bilan caption). Xabar yuborilgach bot elonni tarqatadi.');
    return bot.answerCallbackQuery(qid);
  }

  if (data === 'panel_cancel') {
    clearSession();
    await bot.sendMessage(ADMIN_ID, 'Bekor qilindi.');
    return bot.answerCallbackQuery(qid);
  }

  return bot.answerCallbackQuery(qid);
});

// --- Message handler (main) ---
bot.on('message', async (msg) => {
  const userId = String(msg.chat.id);

  // log last messages (for admin)
  pushMessageLog({ fromId: userId, fromName: msg.from.first_name || 'No name', text: msg.text || '(media)', date: Date.now() });

  // Register user if not admin
  if (userId !== String(ADMIN_ID)) {
    USERS[userId] = USERS[userId] || {
      id: userId,
      name: msg.from.first_name || 'No name',
      username: msg.from.username || '',
      firstSeen: USERS[userId]?.firstSeen || Date.now()
    };

    // Check blocked
    if (BLOCKED_USERS[userId]) {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((BLOCKED_USERS[userId].blockedUntil - now) / 1000));
      if (remaining <= 0) {
        delete BLOCKED_USERS[userId];
        await bot.sendMessage(userId, '✅ Endi yozishingiz mumkin.');
      } else {
        await bot.deleteMessage(userId, msg.message_id).catch(()=>{});
        return bot.sendMessage(userId, `⚠️ Siz bloklandingiz.\n⏱️ Qolgan vaqt: ${formatTime(remaining)}`);
      }
      return;
    }

    // Notify admin
    try {
      await bot.sendMessage(ADMIN_ID, userCardForAdmin(msg), { parse_mode: 'HTML' });
    } catch (e) {}

    return;
  }

  // === Admin messages (when admin sends plain text) ===

  // If admin expects to add channel
  if (getSession('expect_add_channel')) {
    const ch = msg.text && msg.text.trim();
    if (ch) {
      if (!CHANNELS.includes(ch)) CHANNELS.push(ch);
      await bot.sendMessage(ADMIN_ID, `✅ Kanal qo‘shildi: ${ch}`);
    } else {
      await bot.sendMessage(ADMIN_ID, '❗ Kanal identifikatorini yuboring (misol: @kanal_yoki -1001234567890)');
    }
    setSession('expect_add_channel', false);
    return;
  }

  // If admin is replying to a user (reply flow)
  if (replyToUser && msg.text) {
    try {
      await bot.sendMessage(replyToUser, adminReplyCard(msg.text), { parse_mode: 'HTML' });
      await bot.sendMessage(ADMIN_ID, '✔️ Xabar yuborildi!');
    } catch (e) {
      await bot.sendMessage(ADMIN_ID, '❗️ Xatolik: user start qilmagan yoki xato ro‘yxat.');
    }
    replyToUser = null;
    return;
  }

  // If admin preparing an announcement
  if (getSession('expect_announcement')) {
    const target = getSession('elon_target') || 'everyone';
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
          if (photoFileId) await bot.sendPhoto(ch, photoFileId, { caption: text || undefined, parse_mode: 'HTML' });
          else await bot.sendMessage(ch, messageHtml, { parse_mode: 'HTML' });
        } catch (e) {
          // kanalga yuborishda xatolik bo'lishi mumkin (bot admin bo'lishi yoki kanalga qo'shilmagan)
        }
      }
    }

    // Send to users
    if (target === 'users' || target === 'everyone') {
      for (const uid of Object.keys(USERS)) {
        try {
          if (photoFileId) await bot.sendPhoto(uid, photoFileId, { caption: text || undefined, parse_mode: 'HTML' });
          else await bot.sendMessage(uid, messageHtml, { parse_mode: 'HTML' });
        } catch (e) {
          // userga yuborishda xato bo'lishi mumkin (bloklash, start qilmagan)
        }
      }
    }

    clearSession();
    await bot.sendMessage(ADMIN_ID, "📤 Elon yuborildi!");
    return;
  }

  // Other admin text commands
  // (handled above: /reply, /panel, /add_channel via session)
});

// --- Graceful shutdown logging ---
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});

console.log('Bot ishga tushdi: barcha funksiyalar bilan!');
