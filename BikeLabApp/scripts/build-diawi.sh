#!/bin/bash

# 🚀 Build and Upload to Diawi.com
# Простой способ поделиться приложением по ссылке

set -e

echo "🔨 Building for Diawi..."

cd "$(dirname "$0")/../ios"

# Собираем IPA
xcodebuild \
  -workspace BikeLabApp.xcworkspace \
  -scheme BikeLabApp \
  -configuration Release \
  -archivePath ./build/BikeLabApp.xcarchive \
  -destination 'generic/platform=iOS' \
  -allowProvisioningUpdates \
  archive

# Экспортируем IPA для ad-hoc распространения
xcodebuild \
  -exportArchive \
  -archivePath ./build/BikeLabApp.xcarchive \
  -exportOptionsPlist ../scripts/Diawi-ExportOptions.plist \
  -exportPath ./build \
  -allowProvisioningUpdates

echo "✅ IPA готов: ./build/BikeLabApp.ipa"
echo ""
echo "📤 Теперь:"
echo "1. Открой https://www.diawi.com/"
echo "2. Перетащи файл ./ios/build/BikeLabApp.ipa"
echo "3. Получишь ссылку для установки!"
echo ""
echo "Тестеры открывают ссылку на iPhone → Install"

open https://www.diawi.com/
open ./build

