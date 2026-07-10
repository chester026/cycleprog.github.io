# 🔧 Как добавить Associated Domains в Xcode

## Проблема:
При клике на "Associated Domains" ничего не происходит, нет кнопки "Add" или поля для ввода.

---

## ✅ Решение - Пошаговая инструкция:

### Шаг 1: Убедитесь, что вы на правильной вкладке

1. **Откройте проект в Xcode**: `BikeLabApp.xcworkspace`
2. **В левой панели** выберите проект BikeLabApp (синяя иконка)
3. **В центре** под "TARGETS" выберите **BikeLabApp** (НЕ под PROJECT!)
4. **Перейдите на вкладку** "Signing & Capabilities" (в верхней части)

---

### Шаг 2: Проверьте, добавлена ли capability

Посмотрите в секцию "Signing & Capabilities":

#### Вариант А: Associated Domains УЖЕ ЕСТЬ

Если вы видите секцию **"Associated Domains"** с белым фоном:

```
┌─────────────────────────────────────┐
│ Associated Domains                  │
│ ─────────────────────────────────── │
│                                     │
│ Domains                             │
│   (возможно пусто)                  │
└─────────────────────────────────────┘
```

**Действия:**
1. Внутри секции "Associated Domains" найдите маленький **"+" (плюс)** слева снизу
2. Или нажмите **прямо в пустое поле** под словом "Domains" - должно появиться поле для ввода
3. Введите: `applinks:bikelab.app`
4. Нажмите Enter

---

#### Вариант Б: Associated Domains НЕТ

Если вы НЕ видите секцию "Associated Domains":

1. **Нажмите кнопку "+ Capability"** в верхнем левом углу вкладки (под вкладками)
2. В поисковой строке введите: `Associated`
3. Найдите **"Associated Domains"** в списке
4. **Дважды кликните** на "Associated Domains" (или нажмите Enter)
5. Capability будет добавлена!

Теперь следуйте инструкциям из **Варианта А** выше.

---

### Шаг 3: Добавьте домен

После того, как capability добавлена:

1. **Кликните в пустое поле** под заголовком "Domains" внутри секции Associated Domains
2. **ИЛИ** нажмите маленький **"+"** (плюс) в левом нижнем углу секции
3. **Введите**: `applinks:bikelab.app`
4. **Нажмите Enter** или Tab

**ВАЖНО:**
- Формат должен быть ТОЧНО: `applinks:bikelab.app`
- БЕЗ `https://`
- БЕЗ `www.`
- Только: `applinks:домен.com`

---

### Шаг 4: Проверьте результат

Должно выглядеть так:

```
┌─────────────────────────────────────┐
│ Associated Domains                  │
│ ─────────────────────────────────── │
│                                     │
│ Domains                             │
│   ✓ applinks:bikelab.app           │
│                                     │
└─────────────────────────────────────┘
```

---

## 🔍 Альтернативный способ - через entitlements файл напрямую

Если в Xcode что-то не работает, можно отредактировать файл напрямую:

1. **Откройте файл**: `ios/BikeLabApp/BikeLabApp.entitlements`
2. **Убедитесь, что там есть:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.developer.associated-domains</key>
	<array>
		<string>applinks:bikelab.app</string>
	</array>
</dict>
</plist>
```

3. **Сохраните файл**
4. **Вернитесь в Xcode** - изменения должны отобразиться

---

## 🐛 Troubleshooting:

### "Capability добавляется, но сразу исчезает"

**Причина**: Скорее всего проблема с Team или Provisioning Profile.

**Решение:**
1. Убедитесь, что в **Signing** выбран ваш Team: `ABN679M62J`
2. Включите **"Automatically manage signing"**
3. Попробуйте снова добавить capability

---

### "Не могу найти кнопку '+' в секции Associated Domains"

**Решение:**
1. Попробуйте **кликнуть прямо на слово "Domains"** (заголовок столбца)
2. Или кликните **в пустое белое пространство** под "Domains"
3. Должно появиться текстовое поле для ввода
4. Если не появляется - используйте альтернативный способ через entitlements файл

---

### "Associated Domains есть, но пустая, и я не могу ничего ввести"

**Решение:**
1. **Закройте Xcode полностью** (Cmd+Q)
2. **Удалите Derived Data:**
   ```bash
   rm -rf ~/Library/Developer/Xcode/DerivedData
   ```
3. **Откройте проект снова**: `open BikeLabApp.xcworkspace`
4. Попробуйте снова

---

## ✅ Проверка, что всё работает:

После добавления домена:

1. **В Xcode** вы должны видеть `applinks:bikelab.app` в списке
2. **В файле** `BikeLabApp.entitlements` должна быть строка: `<string>applinks:bikelab.app</string>`
3. **При сборке** Xcode не должен выдавать ошибок про entitlements

---

## 📸 Визуальная подсказка:

```
┌────────────────────────────────────────────────────────────┐
│ [General] [Signing & Capabilities] [Resource Tags] [Info] │ ← Вкладки
├────────────────────────────────────────────────────────────┤
│                                                            │
│  + Capability  🔍 Filter                                   │ ← Кнопка добавления
│                                                            │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Signing (Debug)                                   │   │
│  │ ☑ Automatically manage signing                    │   │
│  │ Team: Your Team Name (ABN679M62J)                 │   │
│  │ Bundle Identifier: com.bikelab.app                │   │
│  └───────────────────────────────────────────────────┘   │
│                                                            │
│  ┌───────────────────────────────────────────────────┐   │
│  │ Associated Domains                                │   │ ← Эта секция
│  │                                                   │   │
│  │ Domains                                           │   │
│  │   + applinks:bikelab.app                         │   │ ← Здесь домен
│  │                                                   │   │
│  └───────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 🎯 Итоговый чеклист:

- [ ] Открыл `.xcworkspace` (не `.xcodeproj`)
- [ ] Выбрал TARGET BikeLabApp (не PROJECT)
- [ ] Вкладка "Signing & Capabilities"
- [ ] Team выбран: ABN679M62J
- [ ] Capability "Associated Domains" добавлена
- [ ] Домен `applinks:bikelab.app` добавлен в список
- [ ] Проверил файл `BikeLabApp.entitlements` - домен там есть
- [ ] Проект собирается без ошибок (Cmd+B)

---

Если ничего не помогает - покажите скриншот вашего Xcode на вкладке "Signing & Capabilities", помогу разобраться! 📸
