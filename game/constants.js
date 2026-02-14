const SUITS = ['♠', '♥', '♦', '♣'];

const SUIT_NAMES = {
  '♠': 'Пики',
  '♥': 'Червы',
  '♦': 'Бубны',
  '♣': 'Трефы',
};

const SUIT_COLORS = {
  '♠': 'black',
  '♥': 'red',
  '♦': 'red',
  '♣': 'black',
};

const RANKS = ['6', '7', '8', '9', '10', 'В', 'Д', 'К', 'Т'];

const RANK_VALUES = {
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'В': 11,
  'Д': 12,
  'К': 13,
  'Т': 14,
};

const HAND_SIZE = 6;

const PHASES = {
  WAITING: 'WAITING',
  ATTACKING: 'ATTACKING',
  DEFENDING: 'DEFENDING',
  THROWING_IN: 'THROWING_IN',
  ROUND_END: 'ROUND_END',
  GAME_OVER: 'GAME_OVER',
};

module.exports = { SUITS, SUIT_NAMES, SUIT_COLORS, RANKS, RANK_VALUES, HAND_SIZE, PHASES };
