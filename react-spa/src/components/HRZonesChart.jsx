import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

const HRZonesChart = ({ data }) => {
  if (!data) {
    return (
      <div className="hr-zones-chart-empty">
        Нет данных о пульсовых зонах
      </div>
    );
  }

  const { data: chartData, labels, colors, total, z2, z3, z4 } = data;

  // Подготавливаем данные для графика
  const pieData = chartData.map((value, index) => ({
    name: labels[index],
    value: value,
    color: colors[index]
  }));

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = ((data.value / total) * 100).toFixed(1);
      return (
        <div className="hr-zones-tooltip">
          <p className="tooltip-label">{data.name}</p>
          <p className="tooltip-value">Время: <strong>{data.value.toFixed(0)} мин</strong></p>
          <p className="tooltip-percentage">{percentage}% от общего времени</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="hr-zones-chart">
      <h4>Время в пульсовых зонах (8 недель)</h4>
      <div className="chart-container">
        <ResponsiveContainer width="100%" height={300} style={{ height: '300px' }}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value }) => `${value.toFixed(0)} мин`}
              outerRadius={80}
              innerRadius={40}
              fill="#8884d8"
              dataKey="value"
              paddingAngle={3}
              cornerRadius={6}
            >
              {pieData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip 
              content={<CustomTooltip />}
              cursor={false}
            />
            <Legend 
              layout="horizontal"
              verticalAlign="bottom"
              align="center"
              wrapperStyle={{
                paddingTop: '20px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="zones-summary">
        <div className="zones-grid">
          <div className="zone-item" style={{ borderLeftColor: colors[0] }}>
            <div className="zone-name">{labels[0]}</div>
            <div className="zone-stats">
              <span>{z2.toFixed(0)} мин</span>
              <span>{((z2 / total) * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="zone-item" style={{ borderLeftColor: colors[1] }}>
            <div className="zone-name">{labels[1]}</div>
            <div className="zone-stats">
              <span>{z3.toFixed(0)} мин</span>
              <span>{((z3 / total) * 100).toFixed(1)}%</span>
            </div>
          </div>
          <div className="zone-item" style={{ borderLeftColor: colors[2] }}>
            <div className="zone-name">{labels[2]}</div>
            <div className="zone-stats">
              <span>{z4.toFixed(0)} мин</span>
              <span>{((z4 / total) * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRZonesChart; 