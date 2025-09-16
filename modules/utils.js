// modules/utils.js

function shuffleArray(array) {
  return [...array].sort(() => Math.random() - 0.5);
}

function getRandomWord(words, exclude = null) {
  let word = words[Math.floor(Math.random() * words.length)];
  while (word === exclude) {
    word = words[Math.floor(Math.random() * words.length)];
  }
  return word;
}

function formatTimer(duration) {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  shuffleArray,
  getRandomWord,
  formatTimer,
  delay
};