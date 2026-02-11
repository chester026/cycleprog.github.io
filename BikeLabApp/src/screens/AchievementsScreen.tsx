import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Modal,
  Dimensions,
  FlatList,
  Image,
} from 'react-native';
import {apiFetch} from '../utils/api';

// Medal images
const MEDAL_IMAGES = {
  silver: require('../assets/img/achieve/silver.webp'),
  rare_steel: require('../assets/img/achieve/rare_steel.webp'),
  gold: require('../assets/img/achieve/gold.webp'),
};

// ── Types ───────────────────────────────────────────────

interface Achievement {
  id: number;
  key: string;
  category: string;
  tier: string;
  name: string;
  description: string;
  icon: string;
  metric: string;
  threshold: number;
  condition_type: string;
  sort_order: number;
  current_value: number;
  unlocked: boolean;
  unlocked_at: string | null;
  trigger_activity_id: number | null;
  progress_pct: number;
}

interface AchievementStats {
  total: number;
  unlocked: number;
  progress_pct: number;
}

interface NewlyUnlocked {
  name: string;
  icon: string;
  tier: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  climbing: 'Climbing',
  distance: 'Distance',
  speed: 'Speed',
  power: 'Power',
  cadence: 'Cadence',
  effort: 'Effort',
  consistency: 'Consistency',
};

// ── Helpers ─────────────────────────────────────────────

function formatBadgeValue(threshold: number, metric: string): {value: string; unit: string} {
  if (metric === 'hr_intensity') {
    return {value: `${Math.round(threshold * 100)}`, unit: 'max HR'};
  }
  if (metric === 'hr_intensity_rides') {
    return {value: `${threshold}`, unit: 'rides'};
  }
  if (metric === 'weekly_streak') {
    return {value: `${threshold}`, unit: 'weeks'};
  }
  if (metric === 'total_distance' || metric === 'distance') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'km'};
    return {value: `${threshold}`, unit: 'km'};
  }
  if (metric === 'total_elevation_gain' || metric === 'elevation_gain') {
    if (threshold >= 1000) return {value: `${(threshold / 1000).toFixed(0)}k`, unit: 'meters'};
    return {value: `${threshold}`, unit: 'meters'};
  }
  if (metric === 'average_speed') {
    return {value: `${threshold}`, unit: 'km/h'};
  }
  if (metric === 'average_watts') {
    return {value: `${threshold}`, unit: 'watts'};
  }
  if (metric === 'average_cadence') {
    return {value: `${threshold}`, unit: 'rpm'};
  }
  return {value: `${threshold}`, unit: ''};
}

function formatProgressValue(value: number, metric: string): string {
  if (metric === 'hr_intensity') {
    return `${Math.round(value * 100)}%`;
  }
  if (metric === 'hr_intensity_rides' || metric === 'weekly_streak') {
    return `${Math.round(value)}`;
  }
  if (metric === 'total_distance' || metric === 'distance') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
  }
  if (metric === 'total_elevation_gain' || metric === 'elevation_gain') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;
  }
  if (metric === 'average_speed') {
    return `${value.toFixed(1)}`;
  }
  if (metric === 'average_watts' || metric === 'average_cadence') {
    return `${Math.round(value)}`;
  }
  return `${Math.round(value)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

// ── Main Component ──────────────────────────────────────

export const AchievementsScreen: React.FC<{navigation: any}> = ({navigation}) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newlyUnlocked, setNewlyUnlocked] = useState<NewlyUnlocked[]>([]);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  useEffect(() => {
    loadAchievements();
    // Автоматически проверяем новые ачивки при открытии экрана
    checkForNewAchievements();
  }, []);

  const checkForNewAchievements = async () => {
    try {
      const result = await apiFetch('/api/achievements/evaluate', {method: 'POST'});
      if (result.newly_unlocked && result.newly_unlocked.length > 0) {
        setNewlyUnlocked(result.newly_unlocked);
        setShowUnlockModal(true);
      }
    } catch (error) {
      console.error('Error checking new achievements:', error);
    }
  };

  const loadAchievements = async () => {
    try {
      const data = await apiFetch('/api/achievements/me');
      setAchievements(data.achievements);
      setStats(data.stats);
    } catch (error) {
      console.error('Error loading achievements:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Evaluate achievements on pull-to-refresh
      const result = await apiFetch('/api/achievements/evaluate', {method: 'POST'});
      if (result.newly_unlocked && result.newly_unlocked.length > 0) {
        setNewlyUnlocked(result.newly_unlocked);
        setShowUnlockModal(true);
      }
      // Reload to get updated progress
      await loadAchievements();
    } catch (error) {
      console.error('Error refreshing achievements:', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Filter achievements
  const filteredAchievements = selectedCategory === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === selectedCategory);

  // Group by category
  const groupedAchievements = filteredAchievements.reduce((acc, a) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {} as Record<string, Achievement[]>);

  const categories = Object.keys(groupedAchievements).sort();

  // All categories for filter
  const allCategories = ['all', ...Array.from(new Set(achievements.map(a => a.category))).sort()];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#274dd3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#274dd3" />
        }>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Achievements</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Stats Card */}
        {stats && (
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.unlocked}</Text>
                <Text style={styles.statLabel}>Unlocked</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.progress_pct}%</Text>
                <Text style={styles.statLabel}>Complete</Text>
              </View>
            </View>
            <View style={styles.overallProgressBar}>
              <View style={[styles.overallProgressFill, {width: `${stats.progress_pct}%`}]} />
            </View>
          </View>
        )}

        {/* Category Filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryFilter}
          contentContainerStyle={styles.categoryFilterContent}>
          {allCategories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                selectedCategory === cat && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(cat)}>
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === cat && styles.categoryChipTextActive,
                ]}>
                {cat === 'all' ? 'All' : CATEGORY_LABELS[cat] || cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Achievements by Category */}
        {categories.map(category => (
          <View key={category} style={styles.categorySection}>
            <View style={styles.categorySectionHeader}>
              <Text style={styles.categorySectionTitle}>{CATEGORY_LABELS[category] || category}</Text>
              <Text style={styles.categorySectionCount}>
                {groupedAchievements[category].filter(a => a.unlocked).length}/{groupedAchievements[category].length}
              </Text>
            </View>
            <FlatList
              data={groupedAchievements[category]}
              renderItem={({item}) => <AchievementCard achievement={item} />}
              keyExtractor={item => item.id.toString()}
              numColumns={3}
              scrollEnabled={false}
              columnWrapperStyle={styles.gridRow}
            />
          </View>
        ))}

        <View style={{height: 100}} />
      </ScrollView>

      {/* Unlock Modal */}
      <UnlockModal
        visible={showUnlockModal}
        achievements={newlyUnlocked}
        onClose={() => setShowUnlockModal(false)}
      />
    </View>
  );
};

// ── Achievement Card ────────────────────────────────────

const AchievementCard: React.FC<{achievement: Achievement}> = ({achievement}) => {
  const badge = formatBadgeValue(achievement.threshold, achievement.metric);
  const progressValue = formatProgressValue(achievement.current_value, achievement.metric);
  const progressPct = Math.min(100, achievement.progress_pct);
  const isUnlocked = achievement.unlocked;
  const tier = achievement.tier;

  // Tier-specific badge styles
  const getBadgeValueStyle = () => {
    if (!isUnlocked) return styles.badgeValueLocked;
    switch (tier) {
      case 'silver':
        return styles.badgeValueSilver;
      case 'rare_steel':
        return styles.badgeValueRareSteel;
      case 'gold':
        return styles.badgeValueGold;
      default:
        return styles.badgeValueSilver;
    }
  };

  const getBadgeUnitStyle = () => {
    if (!isUnlocked) return styles.badgeUnitLocked;
    switch (tier) {
      case 'silver':
        return styles.badgeUnitSilver;
      case 'rare_steel':
        return styles.badgeUnitRareSteel;
      case 'gold':
        return styles.badgeUnitGold;
      default:
        return styles.badgeUnitSilver;
    }
  };

  const getMedalImageStyle = () => {
    const base = !isUnlocked && styles.medalImageLocked;
    switch (tier) {
      case 'silver':
        return [styles.medalImageSilver, base];
      case 'rare_steel':
        return [styles.medalImageRareSteel, base];
      case 'gold':
        return [styles.medalImageGold, base];
      default:
        return [styles.medalImageSilver, base];
    }
  };

  return (
    <View style={styles.achievementCard}>
      {/* Medal with Badge */}
      <View style={styles.medalContainer}>
        <Image
          source={MEDAL_IMAGES[achievement.tier as keyof typeof MEDAL_IMAGES]}
          style={getMedalImageStyle()}
        />
        <View style={styles.badgeOverlay}>
          <Text style={getBadgeValueStyle()}>{badge.value}</Text>
          <Text style={getBadgeUnitStyle()}>{badge.unit}</Text>
        </View>
      </View>

      {/* Title & Description */}
      <Text style={[styles.achievementName, isUnlocked && styles.achievementNameUnlocked]}>
        {achievement.name}
      </Text>
      <Text style={styles.achievementDescription}>
        {achievement.description}
      </Text>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {width: `${progressPct}%`},
              isUnlocked && styles.progressFillUnlocked,
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {progressValue} / {badge.value}
        </Text>
      </View>
    </View>
  );
};

// ── Unlock Modal ────────────────────────────────────────

const UnlockModal: React.FC<{
  visible: boolean;
  achievements: NewlyUnlocked[];
  onClose: () => void;
}> = ({visible, achievements, onClose}) => {
  const scaleAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [visible]);

  if (!achievements.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.unlockModalContent, {transform: [{scale: scaleAnim}]}]}>
          <Text style={styles.unlockModalTitle}>
            Achievement{achievements.length > 1 ? 's' : ''} Unlocked!
          </Text>
          {achievements.map((a, i) => (
            <View key={i} style={styles.unlockItem}>
              <Image
                source={MEDAL_IMAGES[a.tier as keyof typeof MEDAL_IMAGES]}
                style={styles.unlockMedal}
              />
              <View style={styles.unlockInfo}>
                <Text style={styles.unlockName}>{a.name}</Text>
                <Text style={styles.unlockDescription}>{a.description}</Text>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.unlockCloseButton} onPress={onClose}>
            <Text style={styles.unlockCloseText}>Awesome!</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────

const {width: SCREEN_WIDTH} = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 3; // 3 columns with 16px padding + 8px gaps

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f8fa',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f8fa',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#f8f8fa',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: '#000',
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    letterSpacing: 0.5,
  },
  headerRight: {
    width: 40,
  },

  // Stats Card
  statsCard: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: 'transparent',
    borderRadius: 16,
    padding: 0,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    
    elevation: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#888',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#e0e0e0',
  },
  overallProgressBar: {
    height: 6,
    backgroundColor: '#e8e8e8',
    borderRadius: 0,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: '#274dd3',
    borderRadius: 0,
  },

  // Category Filter
  categoryFilter: {
    marginTop: 16,
    marginBottom: 8,
  },
  categoryFilterContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryChipActive: {
    backgroundColor: '#274dd3',
    borderColor: '#274dd3',
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#fff',
  },

  // Category Section
  categorySection: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  categorySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  categorySectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  categorySectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },

  // Grid
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // Achievement Card
  achievementCard: {
    width: CARD_WIDTH,
    minHeight: CARD_WIDTH + 40,
    backgroundColor: '#fff',
    padding: 10,
    paddingTop: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
   
  },

  // Medal
  medalContainer: {
    width: CARD_WIDTH - 4,
    height: CARD_WIDTH - 4,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  
  // Silver Medal
  medalImageSilver: {
    width: '82%',
    height: '82%',
    resizeMode: 'contain',
  },
  
  // Rare Steel Medal
  medalImageRareSteel: {
    width: '80%',
    height: '80%',
    resizeMode: 'contain',
  },
  
  // Gold Medal (самая большая)
  medalImageGold: {
    width: '120%',
    height: '120%',
    resizeMode: 'contain',
    position: 'relative',
    top: 16,
    left: 9,
  },
  
  medalImageLocked: {
    opacity: 0,
  },
  badgeOverlay: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    top: '50%',
    transform: [{translateY: -26}],
  },
  
  // Silver Badge
  badgeValueSilver: {
    fontSize: 26,
    fontWeight: '900',
    color: '#6A6A6A',
    paddingTop: 4,
    textShadowColor: 'rgba(255, 255, 255, 0.2)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },
  badgeUnitSilver: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6A6A6A',
    textTransform: 'uppercase',
    marginTop: -2,
    textShadowColor: 'rgba(255, 255, 255, 0.9)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },

  // Rare Steel Badge (белый текст)
  badgeValueRareSteel: {
    fontSize: 26,
    fontWeight: '900',
    color: '#F0F0F0',
    paddingTop: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },
  badgeUnitRareSteel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#F0F0F0',
    textTransform: 'uppercase',
    marginTop: -2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: {width: 0, height: 1},
    textShadowRadius: 3,
  },

  // Gold Badge (больше размер)
  badgeValueGold: {
    fontSize: 26,
    fontWeight: '900',
    color: '#41382D',
    marginTop: -2,
    textShadowColor: 'rgba(28, 28, 28, 0.1)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 4,
  },
  badgeUnitGold: {
    fontSize: 9,
    fontWeight: '800',
    color: '#41382D',
    textTransform: 'uppercase',
    marginTop: -3,
    textShadowColor: 'rgba(28, 28, 28, 0.2)',
    textShadowOffset: {width: 0, height: 0},
    textShadowRadius: 1,
  },

  // Locked Badge (общий для всех тиров)
  badgeValueLocked: {
    fontSize: 25,
    fontWeight: '900',
    paddingTop: 6,
    color: 'rgba(0, 0, 0, 0.1)',
  },
  badgeUnitLocked: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(0, 0, 0, 0.1)',
    textTransform: 'uppercase',
    marginTop: -2,
  },

  // Title & Description
  achievementName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
    textAlign: 'center',
  letterSpacing: 0.1,
    marginBottom: 4,
    lineHeight: 14,
    
  },
  achievementNameUnlocked: {
    color: '#000',
  },
  achievementDescription: {
    fontSize: 10,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 12,
  },

  // Progress
  progressSection: {
    width: '100%',
  },
  progressBar: {
    height: 5,
    backgroundColor: '#e8e8e8',
    borderRadius: 0,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#ccc',
    borderRadius: 0,
  },
  progressFillUnlocked: {
    backgroundColor: '#274dd3',
  },
  progressText: {
    fontSize: 9,
    color: '#999',
    textAlign: 'center',
    fontWeight: '600',
  },

  // Unlock Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockModalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    width: SCREEN_WIDTH - 48,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  unlockModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#274dd3',
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  unlockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  unlockMedal: {
    width: 50,
    height: 50,
    marginRight: 14,
    resizeMode: 'contain',
  },
  unlockInfo: {
    flex: 1,
  },
  unlockName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  unlockDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  unlockCloseButton: {
    marginTop: 24,
    backgroundColor: '#274dd3',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  unlockCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
