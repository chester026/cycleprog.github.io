const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CACHE_PATH = path.join(__dirname, 'aiAnalysisCache.json');
let aiCache = {};
// Загрузка кэша из файла при старте
try {
  if (fs.existsSync(CACHE_PATH)) {
    aiCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
  }
} catch (e) {
  aiCache = {};
}

function getSummaryHash(summary) {
  return crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex');
}

async function analyzeTraining(summary) {
  const hash = getSummaryHash(summary);
  if (aiCache[hash]) {
    return aiCache[hash];
  }
  const prompt = `
    Ты — опытный тренер по велоспорту. Проанализируй тренировку:
    ${JSON.stringify(summary, null, 2)}
    Дай советы по восстановлению, питанию, технике, если есть проблемы — укажи их. Пиши кратко и по делу.
  `;
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-nano',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 400,
    temperature: 0.7,
  });
  const analysis = response.choices[0].message.content.trim();
  aiCache[hash] = analysis;
  // Сохраняем кэш в файл
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(aiCache, null, 2), 'utf-8');
  } catch (e) {
    // ignore
  }
  return analysis;
}

module.exports = { analyzeTraining }; 