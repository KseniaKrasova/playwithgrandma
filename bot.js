require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const GAME_URL = process.env.GAME_URL;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Hi! I\'m the Durak card game bot.\n\n' +
    'Send /play to invite someone to a game!'
  );
});

bot.onText(/\/play/, async (msg) => {
  try {
    const res = await fetch(`${GAME_URL}/api/create-room`, { method: 'POST' });
    const { roomId } = await res.json();

    bot.sendMessage(msg.chat.id, 'Invite who?', {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Choose contact', switch_inline_query: roomId }
        ]]
      }
    });
  } catch (err) {
    bot.sendMessage(msg.chat.id, 'Could not create a room. Try again later.');
  }
});

// When user picks a contact, Telegram fires an inline query with the roomId
bot.on('inline_query', (query) => {
  const roomId = query.query;
  if (!roomId) return;

  const name = query.from.first_name || 'Someone';
  const link = `${GAME_URL}/?room=${roomId}`;

  bot.answerInlineQuery(query.id, [{
    type: 'article',
    id: roomId,
    title: `Play Durak with ${name}`,
    description: 'Tap to send the invite',
    input_message_content: {
      message_text: `🃏 Play Durak with ${name}!\n\n👉 ${link}`
    }
  }]);
});

console.log('Bot is running...');
