#!/usr/bin/env node

const { Client } = require('pg');
const { profiles } = require('./database_profiles');

// Конфигурация подключения к PostgreSQL
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

async function applyProfile(profileName) {
  const client = new Client(config);
  
  try {
    console.log(`🔌 Подключение к PostgreSQL...`);
    await client.connect();
    
    // Проверяем права доступа
    const rightsCheck = await client.query('SELECT current_user, session_user;');
    console.log(`👤 Текущий пользователь: ${rightsCheck.rows[0].current_user}`);
    
    const selectedProfile = profiles[profileName];
    if (!selectedProfile) {
      console.error(`❌ Профиль "${profileName}" не найден`);
      console.log(`📋 Доступные профили: ${Object.keys(profiles).join(', ')}`);
      return;
    }
    
    console.log(`\n🎯 Применяем профиль: ${selectedProfile.name}`);
    console.log(`📝 Описание: ${selectedProfile.description}`);
    console.log(`\n⚙️  Настройки:`);
    
    const results = [];
    
    for (const [name, setting] of Object.entries(selectedProfile.settings)) {
      try {
        console.log(`\n🔧 ${name} = ${setting.value}`);
        console.log(`   ${setting.description}`);
        
        await client.query(`ALTER SYSTEM SET ${name} = '${setting.value}';`);
        console.log(`   ✅ Успешно применено`);
        results.push({ name, value: setting.value, status: 'success' });
      } catch (error) {
        console.log(`   ❌ Ошибка: ${error.message}`);
        results.push({ name, value: setting.value, status: 'error', error: error.message });
      }
    }
    
    // Статистика
    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    console.log(`\n📊 Результаты:`);
    console.log(`   ✅ Успешно: ${successCount}`);
    console.log(`   ❌ Ошибок: ${errorCount}`);
    
    if (successCount > 0) {
      console.log(`\n🔄 Для применения изменений выполните:`);
      console.log(`   sudo systemctl restart postgresql`);
      console.log(`   или`);
      console.log(`   SELECT pg_reload_conf();`);
    }
    
    console.log(`\n💡 Рекомендации:`);
    selectedProfile.recommendations.forEach(rec => {
      console.log(`   • ${rec}`);
    });
    
  } catch (error) {
    console.error(`❌ Ошибка подключения: ${error.message}`);
    console.log(`\n💡 Проверьте:`);
    console.log(`   • Правильность данных подключения`);
    console.log(`   • Права доступа пользователя`);
    console.log(`   • Статус PostgreSQL сервиса`);
  } finally {
    await client.end();
  }
}

// Обработка аргументов командной строки
const profileName = process.argv[2];

if (!profileName) {
  console.log(`📋 Использование: node apply_profile.js <profile_name>`);
  console.log(`\n📋 Доступные профили:`);
  Object.entries(profiles).forEach(([key, profile]) => {
    console.log(`   ${key}: ${profile.name}`);
  });
  console.log(`\n💡 Пример: node apply_profile.js low-end`);
  process.exit(1);
}

applyProfile(profileName); 