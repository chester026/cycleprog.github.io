import React, {useState, useEffect, useRef, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import {KNOWLEDGE_TOPICS, KNOWLEDGE_CATEGORY_KEYS} from './topics';
import {makeStyles, withOpacity} from '../../theme';

const SIDEBAR_WIDTH = 130;

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTopic?: string | null;
}

export const KnowledgeCenterModal: React.FC<Props> = ({
  visible,
  onClose,
  initialTopic,
}) => {
  const {t} = useTranslation();
  const {width: screenWidth} = useWindowDimensions();
  const [activeTopic, setActiveTopic] = useState(
    KNOWLEDGE_TOPICS[0]?.id ?? '',
  );
  const contentScrollRef = useRef<ScrollView>(null);
  const sidebarScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && initialTopic) {
      const exists = KNOWLEDGE_TOPICS.some(topic => topic.id === initialTopic);
      if (exists) {
        setActiveTopic(initialTopic);
      }
    }
  }, [visible, initialTopic]);

  useEffect(() => {
    if (visible) {
      contentScrollRef.current?.scrollTo({y: 0, animated: false});
    }
  }, [activeTopic, visible]);

  const topicsByCategory = useMemo(() => {
    const map: Record<string, typeof KNOWLEDGE_TOPICS> = {};
    for (const categoryKey of KNOWLEDGE_CATEGORY_KEYS) {
      map[categoryKey] = KNOWLEDGE_TOPICS.filter(topic => topic.categoryKey === categoryKey);
    }
    return map;
  }, []);

  const currentTopic = KNOWLEDGE_TOPICS.find(topic => topic.id === activeTopic);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('knowledgeCenter.title')}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>

        {/* Body */}
        <View style={styles.body}>
          {/* Sidebar */}
          <ScrollView
            ref={sidebarScrollRef}
            style={styles.sidebar}
            showsVerticalScrollIndicator={false}>
            {KNOWLEDGE_CATEGORY_KEYS.map(categoryKey => (
              <View key={categoryKey} style={styles.sidebarGroup}>
                <Text style={styles.sidebarCategory}>
                  {t(`knowledgeCenter.categories.${categoryKey}`)}
                </Text>
                {topicsByCategory[categoryKey]?.map(topic => {
                  const isActive = topic.id === activeTopic;
                  return (
                    <TouchableOpacity
                      key={topic.id}
                      style={[
                        styles.sidebarItem,
                        isActive && styles.sidebarItemActive,
                      ]}
                      onPress={() => setActiveTopic(topic.id)}>
                      <Text
                        style={[
                          styles.sidebarItemText,
                          isActive && styles.sidebarItemTextActive,
                        ]}
                        numberOfLines={2}>
                        {t(`knowledgeCenter.topics.${topic.id}.title`)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={styles.sidebarSpacer} />
          </ScrollView>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Content */}
          <ScrollView
            ref={contentScrollRef}
            style={[styles.content, {width: screenWidth - SIDEBAR_WIDTH}]}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}>
            {currentTopic ? <>
                <Text style={styles.contentCategory}>
                  {t(`knowledgeCenter.categories.${currentTopic.categoryKey}`)}
                </Text>
                <Text style={styles.contentTitle}>
                  {t(`knowledgeCenter.topics.${currentTopic.id}.title`)}
                </Text>
                <View style={styles.contentDivider} />
                {t(`knowledgeCenter.topics.${currentTopic.id}.content`)
                  .split('\n')
                  .map((line: string, i: number) => {
                    const trimmed = line.trim();
                    if (!trimmed) return <View key={i} style={styles.blankLine} />;
                    if (trimmed.startsWith('•')) {
                      return (
                        <Text key={i} style={styles.contentBullet}>
                          {trimmed}
                        </Text>
                      );
                    }
                    return (
                      <Text key={i} style={styles.contentParagraph}>
                        {trimmed}
                      </Text>
                    );
                  })}
              </> : null}
            <View style={styles.contentSpacer} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = makeStyles(theme => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.knowledgeCenter.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: withOpacity(theme.colors.text.inverse, 0.08),
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text.inverse,
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.accent,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: theme.colors.knowledgeCenter.sidebarBg,
    paddingTop: 12,
  },
  sidebarGroup: {
    marginBottom: 8,
  },
  sidebarCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.colors.activityDetails.mutedText,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sidebarItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  sidebarItemActive: {
    backgroundColor: withOpacity(theme.colors.accent, 0.12),
    borderLeftColor: theme.colors.accent,
  },
  sidebarItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: theme.colors.text.muted,
    lineHeight: 16,
  },
  sidebarItemTextActive: {
    color: theme.colors.text.inverse,
    fontWeight: '600',
  },
  divider: {
    width: 1,
    backgroundColor: withOpacity(theme.colors.text.inverse, 0.06),
  },
  content: {
    backgroundColor: theme.colors.knowledgeCenter.contentBg,
  },
  contentInner: {
    padding: 20,
  },
  contentCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contentTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text.inverse,
    marginBottom: 12,
  },
  contentDivider: {
    height: 2,
    backgroundColor: withOpacity(theme.colors.accent, 0.3),
    borderRadius: 1,
    marginBottom: 16,
  },
  contentParagraph: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.disabled,
    marginBottom: 8,
  },
  contentBullet: {
    fontSize: 14,
    lineHeight: 22,
    color: theme.colors.knowledgeCenter.bulletText,
    paddingLeft: 8,
    marginBottom: 4,
  },
  sidebarSpacer: {height: 40},
  blankLine: {height: 12},
  contentSpacer: {height: 60},
}));
