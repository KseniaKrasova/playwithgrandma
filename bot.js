require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createRoom } = require('./game/room');

const GAME_URL = process.env.GAME_URL;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Use webhooks in production (Railway), polling locally
const isProduction = !!process.env.RAILWAY_PUBLIC_DOMAIN;
const bot = isProduction
  ? new TelegramBot(TOKEN)
  : new TelegramBot(TOKEN, { polling: true });

if (isProduction) {
  const webhookUrl = `${GAME_URL}/bot${TOKEN}`;
  bot.setWebHook(webhookUrl).then(() => {
    console.log('Webhook set:', GAME_URL + '/bot<token>');
  }).catch(err => {
    console.error('Failed to set webhook:', err.message);
  });
}

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
    const room = createRoom();
    const link = `${GAME_URL}/?room=${room.id}`;
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

console.log('Bot is running...' + (isProduction ? ' (webhook mode)' : ' (polling mode)'));

module.exports = { bot };
