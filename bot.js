require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const GAME_URL = process.env.GAME_URL;

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id,
    'Привет! Я бот для игры в Дурака.\n\n' +
    'Отправь /play — я создам комнату и дам тебе ссылку.\n' +
    'Перешли ссылку бабушке (или другу) и играйте!'
  );
});

bot.onText(/\/play/, async (msg) => {
  try {
    const res = await fetch(`${GAME_URL}/api/create-room`, { method: 'POST' });
    const { roomId } = await res.json();
    const link = `${GAME_URL}/?room=${roomId}`;
    bot.sendMessage(msg.chat.id,
      `Комната создана! Отправь эту ссылку сопернику:\n\n${link}`
    );
  } catch (err) {
    bot.sendMessage(msg.chat.id, 'Не удалось создать комнату. Попробуй позже.');
  }
});

console.log('Bot is running...');
