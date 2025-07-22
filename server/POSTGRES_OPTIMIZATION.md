# 🐘 Оптимизация PostgreSQL

## 🚨 Проблема: "Applied - 0, Failed - 18"

Если вы видите такое сообщение, значит у пользователя базы данных недостаточно прав для изменения системных настроек PostgreSQL.

## 🔧 Решения

### 1. **Через веб-интерфейс (временное решение)**
- Настройки применяются только к текущей сессии
- После перезапуска сервера настройки сбросятся
- Подходит для тестирования

### 2. **Через командную строку (рекомендуется)**

#### Шаг 1: Подключитесь к серверу
```bash
ssh your-server
```

#### Шаг 2: Переключитесь на пользователя postgres
```bash
sudo -u postgres bash
```

#### Шаг 3: Запустите скрипт оптимизации
```bash
cd /path/to/your/project/server
node apply_profile.js low-end
```

#### Шаг 4: Перезапустите PostgreSQL
```bash
sudo systemctl restart postgresql
```

### 3. **Настройка прав доступа (постоянное решение)**

#### Вариант A: Дать права суперпользователя
```sql
-- Подключитесь как суперпользователь postgres
sudo -u postgres psql

-- Создайте пользователя с правами суперпользователя
CREATE USER your_app_user WITH SUPERUSER PASSWORD 'your_password';

-- Или дайте права существующему пользователю
ALTER USER your_app_user WITH SUPERUSER;
```

#### Вариант B: Дать права на изменение настроек
```sql
-- Подключитесь как суперпользователь postgres
sudo -u postgres psql

-- Дайте права на изменение настроек
GRANT ALTER SYSTEM ON ALL TABLES IN SCHEMA public TO your_app_user;
```

## 📋 Доступные профили

| Профиль | RAM | Описание | Команда |
|---------|-----|----------|---------|
| `low-end` | 256 MB | Очень ограниченные ресурсы | `node apply_profile.js low-end` |
| `medium` | 1 GB | Средние ресурсы | `node apply_profile.js medium` |
| `high-end` | 4 GB | Мощный сервер | `node apply_profile.js high-end` |
| `enterprise` | 16 GB | Корпоративный сервер | `node apply_profile.js enterprise` |

## 🔍 Проверка текущих настроек

```sql
-- Подключитесь к PostgreSQL
psql -U your_user -d your_database

-- Проверьте текущие настройки
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW work_mem;
SHOW max_connections;
```

## 🚀 Быстрый старт

1. **Определите мощность сервера:**
   ```bash
   free -h  # Показывает RAM
   ```

2. **Выберите профиль:**
   - 256 MB → `low-end`
   - 1 GB → `medium`
   - 4 GB → `high-end`
   - 16 GB → `enterprise`

3. **Примените оптимизацию:**
   ```bash
   sudo -u postgres node apply_profile.js low-end
   ```

4. **Перезапустите PostgreSQL:**
   ```bash
   sudo systemctl restart postgresql
   ```

## ⚠️ Важные замечания

- **Всегда делайте бэкап** перед изменением настроек
- **Тестируйте на staging** перед применением на production
- **Мониторьте производительность** после изменений
- **Некоторые настройки** требуют перезапуска PostgreSQL

## 🆘 Устранение неполадок

### Ошибка: "permission denied"
```bash
# Решение: используйте пользователя postgres
sudo -u postgres node apply_profile.js low-end
```

### Ошибка: "connection refused"
```bash
# Проверьте статус PostgreSQL
sudo systemctl status postgresql

# Запустите если остановлен
sudo systemctl start postgresql
```

### Ошибка: "invalid value for parameter"
```bash
# Проверьте версию PostgreSQL
psql --version

# Некоторые настройки могут не поддерживаться в старых версиях
```

## 📞 Поддержка

Если проблемы остаются:
1. Проверьте логи PostgreSQL: `sudo tail -f /var/log/postgresql/postgresql-*.log`
2. Проверьте права пользователя: `\du` в psql
3. Убедитесь, что PostgreSQL запущен: `sudo systemctl status postgresql` 