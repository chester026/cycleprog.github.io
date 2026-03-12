import React, {useState, useEffect, useCallback} from 'react';
import {useTranslation} from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Platform,
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {apiFetch} from '../utils/api';
import {getDateLocale} from '../i18n/dateLocale';

interface Ride {
  id: number;
  title: string;
  location: string;
  location_link?: string;
  details?: string;
  start: string;
}

interface FormData {
  title: string;
  location: string;
  date: string;
  details: string;
}

export const PlannedRidesWidget: React.FC = () => {
  const {t} = useTranslation();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    location: '',
    date: '',
    details: '',
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const slideAnim = useState(new Animated.Value(400))[0];

  const loadRides = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/rides');
      const sorted = (data || []).sort(
        (a: Ride, b: Ride) => new Date(a.start).getTime() - new Date(b.start).getTime(),
      );
      setRides(sorted);
    } catch (err) {
      console.error('Error loading rides:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRides();
  }, [loadRides]);

  const deleteRide = (id: number) => {
    Alert.alert(t('plannedRides.deleteTitle'), t('plannedRides.deleteConfirm'), [
      {text: t('common.cancel'), style: 'cancel'},
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await apiFetch(`/api/rides/${id}`, {method: 'DELETE'});
            setRides(prev => prev.filter(r => r.id !== id));
          } catch (err) {
            console.error('Error deleting ride:', err);
          }
        },
      },
    ]);
  };

  const openModal = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setSelectedDate(tomorrow);
    setFormData({title: '', location: '', date: tomorrow.toISOString().split('T')[0], details: ''});
    setShowDatePicker(false);
    setModalVisible(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 20,
      stiffness: 200,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(slideAnim, {
      toValue: 400,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setModalVisible(false));
  };

  const handleSubmit = async () => {
    if (!formData.title.trim() || !formData.location.trim() || !formData.date.trim()) {
      Alert.alert(t('plannedRides.error'), t('plannedRides.fillRequired'));
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiFetch('/api/rides', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          title: formData.title,
          location: formData.location,
          details: formData.details,
          start: formData.date,
        }),
      });
      setRides(prev => {
        const updated = [response, ...prev];
        return updated.sort(
          (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
        );
      });
      closeModal();
    } catch (err) {
      Alert.alert(t('plannedRides.error'), t('plannedRides.addError'));
    } finally {
      setSubmitting(false);
    }
  };

  const formatRideDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(getDateLocale(), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  };

  const getDaysUntil = (dateStr: string) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <View style={s.section}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
        <ActivityIndicator size="small" color="#274dd3" style={{marginTop: 16}} />
      </View>
    );
  }

  return (
    <View style={s.section}>
      <View style={s.headerRow}>
        <Text style={s.sectionTitle}>{t('plannedRides.title')}</Text>
        <TouchableOpacity style={s.addBtn} onPress={openModal} activeOpacity={0.7}>
          <Text style={s.addBtnText}>+ {t('plannedRides.add')}</Text>
        </TouchableOpacity>
      </View>

      {rides.length === 0 ? (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>{t('plannedRides.empty')}</Text>
        </View>
      ) : (
        rides.map(ride => {
          const daysUntil = getDaysUntil(ride.start);
          const isPast = daysUntil < 0;
          return (
            <View key={ride.id} style={[s.rideCard, isPast && s.rideCardPast]}>
              <View style={s.rideCardLeft}>
                <View style={s.dateChip}>
                  <Text style={[s.dateChipText, isPast && s.dateChipTextPast]}>
                    {formatRideDate(ride.start)}
                  </Text>
                </View>
                {!isPast && (
                  <Text style={[s.daysUntil, daysUntil <= 3 && s.daysUntilSoon]}>
                    {daysUntil === 0
                      ? t('plannedRides.today')
                      : daysUntil === 1
                        ? t('plannedRides.tomorrow')
                        : `${daysUntil}d`}
                  </Text>
                )}
              </View>
              <View style={s.rideCardContent}>
                <Text style={[s.rideTitle, isPast && s.rideTitlePast]} numberOfLines={1}>
                  {ride.title}
                </Text>
                <Text style={s.rideLocation} numberOfLines={1}>
                  {ride.location}
                </Text>
                {ride.details ? (
                  <Text style={s.rideDetails} numberOfLines={2}>
                    {ride.details}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={s.deleteBtn}
                onPress={() => deleteRide(ride.id)}
                hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                <Text style={s.deleteBtnText}>×</Text>
              </TouchableOpacity>
            </View>
          );
        })
      )}

      {/* Add Ride Modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{flex: 1}}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={s.modalOverlay}>
            <Animated.View
              style={[s.modalContent, {transform: [{translateY: slideAnim}]}]}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
                <View style={s.modalHeader}>
                  <Text style={s.modalTitle}>{t('plannedRides.addRide')}</Text>
                  <TouchableOpacity onPress={closeModal}>
                    <Text style={s.modalClose}>×</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.formGroup}>
                  <Text style={s.formLabel}>{t('plannedRides.rideTitle')} *</Text>
                  <TextInput
                    style={s.formInput}
                    placeholder={t('plannedRides.titlePlaceholder')}
                    placeholderTextColor="#aaa"
                    value={formData.title}
                    onChangeText={v => setFormData(p => ({...p, title: v}))}
                  />
                </View>

                <View style={s.formGroup}>
                  <Text style={s.formLabel}>{t('plannedRides.location')} *</Text>
                  <TextInput
                    style={s.formInput}
                    placeholder={t('plannedRides.locationPlaceholder')}
                    placeholderTextColor="#aaa"
                    value={formData.location}
                    onChangeText={v => setFormData(p => ({...p, location: v}))}
                  />
                </View>

                <View style={s.formGroup}>
                  <Text style={s.formLabel}>{t('plannedRides.date')} *</Text>
                  <TouchableOpacity
                    style={s.datePickerBtn}
                    onPress={() => setShowDatePicker(true)}
                    activeOpacity={0.7}>
                    <Text style={s.datePickerText}>
                      {selectedDate.toLocaleDateString(getDateLocale(), {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={selectedDate}
                      mode="date"
                      display={Platform.OS === 'ios' ? 'inline' : 'default'}
                      minimumDate={new Date()}
                      onChange={(_event: any, date?: Date) => {
                        if (Platform.OS === 'android') setShowDatePicker(false);
                        if (date) {
                          setSelectedDate(date);
                          setFormData(p => ({...p, date: date.toISOString().split('T')[0]}));
                        }
                      }}
                      themeVariant="light"
                    />
                  )}
                </View>

                <View style={s.formGroup}>
                  <Text style={s.formLabel}>{t('plannedRides.description')}</Text>
                  <TextInput
                    style={[s.formInput, s.formTextarea]}
                    placeholder={t('plannedRides.descriptionPlaceholder')}
                    placeholderTextColor="#aaa"
                    multiline
                    numberOfLines={3}
                    value={formData.details}
                    onChangeText={v => setFormData(p => ({...p, details: v}))}
                  />
                </View>

                <View style={s.modalButtons}>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={closeModal}
                    disabled={submitting}>
                    <Text style={s.cancelBtnText}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.submitBtn}
                    onPress={handleSubmit}
                    disabled={submitting}>
                    <Text style={s.submitBtnText}>
                      {submitting ? t('plannedRides.adding') : t('plannedRides.addBtn')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const s = StyleSheet.create({
  section: {
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 55,
    fontWeight: '900',
    opacity: 0.15,
    textTransform: 'uppercase',
    color: '#1a1a1a',
  },
  addBtn: {
    backgroundColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addBtnText: {
    color: '#274dd3',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyState: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  rideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#f1f0f0',
    marginBottom: 8,
    gap: 16,
  },
  rideCardPast: {
    opacity: 0.45,
  },
  rideCardLeft: {
    alignItems: 'center',
    minWidth: 60,
    gap: 4,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
    paddingBottom: 4,
  },
  dateChip: {
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  dateChipTextPast: {
    color: '#999',
  },
  daysUntil: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
  },
  daysUntilSoon: {
    color: '#274dd3',
    fontWeight: '800',
  },
  rideCardContent: {
    flex: 1,
    gap: 2,

  },
  rideTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1a1a',
  },
  rideTitlePast: {
    color: '#999',
  },
  rideLocation: {
    fontSize: 13,
    color: '#666',
  },
  rideDetails: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 22,
    color: '#1a1a1a',
    fontWeight: '400',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 28,
    color: '#999',
    fontWeight: '300',
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  formInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1a1a1a',
  },
  formTextarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  datePickerBtn: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerText: {
    fontSize: 15,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  submitBtn: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#274dd3',
    borderRadius: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
