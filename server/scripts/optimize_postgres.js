const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.PGSSLMODE === 'require' || process.env.NODE_ENV === 'production';

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function optimizePostgreSQL() {
  console.log('🚀 Оптимизация PostgreSQL для сервера с 256 MB RAM...\n');

  try {
    // Текущие настройки
    console.log('📊 Текущие настройки:');
    const currentSettings = await pool.query(`
      SELECT name, setting, unit, context
      FROM pg_settings 
      WHERE name IN (
        'shared_buffers',
        'effective_cache_size', 
        'work_mem',
        'maintenance_work_mem',
        'wal_buffers',
        'max_connections',
        'checkpoint_segments',
        'checkpoint_completion_target',
        'wal_writer_delay',
        'random_page_cost',
        'effective_io_concurrency'
      )
      ORDER BY name;
    `);

    currentSettings.rows.forEach(row => {
      console.log(`  ${row.name}: ${row.setting} ${row.unit || ''} (${row.context})`);
    });

    console.log('\n🔧 Применение оптимизированных настроек...\n');

    // Оптимизированные настройки для 256 MB RAM
    const optimizations = [
      // Основные настройки памяти
      { name: 'shared_buffers', value: '16MB', description: '6% от RAM - общие буферы' },
      { name: 'effective_cache_size', value: '128MB', description: '50% от RAM - эффективный кэш' },
      { name: 'work_mem', value: '512kB', description: 'Память на операцию сортировки/соединения' },
      { name: 'maintenance_work_mem', value: '2MB', description: 'Память для обслуживания' },
      { name: 'wal_buffers', value: '1MB', description: 'Буферы WAL' },
      
      // Настройки соединений
      { name: 'max_connections', value: '10', description: 'Максимальное количество соединений' },
      
      // Настройки WAL и checkpoint
      { name: 'checkpoint_segments', value: '2', description: 'Количество сегментов WAL' },
      { name: 'checkpoint_completion_target', value: '0.9', description: 'Цель завершения checkpoint' },
      { name: 'wal_writer_delay', value: '200ms', description: 'Задержка записи WAL' },
      
      // Настройки планировщика
      { name: 'random_page_cost', value: '1.1', description: 'Стоимость случайного доступа к странице' },
      { name: 'effective_io_concurrency', value: '1', description: 'Параллельность I/O операций' }
    ];

    // Применяем настройки
    for (const opt of optimizations) {
      try {
        await pool.query(`ALTER SYSTEM SET ${opt.name} = '${opt.value}';`);
        console.log(`✅ ${opt.name}: ${opt.value} - ${opt.description}`);
      } catch (error) {
        console.log(`❌ ${opt.name}: Ошибка - ${error.message}`);
      }
    }

    // Дополнительные оптимизации
    console.log('\n🔧 Дополнительные оптимизации...\n');

    // Отключаем ненужные функции для экономии памяти
    const additionalOpts = [
      { name: 'log_statement', value: 'none', description: 'Отключаем логирование SQL' },
      { name: 'log_min_duration_statement', value: '-1', description: 'Отключаем логирование медленных запросов' },
      { name: 'log_checkpoints', value: 'off', description: 'Отключаем логирование checkpoint' },
      { name: 'log_connections', value: 'off', description: 'Отключаем логирование подключений' },
      { name: 'log_disconnections', value: 'off', description: 'Отключаем логирование отключений' },
      { name: 'log_lock_waits', value: 'off', description: 'Отключаем логирование блокировок' },
      { name: 'log_temp_files', value: '-1', description: 'Отключаем логирование временных файлов' }
    ];

    for (const opt of additionalOpts) {
      try {
        await pool.query(`ALTER SYSTEM SET ${opt.name} = '${opt.value}';`);
        console.log(`✅ ${opt.name}: ${opt.value} - ${opt.description}`);
      } catch (error) {
        console.log(`❌ ${opt.name}: Ошибка - ${error.message}`);
      }
    }

    console.log('\n📋 Рекомендации по перезапуску:');
    console.log('1. Перезапустите PostgreSQL: sudo systemctl restart postgresql');
    console.log('2. Или перезагрузите конфигурацию: SELECT pg_reload_conf();');
    console.log('3. Проверьте новые настройки в админке приложения');

    console.log('\n📊 Ожидаемые улучшения:');
    console.log('✅ Стабильность - не будет нехватки памяти');
    console.log('✅ Производительность - меньше swapping');
    console.log('✅ Надежность - PostgreSQL не будет убит OOM Killer');
    console.log('✅ Отзывчивость - система будет работать быстрее');

    console.log('\n⚠️  Важные замечания:');
    console.log('- Уменьшите количество одновременных пользователей');
    console.log('- Избегайте сложных запросов с большими JOIN');
    console.log('- Рассмотрите увеличение RAM до 512 MB или 1 GB');
    console.log('- Мониторьте использование памяти через админку');

  } catch (error) {
    console.error('❌ Ошибка оптимизации:', error);
  } finally {
    await pool.end();
  }
}

// Запускаем оптимизацию
optimizePostgreSQL(); 