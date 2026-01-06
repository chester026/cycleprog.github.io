#!/bin/bash

# 🚀 Build and Upload to TestFlight Script
# Usage: ./scripts/build-testflight.sh

set -e

echo "🔨 Building BikeLabApp for TestFlight..."

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Переходим в папку ios
cd "$(dirname "$0")/../ios"

# Схема и workspace
SCHEME="BikeLabApp"
WORKSPACE="BikeLabApp.xcworkspace"
ARCHIVE_PATH="./build/BikeLabApp.xcarchive"
EXPORT_PATH="./build"

echo "${BLUE}📦 Step 1: Cleaning previous builds...${NC}"
rm -rf ./build
xcodebuild clean -workspace "$WORKSPACE" -scheme "$SCHEME"

echo "${BLUE}📦 Step 2: Installing CocoaPods...${NC}"
pod install

echo "${BLUE}📦 Step 3: Creating Archive...${NC}"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -archivePath "$ARCHIVE_PATH" \
  -configuration Release \
  -allowProvisioningUpdates

echo "${BLUE}📦 Step 4: Exporting IPA...${NC}"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist ../scripts/ExportOptions.plist \
  -allowProvisioningUpdates

echo "${GREEN}✅ Build complete!${NC}"
echo "${GREEN}📱 IPA file: $EXPORT_PATH/BikeLabApp.ipa${NC}"
echo ""
echo "📤 Uploading to TestFlight..."
xcrun altool --upload-app \
  --type ios \
  --file "$EXPORT_PATH/BikeLabApp.ipa" \
  --username "YOUR_APPLE_ID@email.com" \
  --password "app-specific-password"

echo "${GREEN}🎉 Upload complete! Check App Store Connect in 5-10 minutes.${NC}"

