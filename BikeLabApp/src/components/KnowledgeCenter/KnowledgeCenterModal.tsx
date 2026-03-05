import React, {useState, useEffect, useRef, useMemo} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Dimensions,
} from 'react-native';
import {KNOWLEDGE_TOPICS, KNOWLEDGE_CATEGORIES} from './topics';

const {width: SCREEN_WIDTH} = Dimensions.get('window');
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
  const [activeTopic, setActiveTopic] = useState(
    KNOWLEDGE_TOPICS[0]?.id ?? '',
  );
  const contentScrollRef = useRef<ScrollView>(null);
  const sidebarScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible && initialTopic) {
      const exists = KNOWLEDGE_TOPICS.some(t => t.id === initialTopic);
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
    for (const cat of KNOWLEDGE_CATEGORIES) {
      map[cat] = KNOWLEDGE_TOPICS.filter(t => t.category === cat);
    }
    return map;
  }, []);

  const currentTopic = KNOWLEDGE_TOPICS.find(t => t.id === activeTopic);

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
            {KNOWLEDGE_CATEGORIES.map(category => (
              <View key={category} style={styles.sidebarGroup}>
                <Text style={styles.sidebarCategory}>{category}</Text>
                {topicsByCategory[category]?.map(topic => {
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
                        {topic.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <View style={{height: 40}} />
          </ScrollView>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Content */}
          <ScrollView
            ref={contentScrollRef}
            style={styles.content}
            contentContainerStyle={styles.contentInner}
            showsVerticalScrollIndicator={false}>
            {currentTopic && (
              <>
                <Text style={styles.contentCategory}>
                  {currentTopic.category}
                </Text>
                <Text style={styles.contentTitle}>{currentTopic.title}</Text>
                <View style={styles.contentDivider} />
                {currentTopic.content.split('\n').map((line, i) => {
                  const trimmed = line.trim();
                  if (!trimmed) return <View key={i} style={{height: 12}} />;
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
              </>
            )}
            <View style={{height: 60}} />
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  closeButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#274dd3',
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: '#0d0d0d',
    paddingTop: 12,
  },
  sidebarGroup: {
    marginBottom: 8,
  },
  sidebarCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#555',
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
    backgroundColor: 'rgba(39,77,211,0.12)',
    borderLeftColor: '#274dd3',
  },
  sidebarItemText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#888',
    lineHeight: 16,
  },
  sidebarItemTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  divider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: {
   width: SCREEN_WIDTH - SIDEBAR_WIDTH,
    backgroundColor: '#151515',
  },
  contentInner: {
    padding: 20,
  },
  contentCategory: {
    fontSize: 11,
    fontWeight: '700',
    color: '#274dd3',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contentTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
  },
  contentDivider: {
    height: 2,
    backgroundColor: 'rgba(39,77,211,0.3)',
    borderRadius: 1,
    marginBottom: 16,
  },
  contentParagraph: {
    fontSize: 14,
    lineHeight: 22,
    color: '#ccc',
    marginBottom: 8,
  },
  contentBullet: {
    fontSize: 14,
    lineHeight: 22,
    color: '#bbb',
    paddingLeft: 8,
    marginBottom: 4,
  },
});
