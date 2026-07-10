# Universal Links Setup для TestFlight

## ✅ Что уже готово:

1. ✅ **Associated Domains** в entitlements: `applinks:bikelab.app`
2. ✅ **URL Scheme**: `bikelab://` 
3. ✅ **Deep Link Handler** в App.tsx
4. ✅ **Bundle ID**: `com.bikelab.app`
5. ✅ **apple-app-site-association** файл создан на сервере
6. ✅ **Server endpoint** для раздачи файла

---

## 🔧 Что нужно сделать в Xcode:

### 1. Добавить Team ID в проект

1. Откройте проект в Xcode: `BikeLabApp/ios/BikeLabApp.xcworkspace`
2. Выберите проект **BikeLabApp** в левой панели
3. Выберите таргет **BikeLabApp** 
4. Перейдите на вкладку **Signing & Capabilities**

#### Настройки:

- **Team**: Выберите свой Apple Developer Team (тот, для которого вы получили Team ID)
- **Bundle Identifier**: `com.bikelab.app` (уже настроен)
- **Signing Certificate**: Automatic (или Manual, если хотите)

#### Проверьте Associated Domains:

В секции **Signing & Capabilities** должна быть capability **Associated Domains**:
- Если её нет, нажмите **+ Capability** → **Associated Domains**
- Убедитесь, что там есть домен: `applinks:bikelab.app`

![Associated Domains Example](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppSearch/Art/associated_domains_2x.png)

---

### 2. Обновить apple-app-site-association файл с вашим Team ID

**ВАЖНО!** После того, как выберете Team в Xcode, найдите ваш **Team ID**:

1. В Xcode: **Project Settings** → **Signing & Capabilities**
2. Под полем **Team** будет показан **Team ID** (10 символов, например: `A1B2C3D4E5`)

**ИЛИ** в [Apple Developer Portal](https://developer.apple.com/account/#!/membership/):
- **Membership** → **Team ID**

Затем замените `TEAM_ID` в файле:

```bash
# Откройте файл и замените TEAM_ID на ваш реальный Team ID
server/public/.well-known/apple-app-site-association
```

Например, если ваш Team ID = `A1B2C3D4E5`, то:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "A1B2C3D4E5.com.bikelab.app",
        "paths": [
          "/auth",
          "/auth/*",
          "/exchange_token*"
        ]
      }
    ]
  }
}
```

---

### 3. Деплой на сервер

После обновления файла с Team ID:

```bash
# 1. Деплой файла на production сервер
# Убедитесь, что файл доступен по адресу:
https://bikelab.app/.well-known/apple-app-site-association

# 2. Проверьте, что файл отдаётся с правильными заголовками:
curl -I https://bikelab.app/.well-known/apple-app-site-association
# Должно быть: Content-Type: application/json
```

---

### 4. Проверка Universal Links

#### На реальном устройстве (iOS):

1. Установите приложение через TestFlight
2. Откройте Safari
3. Перейдите на `https://bikelab.app/auth?token=test`
4. iOS должен показать баннер "Открыть в BikeLab" или автоматически открыть приложение

#### Отладка:

- **Проверить файл онлайн**: [Branch.io AASA Validator](https://branch.io/resources/aasa-validator/)
- **Логи в App**: Откройте Xcode → Window → Devices and Simulators → выберите устройство → Console
- **Сбросить кеш Universal Links**:
  ```
  Настройки → Основные → Сброс → Сбросить настройки сети
  ```

---

## 📱 OAuth Flow с Universal Links

### Текущий flow:

1. **Пользователь нажимает "Login with Strava"**
   - Открывается: `https://www.strava.com/oauth/authorize?...&redirect_uri=https://bikelab.app/exchange_token`

2. **Strava редиректит на:**
   - `https://bikelab.app/exchange_token?code=XXX`

3. **Backend обрабатывает и редиректит на:**
   - `https://bikelab.app/auth?token=JWT_TOKEN` ← **Universal Link**
   - ИЛИ `bikelab://auth?token=JWT_TOKEN` ← **URL Scheme (fallback)**

4. **iOS открывает приложение** → App.tsx обрабатывает deep link → сохраняет токен → переходит на Main screen

---

## 🎯 Что проверить перед отправкой в TestFlight:

- [ ] Team ID добавлен в Xcode
- [ ] Associated Domains настроены в Xcode
- [ ] Bundle ID = `com.bikelab.app`
- [ ] apple-app-site-association обновлён с вашим Team ID
- [ ] Файл задеплоен на `https://bikelab.app/.well-known/apple-app-site-association`
- [ ] Файл возвращает `Content-Type: application/json`
- [ ] Приложение собирается для Release (не Debug)
- [ ] Протестировано на реальном устройстве

---

## 🚨 Troubleshooting

### Universal Links не работают:

1. **Проверьте файл онлайн**: https://branch.io/resources/aasa-validator/
   - Введите: `bikelab.app`
   - Должно показать ваш appID и paths

2. **Сбросьте кеш на устройстве**:
   - Settings → General → Reset → Reset Network Settings

3. **Проверьте логи**:
   - Xcode → Window → Devices → Select Device → Open Console
   - Ищите: `swcd` (Shared Web Credentials Daemon)

4. **Проверьте, что приложение установлено через TestFlight/App Store**:
   - Universal Links НЕ работают для debug builds через Xcode!
   - Только для production builds

5. **Проверьте домен**:
   - Убедитесь, что домен в entitlements совпадает с доменом в AASA файле
   - `applinks:bikelab.app` (без www, без протокола)

---

## 📚 Полезные ссылки:

- [Apple - Supporting Universal Links](https://developer.apple.com/documentation/xcode/supporting-universal-links-in-your-app)
- [Apple - AASA File Format](https://developer.apple.com/documentation/bundleresources/applinks)
- [Branch.io AASA Validator](https://branch.io/resources/aasa-validator/)
- [React Native Linking Docs](https://reactnative.dev/docs/linking)

---

## ✨ Готово!

После выполнения всех шагов, ваше приложение будет готово для TestFlight с поддержкой Universal Links для OAuth! 🚀
