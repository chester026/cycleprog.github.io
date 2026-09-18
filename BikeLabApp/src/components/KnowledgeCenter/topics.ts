// T-5.5 (i18n debt): topic title/category/content used to be hardcoded
// English strings baked into this data file with no `t()` anywhere in
// sight — this file now holds only stable ids + a category key; the
// translatable title/content live under `knowledgeCenter.topics.<id>` and
// `knowledgeCenter.categories.<categoryKey>` in en.json/ru.json.
// KnowledgeCenterModal.tsx resolves them with `t()`.
export interface KnowledgeTopic {
  id: string;
  categoryKey: string;
}

export const KNOWLEDGE_TOPICS: KnowledgeTopic[] = [
  {id: 'effort_rate', categoryKey: 'progress'},
  {id: 'skills_radar', categoryKey: 'skills'},
  {id: 'ftp_workload', categoryKey: 'ftp'},
  {id: 'power_dynamics', categoryKey: 'power'},
  {id: 'power_top5', categoryKey: 'power'},
  {id: 'heart_avg_vs_speed', categoryKey: 'heart'},
  {id: 'heart_avg_trend', categoryKey: 'heart'},
  {id: 'heart_max_trend', categoryKey: 'heart'},
  {id: 'heart_zones', categoryKey: 'heart'},
  {id: 'speed_avg_trend', categoryKey: 'speed'},
  {id: 'speed_max_trend', categoryKey: 'speed'},
  {id: 'speed_flat', categoryKey: 'speed'},
  {id: 'speed_hills', categoryKey: 'speed'},
  {id: 'cadence_vs_speed', categoryKey: 'cadence'},
  {id: 'cadence_avg_trend', categoryKey: 'cadence'},
];

export const KNOWLEDGE_CATEGORY_KEYS = [
  'progress',
  'skills',
  'ftp',
  'power',
  'heart',
  'speed',
  'cadence',
];
