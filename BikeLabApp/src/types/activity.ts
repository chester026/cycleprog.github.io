export interface Activity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  start_date: string;
  type: string;
  total_elevation_gain: number;
  elev_high?: number; // максимальная высота
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_temp?: number;
  average_watts?: number; // реальная средняя мощность
  max_watts?: number; // реальная максимальная мощность
  weighted_average_watts?: number; // взвешенная средняя мощность
}

