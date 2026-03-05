import React, {useState, useEffect, useCallback, useRef} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Animated,
} from 'react-native';
import Video from 'react-native-video';
import {BlurView} from '@react-native-community/blur';
import {MetaGoalCard} from '../components/MetaGoalCard';
import {MetaGoal} from '../utils/goalsCache';
import {Activity} from '../types/activity';
import {apiFetch} from '../utils/api';

const {width: screenWidth, height: screenHeight} = Dimensions.get('window');
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export const GoalAssistantScreen: React.FC<{navigation: any; route?: any}> = ({navigation, route}) => {
  const {t} = useTranslation();
  const [metaGoals, setMetaGoals] = useState<MetaGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [goalInput, setGoalInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [inputFocused, setInputFocused] = useState(false);

  const blurOpacity = useRef(new Animated.Value(1)).current;
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const expandAnim = useRef(new Animated.Value(0)).current;

  const isExpanded = inputFocused || goalInput.length > 0;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [isExpanded]);

  const heroHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [380, screenHeight * 0.5],
  });

  const inputHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [48, 100],
  });

  const inputBorderRadius = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [100, 20],
  });

  const inputWrapperTop = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
  });

  const templatesTop = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 12],
  });

  useEffect(() => {
    if (generating) {
      Animated.parallel([
        Animated.timing(blurOpacity, {
          toValue: 3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(blurOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(contentOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [generating]);

  // Автоматическое заполнение prompt'а из параметров навигации
  useEffect(() => {
    if (route?.params?.initialPrompt) {
      console.log('🎯 Setting initial prompt:', route.params.initialPrompt);
      setGoalInput(route.params.initialPrompt);
      // Очищаем параметр после использования
      navigation.setParams({initialPrompt: undefined});
    }
  }, [route?.params?.initialPrompt]);

  useEffect(() => {
    loadMetaGoals();
    loadActivities();
  }, []);

  const loadMetaGoals = async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      const data = await apiFetch('/api/meta-goals');
      setMetaGoals(data || []);
    } catch (e) {
      console.error('Error loading meta goals:', e);
      setError(t('goals.failedLoad'));
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadActivities = async () => {
    try {
      const data = await apiFetch('/api/activities');
      setActivities(data || []);
    } catch (e) {
      console.error('Error loading activities:', e);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadMetaGoals(true), loadActivities()]);
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Client-side relevance check
  const isRelevantToCycling = (text: string): boolean => {
    const lowerText = text.toLowerCase();

    const cyclingKeywords = [
      'bike', 'cycling', 'ride', 'fondo', 'км', 'km', 'distance', 'велосипед',
      'ftp', 'vo2', 'power', 'watts', 'cadence', 'speed', 'climb', 'elevation',
      'hill', 'training', 'workout', 'endurance', 'fitness', 'race', 'event',
      'competition', 'gran fondo', 'century', 'brevet', 'sportive', 'pedal',
      'грандфондо', 'тренировка', 'заезд', 'гонка', 'выносливость', 'дистанция',
      'подъем', 'спуск', 'heart rate', 'hr', 'pulse', 'пульс', 'tempo', 'interval',
      'recovery', 'base', 'threshold', 'zone', 'improve', 'prepare', 'build'
    ];

    const irrelevantKeywords = [
      'cook', 'recipe', 'food', 'meal', 'пельмени', 'готовить', 'рецепт', 'еда',
      'program', 'code', 'python', 'javascript', 'программ', 'сайт',
      'movie', 'film', 'book', 'music', 'фильм', 'книга', 'музыка',
      'weather', 'погода', 'news', 'новости', 'варить', 'жарить'
    ];

    const hasIrrelevant = irrelevantKeywords.some(keyword => lowerText.includes(keyword));
    if (hasIrrelevant) return false;

    const hasKeyword = cyclingKeywords.some(keyword => lowerText.includes(keyword));
    return hasKeyword;
  };

  const handleGenerateGoal = async () => {
    if (!goalInput.trim()) {
      setError(t('goals.describeGoal'));
      return;
    }

    // Client-side validation
    if (!isRelevantToCycling(goalInput)) {
      setError(t('goals.notCycling'));
      return;
    }

    try {
      setGenerating(true);
      setError(null);

      const result = await apiFetch('/api/meta-goals/ai-generate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          userGoalDescription: goalInput
        })
      });

      console.log('✅ Goal generated:', result);

      // Clear input
      setGoalInput('');

      // Reload meta-goals
      await loadMetaGoals();

      // Navigate to goal details
      if (result.metaGoal && result.metaGoal.id) {
        navigation.navigate('GoalDetails', {goalId: result.metaGoal.id});
      }
    } catch (e: any) {
      console.error('Error generating goal:', e);
      setError(e.message || t('goals.failedGenerate'));
    } finally {
      setGenerating(false);
    }
  };

  const handleQuickTemplate = (template: string) => {
    setGoalInput(template);
  };

  const quickTemplates = [
    {label: t('goals.templateDistance'), text: t('goals.templateDistanceText')},
    {label: t('goals.templateFondo'), text: t('goals.templateFondoText')},
    {label: t('goals.templateFTP'), text: t('goals.templateFTPText')},
    {label: t('goals.templateBase'), text: t('goals.templateBaseText')}
  ];

  const filteredGoals = metaGoals.filter(mg => mg.status === activeTab);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <FlatList
        data={filteredGoals}
        keyExtractor={item => item.id.toString()}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#fff"
            colors={['#274dd3']}
          />
        }
        ListHeaderComponent={
          <>
            {/* Hero Section */}
            <Animated.View style={[styles.hero, {height: heroHeight}]}>
              {/* Video Background */}
              <Video
                source={require('../assets/img/blob.mp4')}
                style={styles.videoBackground}
                repeat
                resizeMode="cover"
                muted
                playInBackground={false}
                playWhenInactive={false}
              />

              {/* Blur Overlay — fades out when generating */}
              <Animated.View style={[StyleSheet.absoluteFill, {opacity: blurOpacity}]}>
                <BlurView
                  blurType="dark"
                  blurAmount={10}
                  style={StyleSheet.absoluteFill}
                  reducedTransparencyFallbackColor="rgba(10, 10, 10, 0.65)"
                />
              </Animated.View>

              {/* Content — fades out when generating */}
              <Animated.View style={[styles.heroContent, {opacity: contentOpacity}]} pointerEvents={generating ? 'none' : 'auto'}>
                <Text style={styles.heroTitle}>{t('goals.title')}</Text>
                <Text style={styles.heroSubtitle}>
                  {t('goals.subtitle')}
                </Text>

                {/* AI Input */}
                <Animated.View style={[styles.inputWrapper, {top: inputWrapperTop}]}>
                  <AnimatedTextInput
                    style={[styles.input, isExpanded && styles.inputFocused, {height: inputHeight, borderRadius: 24}]}
                    placeholder={t('goals.placeholder')}
                    placeholderTextColor="#666"
                    value={goalInput}
                    onChangeText={(text: string) => {
                      setGoalInput(text);
                      if (error) setError(null);
                    }}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    multiline
                    numberOfLines={1}
                  />
                  <TouchableOpacity
                    style={[
                      styles.submitBtn,
                      (!goalInput.trim() || generating) && styles.submitBtnDisabled
                    ]}
                    onPress={handleGenerateGoal}
                    disabled={!goalInput.trim() || generating}
                  >
                    <Text style={styles.submitBtnText}>→</Text>
                  </TouchableOpacity>
                </Animated.View>

                {error && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                )}

                {/* Quick Templates */}
                <Animated.View style={{top: templatesTop}}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.templatesContainer}
                >
                  <Text style={styles.templatesLabel}>{t('goals.quickTemplates')}</Text>
                  {quickTemplates.map((template, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.templateBtn}
                      onPress={() => handleQuickTemplate(template.text)}
                      disabled={generating}
                    >
                      <Text style={styles.templateBtnText}>{template.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                </Animated.View>
              </Animated.View>
            </Animated.View>

            {/* Tabs */}
            <View style={styles.tabsContainer}>
              <Text style={styles.sectionTitle}>{t('goals.personalizedGoals')}</Text>
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'active' && styles.tabActive]}
                  onPress={() => setActiveTab('active')}
                >
                  <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
                    {t('goals.active')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
                  onPress={() => setActiveTab('completed')}
                >
                  <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
                    {t('goals.completed')}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        }
        renderItem={({item}) => (
          <MetaGoalCard
            metaGoal={item}
            activities={activities}
            onPress={() => {
              navigation.navigate('GoalDetails', {goalId: item.id});
            }}
            onStatusChange={loadMetaGoals}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#274dd3" />
              <Text style={styles.loadingText}>{t('goals.loadingGoals')}</Text>
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🎯</Text>
              <Text style={styles.emptyTitle}>{activeTab === 'active' ? t('goals.noActiveGoals') : t('goals.noCompletedGoals')}</Text>
              <Text style={styles.emptyText}>
                {activeTab === 'active'
                  ? t('goals.noActiveGoalsHint')
                  : t('goals.noCompletedGoalsHint')}
              </Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: 80,
  },
  hero: {
    height: 355,
    position: 'relative',
    overflow: 'hidden'
  },
  videoBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%'
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)'
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 0,
    zIndex: 10,
    paddingTop: 64,
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    textTransform: 'uppercase',
    textAlign: 'center',
    opacity: 1,
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  heroSubtitle: {
    fontSize: 13,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 24,
    opacity: 0.6,
    lineHeight: 18,
    paddingHorizontal: 40,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom:64,
    marginTop: 12,
    paddingHorizontal: 12,
    position: 'relative',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 11, 0.55)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 14,
    color: '#fff',
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(215, 215, 215, 0.2)',
    height: 48,
    minHeight: 48,
    textAlignVertical: 'center',
  },
  inputFocused: {
    textAlignVertical: 'top'
    
  },
  submitBtn: {
    backgroundColor: '#274dd3',
    width: 48,
    height: 48,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center'
  },
  submitBtnDisabled: {
    backgroundColor: '#333',
    opacity: 0.5
  },
  submitBtnText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold'
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  errorText: {
    color: '#ef4444',
    fontSize: 14,
    textAlign: 'center'
  },
  templatesContainer: {
    position:'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 0,
    paddingLeft: 12,
    marginTop: 0,
  },
  templatesLabel: {
    color: '#888',
    fontSize: 10,
    marginRight: 8
  },
  templateBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  templateBtnText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '500'
  },
  tabsContainer: {
    padding: 16,
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 0.1,
    fontWeight: '900',
    opacity: 0.2,
    color: '#1a1a1a',
    textTransform: 'uppercase',
    marginBottom: 0,
    marginTop: 16,
  },
  tabs: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 4
  },
  tab: {
   
    paddingVertical: 0,
    alignItems: 'center',
    marginRight: 8
  },
  tabActive: {
    color: '#274dd3',
    borderRadius: 100,
  },
  tabText: {
    fontSize: 24,
    textTransform: 'uppercase',
    fontWeight: '800',
    color: 'rgba(0, 0, 0, 0.2)',
  },
  tabTextActive: {
    color: '#191b20',
    fontWeight: '800',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center'
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 14
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center'
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8
  },
  emptyText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20
  }
});

