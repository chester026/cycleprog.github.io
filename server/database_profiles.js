// Профили настроек PostgreSQL для разных мощностей сервера

const profiles = {
  // Профиль для очень слабого сервера (256 MB RAM)
  'low-end': {
    name: 'Low-End Server (256 MB RAM)',
    description: 'Оптимизация для очень ограниченных ресурсов',
    settings: {
      // Основные настройки памяти
      'shared_buffers': { value: '16MB', description: '6% от RAM - общие буферы' },
      'effective_cache_size': { value: '128MB', description: '50% от RAM - эффективный кэш' },
      'work_mem': { value: '512kB', description: 'Память на операцию сортировки/соединения' },
      'maintenance_work_mem': { value: '2MB', description: 'Память для обслуживания' },
      'wal_buffers': { value: '1MB', description: 'Буферы WAL' },
      
      // Настройки соединений
      'max_connections': { value: '10', description: 'Максимальное количество соединений' },
      
      // Настройки WAL и checkpoint
      'checkpoint_segments': { value: '2', description: 'Количество сегментов WAL' },
      'checkpoint_completion_target': { value: '0.9', description: 'Цель завершения checkpoint' },
      'wal_writer_delay': { value: '200ms', description: 'Задержка записи WAL' },
      
      // Настройки планировщика
      'random_page_cost': { value: '1.1', description: 'Стоимость случайного доступа к странице' },
      'effective_io_concurrency': { value: '1', description: 'Параллельность I/O операций' },
      
      // Отключение логов для экономии памяти
      'log_statement': { value: 'none', description: 'Отключаем логирование SQL' },
      'log_min_duration_statement': { value: '-1', description: 'Отключаем логирование медленных запросов' },
      'log_checkpoints': { value: 'off', description: 'Отключаем логирование checkpoint' },
      'log_connections': { value: 'off', description: 'Отключаем логирование подключений' },
      'log_disconnections': { value: 'off', description: 'Отключаем логирование отключений' },
      'log_lock_waits': { value: 'off', description: 'Отключаем логирование блокировок' },
      'log_temp_files': { value: '-1', description: 'Отключаем логирование временных файлов' }
    },
    recommendations: [
      'Уменьшите количество одновременных пользователей',
      'Избегайте сложных запросов с большими JOIN',
      'Рассмотрите увеличение RAM до 512 MB или 1 GB',
      'Мониторьте использование памяти через админку'
    ]
  },

  // Профиль для среднего сервера (1 GB RAM)
  'medium': {
    name: 'Medium Server (1 GB RAM)',
    description: 'Оптимизация для сервера со средними ресурсами',
    settings: {
      // Основные настройки памяти
      'shared_buffers': { value: '128MB', description: '12% от RAM - общие буферы' },
      'effective_cache_size': { value: '512MB', description: '50% от RAM - эффективный кэш' },
      'work_mem': { value: '4MB', description: 'Память на операцию сортировки/соединения' },
      'maintenance_work_mem': { value: '16MB', description: 'Память для обслуживания' },
      'wal_buffers': { value: '4MB', description: 'Буферы WAL' },
      
      // Настройки соединений
      'max_connections': { value: '50', description: 'Максимальное количество соединений' },
      
      // Настройки WAL и checkpoint
      'checkpoint_segments': { value: '8', description: 'Количество сегментов WAL' },
      'checkpoint_completion_target': { value: '0.9', description: 'Цель завершения checkpoint' },
      'wal_writer_delay': { value: '200ms', description: 'Задержка записи WAL' },
      
      // Настройки планировщика
      'random_page_cost': { value: '1.1', description: 'Стоимость случайного доступа к странице' },
      'effective_io_concurrency': { value: '2', description: 'Параллельность I/O операций' },
      
      // Умеренное логирование
      'log_statement': { value: 'none', description: 'Отключаем логирование SQL' },
      'log_min_duration_statement': { value: '1000', description: 'Логируем запросы медленнее 1 секунды' },
      'log_checkpoints': { value: 'on', description: 'Включаем логирование checkpoint' },
      'log_connections': { value: 'off', description: 'Отключаем логирование подключений' },
      'log_disconnections': { value: 'off', description: 'Отключаем логирование отключений' },
      'log_lock_waits': { value: 'on', description: 'Включаем логирование блокировок' },
      'log_temp_files': { value: '0', description: 'Логируем все временные файлы' }
    },
    recommendations: [
      'Поддерживайте умеренную нагрузку',
      'Можно использовать более сложные запросы',
      'Рассмотрите увеличение RAM до 2 GB для лучшей производительности',
      'Мониторьте производительность через админку'
    ]
  },

  // Профиль для мощного сервера (4 GB RAM)
  'high-end': {
    name: 'High-End Server (4 GB RAM)',
    description: 'Оптимизация для мощного сервера',
    settings: {
      // Основные настройки памяти
      'shared_buffers': { value: '1GB', description: '25% от RAM - общие буферы' },
      'effective_cache_size': { value: '3GB', description: '75% от RAM - эффективный кэш' },
      'work_mem': { value: '16MB', description: 'Память на операцию сортировки/соединения' },
      'maintenance_work_mem': { value: '64MB', description: 'Память для обслуживания' },
      'wal_buffers': { value: '16MB', description: 'Буферы WAL' },
      
      // Настройки соединений
      'max_connections': { value: '200', description: 'Максимальное количество соединений' },
      
      // Настройки WAL и checkpoint
      'checkpoint_segments': { value: '32', description: 'Количество сегментов WAL' },
      'checkpoint_completion_target': { value: '0.9', description: 'Цель завершения checkpoint' },
      'wal_writer_delay': { value: '200ms', description: 'Задержка записи WAL' },
      
      // Настройки планировщика
      'random_page_cost': { value: '1.1', description: 'Стоимость случайного доступа к странице' },
      'effective_io_concurrency': { value: '4', description: 'Параллельность I/O операций' },
      
      // Полное логирование
      'log_statement': { value: 'all', description: 'Логируем все SQL запросы' },
      'log_min_duration_statement': { value: '100', description: 'Логируем запросы медленнее 100ms' },
      'log_checkpoints': { value: 'on', description: 'Включаем логирование checkpoint' },
      'log_connections': { value: 'on', description: 'Включаем логирование подключений' },
      'log_disconnections': { value: 'on', description: 'Включаем логирование отключений' },
      'log_lock_waits': { value: 'on', description: 'Включаем логирование блокировок' },
      'log_temp_files': { value: '0', description: 'Логируем все временные файлы' }
    },
    recommendations: [
      'Можно обрабатывать высокую нагрузку',
      'Поддерживаются сложные аналитические запросы',
      'Полное логирование для отладки',
      'Оптимальная производительность для большинства задач'
    ]
  },

  // Профиль для очень мощного сервера (16 GB RAM)
  'enterprise': {
    name: 'Enterprise Server (16 GB RAM)',
    description: 'Оптимизация для корпоративного сервера',
    settings: {
      // Основные настройки памяти
      'shared_buffers': { value: '4GB', description: '25% от RAM - общие буферы' },
      'effective_cache_size': { value: '12GB', description: '75% от RAM - эффективный кэш' },
      'work_mem': { value: '64MB', description: 'Память на операцию сортировки/соединения' },
      'maintenance_work_mem': { value: '256MB', description: 'Память для обслуживания' },
      'wal_buffers': { value: '64MB', description: 'Буферы WAL' },
      
      // Настройки соединений
      'max_connections': { value: '500', description: 'Максимальное количество соединений' },
      
      // Настройки WAL и checkpoint
      'checkpoint_segments': { value: '64', description: 'Количество сегментов WAL' },
      'checkpoint_completion_target': { value: '0.9', description: 'Цель завершения checkpoint' },
      'wal_writer_delay': { value: '200ms', description: 'Задержка записи WAL' },
      
      // Настройки планировщика
      'random_page_cost': { value: '1.1', description: 'Стоимость случайного доступа к странице' },
      'effective_io_concurrency': { value: '8', description: 'Параллельность I/O операций' },
      
      // Расширенное логирование
      'log_statement': { value: 'all', description: 'Логируем все SQL запросы' },
      'log_min_duration_statement': { value: '50', description: 'Логируем запросы медленнее 50ms' },
      'log_checkpoints': { value: 'on', description: 'Включаем логирование checkpoint' },
      'log_connections': { value: 'on', description: 'Включаем логирование подключений' },
      'log_disconnections': { value: 'on', description: 'Включаем логирование отключений' },
      'log_lock_waits': { value: 'on', description: 'Включаем логирование блокировок' },
      'log_temp_files': { value: '0', description: 'Логируем все временные файлы' }
    },
    recommendations: [
      'Корпоративная нагрузка',
      'Поддерживаются сложные аналитические запросы',
      'Высокая параллельность',
      'Оптимально для больших баз данных'
    ]
  }
};

module.exports = { profiles }; 