import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  TextInput,
  RefreshControl,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import polyline from '@mapbox/polyline';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';
import {WeatherBlock} from '../components/WeatherBlock';
import {BestAvgSpeedWidget} from '../components/BestAvgSpeedWidget';
import {WorkloadGaugeWidget} from '../components/WorkloadGaugeWidget';
import {BikesWidget} from '../components/BikesWidget';
import {ShareStudioModal, useScreenshotListener} from '../components/ShareStudio';
import {getActivityStreams} from '../utils/streamsCache';
import {AchievementMiniCard, type Achievement} from '../components/achievements';
import {ShareIcon} from '../assets/img/icons/ShareIcon';
import {AddPhotoIcon} from '../assets/img/icons/AddPhotoIcon';
import {ImageUploadModal} from '../components/ImageUploadModal';
import {PlannedRidesWidget} from '../components/PlannedRidesWidget';
import {VO2maxWidget} from '../components/VO2maxWidget';
import {useHideSplash} from '../components/SplashLoader';
import {getDateLocale} from '../i18n/dateLocale';
import {useAppData} from '../contexts/AppDataContext';

// Nutrition images
const bidonImg = require('../assets/img/nutrition/bidon.webp');
const gelImg = require('../assets/img/nutrition/gel.webp');
const carboImg = require('../assets/img/nutrition/carbo.webp');

const {width: screenWidth} = Dimensions.get('window');

interface Bike {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  primary: boolean;
  distanceKm: number;
  activitiesCount: number;
}

interface GarageImages {
  'left-top'?: {url: string; fileId: string; name: string};
  'left-bottom'?: {url: string; fileId: string; name: string};
  'right'?: {url: string; fileId: string; name: string};
}

interface UserProfile {
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  experience_level?: 'beginner' | 'intermediate' | 'advanced';
}

interface NutritionInput {
  distance: string;
  elevation: string;
  speed: string;
  temp: string;
}

interface NutritionResult {
  timeH: number;
  cal: number;
  carbs: number;
  water: number;
  gels: number;
  bars: number;
  waterPerH: number;
  isPersonalized: boolean;
  userWeight: number;
  calPerKgPerH: number;
  carbsPerKgPerH: number;
}

export const GarageScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation();
  const {activities: sharedActivities, loadActivities: loadSharedActivities, userProfile: sharedProfile, loadUserProfile: loadSharedProfile} = useAppData();
  const [lastRide, setLastRide] = useState<Activity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [garageImages, setGarageImages] = useState<GarageImages>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [uploadModalVisible, setUploadModalVisible] = useState(false);
  const [uploadPosition, setUploadPosition] = useState<'right' | 'left-top' | 'left-bottom'>('right');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllBikes, setShowAllBikes] = useState(false);
  const mapRef = useRef<MapView>(null);
  const hideSplash = useHideSplash();
  
  // Share Studio State
  const [shareStudioVisible, setShareStudioVisible] = useState(false);
  const [streams, setStreams] = useState<any>(null);
  
  // Nutrition Calculator State
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [nutritionInput, setNutritionInput] = useState<NutritionInput>({
    distance: '',
    elevation: '',
    speed: '',
    temp: ''
  });
  const [nutritionResult, setNutritionResult] = useState<NutritionResult | null>(null);
  
  // Screenshot listener - opens Share Studio when user takes a screenshot
  const handleScreenshot = useCallback(() => {
    if (lastRide) {
      setShareStudioVisible(true);
    }
  }, [lastRide]);
  
  useScreenshotListener({
    onScreenshot: handleScreenshot,
    enabled: !!lastRide, // Only enable when we have a ride to share
  });

  // Decode polyline to coordinates
  const trackCoordinates = useMemo(() => {
    if (!lastRide?.map?.summary_polyline) return [];
    
    try {
      const points = polyline.decode(lastRide.map.summary_polyline);
      return points.map(([lat, lng]) => ({
        latitude: lat,
        longitude: lng
      }));
    } catch (error) {
      console.error('Error decoding polyline:', error);
      return [];
    }
  }, [lastRide?.map?.summary_polyline]);

  const mapRegion = useMemo(() => {
    if (trackCoordinates.length === 0) return null;

    const lats = trackCoordinates.map(c => c.latitude);
    const lngs = trackCoordinates.map(c => c.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = (maxLat - minLat) * 1.6 || 0.02;
    const lngDelta = (maxLng - minLng) * 1.6 || 0.02;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.005),
      longitudeDelta: Math.max(lngDelta, 0.005),
    };
  }, [trackCoordinates]);

  const handleMapReady = useCallback(() => {
    if (mapRef.current && trackCoordinates.length > 0) {
      mapRef.current.fitToCoordinates(trackCoordinates, {
        edgePadding: {top: 60, right: 40, bottom: 60, left: 40},
        animated: false,
      });
    }
  }, [trackCoordinates]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      hideSplash();
    }
  }, [loading, hideSplash]);

  const loadData = async (forceRefresh = false) => {
    try {
      if (!forceRefresh) {
        setLoading(true);
      }
      if (forceRefresh) {
        await AsyncStorage.multiRemove(['activities_cache', 'bikes_cache', 'garage_images_cache']);
      }
      await Promise.all([
        loadLastRide(),
        loadBikes(),
        loadGarageImages(),
        loadUserProfile(),
        loadAchievements()
      ]);
    } catch (error) {
      console.error('Error loading garage data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(true);
  }, []);

  const loadAchievements = async () => {
    try {
      const data = await apiFetch('/api/achievements/me');
      
      if (!data || !data.achievements || !Array.isArray(data.achievements)) {
        console.error('❌ Invalid achievements data structure');
        return;
      }
      
      // Get top 6: recently unlocked + closest to unlock
      const unlocked = data.achievements.filter((a: Achievement) => a.unlocked)
        .sort((a: Achievement, b: Achievement) => new Date(b.unlocked_at || 0).getTime() - new Date(a.unlocked_at || 0).getTime())
        .slice(0, 3);
      
      const locked = data.achievements.filter((a: Achievement) => !a.unlocked)
        .sort((a: Achievement, b: Achievement) => b.progress_pct - a.progress_pct)
        .slice(0, 3);
      
      setAchievements([...unlocked, ...locked].slice(0, 6));
    } catch (error) {
      console.error('Error loading achievements:', error);
    }
  };

  const loadUserProfile = async () => {
    try {
      const profile = await loadSharedProfile();
      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  const handleNutritionClear = () => {
    setNutritionInput({
      distance: '',
      elevation: '',
      speed: '',
      temp: ''
    });
    setNutritionResult(null);
  };

  const handleNutritionCalc = () => {
    const dist = parseFloat(nutritionInput.distance);
    const elev = parseFloat(nutritionInput.elevation);
    const spd = parseFloat(nutritionInput.speed);
    const temp = parseFloat(nutritionInput.temp);
    
    if (!dist || !elev || !spd) return;
    
    const timeH = dist / spd;
    const elevPerKm = elev / dist;
    
    let isPersonalized = false;
    let userWeight = 75;
    let calPerKgPerH = 10;
    let carbsPerKgPerH = 0.6;
    let waterPerH = 0.5; // Базовое значение 0.5л/час
    
    if (userProfile?.weight) {
      isPersonalized = true;
      userWeight = userProfile.weight;
      
      const expLevel = userProfile.experience_level || 'intermediate';
      const age = userProfile.age || 30;
      const gender = userProfile.gender || 'male';
      
      if (expLevel === 'advanced') {
        calPerKgPerH = gender === 'female' ? 9 : 11;
        carbsPerKgPerH = 0.7;
      } else if (expLevel === 'beginner') {
        calPerKgPerH = gender === 'female' ? 7.5 : 8.5;
        carbsPerKgPerH = 0.5;
      } else {
        calPerKgPerH = gender === 'female' ? 8 : 10;
        carbsPerKgPerH = 0.6;
      }
      
      if (age > 40) calPerKgPerH *= 0.95;
      if (age > 50) calPerKgPerH *= 0.9;
      
      // Более реалистичный расчет воды: базовые 0.5л/ч + корректировка по весу
      waterPerH = 0.5 + (userWeight - 70) * 0.005; // ~0.5-0.65л/ч
      
      // Корректировка по температуре
      if (temp > 30) waterPerH *= 1.4;
      else if (temp > 25) waterPerH *= 1.25;
      else if (temp > 20) waterPerH *= 1.1;
      else if (temp < 10) waterPerH *= 0.8;
    } else {
      // Без профиля - базовые значения с корректировкой по температуре
      if (temp > 30) waterPerH = 0.75;
      else if (temp > 25) waterPerH = 0.65;
      else if (temp < 10) waterPerH = 0.4;
    }
    
    let cal = isPersonalized ? calPerKgPerH * userWeight * timeH : 600 * timeH;
    let carbs = isPersonalized ? carbsPerKgPerH * userWeight * timeH : 35 * timeH;
    
    // Корректировка по сложности маршрута
    if (elevPerKm > 20 || spd > 30) {
      cal *= 1.4;
      carbs *= 1.2;
      waterPerH *= 1.15; // Больше воды на сложном маршруте
    } else if (elevPerKm > 10 || spd > 25) {
      cal *= 1.2;
      carbs *= 1.1;
      waterPerH *= 1.1;
    }
    
    const water = waterPerH * timeH;
    
    // Реалистичное распределение: гели - экстренная энергия, батончики и еда - основное питание
    const totalSportsNutrition = carbs * 0.65; // 65% углеводов из спортпита, 35% из обычной еды (бананы, бутерброды и тд)
    
    // Адаптивное распределение в зависимости от расстояния:
    // Короткие дистанции (<80км) - меньше гелей, больше батончиков
    // Длинные дистанции (>120км) - умеренно гелей для экстренной энергии
    let gelRatio = 0.3; // 30% базовое значение для гелей
    if (dist < 80) {
      gelRatio = 0.25; // короткая дистанция - мало гелей
    } else if (dist > 120) {
      gelRatio = 0.35; // длинная дистанция - чуть больше гелей для буста
    }
    
    const carbsFromGels = totalSportsNutrition * gelRatio;
    const carbsFromBars = totalSportsNutrition * (1 - gelRatio);
    
    const gels = Math.max(Math.ceil(carbsFromGels / 25), 1); // 1 гель = 25г углеводов, минимум 1
    const bars = Math.ceil(carbsFromBars / 35); // 1 батончик = 35г углеводов (средний размер)
    
    setNutritionResult({
      timeH,
      cal,
      carbs,
      water,
      gels,
      bars,
      waterPerH,
      isPersonalized,
      userWeight,
      calPerKgPerH,
      carbsPerKgPerH
    });
  };

  const loadLastRide = async () => {
    try {
      const allActivities = await loadSharedActivities();
      setActivities(allActivities);

      // Filter cycling activities and get last one
      const rides = allActivities.filter(a => ['Ride', 'VirtualRide'].includes(a.type));
      if (rides.length > 0) {
        const last = rides.sort((a, b) => 
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        )[0];
        setLastRide(last);
        
        // Load streams for charts in Share Studio
        try {
          const streamsData = await getActivityStreams(last.id);
          if (streamsData) {
            setStreams(streamsData);
            console.log('✅ Streams loaded for Share Studio');
          }
        } catch (err) {
          console.log('⚠️ Could not load streams for Share Studio');
        }
      }
    } catch (error) {
      console.error('Error loading last ride:', error);
    }
  };

  const loadBikes = async () => {
    try {
      // Check cache
      const cached = await AsyncStorage.getItem('bikes_cache');
      if (cached) {
        const {data, timestamp} = JSON.parse(cached);
        // Use cache if less than 6 hours old
        if (Date.now() - timestamp < 6 * 60 * 60 * 1000) {
          setBikes(data);
          return;
        }
      }

      // Load from API
      const data = await apiFetch('/api/bikes');
      setBikes(data || []);
      
      // Cache data
      await AsyncStorage.setItem('bikes_cache', JSON.stringify({
        data: data || [],
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error loading bikes:', error);
      setBikes([]);
    }
  };

  const loadGarageImages = async () => {
    try {
      // Check cache
      const cached = await AsyncStorage.getItem('garage_images_cache');
      if (cached) {
        const {data, timestamp} = JSON.parse(cached);
        // Use cache if less than 1 hour old
        if (Date.now() - timestamp < 60 * 60 * 1000) {
          console.log('🖼️ Garage images from cache:', data);
          setGarageImages(data);
          return;
        }
      }

      // Load from API
      console.log('🖼️ Loading garage images from API...');
      const data = await apiFetch('/api/garage/positions');
      console.log('🖼️ Garage images loaded:', data);
      setGarageImages(data || {});
      
      // Cache data
      await AsyncStorage.setItem('garage_images_cache', JSON.stringify({
        data: data || {},
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('❌ Error loading garage images:', error);
      setGarageImages({});
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(getDateLocale(), {day: '2-digit', month: '2-digit', year: 'numeric'});
  };

  const openUploadModal = (position: 'right' | 'left-top' | 'left-bottom') => {
    setUploadPosition(position);
    setUploadModalVisible(true);
  };

  const handleUploadSuccess = async () => {
    // Force reload from API (cache already cleared by modal)
    try {
      const data = await apiFetch('/api/garage/positions');
      setGarageImages(data || {});
      // Update cache with fresh data
      await AsyncStorage.setItem('garage_images_cache', JSON.stringify({
        data: data || {},
        timestamp: Date.now(),
      }));
    } catch (error) {
      console.error('Error reloading garage images:', error);
    }
  };

  const getImageUrl = (position: keyof GarageImages): string | null => {
    const imageData = garageImages[position];
    console.log(`🖼️ Getting image for ${position}:`, imageData);
    if (!imageData?.url) {
      console.log(`⚠️ No URL for ${position}`);
      return null;
    }
    // Use backend proxy for ImageKit (same as web's proxyStravaImage)
    const imagekitUrl = imageData.url.split('?')[0]; // Remove any existing params
    // Production build - always use production server
    const proxyUrl = `https://bikelab.app/api/proxy/strava-image?url=${encodeURIComponent(imagekitUrl)}`;
    // Dev: const proxyUrl = `http://192.168.10.82:8080/api/proxy/strava-image?url=${encodeURIComponent(imagekitUrl)}`;
    console.log(`✅ Proxy URL for ${position}:`, proxyUrl);
    return proxyUrl;
  };

  if (loading) {
    return <View style={styles.container} />;
  }

  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  const elevation = lastRide?.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) : '—';

  const displayedBikes = showAllBikes ? bikes : bikes.filter(bike => bike.primary);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#274dd3"
          colors={['#274dd3']}
        />
      }>
      {/* Hero Track Banner with Map Background */}
      <View style={styles.hero}>
        {/* Map as Background with Grayscale */}
        {trackCoordinates.length > 0 ? (
          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.heroMapBackground}
              provider={PROVIDER_DEFAULT}
              initialRegion={mapRegion!}
              onMapReady={handleMapReady}
              scrollEnabled={false}
              zoomEnabled={false}
              pitchEnabled={false}
              rotateEnabled={false}
              showsBuildings={false}
              showsTraffic={false}
              showsIndoors={false}
              showsPointsOfInterests={false}
              showsCompass={false}
              toolbarEnabled={false}
              userInterfaceStyle="dark"
              mapType="mutedStandard"
            >
              <Polyline
                coordinates={trackCoordinates}
                strokeWidth={3}
                strokeColor="#FFFFFF"
                lineCap="round"
                lineJoin="round"
              />
            </MapView>
            
          </View>
          
        ) : (
          <View style={styles.heroMapBackground}>
            <View style={styles.mapPlaceholder}>
              <Text style={styles.mapPlaceholderText}>{t('garage.noTrackData')}</Text>
            </View>
          </View>
        )}
        
        {/* Dark overlay for readability */}
        
        <View style={styles.heroOverlay} />
        
        <LinearGradient
          colors={['rgba(2, 13, 37, 0.08)', 'rgba(24, 2, 53, 0.08)']}
          locations={[0, 1]}
          style={styles.heroContentGradient}
        >    
        </LinearGradient>  
       
      </View>
      
      <View>
      <View style={styles.heroContent}>
        
        {/* Header */}
        <View style={styles.heroHeader}>
          <View style={{flex: 1}}>
            <Text style={styles.heroDate}>
              {lastRide?.start_date ? formatDate(lastRide.start_date) : '—'}
            </Text>
            <Text style={styles.heroTitle}>{lastRide?.name || t('garage.lastRideTrack')}</Text>
          </View>
          {lastRide && (
            <TouchableOpacity
              style={styles.shareIconButton}
              onPress={() => setShareStudioVisible(true)}>
              <ShareIcon size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

      {/* Stats Cards (moved up, no map container) */}
      <View>
      <View style={styles.statsCards}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Distance<Text style={styles.statUnit}>, km</Text></Text>
          <Text style={styles.statValue}>{distance}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Avg speed<Text style={styles.statUnit}>, km/h</Text></Text>
          <Text style={styles.statValue}>{speed}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Elevation<Text style={styles.statUnit}>, m</Text></Text>
          <Text style={styles.statValue}>{elevation}</Text>
        </View>
         {/* Analyze Button */}
     
      </View>
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.analyzeButton}
          onPress={() => {
            if (lastRide) {
              (navigation as any).navigate('RideAnalytics', {activity: lastRide});
            }
          }}
          disabled={!lastRide}
        >
          <Text style={[styles.analyzeButtonText, !lastRide && {opacity: 0.5}]}>
            Analyze ride
          </Text>
        </TouchableOpacity>
        
      </View>
      </View>

     

     
    
    </View>
      </View>

      {/* Bike Garage Title */}
      <View style={styles.garageHeader}>
        <Text style={styles.garageTitle}>Bike garage</Text>
      </View>

      {/* Statistics Widgets */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.widgetsScrollView}
        contentContainerStyle={styles.widgetsContainer}
      >
         <BikesWidget bikes={bikes} />
        <BestAvgSpeedWidget activities={activities} />
        <WorkloadGaugeWidget />
       
      </ScrollView>

      {/* Bike Garage Images Carousel */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={Dimensions.get('window').width * 0.9 + 8}
        snapToAlignment="start"
        style={styles.garageCarousel}
        contentContainerStyle={styles.garageCarouselContent}
      >
        {/* Image 1 */}
        <TouchableOpacity
          style={styles.garageImageBox}
          activeOpacity={0.8}
          onPress={() => openUploadModal('right')}>
          {(() => {
            const url = getImageUrl('right');
            return url ? (
              <Image source={{uri: url}} style={styles.garageImage} resizeMode="cover" />
            ) : (
              <View style={styles.garageImagePlaceholderBox}>
                <AddPhotoIcon size={32} color="rgba(0, 0, 0, 0.25)" />
                <Text style={styles.garageImagePlaceholder}>{t('garage.addPhoto')}</Text>
              </View>
            );
          })()}
        </TouchableOpacity>

        {/* Image 2 */}
        <TouchableOpacity
          style={styles.garageImageBox}
          activeOpacity={0.8}
          onPress={() => openUploadModal('left-top')}>
          {(() => {
            const url = getImageUrl('left-top');
            return url ? (
              <Image source={{uri: url}} style={styles.garageImage} resizeMode="cover" />
            ) : (
              <View style={styles.garageImagePlaceholderBox}>
                <AddPhotoIcon size={32} color="rgba(0, 0, 0, 0.25)" />
                <Text style={styles.garageImagePlaceholder}>{t('garage.addPhoto')}</Text>
              </View>
            );
          })()}
        </TouchableOpacity>

        {/* Image 3 */}
        <TouchableOpacity
          style={styles.garageImageBox}
          activeOpacity={0.8}
          onPress={() => openUploadModal('left-bottom')}>
          {(() => {
            const url = getImageUrl('left-bottom');
            return url ? (
              <Image source={{uri: url}} style={styles.garageImage} resizeMode="cover" />
            ) : (
              <View style={styles.garageImagePlaceholderBox}>
                <AddPhotoIcon size={32} color="rgba(0, 0, 0, 0.25)" />
                <Text style={styles.garageImagePlaceholder}>{t('garage.addPhoto')}</Text>
              </View>
            );
          })()}
        </TouchableOpacity>

        
      </ScrollView>

      {/* Planned Rides */}
      <PlannedRidesWidget />

      {/* Achievements Section */}
      {achievements.length > 0 && (
        <View style={styles.achievementsSection}>
          <View style={styles.achievementsSectionHeader}>
            <Text style={styles.achievementsSectionTitle}>{t('garage.achieves')}</Text>
           
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.achievementsGridContent}
            style={styles.achievementsGrid}>
            {achievements.map((achievement) => (
              <AchievementMiniCard
                key={achievement.id}
                achievement={achievement}
              />
            ))}
          </ScrollView>
          <TouchableOpacity
              style={styles.viewAllButton}
              onPress={() => (navigation as any).navigate('Achievements')}>
              <Text style={styles.viewAllButtonText}>{t('garage.viewAll')}</Text>
            </TouchableOpacity>
        </View>
      )}

      {/* Nutrition Calculator */}
      <View style={styles.nutritionSection}>
        <Text style={styles.nutritionTitle}>{t('garage.nutrition')}</Text>
        
        <View style={styles.nutritionCalcWrap}>
          {/* Input Fields */}
          <View style={styles.nutritionFields}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('garage.distanceKm')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="105"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  value={nutritionInput.distance}
                  onChangeText={(text) => setNutritionInput(prev => ({...prev, distance: text}))}
                />
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('garage.elevationM')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="1200"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  value={nutritionInput.elevation}
                  onChangeText={(text) => setNutritionInput(prev => ({...prev, elevation: text}))}
                />
              </View>
            </View>
            
            <View style={styles.fieldRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('garage.avgSpeedKmh')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="27"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  value={nutritionInput.speed}
                  onChangeText={(text) => setNutritionInput(prev => ({...prev, speed: text}))}
                />
              </View>
              
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>{t('garage.tempC')}</Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="22"
                  placeholderTextColor="#aaa"
                  keyboardType="numeric"
                  value={nutritionInput.temp}
                  onChangeText={(text) => setNutritionInput(prev => ({...prev, temp: text}))}
                />
              </View>
            </View>
          </View>
          
          {/* Buttons */}
          <View style={styles.nutritionButtons}>
            <TouchableOpacity 
              style={styles.calculateButton}
              onPress={handleNutritionCalc}
            >
              <Text style={styles.calculateButtonText}>{t('garage.calculate')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={handleNutritionClear}
            >
              <Text style={styles.clearButtonText}>{t('garage.clear')}</Text>
            </TouchableOpacity>
          </View>
          
          {/* Results */}
          {nutritionResult && (
            <View style={styles.nutritionResults}>
              <View style={styles.resultsMainBox}>
                {/* Stats */}
                <View style={styles.resultsStats}>
                  <View style={styles.resultsStatsColumn}>
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>{t('garage.timeInMotion')}</Text>
                      <Text style={styles.resultStatValue}>{nutritionResult.timeH.toFixed(2)} {t('common.h')}</Text>
                    </View>
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>{t('garage.water')}</Text>
                      <Text style={styles.resultStatValue}>~{nutritionResult.water.toFixed(1)} l</Text>
                      <Text style={styles.resultStatHint}>
                        (based on {nutritionResult.waterPerH.toFixed(1)} l/h{nutritionResult.isPersonalized ? `, weight ${nutritionResult.userWeight}kg` : ''})
                      </Text>
                    </View>
                   
                  </View>
                  
                  <View style={styles.resultsStatsColumn}>
                    
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>{t('garage.calories')}</Text>
                      <Text style={styles.resultStatValue}>~{Math.round(nutritionResult.cal).toLocaleString()} kcal</Text>
                    </View>
                    
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>{t('garage.carbsTotal')}</Text>
                      <Text style={styles.resultStatValue}>~{Math.round(nutritionResult.carbs)} g</Text>
                      <Text style={styles.resultStatHint}>
                        {t('garage.sportsNutrition')}{Math.round(nutritionResult.carbs * 0.65)}{t('garage.regularFood')}{Math.round(nutritionResult.carbs * 0.35)}g{nutritionResult.isPersonalized ? `, ${nutritionResult.carbsPerKgPerH} g/kg/h` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
                
                {/* Icons */}
                <View style={styles.resultsIcons}>
                  <View style={styles.resultIcon}>
                   
                    <Image source={bidonImg} style={styles.resultIconImage} resizeMode="contain" />
                    <Text style={styles.resultIconTitle}>{t('garage.water').replace(':', '')}</Text>
                    <Text style={styles.resultIconLabel}>{nutritionResult.water.toFixed(1)}L</Text>
                    <Text style={styles.resultIconHint}>≈{Math.ceil(nutritionResult.water / 0.5)} bottles</Text>
                    
                  </View>
                  
                  <View style={styles.resultIcon}>
                   
                    <Image source={gelImg} style={styles.resultIconImage} resizeMode="contain" />
                    <Text style={styles.resultIconTitle}>Gel</Text>
                    <Text style={styles.resultIconLabel}>x{nutritionResult.gels}</Text>
                    <Text style={styles.resultIconHint}>{(nutritionResult.gels * 25)}g</Text>
                  </View>
                  
                  <View style={styles.resultIcon}>
                   
                    <Image source={carboImg} style={styles.resultIconImage} resizeMode="contain" />
                    <Text style={styles.resultIconTitle}>Carbo.</Text>
                    <Text style={styles.resultIconLabel}>x{nutritionResult.bars}</Text>
                    <Text style={styles.resultIconHint}>{(nutritionResult.bars * 35)}g</Text>
                  </View>
                </View>
              </View>
              
              {/* Personalized Badge */}
              {nutritionResult.isPersonalized && (
                <View style={styles.personalizedBadge}>
                  <Text style={styles.personalizedBadgeTitle}>{t('garage.calculatedUsingProfile')}</Text>
                  <Text style={styles.personalizedBadgeText}>
                    {t('garage.weightLabel')}{nutritionResult.userWeight}kg{t('garage.caloriesLabel')}{nutritionResult.carbsPerKgPerH} g/kg/h
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* Hint */}
          <View style={styles.nutritionHint}>
            {userProfile?.weight ? (
              <>
                <Text style={styles.hintTitle}>{t('garage.personalizedCalc')}</Text>
                <Text style={styles.hintText}>• {t('garage.waterCalc')} ({userProfile.weight}kg), temperature, and route difficulty</Text>
                <Text style={styles.hintText}>• Carbs: {userProfile.experience_level === 'advanced' ? '0.6-0.8' : userProfile.experience_level === 'beginner' ? '0.4-0.6' : '0.5-0.7'}{t('garage.carbsCalc')}</Text>
                <Text style={styles.hintText}>• {t('garage.calories')} {userProfile.gender === 'female' ? '7.5-10' : '8.5-12'}{t('garage.caloriesCalc')}</Text>
                <Text style={styles.hintText}>• {t('garage.sportsNutritionCalc')}</Text>
              </>
            ) : (
              <>
                <Text style={styles.hintTitle}>{t('garage.genericCalc')}</Text>
                <Text style={styles.hintText}>• {t('garage.genericWater')}</Text>
                <Text style={styles.hintText}>• {t('garage.genericCarbs')}</Text>
                <Text style={styles.hintText}>• {t('garage.genericCalories')}</Text>
              </>
            )}
            <Text style={styles.hintText}>• {t('garage.genericRegularFood')}</Text>
            <Text style={styles.hintText}>• {t('garage.genericGelRatio')}</Text>
          </View>
        </View>
      </View>

      {/* VO2max Calculator */}
      <VO2maxWidget userProfile={userProfile} />

      {/* Weather Block */}
      <WeatherBlock />
      
      {/* Share Studio Modal */}
      {lastRide && (
        <ShareStudioModal
          visible={shareStudioVisible}
          onClose={() => setShareStudioVisible(false)}
          activity={lastRide}
          trackCoordinates={trackCoordinates}
          streams={streams}
        />
      )}

      {/* Image Upload Modal */}
      <ImageUploadModal
        visible={uploadModalVisible}
        position={uploadPosition}
        onClose={() => setUploadModalVisible(false)}
        onUploadSuccess={handleUploadSuccess}
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    marginBottom: 0
  },
  scrollContent: {
    paddingBottom: 0
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40
  },
  loadingText: {
    color: '#888',
    marginTop: 16,
    fontSize: 14
  },
  hero: {
    height: 440,
    position: 'relative',
    backgroundColor: '#0a0a0a',
   
  },
  mapWrapper: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',

  },
  heroMapBackground: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(1, 6, 19, 0.35)', // Легкий overlay для читаемости текста
    zIndex: 1,
  },
  heroContent: {
    flex: 1,
    backgroundColor: '#191b20',
    padding: 20,
    paddingTop: 32,
    paddingBottom: 30,
    zIndex: 10,
    justifyContent: 'flex-end', // Контент внизу
    
  },
  heroContentGradient: {
    width: '250%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    
  },
  mapPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0a'
  },
  mapPlaceholderText: {
    color: '#666',
    fontSize: 13
  },
    heroHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    shareIconButton: {
      width: 45,
      height: 45,
      borderRadius: 80,
      backgroundColor: 'rgba(255, 255, 255, 0.07)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0)',
      marginLeft: 12,
      marginTop: -12,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: '#fff',
      marginBottom: 12,
      marginTop: 12,
      lineHeight: 30,
      
    },
    heroDate: {
      fontSize: 13,
      fontWeight: '600',
      color: 'rgba(255, 255, 255, 0.6)',
      marginBottom: 0,
    },
  statsCards: {
    flexDirection: 'row',
    gap: 12
  },
  statCard: {
    flex: 1,
    padding: 0,
  },
  statLabel: {
    fontSize: 12,
    color: '#aaa',
    marginBottom: 8
  },
  statUnit: {
    fontSize: 11,
    color: '#666'
  },
  statValue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff'
  },
  bikesSection: {
    paddingVertical: 24,
    paddingHorizontal: 20,
   backgroundColor: '#eaeaea'
  },
  bikeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 0,
  },
  bikeInfo: {
    flex: 1,
    marginRight: 16
  },
  bikeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4
  },
  bikeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a1a'
  },
  primaryBadge: {
    backgroundColor: '#274dd3',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 100
  },
  primaryBadgeText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '600'
  },
  bikeActivities: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666'
  },
  bikeDistance: {
    fontSize: 18,
    color: '#1a1a1a',
    fontWeight: '800'
  },
  bikeDistanceLabel: {
    fontWeight: '600',
    color: '#aaa'
  },
  showAllBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 8
  },
  showAllBtnText: {
    color: '#274dd3',
    fontSize: 14,
    fontWeight: '600'
  },
  garageHeader: {
    padding: 16,
  },
  widgetsScrollView: {
    marginBottom: 0,
  },
  widgetsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  garageTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a',
    marginTop: 16,
  },
  garageCarousel: {
    marginBottom: 16,
  },
  garageCarouselContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  garageImageBox: {
    width: Dimensions.get('window').width * 0.68,
    height: 390,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  garageImage: {
    width: '100%',
    height: '100%'
  },
  garageImagePlaceholderBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f1f0f0',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    borderStyle: 'dashed',
    width: '100%',
    height: '100%',
  },
  garageImagePlaceholder: {
    color: 'rgba(0,0,0,0.3)',
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 12,
    marginTop: 32,
  },
  analyzeButton: {
    flex: 1,
    backgroundColor: '#274dd3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    shadowColor: '#274dd3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6
  },
  analyzeButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  shareButton: {
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    paddingHorizontal: 12,
  },
  shareButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5
  },
  // Nutrition Calculator Styles
  nutritionSection: {
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  nutritionTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  nutritionCalcWrap: {
   
    borderRadius: 8,
    
  },
  nutritionFields: {
    gap: 16,
    marginBottom: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 32,
  },
  fieldGroup: {
    flex: 1,
    gap: 0,
  },
  fieldLabel: {
    fontSize: 14,
    color: 'rgba(0, 0, 0, 0.2)',
    fontWeight: '500',
  },
    fieldInput: {
      fontSize: 52,
      fontWeight: '900',
      color: '#222',
      paddingVertical: 8,
      paddingHorizontal: 0,
      borderBottomWidth: 0,
    },
    nutritionButtons: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 20,
      alignItems: 'flex-start',
      width: '65%',
    },
    calculateButton: {
      flex: 1,
      backgroundColor: '#4CAF50',
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calculateButtonText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '600',
    },
    clearButton: {
      flex: 1,
     
      padding: 16,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    clearButtonText: {
      color: 'rgba(0, 0, 0, 0.5)',
      fontSize: 14,
      fontWeight: '600',
    },
  nutritionResults: {
    marginTop: 12,
  },
  resultsMainBox: {
    backgroundColor: '#4CAF50',
    borderRadius: 0,
    padding: 20,
    marginBottom: 0,
  },
    resultsStats: {
      flexDirection: 'row',
      gap: 24,
      marginBottom: 20,
    },
    resultsStatsColumn: {
      flex: 1,
      gap: 24,
    },
    resultStatItem: {
      gap: 8,
    },
  resultStatLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  resultStatValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  resultStatHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  resultsIcons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  resultIcon: {
    alignItems: 'center',
    gap: 4,
  },
  resultIconTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  resultIconImage: {
    width: 92,
    height: 92,
  },
  resultIconLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  resultIconHint: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  personalizedBadge: {
    backgroundColor: 'rgb(44, 171, 42)',
    padding: 16,
    borderRadius: 0,
    marginTop: 0,
  },
  personalizedBadgeTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  personalizedBadgeText: {
    fontSize: 12,
    color: '#fff',
  },
  nutritionHint: {
    marginTop: 24,
    gap: 8,
  },
  hintTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#888',
    marginBottom: 4,
  },
  hintText: {
    fontSize: 12,
    color: '#888',
    lineHeight: 18,
  },
  // Achievements Section Styles
  achievementsSection: {
   
    marginTop: 16,
    marginBottom: 24,
  },
  achievementsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    marginBottom: 16,
    padding: 16,
  },
  achievementsSectionTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a',
    letterSpacing: -1,
  },
  viewAllButton: {
    flex: 1,
      backgroundColor: '#f1f0f0',
      padding: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: 16,
      width: 115,
      marginTop: 8,

  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
    
  },
  achievementsGrid: {
    marginBottom: 0,
   
  },
  achievementsGridContent: {
    flexDirection: 'row',
    gap: 0,
    paddingHorizontal: 0,
   
  },
});

