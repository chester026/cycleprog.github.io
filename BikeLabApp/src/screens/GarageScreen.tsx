import React, {useState, useEffect, useMemo, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import MapView, {Polyline, PROVIDER_DEFAULT} from 'react-native-maps';
import polyline from '@mapbox/polyline';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LinearGradient from 'react-native-linear-gradient';

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

export const GarageScreen: React.FC = () => {
  const navigation = useNavigation();
  const [lastRide, setLastRide] = useState<Activity | null>(null);
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [garageImages, setGarageImages] = useState<GarageImages>({});
  const [loading, setLoading] = useState(true);
  const [showAllBikes, setShowAllBikes] = useState(false);
  const mapRef = useRef<MapView>(null);

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
        loadGarageImages()
      ]);
    } catch (error) {
      console.error('Error loading garage data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLastRide = async () => {
    try {
      // Check cache first
      const cached = await AsyncStorage.getItem('activities_cache');
      let activities: Activity[] = [];

      if (cached) {
        const {data, timestamp} = JSON.parse(cached);
        // Use cache if less than 30 minutes old
        if (Date.now() - timestamp < 30 * 60 * 1000) {
          activities = data;
        }
      }

      // Load from API if no cache
      if (activities.length === 0) {
        activities = await apiFetch('/api/activities');
        await AsyncStorage.setItem('activities_cache', JSON.stringify({
          data: activities,
          timestamp: Date.now()
        }));
      }

      // Filter cycling activities and get last one
      const rides = activities.filter(a => ['Ride', 'VirtualRide'].includes(a.type));
      if (rides.length > 0) {
        const last = rides.sort((a, b) => 
          new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        )[0];
        setLastRide(last);
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
    const proxyUrl = `${__DEV__ ? 'http://localhost:8080' : 'https://bikelab.app'}/api/proxy/strava-image?url=${encodeURIComponent(imagekitUrl)}`;
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
                strokeWidth={5}
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
        
        <View style={styles.heroContent}>
        
            {/* Header */}
            <View style={styles.heroHeader}>
              <Text style={styles.heroDate}>
                {lastRide?.start_date ? formatDate(lastRide.start_date) : '—'}
              </Text>
              <Text style={styles.heroTitle}>{lastRide?.name || 'Last ride track'}</Text>
            </View>

          {/* Stats Cards (moved up, no map container) */}
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
          </View>

          {/* Analyze Button */}
          <TouchableOpacity
            style={styles.analyzeButton}
            onPress={() => navigation.navigate('AnalysisTab' as never)}
          >
            <Text style={styles.analyzeButtonText}>Analyze ride</Text>
          </TouchableOpacity>

          <LinearGradient
          colors={['rgba(12, 19, 35, 0.2)', 'rgba(4, 7, 14, 0.85)']}
          locations={[0, 1]}
          style={styles.heroContentGradient}
        >    
        </LinearGradient>  
        
        </View>
       
      </View>

      {/* Bike Mileage Info */}
      {bikes.length > 0 && (
        <View style={styles.bikesSection}>
          {displayedBikes.map((bike) => (
            <View key={bike.id} style={styles.bikeItem}>
              <View style={styles.bikeInfo}>
                <View style={styles.bikeNameRow}>
                
                  <Text style={styles.bikeName}>
                    {bike.brand_name && bike.model_name
                      ? `${bike.brand_name} ${bike.model_name}`
                      : bike.name}
                  </Text>
                  {bike.primary && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>Primary</Text>
                    </View>
                  )}
                </View>
                {bike.activitiesCount > 0 && (
                  <Text style={styles.bikeActivities}>{bike.activitiesCount} rides</Text>
                )}
              </View>
              <Text style={styles.bikeDistance}>
                <Text style={styles.bikeDistanceLabel}>ODO: </Text>
                {bike.distanceKm.toLocaleString()} km
              </Text>
            </View>
          ))}
          
          {bikes.length > 1 && (
            <TouchableOpacity
              style={styles.showAllBtn}
              onPress={() => setShowAllBikes(!showAllBikes)}
            >
              <Text style={styles.showAllBtnText}>
                {showAllBikes ? 'Show less' : `See all bikes (${bikes.length})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Bike Garage Title */}
      <View style={styles.garageHeader}>
        <Text style={styles.garageTitle}>Bike garage</Text>
      </View>

      {/* Bike Garage Images */}
      <View style={styles.garageGrid}>
        {/* Left Column (2 images) */}
        <View style={styles.garageLeft}>
          <View style={styles.garageImageBox}>
            {(() => {
              const url = getImageUrl('left-top');
              console.log('🎨 Rendering left-top, url:', url, 'truthy:', !!url);
              
              if (!url) {
                console.log('⚠️ No URL for left-top, showing placeholder');
                return <Text style={styles.garageImagePlaceholder}>No image</Text>;
              }
              
              console.log('📸 About to render Image for left-top');
              return (
                <Image
                  source={{uri: url}}
                  style={styles.garageImage}
                  resizeMode="cover"
                  onError={(error) => {
                    console.error('❌ Image load error (left-top)');
                    console.error('Error details:', JSON.stringify(error.nativeEvent, null, 2));
                    console.error('URL that failed:', url);
                  }}
                  onLoad={() => console.log('✅ Image loaded (left-top)')}
                  onLoadStart={() => console.log('🔄 Loading started (left-top)')}
                  onLoadEnd={() => console.log('🏁 Loading ended (left-top)')}
                />
              );
            })()}
          </View>
          <View style={styles.garageImageBox}>
            {(() => {
              const url = getImageUrl('left-bottom');
              return url ? (
                <Image
                  source={{uri: url}}
                  style={styles.garageImage}
                  resizeMode="cover"
                  onError={(error) => {
                    console.error('❌ Image load error (left-bottom)');
                    console.error('Error:', error.nativeEvent?.error);
                  }}
                  onLoad={() => console.log('✅ Image loaded (left-bottom)')}
                  onLoadStart={() => console.log('🔄 Loading started (left-bottom)')}
                  onLoadEnd={() => console.log('🏁 Loading ended (left-bottom)')}
                />
              ) : (
                <Text style={styles.garageImagePlaceholder}>No image</Text>
              );
            })()}
          </View>
        </View>

        {/* Right Column (1 large image) */}
        <View style={styles.garageRight}>
          <View style={[styles.garageImageBox, styles.garageImageBoxLarge]}>
            {(() => {
              const url = getImageUrl('right');
              return url ? (
                <Image
                  source={{uri: url}}
                  style={styles.garageImage}
                  resizeMode="cover"
                  onError={(error) => {
                    console.error('❌ Image load error (right)');
                    console.error('Error:', error.nativeEvent?.error);
                  }}
                  onLoad={() => console.log('✅ Image loaded (right)')}
                  onLoadStart={() => console.log('🔄 Loading started (right)')}
                  onLoadEnd={() => console.log('🏁 Loading ended (right)')}
                />
              ) : (
                <Text style={styles.garageImagePlaceholder}>No image</Text>
              );
            })()}
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    marginBottom: 39
  },
  scrollContent: {
    paddingBottom: 40
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
    height: 550,
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
    backgroundColor: 'rgba(13, 13, 13, 0.45)', // Легкий overlay для читаемости текста
    zIndex: 1,
  },
  heroContent: {
    flex: 1,
    padding: 20,
    paddingTop: 60,
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
    zIndex: -1,
    
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
      fontWeight: 'bold',
      color: '#fff',
      marginBottom: 12,
    },
    heroDate: {
      fontSize: 10,
      fontWeight: '500',
      color: '#aaa',
      marginBottom: 4,
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
    fontSize: 35,
    fontWeight: '800',
    color: '#fff'
  },
  bikesSection: {
    padding: 24,
    paddingHorizontal: 16,
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
    fontSize: 14,
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
    fontSize: 9,
    color: '#fff',
    fontWeight: '600'
  },
  bikeActivities: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666'
  },
  bikeDistance: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '800'
  },
  bikeDistanceLabel: {
    fontWeight: '800',
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
  garageTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a'
  },
  garageGrid: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    gap: 0,
    
  },
  garageLeft: {
    flex: 1,
    gap: 0
  },
  garageRight: {
    flex: 1
  },
  garageImageBox: {
    height: 156,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  
  },
  garageImageBoxLarge: {
    height: 312 // 150 + 12 + 150 (matching left column total height)
  },
  garageImage: {
    width: '100%',
    height: '100%'
  },
  garageImagePlaceholder: {
    color: '#666',
    fontSize: 13
  },
  analyzeButton: {
    
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 24,
    shadowColor: '#274dd3',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 6
  },
  analyzeButtonText: {
    color: '#6184FF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5
  }
});

