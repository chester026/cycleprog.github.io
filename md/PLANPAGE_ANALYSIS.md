# PlanPage - Comprehensive Analysis

## Overview
PlanPage is the main analytics and planning page of the cycling application. It provides comprehensive analysis of user's cycling activities, personal goals tracking, and professional recommendations.

## File Location
`react-spa/src/pages/PlanPage.jsx` (1648 lines)

## Main Components Structure

### 1. Hero Banner Section
**Location**: Lines 1120-1180
- **Background**: Dynamic hero image from user's activities or default image
- **Title**: "Analysis and Recommendations"
- **Period Display**: Shows current analysis period (start - end dates)
- **Progress Cards**: 4 key metrics displayed as cards:
  - **Workouts**: Progress percentage (rides/12)
  - **Volume**: Distance progress (km/400)
  - **Long Rides**: Count progress (longRides/4)
  - **VO₂max**: Current VO₂max value

### 2. Progress Chart
**Location**: Lines 1182-1185
- **Component**: `ProgressChart`
- **Data**: `periodSummary` - 4-week period summaries
- **Purpose**: Visual representation of progress over time

### 3. Personal Goals Section
**Location**: Lines 1190-1350
- **Component**: `GoalsManager` (when expanded)
- **Toggle**: "Manage Goals" / "Hide Goals" button
- **Goals Grid**: Display of current goals with progress bars
- **Goal Types Supported**:
  - `ftp_vo2max`: FTP/VO₂max goals with special visualization
  - `distance`: Distance goals (km)
  - `time`: Time goals (hours)
  - `elevation`: Elevation gain goals (m)
  - `speed_flat`: Flat speed goals (km/h)
  - `speed_hills`: Hill speed goals (km/h)
  - `pulse`: Average heart rate goals (bpm)
  - `avg_hr_flat`: Average HR on flat (bpm)
  - `avg_hr_hills`: Average HR on hills (bpm)
  - `long_rides`: Long ride count goals
  - `intervals`: Interval workout count goals
  - `recovery`: Recovery ride count goals
  - `avg_power`: Average power goals (W)

### 4. Heart Rate Analysis Section
**Location**: Lines 1355-1380
- **Components**:
  - `HeartRateVsSpeedChart`: HR vs Speed correlation
  - `AverageHeartRateTrendChart`: HR trend over time
  - `MinMaxHeartRateBarChart`: Min/Max HR visualization
  - `HeartRateVsElevationChart`: HR vs Elevation correlation
  - `HeartRateZonesChart`: HR zones distribution

### 5. Power Analysis Section
**Location**: Lines 1382-1385
- **Component**: `PowerAnalysis`
- **Features**:
  - Power estimation using Strava formulas
  - Configurable rider/bike weight
  - Surface type selection
  - Power breakdown (gravity, rolling, aero)
  - Top activities by power
  - Detailed power analysis

### 6. Cadence Analysis Section
**Location**: Lines 1387-1400
- **Components**:
  - `CadenceStandardsAnalysis`: Professional cadence standards
  - `CadenceVsSpeedChart`: Cadence vs Speed correlation
  - `AverageCadenceTrendChart`: Cadence trend over time
  - `CadenceVsElevationChart`: Cadence vs Elevation correlation

### 7. VO₂max Calculator
**Location**: Lines 1402-1500
- **Automatic Calculation**: Based on last 4 weeks of Strava data
- **Manual Calculation**: User-input test data
- **Input Fields**:
  - Test time (minutes)
  - Test heart rate (bpm)
  - Weight (kg)
  - Age
  - Gender
- **Output**: VO₂max value in ml/kg/min with fitness level classification

### 8. Plan vs Fact Analysis
**Location**: Lines 1502-1580
- **Comparison Table**: Plan vs actual performance
- **Metrics**: Workouts, Volume, Long rides, Intervals
- **Progress**: Percentage completion for each metric

### 9. Recommendations Section
**Location**: Lines 1582-1648
- **Professional Comparison**: User data vs professional standards
- **Metrics Compared**:
  - Average speed on flat
  - Median pulse on flat
  - Volume for 4 weeks
  - Interval workouts
  - Long rides (>60km or >2.5h)
- **Professional Recommendations**: 8 key training principles

## Key Functions

### Data Management
- **`fetchActivities()`**: Loads user activities from API
- **`updateGoalsOnActivitiesChange()`**: Recalculates goals when activities change
- **`cleanupOldStreamsCache()`**: Removes old cached data (>7 days)

### Goal Calculations
- **`calculateGoalProgress()`**: Calculates current value for each goal type
- **Rolling 28-day period**: Used for most goal calculations
- **Frontend-driven**: Goals calculated on frontend and synced to database

### VO₂max Calculations
- **`calculateAutoVO2max()`**: Automatic calculation from activity data
- **`calculateManualVO2max()`**: Manual calculation from test data
- **Fitness Level Classification**:
  - <30: Beginner
  - 30-50: Amateur
  - 50-75: Advanced
  - 75-85: Elite road cyclist
  - >85: World-class

### Progress Tracking
- **`percentForPeriod()`**: Calculates progress percentages
- **`formatGoalValue()`**: Formats goal values with appropriate units
- **`progressBar()`**: Renders progress bars with labels

## State Management

### Main State Variables
```javascript
const [activities, setActivities] = useState([]);
const [loading, setLoading] = useState(true);
const [selectedPeriod, setSelectedPeriod] = useState('4w');
const [heroImage, setHeroImage] = useState(null);
const [vo2maxData, setVo2maxData] = useState({...});
const [personalGoals, setPersonalGoals] = useState([]);
const [showPersonalGoals, setShowPersonalGoals] = useState(false);
const [pageLoading, setPageLoading] = useState(true);
```

### Period Options
```javascript
const PERIOD_OPTIONS = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' }
];
```

## Data Flow

### 1. Initial Load
1. **Page Loading Overlay**: Shows during initial data fetch
2. **Token Validation**: Checks user authentication
3. **Cache Cleanup**: Removes old cached data
4. **Data Fetching**: Activities, hero image, goals
5. **Analytics Processing**: VO₂max, intervals, summaries

### 2. Goal Management
1. **Frontend Calculation**: Goals calculated using rolling 28-day periods
2. **Database Sync**: Calculated values sent to backend
3. **Real-time Updates**: Goals update when new activities added
4. **Progress Display**: Visual progress bars with percentages

### 3. Activity Analysis
1. **Data Filtering**: Activities filtered by selected period
2. **Metrics Calculation**: Various performance metrics computed
3. **Chart Generation**: Multiple charts created for different analyses
4. **Recommendations**: AI-generated training recommendations

## Key Features

### 1. Responsive Design
- **Mobile-friendly**: Adapts to different screen sizes
- **Flexible Layout**: Components adjust based on content
- **Loading States**: Smooth loading transitions

### 2. Real-time Updates
- **Goal Recalculation**: Automatic when activities change
- **Cache Management**: Intelligent caching with cleanup
- **Data Synchronization**: Frontend-backend sync

### 3. Professional Analytics
- **Multiple Chart Types**: Line, bar, area, pie charts
- **Correlation Analysis**: HR vs Speed, Cadence vs Elevation
- **Trend Analysis**: Time-based trend visualization
- **Standards Comparison**: Professional benchmarks

### 4. Goal Tracking
- **Flexible Goal Types**: 13 different goal categories
- **Progress Visualization**: Visual progress bars
- **Period Flexibility**: 4w, 3m, year, all-time periods
- **Inverted Logic**: Special handling for HR goals (lower is better)

## Technical Implementation

### Performance Optimizations
- **Caching**: Activity streams cached in localStorage
- **Lazy Loading**: Components load as needed
- **Debounced Updates**: Goal updates debounced to prevent excessive API calls
- **Memory Management**: Old cache cleanup

### Error Handling
- **Graceful Degradation**: Components handle missing data
- **Loading States**: Clear loading indicators
- **Fallback Values**: Default values for missing data
- **Error Boundaries**: Component-level error handling

### Data Validation
- **Input Validation**: Form inputs validated
- **Data Sanitization**: Raw data cleaned before processing
- **Type Checking**: Proper data type handling
- **Range Validation**: Values checked against reasonable ranges

## Integration Points

### Backend APIs
- **`/api/activities`**: Activity data
- **`/api/goals`**: Goal management
- **`/api/analytics`**: Analytics data
- **`/api/vo2max`**: VO₂max calculations

### External Services
- **Strava API**: Activity data source
- **Image Storage**: Hero image management
- **Cache System**: Local storage for performance

### Component Dependencies
- **Sidebar**: Navigation component
- **Chart Components**: Recharts-based visualizations
- **GoalsManager**: Goal management interface
- **PowerAnalysis**: Power estimation component

## Future Enhancements

### Potential Improvements
1. **Advanced Analytics**: Machine learning insights
2. **Social Features**: Compare with friends
3. **Training Plans**: AI-generated training plans
4. **Mobile App**: Native mobile application
5. **Real-time Tracking**: Live activity tracking
6. **Advanced Metrics**: More sophisticated performance indicators

### Scalability Considerations
1. **Data Volume**: Handle large activity datasets
2. **User Growth**: Support for more concurrent users
3. **Feature Expansion**: Modular component architecture
4. **Performance**: Optimize for slower devices
5. **Caching Strategy**: Advanced caching mechanisms

## Conclusion

PlanPage serves as the central hub for cycling analytics and goal tracking. It provides comprehensive insights into user performance through multiple visualization types, professional comparisons, and personalized recommendations. The modular architecture allows for easy expansion and maintenance, while the frontend-driven goal calculation ensures real-time accuracy and responsiveness. 