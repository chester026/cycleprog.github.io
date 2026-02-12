/**
 * Achievement Engine — система ачивок BikeLab
 * 
 * Оценивает достижения пользователя по 9 категориям:
 * climbing, distance, speed, power, cadence, effort, consistency, tempo_attack, focus
 * 
 * 3 тира: silver, rare_steel, gold
 */

// ========================================
// ACHIEVEMENT DEFINITIONS (seed data)
// ========================================

const ACHIEVEMENT_DEFINITIONS = [
  // ── CLIMBING ──────────────────────────────────────────
  { key: 'trail_mark',          category: 'climbing',    tier: 'silver',     name: 'Trail Mark',              description: 'Climb a total of 1,000m elevation',                    icon: '🗻', metric: 'total_elevation_gain', threshold: 1000,    condition_type: 'cumulative',  sort_order: 1 },
  { key: 'hill_breaker',        category: 'climbing',    tier: 'silver',     name: 'Hill Breaker',            description: 'Gain 500m elevation in a single ride',                 icon: '🪨', metric: 'elevation_gain',       threshold: 500,     condition_type: 'single_ride', sort_order: 2 },
  { key: 'climb_adept',         category: 'climbing',    tier: 'silver',     name: 'Climb Adept',             description: 'Climb a total of 5,000m elevation',                    icon: '🧗', metric: 'total_elevation_gain', threshold: 5000,    condition_type: 'cumulative',  sort_order: 3 },
  { key: 'elevation_master',    category: 'climbing',    tier: 'rare_steel', name: 'Elevation Master',        description: 'Climb a total of 15,000m elevation',                   icon: '⛰️', metric: 'total_elevation_gain', threshold: 15000,   condition_type: 'cumulative',  sort_order: 4 },
  { key: 'mountain_tactician',  category: 'climbing',    tier: 'rare_steel', name: 'Mountain Tactician',      description: 'Gain 1,000m elevation in a single ride',               icon: '🛡️', metric: 'elevation_gain',       threshold: 1000,    condition_type: 'single_ride', sort_order: 5 },
  { key: 'steel_climber',       category: 'climbing',    tier: 'rare_steel', name: 'Steel Climber',           description: 'Climb a total of 30,000m elevation',                   icon: '⚙️', metric: 'total_elevation_gain', threshold: 30000,   condition_type: 'cumulative',  sort_order: 6 },
  { key: 'prince_of_mountains', category: 'climbing',    tier: 'gold',       name: 'Prince of the Mountains', description: 'Climb a total of 50,000m elevation',                   icon: '👑', metric: 'total_elevation_gain', threshold: 50000,   condition_type: 'cumulative',  sort_order: 7 },
  { key: 'king_of_mountains',   category: 'climbing',    tier: 'gold',       name: 'King of the Mountains',   description: 'Gain 2,000m elevation in a single ride',               icon: '👑', metric: 'elevation_gain',       threshold: 2000,    condition_type: 'single_ride', sort_order: 8 },
  { key: 'lord_of_elevation',   category: 'climbing',    tier: 'gold',       name: 'Lord of Elevation',       description: 'Climb a total of 100,000m elevation',                  icon: '🜂', metric: 'total_elevation_gain', threshold: 100000,  condition_type: 'cumulative',  sort_order: 9 },

  // ── DISTANCE ──────────────────────────────────────────
  { key: 'distance_rider',      category: 'distance',    tier: 'silver',     name: 'Distance Rider',          description: 'Ride 50km in a single ride',                           icon: '🚴', metric: 'distance',             threshold: 50,      condition_type: 'single_ride', sort_order: 1 },
  { key: 'long_haul',           category: 'distance',    tier: 'silver',     name: 'Long Haul',               description: 'Ride 100km in a single ride',                          icon: '🧭', metric: 'distance',             threshold: 100,     condition_type: 'single_ride', sort_order: 2 },
  { key: 'endurance_adept',     category: 'distance',    tier: 'silver',     name: 'Endurance Adept',         description: 'Ride a total of 1,000km',                              icon: '🪶', metric: 'total_distance',        threshold: 1000,    condition_type: 'cumulative',  sort_order: 3 },
  { key: 'distance_master',     category: 'distance',    tier: 'rare_steel', name: 'Distance Master',         description: 'Ride a total of 3,000km',                              icon: '⚙️', metric: 'total_distance',        threshold: 3000,    condition_type: 'cumulative',  sort_order: 4 },
  { key: 'iron_legs',           category: 'distance',    tier: 'rare_steel', name: 'Iron Legs',               description: 'Ride 160km in a single ride',                          icon: '🦿', metric: 'distance',             threshold: 160,     condition_type: 'single_ride', sort_order: 5 },
  { key: 'endurance_specialist',category: 'distance',    tier: 'rare_steel', name: 'Endurance Specialist',    description: 'Ride a total of 5,000km',                              icon: '🔁', metric: 'total_distance',        threshold: 5000,    condition_type: 'cumulative',  sort_order: 6 },
  { key: 'marathon_king',       category: 'distance',    tier: 'gold',       name: 'Marathon King',           description: 'Ride 200km in a single ride',                          icon: '🏁', metric: 'distance',             threshold: 200,     condition_type: 'single_ride', sort_order: 7 },
  { key: 'eternal_rider',       category: 'distance',    tier: 'gold',       name: 'Eternal Rider',           description: 'Ride a total of 10,000km',                             icon: '☀️', metric: 'total_distance',        threshold: 10000,   condition_type: 'cumulative',  sort_order: 8 },
  { key: 'beyond_distance',     category: 'distance',    tier: 'gold',       name: 'Beyond Distance',         description: 'Ride a total of 20,000km',                             icon: '🜁', metric: 'total_distance',        threshold: 20000,   condition_type: 'cumulative',  sort_order: 9 },

  // ── SPEED ─────────────────────────────────────────────
  { key: 'speed_seeker',        category: 'speed',       tier: 'silver',     name: 'Speed Seeker',            description: 'Average 25 km/h in a ride',                            icon: '🌬️', metric: 'average_speed',        threshold: 25,      condition_type: 'single_ride', sort_order: 1 },
  { key: 'pace_holder',         category: 'speed',       tier: 'silver',     name: 'Pace Holder',             description: 'Average 28 km/h in a ride',                            icon: '🟦', metric: 'average_speed',        threshold: 28,      condition_type: 'single_ride', sort_order: 2 },
  { key: 'fast_roll',           category: 'speed',       tier: 'silver',     name: 'Fast Roll',               description: 'Average 30 km/h in a ride',                            icon: '⚡', metric: 'average_speed',        threshold: 30,      condition_type: 'single_ride', sort_order: 3 },
  { key: 'velocity_master',     category: 'speed',       tier: 'rare_steel', name: 'Velocity Master',         description: 'Average 33 km/h in a ride',                            icon: '🧠', metric: 'average_speed',        threshold: 33,      condition_type: 'single_ride', sort_order: 4 },
  { key: 'breakaway_engine',    category: 'speed',       tier: 'rare_steel', name: 'Breakaway Engine',        description: 'Average 35 km/h in a ride',                            icon: '🏎️', metric: 'average_speed',        threshold: 35,      condition_type: 'single_ride', sort_order: 5 },
  { key: 'steel_pace',          category: 'speed',       tier: 'rare_steel', name: 'Steel Pace',              description: 'Average 37 km/h in a ride',                            icon: '⚙️', metric: 'average_speed',        threshold: 37,      condition_type: 'single_ride', sort_order: 6 },
  { key: 'wind_cutter',         category: 'speed',       tier: 'gold',       name: 'Wind Cutter',             description: 'Average 39 km/h in a ride',                            icon: '🌪️', metric: 'average_speed',        threshold: 39,      condition_type: 'single_ride', sort_order: 7 },
  { key: 'speed_king',          category: 'speed',       tier: 'gold',       name: 'Speed King',              description: 'Average 41 km/h in a ride',                            icon: '👑', metric: 'average_speed',        threshold: 41,      condition_type: 'single_ride', sort_order: 8 },
  { key: 'uncatchable',         category: 'speed',       tier: 'gold',       name: 'Uncatchable',             description: 'Average 43 km/h in a ride',                            icon: '✨', metric: 'average_speed',        threshold: 43,      condition_type: 'single_ride', sort_order: 9 },

  // ── POWER ─────────────────────────────────────────────
  { key: 'power_builder',       category: 'power',       tier: 'silver',     name: 'Power Builder',           description: 'Average 150W in a ride',                               icon: '🔋', metric: 'average_watts',        threshold: 150,     condition_type: 'single_ride', sort_order: 1 },
  { key: 'torque_rider',        category: 'power',       tier: 'silver',     name: 'Torque Rider',            description: 'Average 180W in a ride',                               icon: '🔩', metric: 'average_watts',        threshold: 180,     condition_type: 'single_ride', sort_order: 2 },
  { key: 'diesel_engine',       category: 'power',       tier: 'silver',     name: 'Diesel Engine',           description: 'Average 200W in a ride',                               icon: '🛠️', metric: 'average_watts',        threshold: 200,     condition_type: 'single_ride', sort_order: 3 },
  { key: 'watt_master',         category: 'power',       tier: 'rare_steel', name: 'Watt Master',             description: 'Average 230W in a ride',                               icon: '⚙️', metric: 'average_watts',        threshold: 230,     condition_type: 'single_ride', sort_order: 4 },
  { key: 'steel_engine',        category: 'power',       tier: 'rare_steel', name: 'Steel Engine',            description: 'Average 260W in a ride',                               icon: '🦾', metric: 'average_watts',        threshold: 260,     condition_type: 'single_ride', sort_order: 5 },
  { key: 'power_specialist',    category: 'power',       tier: 'rare_steel', name: 'Power Specialist',        description: 'Average 280W in a ride',                               icon: '🔧', metric: 'average_watts',        threshold: 280,     condition_type: 'single_ride', sort_order: 6 },
  { key: 'watt_monster',        category: 'power',       tier: 'gold',       name: 'Watt Monster',            description: 'Average 300W in a ride',                               icon: '⚡', metric: 'average_watts',        threshold: 300,     condition_type: 'single_ride', sort_order: 7 },
  { key: 'human_generator',     category: 'power',       tier: 'gold',       name: 'Human Generator',         description: 'Average 330W in a ride',                               icon: '☢️', metric: 'average_watts',        threshold: 330,     condition_type: 'single_ride', sort_order: 8 },
  { key: 'power_king',          category: 'power',       tier: 'gold',       name: 'Power King',              description: 'Average 350W in a ride',                               icon: '👑', metric: 'average_watts',        threshold: 350,     condition_type: 'single_ride', sort_order: 9 },

  // ── CADENCE ───────────────────────────────────────────
  { key: 'cadence_finder',      category: 'cadence',     tier: 'silver',     name: 'Cadence Finder',          description: 'Average 80 rpm in a ride',                             icon: '🎵', metric: 'average_cadence',      threshold: 80,      condition_type: 'single_ride', sort_order: 1 },
  { key: 'smooth_spinner',      category: 'cadence',     tier: 'silver',     name: 'Smooth Spinner',          description: 'Average 85 rpm in a ride',                             icon: '🌀', metric: 'average_cadence',      threshold: 85,      condition_type: 'single_ride', sort_order: 2 },
  { key: 'spin_master',         category: 'cadence',     tier: 'rare_steel', name: 'Spin Master',             description: 'Average 90 rpm in a ride',                             icon: '⏱️', metric: 'average_cadence',      threshold: 90,      condition_type: 'single_ride', sort_order: 3 },
  { key: 'metronome',           category: 'cadence',     tier: 'rare_steel', name: 'Metronome',               description: 'Average 95 rpm in a ride',                             icon: '⚙️', metric: 'average_cadence',      threshold: 95,      condition_type: 'single_ride', sort_order: 4 },
  { key: 'cadence_king',        category: 'cadence',     tier: 'gold',       name: 'Cadence King',            description: 'Average 100 rpm in a ride',                            icon: '👑', metric: 'average_cadence',      threshold: 100,     condition_type: 'single_ride', sort_order: 5 },
  { key: 'silk_legs',           category: 'cadence',     tier: 'gold',       name: 'Silk Legs',               description: 'Average 105 rpm in a ride',                            icon: '🪶', metric: 'average_cadence',      threshold: 105,     condition_type: 'single_ride', sort_order: 6 },
  { key: 'perfect_rpm',         category: 'cadence',     tier: 'gold',       name: 'Perfect RPM',             description: 'Average 110 rpm in a ride',                            icon: '🧘', metric: 'average_cadence',      threshold: 110,     condition_type: 'single_ride', sort_order: 7 },

  // ── EFFORT ────────────────────────────────────────────
  { key: 'red_zone_visitor',    category: 'effort',      tier: 'silver',     name: 'Red Zone Visitor',        description: 'Intensity ≥82% of max HR in a ride',                   icon: '🔥', metric: 'hr_intensity',         threshold: 0.82,    condition_type: 'intensity',   sort_order: 1, extra: {} },
  { key: 'pain_curious',        category: 'effort',      tier: 'silver',     name: 'Pain Curious',            description: 'Intensity ≥80% of max HR (ride ≥30 min)',              icon: '😬', metric: 'hr_intensity',         threshold: 0.80,    condition_type: 'intensity',   sort_order: 2, extra: { min_duration: 1800 } },
  { key: 'pain_manager',        category: 'effort',      tier: 'rare_steel', name: 'Pain Manager',            description: 'Intensity ≥82% of max HR (ride ≥45 min)',              icon: '🧠', metric: 'hr_intensity',         threshold: 0.82,    condition_type: 'intensity',   sort_order: 3, extra: { min_duration: 2700 } },
  { key: 'red_zone_resident',   category: 'effort',      tier: 'rare_steel', name: 'Red Zone Resident',       description: '15 rides with intensity ≥80% of max HR',               icon: '🩸', metric: 'hr_intensity_rides',   threshold: 15,      condition_type: 'intensity',   sort_order: 4, extra: { count_mode: true, intensity_threshold: 0.80 } },
  { key: 'suffering_king',      category: 'effort',      tier: 'gold',       name: 'Suffering King',          description: 'Intensity ≥85% of max HR (ride ≥60 min)',              icon: '👑', metric: 'hr_intensity',         threshold: 0.85,    condition_type: 'intensity',   sort_order: 5, extra: { min_duration: 3600 } },
  { key: 'pain_connoisseur',    category: 'effort',      tier: 'gold',       name: 'Pain Connoisseur',        description: '40 rides with intensity ≥80% of max HR',               icon: '🍷', metric: 'hr_intensity_rides',   threshold: 40,      condition_type: 'intensity',   sort_order: 6, extra: { count_mode: true, intensity_threshold: 0.80 } },
  { key: 'into_the_red',        category: 'effort',      tier: 'gold',       name: 'Into the Red',            description: 'Intensity ≥88% of max HR (ride ≥45 min)',              icon: '🔥', metric: 'hr_intensity',         threshold: 0.88,    condition_type: 'intensity',   sort_order: 7, extra: { min_duration: 2700 } },

  // ── CONSISTENCY ───────────────────────────────────────
  { key: 'week_grinder',        category: 'consistency', tier: 'silver',     name: 'Week Grinder',            description: '4 consecutive weeks with 2+ rides',                    icon: '📅', metric: 'weekly_streak',        threshold: 4,       condition_type: 'streak',      sort_order: 1 },
  { key: 'training_machine',    category: 'consistency', tier: 'rare_steel', name: 'Training Machine',        description: '8 consecutive weeks with 2+ rides',                    icon: '⚙️', metric: 'weekly_streak',        threshold: 8,       condition_type: 'streak',      sort_order: 2 },
  { key: 'relentless',          category: 'consistency', tier: 'gold',       name: 'Relentless',              description: '12 consecutive weeks with 2+ rides',                   icon: '🜃', metric: 'weekly_streak',        threshold: 12,      condition_type: 'streak',      sort_order: 3 },
  { key: 'iron_discipline',     category: 'consistency', tier: 'gold',       name: 'Iron Discipline',         description: '24 consecutive weeks with 2+ rides',                   icon: '🏆', metric: 'weekly_streak',        threshold: 24,      condition_type: 'streak',      sort_order: 4 },

  // ── TEMPO / ATTACK ────────────────────────────────────────
  { key: 'attack_curious',      category: 'tempo_attack', tier: 'silver',     name: 'Attack Curious',          description: 'Reach max speed of 45 km/h in a ride',                 icon: '⚡', metric: 'max_speed',            threshold: 45,      condition_type: 'single_ride', sort_order: 1 },
  { key: 'tempo_seeker',        category: 'tempo_attack', tier: 'silver',     name: 'Tempo Seeker',            description: 'Reach max speed of 50 km/h in a ride',                 icon: '↗️', metric: 'max_speed',            threshold: 50,      condition_type: 'single_ride', sort_order: 2 },
  { key: 'quick_jump',          category: 'tempo_attack', tier: 'silver',     name: 'Quick Jump',              description: 'Reach max speed of 55 km/h in a ride',                 icon: '💥', metric: 'max_speed',            threshold: 55,      condition_type: 'single_ride', sort_order: 3 },
  { key: 'attack_adept',        category: 'tempo_attack', tier: 'rare_steel', name: 'Attack Adept',            description: 'Reach max speed of 60 km/h in a ride',                 icon: '⚙️', metric: 'max_speed',            threshold: 60,      condition_type: 'single_ride', sort_order: 4 },
  { key: 'tempo_master',        category: 'tempo_attack', tier: 'rare_steel', name: 'Tempo Master',            description: 'Reach max speed of 65 km/h in a ride',                 icon: '⚡', metric: 'max_speed',            threshold: 65,      condition_type: 'single_ride', sort_order: 5 },
  { key: 'snap_engine',         category: 'tempo_attack', tier: 'rare_steel', name: 'Snap Engine',             description: 'Reach max speed of 70 km/h in a ride',                 icon: '⚙️', metric: 'max_speed',            threshold: 70,      condition_type: 'single_ride', sort_order: 6 },
  { key: 'attack_king',         category: 'tempo_attack', tier: 'gold',       name: 'Attack King',             description: 'Reach max speed of 75 km/h in a ride',                 icon: '👑', metric: 'max_speed',            threshold: 75,      condition_type: 'single_ride', sort_order: 7 },
  { key: 'explosive_force',     category: 'tempo_attack', tier: 'gold',       name: 'Explosive Force',         description: 'Reach max speed of 80 km/h in a ride',                 icon: '💥', metric: 'max_speed',            threshold: 80,      condition_type: 'single_ride', sort_order: 8 },
  { key: 'unstoppable_jump',    category: 'tempo_attack', tier: 'gold',       name: 'Unstoppable Jump',        description: 'Reach max speed of 85 km/h in a ride',                 icon: '🚀', metric: 'max_speed',            threshold: 85,      condition_type: 'single_ride', sort_order: 9 },

  // ── FOCUS (DESCENTS) ──────────────────────────────────────
  { key: 'descent_initiate',    category: 'focus',        tier: 'silver',     name: 'Descent Initiate',        description: 'Trust the speed',                                      icon: '⬇️', metric: 'focus_max_speed',      threshold: 50,      condition_type: 'single_ride', sort_order: 1 },
  { key: 'gravity_rider',       category: 'focus',        tier: 'silver',     name: 'Gravity Rider',           description: 'Descents no longer scare you',                         icon: '🏔️', metric: 'focus_max_speed',      threshold: 55,      condition_type: 'single_ride', sort_order: 2 },
  { key: 'focus_seeker',        category: 'focus',        tier: 'silver',     name: 'Focus Seeker',            description: 'Eyes forward',                                         icon: '👁️', metric: 'focus_max_speed',      threshold: 60,      condition_type: 'single_ride', sort_order: 3 },
  { key: 'descent_adept',       category: 'focus',        tier: 'rare_steel', name: 'Descent Adept',           description: 'Speed under control',                                  icon: '⚙️', metric: 'focus_max_speed',      threshold: 65,      condition_type: 'single_ride', sort_order: 4 },
  { key: 'gravity_master',      category: 'focus',        tier: 'rare_steel', name: 'Gravity Master',          description: 'Descent is yours to command',                          icon: '🎯', metric: 'focus_max_speed',      threshold: 70,      condition_type: 'single_ride', sort_order: 5 },
  { key: 'steel_focus',         category: 'focus',        tier: 'rare_steel', name: 'Steel Focus',             description: 'Cold head at high speed',                              icon: '⚙️', metric: 'focus_max_speed',      threshold: 75,      condition_type: 'single_ride', sort_order: 6 },
  { key: 'descend_king',        category: 'focus',        tier: 'gold',       name: 'Descend King',            description: 'Speed without panic',                                  icon: '👑', metric: 'focus_max_speed',      threshold: 80,      condition_type: 'single_ride', sort_order: 7 },
  { key: 'ice_in_veins',        category: 'focus',        tier: 'gold',       name: 'Ice in the Veins',        description: 'Full control at 70+',                                  icon: '❄️', metric: 'focus_max_speed',      threshold: 85,      condition_type: 'single_ride', sort_order: 8 },
  { key: 'master_of_gravity',   category: 'focus',        tier: 'gold',       name: 'Master of Gravity',       description: 'Gravity works for you',                                icon: '🌀', metric: 'focus_max_speed',      threshold: 90,      condition_type: 'single_ride', sort_order: 9 },
  { key: 'precision_rider',     category: 'focus',        tier: 'gold',       name: 'Precision Rider',         description: 'Perfect control at extreme speed',                     icon: '🎯', metric: 'focus_max_speed',      threshold: 95,      condition_type: 'single_ride', sort_order: 10 },
];


// ========================================
// DATABASE SETUP
// ========================================

async function setupAchievementTables(pool) {
  // Create achievements table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS achievements (
      id SERIAL PRIMARY KEY,
      key VARCHAR(60) UNIQUE NOT NULL,
      category VARCHAR(30) NOT NULL,
      tier VARCHAR(20) NOT NULL,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      icon VARCHAR(10),
      metric VARCHAR(50) NOT NULL,
      threshold NUMERIC NOT NULL,
      condition_type VARCHAR(30) NOT NULL,
      sort_order INT DEFAULT 0,
      extra JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Migrate: add extra column if missing (table may have been created before this column existed)
  await pool.query(`
    ALTER TABLE achievements ADD COLUMN IF NOT EXISTS extra JSONB DEFAULT '{}';
  `);

  // Create user_achievements table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_achievements (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      achievement_id INT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
      current_value NUMERIC DEFAULT 0,
      unlocked BOOLEAN DEFAULT FALSE,
      unlocked_at TIMESTAMP,
      trigger_activity_id BIGINT,
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, achievement_id)
    );
  `);

  // Create indexes
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_user_achievements_unlocked ON user_achievements(user_id, unlocked);
  `);

  console.log('✅ Achievement tables ready');
}

async function seedAchievements(pool) {
  // Check if already seeded
  const { rows } = await pool.query('SELECT COUNT(*) as cnt FROM achievements');
  if (parseInt(rows[0].cnt) > 0) {
    // Update existing achievements (upsert) to keep in sync with code definitions
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      await pool.query(`
        INSERT INTO achievements (key, category, tier, name, description, icon, metric, threshold, condition_type, sort_order, extra)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (key) DO UPDATE SET
          category = EXCLUDED.category,
          tier = EXCLUDED.tier,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          icon = EXCLUDED.icon,
          metric = EXCLUDED.metric,
          threshold = EXCLUDED.threshold,
          condition_type = EXCLUDED.condition_type,
          sort_order = EXCLUDED.sort_order,
          extra = EXCLUDED.extra
      `, [
        def.key, def.category, def.tier, def.name, def.description,
        def.icon, def.metric, def.threshold, def.condition_type,
        def.sort_order, JSON.stringify(def.extra || {})
      ]);
    }
    console.log(`🔄 Achievements synced (${ACHIEVEMENT_DEFINITIONS.length} definitions)`);
    return;
  }

  // Initial seed
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    await pool.query(`
      INSERT INTO achievements (key, category, tier, name, description, icon, metric, threshold, condition_type, sort_order, extra)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
      def.key, def.category, def.tier, def.name, def.description,
      def.icon, def.metric, def.threshold, def.condition_type,
      def.sort_order, JSON.stringify(def.extra || {})
    ]);
  }
  console.log(`🏆 Seeded ${ACHIEVEMENT_DEFINITIONS.length} achievements`);
}


// ========================================
// ACHIEVEMENT ENGINE
// ========================================

class AchievementEngine {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Main evaluation — call after Strava sync or manually
   * Returns { newly_unlocked: [...], total_unlocked: N }
   */
  async evaluate(userId, activities) {
    // 🎯 Filter: only last 6 months (for gamification - progressive unlocks)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    activities = activities.filter(a => new Date(a.start_date) >= sixMonthsAgo);
    
    console.log(`🏆 Evaluating achievements for user ${userId}: ${activities.length} activities in last 6 months`);

    const { rows: achievements } = await this.pool.query(
      'SELECT * FROM achievements ORDER BY category, sort_order'
    );

    // Get user profile for max_hr (needed for effort achievements)
    const { rows: profileRows } = await this.pool.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [userId]
    );
    const profile = profileRows[0] || null;

    // Compute progress for each achievement
    const results = [];
    for (const achievement of achievements) {
      const { currentValue, isUnlocked, triggerActivityId } = this.computeProgress(
        achievement, activities, profile
      );
      results.push({
        achievementId: achievement.id,
        currentValue,
        isUnlocked,
        triggerActivityId,
      });
    }

    // Sync results to DB and return newly unlocked
    return await this.syncResults(userId, results);
  }

  /**
   * Compute progress for a single achievement
   */
  computeProgress(achievement, activities, profile) {
    switch (achievement.condition_type) {
      case 'cumulative':
        return this.evalCumulative(achievement, activities);
      case 'single_ride':
        return this.evalSingleRide(achievement, activities);
      case 'streak':
        return this.evalStreak(achievement, activities);
      case 'intensity':
        return this.evalIntensity(achievement, activities, profile);
      default:
        return { currentValue: 0, isUnlocked: false, triggerActivityId: null };
    }
  }

  /**
   * Cumulative — SUM across all activities
   * Metrics: total_elevation_gain, total_distance
   */
  evalCumulative(achievement, activities) {
    let sum = 0;

    for (const a of activities) {
      if (achievement.metric === 'total_elevation_gain') {
        sum += (a.total_elevation_gain || 0);
      } else if (achievement.metric === 'total_distance') {
        // Strava returns distance in meters, threshold is in km
        sum += (a.distance || 0) / 1000;
      }
    }

    const currentValue = Math.round(sum * 100) / 100;
    return {
      currentValue,
      isUnlocked: currentValue >= achievement.threshold,
      triggerActivityId: null,
    };
  }

  /**
   * Single ride — MAX across all activities  
   * Metrics: distance, elevation_gain, average_speed, max_speed, focus_max_speed, average_watts, average_cadence
   * 
   * Special filters:
   * - max_speed: only flat rides (elevation_gain/distance < 10 m/km) to exclude downhills
   * - focus_max_speed: only rides with significant climbing (elevation_gain >= 250m) for descent focus
   */
  evalSingleRide(achievement, activities) {
    let maxValue = 0;
    let bestActivityId = null;

    // Filter activities based on metric
    let filteredActivities = activities;
    
    if (achievement.metric === 'max_speed') {
      // Only flat rides: less than 10 meters of elevation gain per km
      filteredActivities = activities.filter(a => {
        const distanceKm = (a.distance || 0) / 1000;
        const elevationGain = a.total_elevation_gain || 0;
        if (distanceKm < 1) return false; // Skip very short rides
        const elevationPerKm = elevationGain / distanceKm;
        return elevationPerKm < 10;
      });
    }
    
    if (achievement.metric === 'focus_max_speed') {
      // Only rides with significant climbing (250m+) - ensures there are descents
      filteredActivities = activities.filter(a => {
        const elevationGain = a.total_elevation_gain || 0;
        return elevationGain >= 250;
      });
    }

    for (const a of filteredActivities) {
      let value = 0;

      switch (achievement.metric) {
        case 'distance':
          // Strava returns distance in meters, threshold is in km
          value = (a.distance || 0) / 1000;
          break;
        case 'elevation_gain':
          value = a.total_elevation_gain || 0;
          break;
        case 'average_speed':
          // Strava returns average_speed in m/s, threshold is in km/h
          value = (a.average_speed || 0) * 3.6;
          break;
        case 'max_speed':
        case 'focus_max_speed':
          // Strava returns max_speed in m/s, threshold is in km/h
          value = (a.max_speed || 0) * 3.6;
          break;
        case 'average_watts':
          value = a.average_watts || 0;
          break;
        case 'average_cadence':
          value = a.average_cadence || 0;
          break;
      }

      if (value > maxValue) {
        maxValue = value;
        bestActivityId = a.id;
      }
    }

    const currentValue = Math.round(maxValue * 100) / 100;
    return {
      currentValue,
      isUnlocked: currentValue >= achievement.threshold,
      triggerActivityId: currentValue >= achievement.threshold ? bestActivityId : null,
    };
  }

  /**
   * Streak — consecutive weeks with 2+ rides
   * Metric: weekly_streak
   */
  evalStreak(achievement, activities) {
    if (!activities.length) {
      return { currentValue: 0, isUnlocked: false, triggerActivityId: null };
    }

    // Group activities by ISO week
    const weekMap = {};
    for (const a of activities) {
      const date = new Date(a.start_date);
      const weekKey = this.getISOWeekKey(date);
      if (!weekMap[weekKey]) weekMap[weekKey] = 0;
      weekMap[weekKey]++;
    }

    // Sort weeks chronologically
    const weeks = Object.keys(weekMap).sort();

    // Find longest consecutive streak of weeks with 2+ rides
    let maxStreak = 0;
    let currentStreak = 0;

    for (let i = 0; i < weeks.length; i++) {
      if (weekMap[weeks[i]] >= 2) {
        if (i === 0) {
          currentStreak = 1;
        } else {
          // Check if this week is consecutive to the previous qualifying week
          const isConsecutive = this.areConsecutiveWeeks(weeks[i - 1], weeks[i]) && weekMap[weeks[i - 1]] >= 2;
          if (isConsecutive) {
            currentStreak++;
          } else {
            currentStreak = 1;
          }
        }
        maxStreak = Math.max(maxStreak, currentStreak);
      }
    }

    return {
      currentValue: maxStreak,
      isUnlocked: maxStreak >= achievement.threshold,
      triggerActivityId: null,
    };
  }

  /**
   * Intensity — HR-based effort metrics
   * Requires user profile with max_hr
   */
  evalIntensity(achievement, activities, profile) {
    if (!profile || !profile.max_hr) {
      return { currentValue: 0, isUnlocked: false, triggerActivityId: null };
    }

    const maxHR = profile.max_hr;
    const extra = achievement.extra || {};

    // Count mode: count rides meeting intensity threshold
    if (extra.count_mode) {
      const intensityThreshold = extra.intensity_threshold || 0.80;
      let count = 0;

      for (const a of activities) {
        if (!a.average_heartrate) continue;
        const intensity = a.average_heartrate / maxHR;
        if (intensity >= intensityThreshold) {
          count++;
        }
      }

      return {
        currentValue: count,
        isUnlocked: count >= achievement.threshold,
        triggerActivityId: null,
      };
    }

    // Single ride intensity mode
    const minDuration = extra.min_duration || 0;
    let maxIntensity = 0;
    let bestActivityId = null;

    for (const a of activities) {
      if (!a.average_heartrate) continue;

      // Check duration filter
      const duration = a.moving_time || 0;
      if (minDuration > 0 && duration < minDuration) continue;

      const intensity = a.average_heartrate / maxHR;
      if (intensity > maxIntensity) {
        maxIntensity = intensity;
        bestActivityId = a.id;
      }
    }

    const currentValue = Math.round(maxIntensity * 1000) / 1000;
    return {
      currentValue,
      isUnlocked: currentValue >= achievement.threshold,
      triggerActivityId: currentValue >= achievement.threshold ? bestActivityId : null,
    };
  }

  /**
   * Sync evaluation results to user_achievements table
   * Returns { newly_unlocked: [...], total_unlocked: N }
   */
  async syncResults(userId, results) {
    const newlyUnlocked = [];
    let totalUnlocked = 0;

    for (const r of results) {
      // Upsert user_achievement
      const { rows } = await this.pool.query(`
        INSERT INTO user_achievements (user_id, achievement_id, current_value, unlocked, unlocked_at, trigger_activity_id, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (user_id, achievement_id) DO UPDATE SET
          current_value = $3,
          unlocked = CASE WHEN user_achievements.unlocked = TRUE THEN TRUE ELSE $4 END,
          unlocked_at = CASE WHEN user_achievements.unlocked = TRUE THEN user_achievements.unlocked_at ELSE $5 END,
          trigger_activity_id = CASE WHEN user_achievements.unlocked = TRUE THEN user_achievements.trigger_activity_id ELSE $6 END,
          updated_at = NOW()
        RETURNING unlocked, (xmax = 0) AS is_insert, unlocked_at
      `, [
        userId,
        r.achievementId,
        r.currentValue,
        r.isUnlocked,
        r.isUnlocked ? new Date() : null,
        r.triggerActivityId,
      ]);

      const row = rows[0];
      if (row.unlocked) {
        totalUnlocked++;
      }

      // Detect newly unlocked: was just unlocked (unlocked_at is very recent)
      if (r.isUnlocked && row.is_insert && row.unlocked) {
        // New insert + unlocked = first time unlock
        const achievement = await this.pool.query('SELECT * FROM achievements WHERE id = $1', [r.achievementId]);
        if (achievement.rows[0]) {
          newlyUnlocked.push(achievement.rows[0]);
        }
      }
    }

    // Also detect newly unlocked for updates (check timestamps)
    // For updates, we use a different approach: compare before/after
    // The RETURNING clause above handles inserts; for updates we need to check
    // if the previous state was unlocked=false and now it's true

    return { newly_unlocked: newlyUnlocked, total_unlocked: totalUnlocked };
  }

  // ── Helper: ISO week key ──────────────────────────────
  getISOWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }

  areConsecutiveWeeks(weekA, weekB) {
    // Parse "YYYY-WNN" format
    const [yearA, wA] = weekA.split('-W').map(Number);
    const [yearB, wB] = weekB.split('-W').map(Number);

    if (yearA === yearB) {
      return wB - wA === 1;
    }
    // Cross-year: last week of yearA → first week of yearB
    if (yearB - yearA === 1 && wB === 1) {
      // ISO year can have 52 or 53 weeks
      const lastWeek = this.getISOWeeksInYear(yearA);
      return wA === lastWeek;
    }
    return false;
  }

  getISOWeeksInYear(year) {
    const dec28 = new Date(Date.UTC(year, 11, 28));
    const dayOfYear = Math.floor((dec28 - new Date(Date.UTC(year, 0, 1))) / 86400000) + 1;
    return Math.floor((dayOfYear - ((dec28.getUTCDay() + 6) % 7) + 9) / 7);
  }
}


// ========================================
// IMPROVED SYNC — detect newly unlocked for updates too
// ========================================

/**
 * Enhanced evaluate that properly tracks newly unlocked achievements
 */
async function evaluateAchievements(pool, userId, activities) {
  // Get current unlocked state BEFORE evaluation
  const { rows: beforeRows } = await pool.query(
    'SELECT achievement_id FROM user_achievements WHERE user_id = $1 AND unlocked = TRUE',
    [userId]
  );
  const previouslyUnlocked = new Set(beforeRows.map(r => r.achievement_id));

  const engine = new AchievementEngine(pool);
  const result = await engine.evaluate(userId, activities);

  // Get current unlocked state AFTER evaluation
  const { rows: afterRows } = await pool.query(
    `SELECT ua.achievement_id, a.* FROM user_achievements ua
     JOIN achievements a ON a.id = ua.achievement_id
     WHERE ua.user_id = $1 AND ua.unlocked = TRUE`,
    [userId]
  );

  // Find truly new unlocks
  const newlyUnlocked = afterRows.filter(r => !previouslyUnlocked.has(r.achievement_id));

  return {
    newly_unlocked: newlyUnlocked,
    total_unlocked: afterRows.length,
    total_achievements: ACHIEVEMENT_DEFINITIONS.length,
  };
}


// ========================================
// API HELPERS
// ========================================

/**
 * Get all achievements with user progress
 */
async function getUserAchievements(pool, userId) {
  const { rows } = await pool.query(`
    SELECT 
      a.*,
      COALESCE(ua.current_value, 0) as current_value,
      COALESCE(ua.unlocked, FALSE) as unlocked,
      ua.unlocked_at,
      ua.trigger_activity_id
    FROM achievements a
    LEFT JOIN user_achievements ua ON ua.achievement_id = a.id AND ua.user_id = $1
    ORDER BY a.category, a.sort_order
  `, [userId]);

  return rows.map(r => ({
    id: r.id,
    key: r.key,
    category: r.category,
    tier: r.tier,
    name: r.name,
    description: r.description,
    icon: r.icon,
    metric: r.metric,
    threshold: parseFloat(r.threshold),
    condition_type: r.condition_type,
    sort_order: r.sort_order,
    current_value: parseFloat(r.current_value),
    unlocked: r.unlocked,
    unlocked_at: r.unlocked_at,
    trigger_activity_id: r.trigger_activity_id,
    progress_pct: Math.min(100, Math.round((parseFloat(r.current_value) / parseFloat(r.threshold)) * 100)),
  }));
}

/**
 * Get all achievement definitions (no user data)
 */
async function getAllAchievements(pool) {
  const { rows } = await pool.query(
    'SELECT * FROM achievements ORDER BY category, sort_order'
  );
  return rows;
}


module.exports = {
  setupAchievementTables,
  seedAchievements,
  AchievementEngine,
  evaluateAchievements,
  getUserAchievements,
  getAllAchievements,
  ACHIEVEMENT_DEFINITIONS,
};
