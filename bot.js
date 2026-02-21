require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const GAME_URL = process.env.GAME_URL;

bot.onText(/\/start(.*)/, (msg, match) => {
  const roomId = (match[1] || '').trim();

  // Grandma tapped the invite link — show a Play button
  if (roomId) {
    const link = `${GAME_URL}/?room=${roomId}`;
    bot.sendMessage(msg.chat.id, '🃏 You\'ve been invited to play Durak!', {
      reply_markup: {
        inline_keyboard: [[
          { text: '▶️ Play', url: link }
        ]]
      }
    });
    return;
  }

  bot.sendMessage(msg.chat.id,
    'Hi! I\'m the Durak card game bot.\n\n' +
    'Send /play to invite someone to a game!'
  );
});

bot.onText(/\/play/, async (msg) => {
  try {
    const res = await fetch(`${GAME_URL}/api/create-room`, { method: 'POST' });
    const { roomId } = await res.json();
    const link = `${GAME_URL}/?room=${roomId}`;
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}`;

    bot.sendMessage(msg.chat.id, `Your game link:\n\n👉 ${link}\n\nNow invite your opponent!`, {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Invite', url: shareUrl }
        ]]
      }
    });
  } catch (err) {
    bot.sendMessage(msg.chat.id, 'Could not create a room. Try again later.');
  }
});

console.log('Bot is running...');
