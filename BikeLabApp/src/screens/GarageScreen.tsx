import React, {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  TextInput
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

interface Achievement {
  id: number;
  name: string;
  tier: string;
  icon: string;
  threshold: number;
  metric: string;
  current_value: number;
  progress_pct: number;
  unlocked: boolean;
  unlocked_at?: string;
}

// Helper to format achievement badge value and unit
function formatBadgeValue(threshold: number, metric: string): {value: string; unit: string} {
  if (metric === 'hr_intensity') {
    return {value: `${Math.round(threshold * 100)}`, unit: 'max HR'};
  }
  if (metric === 'hr_intensity_rides') {
    return {value: `${threshold}`, unit: 'rides'};
  }
  if (metric === 'weekly_streak') {
    return {value: `${threshold}`, unit: 'wk'};
  }
  if (metric === 'total_distance' || metric === 'distance') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'km'};
    return {value: `${threshold}`, unit: 'km'};
  }
  if (metric === 'total_elevation_gain' || metric === 'elevation_gain') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'm'};
    return {value: `${threshold}`, unit: 'm'};
  }
  if (metric === 'average_speed') {
    return {value: `${threshold}`, unit: 'km/h'};
  }
  if (metric === 'average_watts') {
    return {value: `${threshold}`, unit: 'w'};
  }
  if (metric === 'average_cadence') {
    return {value: `${threshold}`, unit: 'rpm'};
  }
  return {value: `${threshold}`, unit: ''};
}

export const GarageScreen: React.FC = () => {
  const navigation = useNavigation();
  const [lastRide, setLastRide] = useState<Activity | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [garageImages, setGarageImages] = useState<GarageImages>({});
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllBikes, setShowAllBikes] = useState(false);
  const mapRef = useRef<MapView>(null);
  
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

  // Fit map to track
  useEffect(() => {
    if (mapRef.current && trackCoordinates.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(trackCoordinates, {
          edgePadding: {top: 20, right: 20, bottom: 20, left: 20},
          animated: true
        });
      }, 300);
    }
  }, [trackCoordinates]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
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
    }
  };

  const loadAchievements = async () => {
    try {
      const data = await apiFetch('/api/achievements/me');
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
      const profile = await apiFetch('/api/user-profile');
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
      // Check cache first
      const cached = await AsyncStorage.getItem('activities_cache');
      let allActivities: Activity[] = [];

      if (cached) {
        const {data, timestamp} = JSON.parse(cached);
        // Use cache if less than 30 minutes old
        if (Date.now() - timestamp < 30 * 60 * 1000) {
          allActivities = data;
        }
      }

      // Load from API if no cache
      if (allActivities.length === 0) {
        allActivities = await apiFetch('/api/activities');
        await AsyncStorage.setItem('activities_cache', JSON.stringify({
          data: allActivities,
          timestamp: Date.now()
        }));
      }

      // Сохраняем все активности для виджетов
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
    return date.toLocaleDateString('en-US', {day: '2-digit', month: '2-digit', year: 'numeric'});
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
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#274dd3" />
          <Text style={styles.loadingText}>Loading garage...</Text>
        </View>
      </View>
    );
  }

  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  const elevation = lastRide?.total_elevation_gain ? Math.round(lastRide.total_elevation_gain) : '—';

  const displayedBikes = showAllBikes ? bikes : bikes.filter(bike => bike.primary);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Hero Track Banner with Map Background */}
      <View style={styles.hero}>
        {/* Map as Background with Grayscale */}
        {trackCoordinates.length > 0 ? (
          <View style={styles.mapWrapper}>
            <MapView
              ref={mapRef}
              style={styles.heroMapBackground}
              provider={PROVIDER_DEFAULT}
              initialRegion={{
                latitude: trackCoordinates[0].latitude,
                longitude: trackCoordinates[0].longitude,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05
              }}
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
              <Text style={styles.mapPlaceholderText}>No track data</Text>
            </View>
          </View>
        )}
        
        {/* Dark overlay for readability */}
        
        <View style={styles.heroOverlay} />
        
        <LinearGradient
          colors={['rgba(2, 13, 37, 0.08)', 'rgba(24, 2, 53, 0.3)']}
          locations={[0, 1]}
          style={styles.heroContentGradient}
        >    
        </LinearGradient>  
       
      </View>
      
      <View>
      <View style={styles.heroContent}>
        
        {/* Header */}
        <View style={styles.heroHeader}>
        <Text style={styles.heroDate}>
            {lastRide?.start_date ? formatDate(lastRide.start_date) : '—'}
          </Text>
          <Text style={styles.heroTitle}>{lastRide?.name || 'Last ride track'}</Text>
         
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
        
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => setShareStudioVisible(true)}
          disabled={!lastRide}
        >
          <Text style={[styles.shareButtonText, !lastRide && {opacity: 0.5}]}>
            Share
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
        <View style={styles.garageImageBox}>
          {(() => {
            const url = getImageUrl('right');
            return url ? (
              <Image
                source={{uri: url}}
                style={styles.garageImage}
                resizeMode="cover"
                onError={(error) => {
                  console.error('❌ Image load error (image 3)');
                  console.error('Error:', error.nativeEvent?.error);
                }}
                onLoad={() => console.log('✅ Image loaded (image 3)')}
                onLoadStart={() => console.log('🔄 Loading started (image 3)')}
                onLoadEnd={() => console.log('🏁 Loading ended (image 3)')}
              />
            ) : (
              <Text style={styles.garageImagePlaceholder}>No image</Text>
            );
          })()}
        </View>

        {/* Image 2 */}
        <View style={styles.garageImageBox}>
          {(() => {
            const url = getImageUrl('left-top');
            console.log('🎨 Rendering image 1, url:', url, 'truthy:', !!url);
            
            if (!url) {
              console.log('⚠️ No URL for image 1, showing placeholder');
              return <Text style={styles.garageImagePlaceholder}>No image</Text>;
            }
            
            console.log('📸 About to render Image for image 1');
            return (
              <Image
                source={{uri: url}}
                style={styles.garageImage}
                resizeMode="cover"
                onError={(error) => {
                  console.error('❌ Image load error (image 1)');
                  console.error('Error details:', JSON.stringify(error.nativeEvent, null, 2));
                  console.error('URL that failed:', url);
                }}
                onLoad={() => console.log('✅ Image loaded (image 1)')}
                onLoadStart={() => console.log('🔄 Loading started (image 1)')}
                onLoadEnd={() => console.log('🏁 Loading ended (image 1)')}
              />
            );
          })()}
        </View>

        {/* Image 3 */}
        <View style={styles.garageImageBox}>
          {(() => {
            const url = getImageUrl('left-bottom');
            return url ? (
              <Image
                source={{uri: url}}
                style={styles.garageImage}
                resizeMode="cover"
                onError={(error) => {
                  console.error('❌ Image load error (image 2)');
                  console.error('Error:', error.nativeEvent?.error);
                }}
                onLoad={() => console.log('✅ Image loaded (image 2)')}
                onLoadStart={() => console.log('🔄 Loading started (image 2)')}
                onLoadEnd={() => console.log('🏁 Loading ended (image 2)')}
              />
            ) : (
              <Text style={styles.garageImagePlaceholder}>No image</Text>
            );
          })()}
        </View>

        
      </ScrollView>

      {/* Achievements Section */}
      {achievements.length > 0 && (
        <View style={styles.achievementsSection}>
          <View style={styles.achievementsSectionHeader}>
            <Text style={styles.achievementsSectionTitle}>Achieves</Text>
           
          </View>

          <View style={styles.achievementsGrid}>
            {achievements.map((achievement) => {
              const badge = formatBadgeValue(achievement.threshold, achievement.metric);
              return (
                <TouchableOpacity 
                  key={achievement.id}
                  style={styles.achievementMiniCard}
                  onPress={() => (navigation as any).navigate('Achievements')}
                >
                  <View style={[
                    styles.achievementMiniMedalContainer,
                    achievement.tier === 'gold' && styles.achievementMiniMedalContainerGold
                  ]}>
                    <Image 
                      source={
                        achievement.tier === 'gold' 
                          ? require('../assets/img/achieve/gold.webp')
                          : achievement.tier === 'rare_steel'
                          ? require('../assets/img/achieve/rare_steel.webp')
                          : require('../assets/img/achieve/silver.webp')
                      }
                      style={[
                        styles.achievementMiniMedal,
                        achievement.tier === 'gold' && styles.achievementMiniMedalGold
                      ]}
                      resizeMode="contain"
                    />
                    <View style={styles.achievementMiniBadge}>
                      <Text style={[
                        styles.achievementMiniBadgeValue,
                        achievement.tier === 'rare_steel' && styles.achievementMiniBadgeValueRare,
                        achievement.tier === 'gold' && styles.achievementMiniBadgeValueGold
                      ]}>
                        {badge.value}
                      </Text>
                      <Text style={[
                        styles.achievementMiniBadgeUnit,
                        achievement.tier === 'rare_steel' && styles.achievementMiniBadgeUnitRare,
                        achievement.tier === 'gold' && styles.achievementMiniBadgeUnitGold
                      ]}>
                        {badge.unit}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.achievementMiniName} numberOfLines={2}>
                    {achievement.name}
                  </Text>
                  {achievement.unlocked ? (
                    <Text style={styles.achievementMiniUnlocked}>✓ Unlocked</Text>
                  ) : (
                    <View style={styles.achievementMiniProgressContainer}>
                      <View style={styles.achievementMiniProgressBar}>
                        <View 
                          style={[
                            styles.achievementMiniProgressFill, 
                            { width: `${achievement.progress_pct}%` }
                          ]} 
                        />
                      </View>
                      <Text style={styles.achievementMiniProgressText}>
                        {achievement.progress_pct.toFixed(0)}%
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
             <TouchableOpacity 
              style={styles.viewAllButton}
              onPress={() => (navigation as any).navigate('Achievements')}
            >
              <Text style={styles.viewAllButtonText}>View All</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Nutrition Calculator */}
      <View style={styles.nutritionSection}>
        <Text style={styles.nutritionTitle}>Nutrition</Text>
        
        <View style={styles.nutritionCalcWrap}>
          {/* Input Fields */}
          <View style={styles.nutritionFields}>
            <View style={styles.fieldRow}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Distance, km</Text>
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
                <Text style={styles.fieldLabel}>Elevation, m</Text>
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
                <Text style={styles.fieldLabel}>Avg Speed, km/h</Text>
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
                <Text style={styles.fieldLabel}>Temp, °C</Text>
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
              <Text style={styles.calculateButtonText}>Calculate</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.clearButton}
              onPress={handleNutritionClear}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
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
                      <Text style={styles.resultStatLabel}>Time in motion:</Text>
                      <Text style={styles.resultStatValue}>{nutritionResult.timeH.toFixed(2)} h</Text>
                    </View>
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>Water:</Text>
                      <Text style={styles.resultStatValue}>~{nutritionResult.water.toFixed(1)} l</Text>
                      <Text style={styles.resultStatHint}>
                        (based on {nutritionResult.waterPerH.toFixed(1)} l/h{nutritionResult.isPersonalized ? `, weight ${nutritionResult.userWeight}kg` : ''})
                      </Text>
                    </View>
                   
                  </View>
                  
                  <View style={styles.resultsStatsColumn}>
                    
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>Calories:</Text>
                      <Text style={styles.resultStatValue}>~{Math.round(nutritionResult.cal).toLocaleString()} kcal</Text>
                    </View>
                    
                    <View style={styles.resultStatItem}>
                      <Text style={styles.resultStatLabel}>Carbs (total):</Text>
                      <Text style={styles.resultStatValue}>~{Math.round(nutritionResult.carbs)} g</Text>
                      <Text style={styles.resultStatHint}>
                        Sports nutrition: {Math.round(nutritionResult.carbs * 0.65)}g (gels + bars), Regular food: {Math.round(nutritionResult.carbs * 0.35)}g{nutritionResult.isPersonalized ? `, ${nutritionResult.carbsPerKgPerH} g/kg/h` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
                
                {/* Icons */}
                <View style={styles.resultsIcons}>
                  <View style={styles.resultIcon}>
                   
                    <Image source={bidonImg} style={styles.resultIconImage} resizeMode="contain" />
                    <Text style={styles.resultIconTitle}>Water</Text>
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
                  <Text style={styles.personalizedBadgeTitle}>Calculated using profile data</Text>
                  <Text style={styles.personalizedBadgeText}>
                    Weight: {nutritionResult.userWeight}kg | Calories: {nutritionResult.calPerKgPerH} kcal/kg/h | Carbs: {nutritionResult.carbsPerKgPerH} g/kg/h
                  </Text>
                </View>
              )}
            </View>
          )}
          
          {/* Hint */}
          <View style={styles.nutritionHint}>
            {userProfile?.weight ? (
              <>
                <Text style={styles.hintTitle}>Personalized calculations using your profile data:</Text>
                <Text style={styles.hintText}>• Water: 0.5-0.65 l/h, adjusted for weight ({userProfile.weight}kg), temperature, and route difficulty</Text>
                <Text style={styles.hintText}>• Carbs: {userProfile.experience_level === 'advanced' ? '0.6-0.8' : userProfile.experience_level === 'beginner' ? '0.4-0.6' : '0.5-0.7'} g/kg/h based on experience level</Text>
                <Text style={styles.hintText}>• Calories: {userProfile.gender === 'female' ? '7.5-10' : '8.5-12'} kcal/kg/h adjusted for age, gender, and experience</Text>
                <Text style={styles.hintText}>• Sports nutrition (65% of carbs): gels 25-35% (distance-based), bars 65-75%</Text>
              </>
            ) : (
              <>
                <Text style={styles.hintTitle}>Generic calculations - Complete your profile for personalized results:</Text>
                <Text style={styles.hintText}>• Water: 0.5 l/h (hot: +25%, cold: -20%), adjusted by route difficulty</Text>
                <Text style={styles.hintText}>• Carbs: 35 g/h, balanced between gels (quick energy) and bars</Text>
                <Text style={styles.hintText}>• Calories: 600 kcal/h (intense/high elevation: +20-40%)</Text>
              </>
            )}
            <Text style={styles.hintText}>• 35% of carbs from regular food: bananas, sandwiches, energy drinks, etc.</Text>
            <Text style={styles.hintText}>• Gel ratio adapts to distance: short rides (&lt;80km) use fewer gels</Text>
          </View>
        </View>
      </View>

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
      marginBottom: 16,
    },
    heroTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: '#fff',
      marginBottom: 12,
      marginTop: 12,
      
    },
    heroDate: {
      fontSize: 14,
      fontWeight: '700',
      color: 'rgba(255, 255, 255, 0.8)',
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
    width: Dimensions.get('window').width * 0.706,
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
  garageImagePlaceholder: {
    color: '#666',
    fontSize: 13
  },
  actionButtons: {
    flexDirection: 'row',
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
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    padding: 16,
    marginTop: 16,
    marginBottom: 24,
  },
  achievementsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#274dd3',
    borderRadius: 20,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  achievementsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  achievementMiniCard: {
    width: (screenWidth - 56) / 3,
    backgroundColor: 'transparent',
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  achievementMiniMedalContainer: {
    position: 'relative',
    width: 60,
    height: 60,
    marginBottom: 8,
  },
  achievementMiniMedalContainerGold: {
    width: 60,
    height: 60,
   
  },
  achievementMiniMedal: {
    width: 60,
    height: 60,
  },
  achievementMiniMedalGold: {
    width: 100,
    height: 100,
  },
  achievementMiniBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  achievementMiniBadgeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5a4a3a',
    textAlign: 'center',
  },
  achievementMiniBadgeValueRare: {
    color: '#fff',
  },
  achievementMiniBadgeValueGold: {
    fontSize: 18,
  },
  achievementMiniBadgeUnit: {
    fontSize: 8,
    fontWeight: '700',
    color: '#5a4a3a',
    textAlign: 'center',
    marginTop: -2,
  },
  achievementMiniBadgeUnitRare: {
    color: '#fff',
  },
  achievementMiniBadgeUnitGold: {
    fontSize: 9,
  },
  achievementMiniName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1a1a1a',
    textAlign: 'center',
    marginBottom: 6,
    minHeight: 30,
  },
  achievementMiniUnlocked: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4CAF50',
    textTransform: 'uppercase',
  },
  achievementMiniProgressContainer: {
    width: '100%',
    alignItems: 'center',
    gap: 4,
  },
  achievementMiniProgressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  achievementMiniProgressFill: {
    height: '100%',
    backgroundColor: '#274dd3',
    borderRadius: 2,
  },
  achievementMiniProgressText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#888',
  }
});

