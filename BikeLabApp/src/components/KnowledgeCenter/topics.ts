export interface KnowledgeTopic {
  id: string;
  title: string;
  category: string;
  content: string;
}

export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  // ── Progress ──
  {
    id: 'effort_rate',
    title: 'Effort Rate',
    category: 'Progress',
    content: `Effort Rate (EFR) is a composite score that reflects how hard you've been training over recent weeks.\n\nIt combines ride frequency, duration, intensity (heart rate zones), and elevation gain into a single 0–100 number.\n\nA higher EFR means you're pushing yourself more consistently. The block breakdown shows how your effort rate changed week to week — look for a steady upward trend to confirm progressive overload.\n\nKey factors:\n• Ride frequency and duration\n• Time spent in higher HR zones\n• Climbing volume\n• Consistency across weeks`,
  },

  // ── Skills ──
  {
    id: 'skills_radar',
    title: 'Skills Radar',
    category: 'Skills',
    content: `The Skills Radar shows your cycling profile across multiple dimensions based on the last three months of activity.\n\nEach axis represents a skill area:\n• Endurance — ability to sustain long efforts\n• Climbing — uphill performance relative to weight\n• Speed — raw average and peak speeds on flats\n• Power — sustained wattage output\n• Consistency — regularity of training\n• Recovery — how quickly you bounce back between hard efforts\n\nThe shape of the radar reveals your strengths and weaknesses. A well-rounded cyclist has a balanced polygon; a specialist has spikes in specific areas.\n\nTrend arrows next to each skill show whether you're improving or declining compared to the previous period.`,
  },

  // ── FTP ──
  {
    id: 'ftp_workload',
    title: 'FTP Workload',
    category: 'FTP',
    content: `FTP (Functional Threshold Power) Workload shows how your training load over the past 4 weeks compares to your estimated FTP.\n\nFTP is the maximum power you can sustain for approximately one hour. This chart tracks your weekly TSS (Training Stress Score) relative to your threshold.\n\nThe workload gauge indicates:\n• Low — not enough stimulus for improvement\n• Moderate — maintenance level\n• High — building fitness, risk of fatigue\n• Very High — overreaching, recovery needed\n\nUse this to balance training stress with recovery. Sustained high workload without rest leads to overtraining.`,
  },

  // ── Power ──
  {
    id: 'power_dynamics',
    title: 'Power Dynamics',
    category: 'Power',
    content: `Power Dynamics displays your average and maximum power output trends over time.\n\nThe line chart tracks weekly averages, letting you spot:\n• Progressive improvement in sustained power\n• Peak power spikes from interval sessions or races\n• Drops that may indicate fatigue or detraining\n\nAverage power reflects your endurance capacity — how much wattage you maintain over entire rides. Max power reflects neuromuscular capacity — short explosive efforts.\n\nA widening gap between avg and max power suggests you're doing more polarized training (easy rides + hard intervals).`,
  },
  {
    id: 'power_top5',
    title: 'Top 5 by Power',
    category: 'Power',
    content: `This ranking shows your five best rides sorted by average power output.\n\nUse it to identify:\n• Your all-time best power performances\n• Conditions that led to peak output (weather, terrain, freshness)\n• Whether recent rides are approaching or exceeding your bests\n\nIf your top 5 is dominated by old rides, it may be time to target a power-focused training block. If recent rides are appearing, your fitness is trending upward.`,
  },

  // ── Heart ──
  {
    id: 'heart_avg_vs_speed',
    title: 'HR vs Speed',
    category: 'Heart',
    content: `This scatter-style chart plots your average heart rate against average speed for each ride.\n\nThe relationship reveals aerobic efficiency:\n• Moving up and right = faster at the same HR = improving fitness\n• Clusters in the upper-left = high HR, low speed = inefficient or hard conditions\n\nOver time, you want to see dots migrate toward the bottom-right — higher speed at lower heart rate. This is the hallmark of aerobic development.\n\nOutliers may be caused by heat, altitude, illness, or exceptionally hilly routes.`,
  },
  {
    id: 'heart_avg_trend',
    title: 'Avg HR Trend',
    category: 'Heart',
    content: `The weekly average heart rate trend shows how your typical riding intensity evolves.\n\nA gradually decreasing average HR at the same or higher speed/power indicates improved cardiovascular fitness — your heart is doing less work for the same output.\n\nA rising trend may indicate:\n• Increased training intensity (intentional)\n• Accumulated fatigue or overtraining\n• External stress, poor sleep, or dehydration\n\nCompare this chart alongside speed and power trends for the full picture.`,
  },
  {
    id: 'heart_max_trend',
    title: 'Max HR per Week',
    category: 'Heart',
    content: `This bar chart shows the highest heart rate recorded each week.\n\nMax HR per week reflects the intensity ceiling of your hardest efforts:\n• Consistent high values = regular high-intensity sessions\n• Low values = mostly easy/endurance riding\n• Spikes = race efforts or intense interval sessions\n\nYour true physiological max HR is genetically determined and doesn't change much with training. If weekly max HR is far below your known max, you may not be including enough intensity in your plan.`,
  },
  {
    id: 'heart_zones',
    title: 'HR Zones',
    category: 'Heart',
    content: `Heart Rate Zones Distribution shows how much time you spend in each training zone across your rides.\n\nThe five zones:\n• Zone 1 (Recovery) — very easy, active recovery\n• Zone 2 (Endurance) — conversational pace, fat burning, base building\n• Zone 3 (Tempo) — moderately hard, "no man's land"\n• Zone 4 (Threshold) — hard, sustainable for 20–60 min\n• Zone 5 (VO2max) — very hard, max effort intervals\n\nFor most cyclists, the ideal distribution is polarized: ~80% in Zones 1–2 and ~20% in Zones 4–5, with minimal Zone 3 time. This approach builds the deepest aerobic base while still developing top-end fitness.`,
  },

  // ── Speed ──
  {
    id: 'speed_avg_trend',
    title: 'Avg Speed Trend',
    category: 'Speed',
    content: `Weekly average speed trend shows your overall riding pace evolution.\n\nRising average speed can indicate:\n• Improved fitness and power output\n• Better aerodynamic positioning\n• Favorable route or weather conditions\n\nNote that average speed is heavily influenced by terrain, wind, and stops. For a purer fitness signal, cross-reference with power data (if available) or heart rate.\n\nA plateau in average speed despite rising power typically means you're riding hillier routes or facing more headwind.`,
  },
  {
    id: 'speed_max_trend',
    title: 'Max Speed Trend',
    category: 'Speed',
    content: `The weekly max speed trend tracks your peak speed each week.\n\nMax speed is mostly determined by:\n• Downhill gradient and length\n• Sprint power on flats\n• Aerodynamic efficiency\n• Wind conditions\n\nThis metric is less useful for tracking fitness (a steep descent will always inflate it) but interesting for tracking your comfort at high speeds and sprint capability on flat terrain.`,
  },
  {
    id: 'speed_flat',
    title: 'Speed on Flat',
    category: 'Speed',
    content: `Speed on Flat isolates your pace on relatively flat terrain segments, removing the influence of hills.\n\nThis is a much better fitness indicator than raw average speed because it eliminates the gradient variable. Improving flat speed directly reflects:\n• Higher sustained power output\n• Better aerodynamic position\n• Improved pedaling efficiency\n\nTrack this alongside average power — if flat speed rises while power stays the same, your aero position or rolling resistance improved.`,
  },
  {
    id: 'speed_hills',
    title: 'Speed on Hills',
    category: 'Speed',
    content: `Speed on Hills measures your pace on uphill segments specifically.\n\nClimbing speed is primarily determined by your power-to-weight ratio (W/kg). Improving hill speed means:\n• You're producing more power, or\n• You've lost weight, or\n• Both\n\nThis metric is valuable for riders training for mountainous events (Gran Fondos, hill climbs). Compare with flat speed to understand whether your gains are general fitness or climbing-specific.`,
  },

  // ── Cadence ──
  {
    id: 'cadence_vs_speed',
    title: 'Cadence vs Speed',
    category: 'Cadence',
    content: `This chart shows the relationship between your average cadence and average speed across rides.\n\nCadence (pedal revolutions per minute) is a key efficiency metric:\n• Higher cadence (85–95 RPM) = less muscular strain, more cardiovascular load\n• Lower cadence (60–75 RPM) = more muscular force, grinding style\n\nOptimal cadence varies by rider, but most efficient cyclists gravitate toward 85–95 RPM. If your speed increases while cadence stays constant, you're likely gearing up (bigger gear, same spin rate = more speed).`,
  },
  {
    id: 'cadence_avg_trend',
    title: 'Avg Cadence Trend',
    category: 'Cadence',
    content: `The weekly average cadence trend shows how your pedaling style evolves over time.\n\nA stable cadence around 80–95 RPM suggests good technique. Trends to watch:\n• Gradually increasing cadence — you're learning to spin more efficiently\n• Decreasing cadence — possibly grinding bigger gears, or fatigue\n• Erratic jumps — inconsistent terrain or mixed ride types\n\nProfessional cyclists typically maintain cadence between 85–100 RPM. Working on cadence drills (high-RPM spinning) can improve efficiency and reduce knee strain over time.`,
  },
];

export const KNOWLEDGE_CATEGORIES = [
  'Progress',
  'Skills',
  'FTP',
  'Power',
  'Heart',
  'Speed',
  'Cadence',
];
