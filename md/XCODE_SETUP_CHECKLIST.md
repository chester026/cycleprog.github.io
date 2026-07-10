# ✅ Xcode Setup Checklist для TestFlight

## Шаг 1: Откройте проект в Xcode

```bash
cd BikeLabApp/ios
open BikeLabApp.xcworkspace
```

⚠️ **ВАЖНО**: Открывайте именно `.xcworkspace`, а НЕ `.xcodeproj`!

---

## Шаг 2: Настройте Signing & Capabilities

1. **Выберите проект** в левой панели (синяя иконка BikeLabApp)
2. **Выберите таргет** BikeLabApp (под PROJECT)
3. **Перейдите на вкладку** "Signing & Capabilities"

### 2.1 Signing:

- **Automatically manage signing**: ✅ (включите)
- **Team**: Выберите ваш Apple Developer Team из выпадающего списка
- **Bundle Identifier**: `com.bikelab.app` (должен быть уже установлен)

После выбора Team, Xcode покажет ваш **Team ID** под полем Team (10 символов, например: `A1B2C3D4E5`)

**📝 Запишите ваш Team ID - он понадобится в Шаге 3!**

---

### 2.2 Capabilities:

Проверьте, что есть capability **Associated Domains**:

- Если её нет: нажмите **"+ Capability"** (вверху слева) → найдите и добавьте **"Associated Domains"**
- Должен быть домен: **`applinks:bikelab.app`**
- Если домена нет: нажмите **"+"** и добавьте `applinks:bikelab.app`

![Associated Domains](https://i.imgur.com/XXX.png)

✅ Должно выглядеть так:
```
Associated Domains
  ✓ applinks:bikelab.app
```

---

## Шаг 3: Обновите Team ID в apple-app-site-association

Откройте файл:
```bash
server/public/.well-known/apple-app-site-association
```

Замените `TEAM_ID` на ваш реальный Team ID из Шага 2.1:

**Было:**
```json
"appID": "TEAM_ID.com.bikelab.app"
```

**Станет** (например, если Team ID = `A1B2C3D4E5`):
```json
"appID": "A1B2C3D4E5.com.bikelab.app"
```

---

## Шаг 4: Проверьте настройки проекта

### Build Settings → Product Bundle Identifier:

- Debug: `com.bikelab.app`
- Release: `com.bikelab.app`

### General → Deployment Info:

- **iOS Deployment Target**: 13.0 или выше
- **iPhone / iPad**: в зависимости от вашего таргета

---

## Шаг 5: Соберите приложение для TestFlight

### 5.1 Выберите схему:

В Xcode вверху слева:
- Схема: **BikeLabApp**
- Устройство: **Any iOS Device (arm64)**

### 5.2 Создайте архив:

1. **Product** → **Archive**
2. Дождитесь завершения сборки
3. Откроется окно Organizer с вашим архивом

### 5.3 Загрузите в TestFlight:

1. В Organizer выберите ваш архив
2. Нажмите **"Distribute App"**
3. Выберите **"App Store Connect"**
4. Следуйте инструкциям мастера

---

## Шаг 6: Деплой на сервер

После обновления Team ID в файле, задеплойте его на production:

```bash
# Загрузите обновлённый файл на сервер
# Убедитесь, что он доступен по адресу:
https://bikelab.app/.well-known/apple-app-site-association
```

### Проверка:

```bash
# 1. Проверьте, что файл доступен
curl https://bikelab.app/.well-known/apple-app-site-association

# 2. Проверьте заголовки
curl -I https://bikelab.app/.well-known/apple-app-site-association
# Должно быть: Content-Type: application/json

# 3. Проверьте содержимое
curl https://bikelab.app/.well-known/apple-app-site-association | jq
```

---

## Шаг 7: Тестирование Universal Links

### На реальном устройстве:

1. **Установите приложение** через TestFlight
2. **Откройте Safari** на iPhone
3. **Введите адрес**: `https://bikelab.app/auth?token=test123`
4. **Нажмите Go**

**Ожидаемое поведение:**
- iOS покажет баннер "Открыть в BikeLab" в верхней части экрана
- ИЛИ автоматически откроет приложение (если вы уже выбирали "Всегда открывать")

**Если ничего не происходит:**
- Settings → Safari → Advanced → Website Data → удалите данные bikelab.app
- Settings → General → Reset → Reset Network Settings (сбросит кеш Universal Links)

---

## 🎯 Финальный чеклист:

Перед отправкой в TestFlight убедитесь:

- [ ] **Team** выбран в Signing & Capabilities
- [ ] **Associated Domains** содержит `applinks:bikelab.app`
- [ ] **Team ID** заменён в `apple-app-site-association` файле
- [ ] Файл задеплоен на `https://bikelab.app/.well-known/apple-app-site-association`
- [ ] Файл возвращает `Content-Type: application/json` (проверить curl)
- [ ] Bundle ID = `com.bikelab.app`
- [ ] Приложение собрано через Product → Archive
- [ ] Архив загружен в App Store Connect

---

## 🐛 Troubleshooting:

### Universal Links не работают после установки:

1. **Проверьте файл онлайн**: https://branch.io/resources/aasa-validator/
   - Введите: `bikelab.app`
   - Проверьте, что показывает ваш App ID с правильным Team ID

2. **Очистите кеш на устройстве**:
   - Settings → General → Reset → Reset Network Settings
   - Переустановите приложение через TestFlight

3. **Проверьте логи** (подключите устройство к Mac):
   - Xcode → Window → Devices and Simulators
   - Выберите ваше устройство → Open Console
   - Запустите приложение и попробуйте Universal Link
   - Ищите в логах: `swcd` (Shared Web Credentials Daemon)

4. **Universal Links работают ТОЛЬКО для production builds**:
   - ✅ TestFlight / App Store
   - ❌ Debug builds через Xcode (там работает только URL Scheme: `bikelab://`)

---

## 📚 Полезные команды:

```bash
# Проверить валидность JSON
cat server/public/.well-known/apple-app-site-association | jq

# Проверить файл на сервере
curl -v https://bikelab.app/.well-known/apple-app-site-association

# Валидатор от Branch.io
open https://branch.io/resources/aasa-validator/

# Apple Developer Portal (найти Team ID)
open https://developer.apple.com/account/#!/membership/
```

---

## ✅ Готово!

После выполнения всех шагов, ваше приложение готово для TestFlight! 🚀

При первом логине через Strava:
1. Strava запросит разрешение
2. Вернёт на `bikelab.app/exchange_token?code=...`
3. Backend обработает и редиректнет на `https://bikelab.app/auth?token=JWT`
4. iOS откроет BikeLab приложение через Universal Link 🎉
5. Приложение сохранит токен и перейдёт на главный экран

---

## 🔐 Безопасность:

Universal Links более безопасны, чем URL Schemes:
- ✅ Гарантия, что только ваше приложение откроет ссылку (через Associated Domains)
- ✅ Не могут быть перехвачены другими приложениями
- ✅ Работают в Safari, Messages, Mail и других приложениях
- ✅ Пользователь может выбрать открывать ссылки в браузере (долгий тап)
