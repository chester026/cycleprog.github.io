# Настройка переменных окружения

## Создайте файл .env в папке server/

Скопируйте этот шаблон и замените значения на ваши:

```env
# Database Configuration
PGHOST=localhost
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=your_database
PGPORT=5432

# Strava API
STRAVA_CLIENT_ID=your_strava_client_id
STRAVA_CLIENT_SECRET=your_strava_client_secret

# JWT Secret
JWT_SECRET=your_jwt_secret_key

# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx="
IMAGEKIT_PRIVATE_KEY="private_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx="
IMAGEKIT_URL_ENDPOINT="https://ik.imagekit.io/your_account_name"
```

## Где взять ImageKit ключи:

1. **Зайдите на https://imagekit.io/**
2. **Зарегистрируйтесь** (Sign Up)
3. **Войдите в Dashboard**
4. **Найдите "Developer Options" → "API Keys"**
5. **Скопируйте три значения:**
   - Public Key (начинается с `pk_`)
   - Private Key (начинается с `private_`)
   - URL Endpoint (начинается с `https://ik.imagekit.io/`)

## Важно:
- Файл `.env` НЕ должен попасть в git (уже в .gitignore)
- Храните ключи в безопасности
- Не публикуйте их в открытом доступе 