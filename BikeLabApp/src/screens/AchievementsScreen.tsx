import React, {useState, useEffect} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Modal,
  FlatList,
  Image,
  useWindowDimensions,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {AchievementCard, AchievementMiniCard, type Achievement} from '../components/achievements';
import {useAchievements} from '../data/hooks/useAchievements';
import {useEvaluateAchievements, type EvaluateAchievementsResult} from '../data/hooks/useEvaluateAchievements';
import {makeStyles, useTheme, withOpacity} from '../theme';

type NewlyUnlocked = NonNullable<EvaluateAchievementsResult['newly_unlocked']>[number];

// ── Main Component ──────────────────────────────────────

export const AchievementsScreen: React.FC = () => {
  const {t} = useTranslation();
  const navigation = useNavigation();
  const theme = useTheme();

  const CATEGORY_LABELS: Record<string, string> = {
    climbing: t('achievements.climbing'),
    distance: t('achievements.distance'),
    speed: t('achievements.speed'),
    power: t('achievements.power'),
    cadence: t('achievements.cadence'),
    effort: t('achievements.effort'),
    consistency: t('achievements.consistency'),
    tempo_attack: t('achievements.tempoAttack'),
    focus: t('achievements.focus'),
  };

  // T-5.1/A-17/A-34 (docs/audit/layers/02-bikelabapp.md): this screen used to
  // own its own loading/refreshing useState around a manual
  // apiFetch('/api/achievements/me') — now it reads the shared
  // useAchievements() query/cache entry. Evaluation itself
  // (POST /api/achievements/evaluate) now runs server-side on new
  // activities, not on every screen mount — pull-to-refresh below still
  // evaluates explicitly, since that's a deliberate user action, not a mount.
  const achievementsQuery = useAchievements();
  const evaluateMutation = useEvaluateAchievements();
  const achievements = achievementsQuery.data?.achievements ?? [];
  const stats = achievementsQuery.data?.stats ?? null;
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [newlyUnlocked, setNewlyUnlocked] = useState<NewlyUnlocked[]>([]);
  const [showUnlockModal, setShowUnlockModal] = useState(false);

  const onRefresh = async () => {
    const result = await evaluateMutation.mutateAsync();
    if (result.newly_unlocked && result.newly_unlocked.length > 0) {
      setNewlyUnlocked(result.newly_unlocked);
      setShowUnlockModal(true);
    }
  };

  // Recent unlocked achievements (top 6)
  const recentUnlocked = achievements
    .filter((a: Achievement) => a.unlocked)
    .sort(
      (a: Achievement, b: Achievement) =>
        new Date(b.unlocked_at || 0).getTime() - new Date(a.unlocked_at || 0).getTime(),
    )
    .slice(0, 6);

  // Filter achievements
  const filteredAchievements = selectedCategory === 'all'
    ? achievements
    : achievements.filter((a: Achievement) => a.category === selectedCategory);

  // Group by category
  const groupedAchievements = filteredAchievements.reduce((acc: Record<string, Achievement[]>, a: Achievement) => {
    if (!acc[a.category]) acc[a.category] = [];
    acc[a.category].push(a);
    return acc;
  }, {} as Record<string, Achievement[]>);

  const categories = Object.keys(groupedAchievements).sort();

  // All categories for filter
  const allCategories = ['all', ...Array.from(new Set(achievements.map((a: Achievement) => a.category))).sort()];

  if (achievementsQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={evaluateMutation.isPending}
            onRefresh={onRefresh}
            tintColor={theme.colors.accent}
          />
        }>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('achievements.title')}</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Stats Card */}
        {stats ? <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.unlocked}</Text>
                <Text style={styles.statLabel}>{t('achievements.unlocked')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.total}</Text>
                <Text style={styles.statLabel}>{t('achievements.total')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.progress_pct}%</Text>
                <Text style={styles.statLabel}>{t('achievements.complete')}</Text>
              </View>
            </View>
            <View style={styles.overallProgressBar}>
              <View style={[styles.overallProgressFill, {width: `${stats.progress_pct}%`}]} />
            </View>
          </View> : null}

        {/* Recent Unlocked */}
        {recentUnlocked.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentTitle}>{t('achievements.recentlyUnlocked')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recentScroll}>
              {recentUnlocked.map((a: Achievement) => (
                <AchievementMiniCard key={a.id} achievement={a} />
              ))}
            </ScrollView>
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
                {cat === 'all' ? t('achievements.all') : CATEGORY_LABELS[cat] || cat}
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
                {groupedAchievements[category].filter((a: Achievement) => a.unlocked).length}/{groupedAchievements[category].length}
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

        <View style={styles.bottomSpacer} />
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
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
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
  }, [visible, scaleAnim]);

  if (!achievements.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.unlockModalContent,
            {width: screenWidth - 48, transform: [{scale: scaleAnim}]},
          ]}>
          <Text style={styles.unlockModalTitle}>
            {achievements.length > 1 ? t('achievements.achievementsUnlocked') : t('achievements.achievementUnlocked')}
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
            <Text style={styles.unlockCloseText}>{t('achievements.awesome')}</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
};

// ── Styles ──────────────────────────────────────────────

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surfaceLight,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceLight,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: theme.colors.surfaceLight,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: theme.colors.black,
    fontWeight: '300',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.black,
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
    color: theme.colors.black,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.text.muted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: theme.colors.borderLight,
  },
  overallProgressBar: {
    height: 6,
    backgroundColor: theme.colors.achievementsProgressTrack,
    borderRadius: 0,
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: theme.colors.disabled,
    borderRadius: 0,
  },

  // Recent Unlocked
  recentSection: {
    marginTop: 16,
    marginBottom: 8,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.black,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  recentScroll: {
    paddingHorizontal: 8,
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
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  categoryChipActive: {
    backgroundColor: theme.colors.black,
    borderColor: theme.colors.black,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },
  categoryChipTextActive: {
    color: theme.colors.text.inverse,
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
    color: theme.colors.black,
  },
  categorySectionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text.secondary,
  },

  bottomSpacer: {
    height: 100,
  },

  // Grid
  gridRow: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  // Unlock Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: withOpacity(theme.colors.black, 0.7),
    justifyContent: 'center',
    alignItems: 'center',
  },
  unlockModalContent: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    shadowColor: theme.colors.black,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  unlockModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.accent,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  unlockItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.divider,
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
    color: theme.colors.black,
  },
  unlockDescription: {
    fontSize: 12,
    color: theme.colors.text.secondary,
    marginTop: 2,
  },
  unlockCloseButton: {
    marginTop: 24,
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
  },
  unlockCloseText: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
}));
