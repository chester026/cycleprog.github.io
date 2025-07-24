# ImageKit.io Setup Instructions

## 1. Создайте аккаунт на ImageKit.io
- Перейдите на https://imagekit.io/
- Зарегистрируйтесь и создайте аккаунт

## 2. Получите ключи доступа
- Войдите в ImageKit Dashboard
- Перейдите в Developer Options → API Keys
- Скопируйте:
  - Public Key
  - Private Key
  - URL Endpoint

## 3. Настройте переменные окружения
Добавьте в файл `.env` в папке `server/`:

```env
# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY=your_public_key_here
IMAGEKIT_PRIVATE_KEY=your_private_key_here
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_account
```

## 4. Структура папок в ImageKit
Создайте следующие папки в ImageKit:
- `/garage` - для изображений велосипедов
- `/hero` - для hero изображений
- `/general` - для общих изображений

## 5. Преимущества интеграции
- ✅ Автоматическая оптимизация изображений
- ✅ CDN для быстрой загрузки
- ✅ Responsive images
- ✅ Автоматическое сжатие
- ✅ WebP/AVIF поддержка

## 6. Трансформации изображений
В коде используются следующие трансформации:
- `w-300,h-200,fo-auto` - для маленьких изображений
- `w-400,h-300,fo-auto` - для средних изображений
- `w-auto,h-auto,fo-auto,q-80` - для общих случаев

## 7. Тестирование
После настройки:
1. Перезапустите сервер
2. Попробуйте загрузить изображение в BikeGarage через админку
3. Проверьте, что изображение загружается через ImageKit CDN 