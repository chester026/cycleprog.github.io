import React, {useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity} from 'react-native';
import {BikesModal} from './BikesModal';

interface Bike {
  id: string;
  name: string;
  brand_name?: string;
  model_name?: string;
  primary: boolean;
  distanceKm: number;
  activitiesCount: number;
}

interface BikesWidgetProps {
  bikes: Bike[];
}

export const BikesWidget: React.FC<BikesWidgetProps> = ({bikes}) => {
  const [modalVisible, setModalVisible] = useState(false);

  if (bikes.length === 0) {
    return null;
  }

  // Находим primary bike
  const primaryBike = bikes.find(b => b.primary) || bikes[0];

  return (
    <View style={styles.container}>
      {/* Primary bike */}
      <View style={styles.bikeInfoContainer}>
        <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>Primary</Text>
        </View>

        <Text style={styles.bikeName}>
            {primaryBike.brand_name && primaryBike.model_name
            ? `${primaryBike.brand_name} ${primaryBike.model_name}`
            : primaryBike.name}
        </Text>
      </View>
      

      

      <View style={styles.distanceContainer}>
            {primaryBike.activitiesCount > 0 && (
                <Text style={styles.bikeActivities}>
                {primaryBike.activitiesCount} rides
                </Text>
            )}
        <View style={styles.distanceValueContainer}>
            <Text style={styles.distanceValue}>
            {primaryBike.distanceKm.toLocaleString()}
            </Text>
            <Text style={styles.distanceUnit}>km</Text>
        </View>
        
       
      </View>

      {/* See all bikes button */}
      {bikes.length > 1 && (
        <TouchableOpacity
          style={styles.seeAllBtn}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.seeAllText}>
            See all bikes →
          </Text>
        </TouchableOpacity>
      )}

      {/* Bikes Modal */}
      <BikesModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        bikes={bikes}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 220,
    height: 270,
    backgroundColor: '#F1F0F0',
    padding: 16,
    paddingVertical: 20,
    marginRight: 8,
    position: 'relative',
    justifyContent: 'space-between',
   
  },
  primaryBadge: {
    backgroundColor: '#274dd3',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 12,
  },
  primaryBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  bikeName: {
    fontSize: 25,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 4,
    lineHeight: 32,
  },
  bikeActivities: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
    fontWeight: '700',
  },
  bikeInfoContainer: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  distanceContainer: {
    flexDirection: 'column',
    alignItems: 'baseline',
    marginBottom: 0,
    justifyContent: 'space-between',
  },
  distanceValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  distanceValue: {
    fontSize: 29,
    fontWeight: '900',
    color: '#1a1a1a',
    letterSpacing: -1.5,
  },
  distanceUnit: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    marginLeft: 4,
  },
  seeAllBtn: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4169E1',
  },
});
