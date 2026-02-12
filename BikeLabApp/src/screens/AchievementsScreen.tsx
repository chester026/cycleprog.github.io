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
import {useNavigation} from '@react-navigation/native';
import {apiFetch} from '../utils/api';
import {AchievementCard, type Achievement} from '../components/achievements';

// ── Types ───────────────────────────────────────────────

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
  tempo_attack: 'Tempo / Attack',
  focus: 'Focus',
};

// ── Helpers ─────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

// ── Main Component ──────────────────────────────────────

export const AchievementsScreen: React.FC = () => {
  const navigation = useNavigation();
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

// ── Unlock Modal ────────────────────────────────────────

// Medal images for UnlockModal
const MEDAL_IMAGES = {
  silver: require('../assets/img/achieve/silver.webp'),
  rare_steel: require('../assets/img/achieve/rare_steel.webp'),
  gold: require('../assets/img/achieve/gold.webp'),
};

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
    backgroundColor: '#ccc',
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
    backgroundColor: '#000',
    borderColor: '#000',
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
