-- Создание таблицы для персональных целей пользователей
CREATE TABLE IF NOT EXISTS goals (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    target_value DECIMAL(10,2) NOT NULL,
    current_value DECIMAL(10,2) DEFAULT 0,
    unit VARCHAR(50) NOT NULL,
    goal_type VARCHAR(50) NOT NULL DEFAULT 'custom',
    period VARCHAR(10) NOT NULL DEFAULT '4w',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Создание индекса для быстрого поиска целей по пользователю
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);

-- Создание индекса для поиска по типу цели
CREATE INDEX IF NOT EXISTS idx_goals_goal_type ON goals(goal_type);

-- Создание индекса для поиска по периоду
CREATE INDEX IF NOT EXISTS idx_goals_period ON goals(period);

-- Комментарии к таблице
COMMENT ON TABLE goals IS 'Персональные цели пользователей';
COMMENT ON COLUMN goals.user_id IS 'ID пользователя (внешний ключ)';
COMMENT ON COLUMN goals.title IS 'Название цели';
COMMENT ON COLUMN goals.description IS 'Описание цели';
COMMENT ON COLUMN goals.target_value IS 'Целевое значение';
COMMENT ON COLUMN goals.current_value IS 'Текущее значение (автоматически обновляется)';
COMMENT ON COLUMN goals.unit IS 'Единица измерения';
COMMENT ON COLUMN goals.goal_type IS 'Тип цели: distance, elevation, time, speed_flat, speed_hills, long_rides, intervals, recovery, custom';
COMMENT ON COLUMN goals.period IS 'Период цели: 4w, 3m, year, all';
COMMENT ON COLUMN goals.created_at IS 'Дата создания';
COMMENT ON COLUMN goals.updated_at IS 'Дата последнего обновления'; 