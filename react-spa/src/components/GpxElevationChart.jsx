import React, { useRef, useState, useEffect } from 'react';
import GPXParser from 'gpxparser';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, ReferenceLine } from 'recharts';
import html2canvas from 'html2canvas';

export default React.memo(GpxElevationChart);

function GpxElevationChart() {
  const [elevationData, setElevationData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const fileInputRef = useRef();
  const memoRef = useRef();
  const [memoCollapsed, setMemoCollapsed] = useState(true);

  // Функция для расчёта расстояния между двумя точками (в метрах)
  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000; // радиус Земли в метрах
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const points = parseGpx(event.target.result);
      if (points && points.length > 0) {
        localStorage.setItem('gpxElevationData', JSON.stringify(points));
        localStorage.setItem('gpxFileName', file.name);
        setElevationData(points);
      }
    };
    reader.readAsText(file);
  };

  // Парсинг GPX-текста
  function parseGpx(gpxText) {
    const gpx = new GPXParser();
    gpx.parse(gpxText);
    const track = gpx.tracks[0];
    if (!track) {
      setElevationData([]);
      setFileName('');
      setHasLoaded(true);
      return [];
    }
    let dist = 0;
    let prev = null;
    const points = track.points.map((pt, idx) => {
      if (prev) {
        const dx = haversine(prev.lat, prev.lon, pt.lat, pt.lon);
        dist += dx;
      }
      prev = pt;
      return {
        km: +(dist / 1000).toFixed(2),
        elevation: pt.ele
      };
    });
    setHasLoaded(true);
    return points;
  }

  // При монтировании — если есть файл в localStorage, парсим его
  useEffect(() => {
    if (!hasLoaded) {
      const data = localStorage.getItem('gpxElevationData');
      const gpxName = localStorage.getItem('gpxFileName');
      if (data) {
        setFileName(gpxName || 'Загруженный GPX');
        setElevationData(JSON.parse(data));
        setHasLoaded(true);
      }
    }
    // eslint-disable-next-line
  }, [hasLoaded]);

  // Очистить данные
  const handleClear = () => {
    localStorage.removeItem('gpxElevationData');
    localStorage.removeItem('gpxFileName');
    setElevationData([]);
    setFileName('');
    setHasLoaded(false);
  };

  // --- Генерация отметок ---
  // Вода: каждые 7 км, Гель: 20 км, Батончик: 40 км
  const marks = [];
  if (elevationData.length > 0) {
    const maxKm = elevationData[elevationData.length - 1].km;
    for (let km = 7; km < maxKm; km += 7) {
      marks.push({ km, type: 'В', color: '#00B2FF' });
    }
    for (let km = 20; km < maxKm; km += 20) {
      marks.push({ km, type: 'Г', color: '#FFB800' });
    }
    for (let km = 40; km < maxKm; km += 40) {
      marks.push({ km, type: 'Б', color: '#FF5C5C' });
    }
  }

  // --- Интеллектуальная памятка для питания и гидрации ---
  // Для каждой точки считаем кумулятивное время и набор высоты
  let nutritionTable = [];
  if (elevationData.length > 0) {
    // 1. Добавляем время и набор высоты к каждой точке
    let elapsed = 0;
    let prev = null;
    let elevGain = 0;
    const points = elevationData.map((pt, idx) => {
      let dt = 0;
      if (prev) {
        // Оценим dt по средней скорости (км/ч)
        const dx = pt.km - prev.km;
        const avgSpeed = 20; // км/ч, можно сделать настраиваемым
        dt = dx / avgSpeed * 3600; // сек
        if (pt.elevation > prev.elevation) elevGain += pt.elevation - prev.elevation;
      }
      elapsed += dt;
      const res = { ...pt, elapsed, elevGain };
      prev = pt;
      return res;
    });
    // 2. Вода: каждые 15 мин по времени
    let waterEvents = [];
    let t = 15 * 60;
    while (t < points[points.length - 1].elapsed) {
      // Находим ближайшую точку по времени
      let pt = points.reduce((prev, curr) => Math.abs(curr.elapsed - t) < Math.abs(prev.elapsed - t) ? curr : prev);
      waterEvents.push({ km: pt.km.toFixed(1), time: pt.elapsed, type: 'В', reason: '15 мин' });
      t += 15 * 60;
    }
    // 3. Вода: если набор > 100 м за 15 мин
    for (let i = 1; i < points.length; ++i) {
      const windowStart = points[i].elapsed - 15 * 60;
      const elevStart = points.find(p => p.elapsed >= windowStart)?.elevation ?? points[0].elevation;
      const elevGain = points[i].elevation - elevStart;
      if (elevGain > 100) {
        // Проверяем, нет ли уже воды рядом
        if (!waterEvents.some(ev => Math.abs(ev.time - points[i].elapsed) < 8 * 60)) {
          waterEvents.push({ km: points[i].km.toFixed(1), time: points[i].elapsed, type: 'В', reason: 'набор высоты' });
        }
      }
    }
    // 4. Гель и батончик по времени
    let gelEvents = [];
    let barEvents = [];
    const maxTime = points[points.length - 1].elapsed;
    // Гель — каждые 40 минут
    for (let t = 40 * 60; t < maxTime; t += 40 * 60) {
      let pt = points.reduce((prev, curr) => Math.abs(curr.elapsed - t) < Math.abs(prev.elapsed - t) ? curr : prev);
      gelEvents.push({ km: pt.km.toFixed(1), time: pt.elapsed, type: 'Г', reason: '40 мин' });
    }
    // Батончик — каждые 1.5 часа
    for (let t = 90 * 60; t < maxTime; t += 90 * 60) {
      let pt = points.reduce((prev, curr) => Math.abs(curr.elapsed - t) < Math.abs(prev.elapsed - t) ? curr : prev);
      barEvents.push({ km: pt.km.toFixed(1), time: pt.elapsed, type: 'Б', reason: '1.5 ч' });
    }
    // 5. Собираем все события и группируем по времени (±2 мин)
    let allEvents = [...waterEvents, ...gelEvents, ...barEvents];
    allEvents.sort((a, b) => a.time - b.time);
    // Группировка событий с близким временем
    let grouped = [];
    for (let i = 0; i < allEvents.length; ++i) {
      const ev = allEvents[i];
      // Ищем, есть ли уже группа с похожим временем (±2 мин)
      let group = grouped.find(g => Math.abs(g.time - ev.time) < 2 * 60);
      if (group) {
        if (!group.type.includes(ev.type)) group.type.push(ev.type);
        if (!group.reason.includes(ev.reason)) group.reason.push(ev.reason);
      } else {
        grouped.push({ km: ev.km, time: ev.time, type: [ev.type], reason: [ev.reason] });
      }
    }
    nutritionTable = grouped;
  }

  // Экспорт памятки в PNG
  const handleExportPNG = async () => {
    if (!memoRef.current) return;
    // Сохраним исходные стили
    const prevBg = memoRef.current.style.background;
    const prevColor = memoRef.current.style.color;
    // Установим светлый фон и темный текст для экспорта
    memoRef.current.style.background = '#f6f8ff';
    memoRef.current.style.color = '#23272f';
    // Экспорт
    const canvas = await html2canvas(memoRef.current, { backgroundColor: '#f6f8ff', scale: 2 });
    const link = document.createElement('a');
    link.download = 'nutrition-memo.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
    // Вернем стили обратно
    memoRef.current.style.background = prevBg;
    memoRef.current.style.color = prevColor;
  };

  // Форматирование времени в ч:мм
  function formatTime(sec) {
    if (!sec && sec !== 0) return '';
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h + ':' + (m < 10 ? '0' : '') + m;
  }

  return (
    <div id="gpx-elevation-block" className="gpx-elevation-block">
      <h2 style={{ color: '#f6f8ff' }}>Upload GPX and see elevation chart</h2>
      <input
        type="file"
        accept=".gpx"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="gpx-file-input"
      />
      {fileName && <div style={{ marginBottom: '1em', color: '#b0b8c9' }}>Файл: {fileName} <button onClick={handleClear} style={{ marginLeft: 12, color: '#7eaaff', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.98em' }}>Очистить</button></div>}
      {elevationData.length > 0 ? (
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={elevationData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="elevColor" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7eaaff" stopOpacity={0.32}/>
                <stop offset="100%" stopColor="#7eaaff" stopOpacity={0.01}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#353a44" />
            <XAxis
              dataKey="km"
              type="number"
              domain={['dataMin', 'dataMax']}
              tick={{ fontSize: 13, fill: '#b0b8c9' }}
              axisLine={{ stroke: '#444' }}
              tickLine={false}
              label={{ value: 'KM', position: 'insideBottomRight', offset: -5, fill: '#b0b8c9', fontSize: 14 }}
            />
            <YAxis dataKey="elevation" tick={{ fontSize: 13, fill: '#b0b8c9' }} axisLine={{ stroke: '#444' }} tickLine={false} label={{ value: 'Height m', angle: -90, position: 'insideLeft', fill: '#b0b8c9', fontSize: 14 }} width={60} />
            <Tooltip 
              contentStyle={{ background: '#23272f', border: '1.5px solid #7eaaff', fontSize: 15, color: '#f6f8ff' }}
              formatter={(v) => Math.round(v)}
              labelFormatter={v => `KM: ${v}`}
              labelStyle={{ color: '#f6f8ff' }}
              itemStyle={{ color: '#f6f8ff' }}
            />
            {nutritionTable.map((row, i) => {
              // Определяем opacity: если есть Б или Г — 0.5, иначе 1
              const hasBarOrGel = row.type.includes('Б') || row.type.includes('Г');
              const strokeColor = row.type.length === 1
                ? (row.type[0] === 'В' ? '#00B2FF' : row.type[0] === 'Г' ? '#FFB800' : row.type[0] === 'Б' ? '#FF5C5C' : '#b0b8c9')
                : '#b0b8c9';
              const labelColor = row.type.length === 1
                ? (row.type[0] === 'В' ? '#00B2FF' : row.type[0] === 'Г' ? '#FFB800' : row.type[0] === 'Б' ? '#FF5C5C' : '#b0b8c9')
                : '#b0b8c9';
              return (
                <ReferenceLine
                  key={i + '-' + row.type.join(',')}
                  x={parseFloat(row.km)}
                  stroke={strokeColor}
                  strokeDasharray="2 4"
                  strokeWidth={2}
                  ifOverflow="extendDomain"
                  label={{
                    value: row.type.join(','),
                    position: 'top',
                    fill: labelColor,
                    fontSize: 13,
                    fontWeight: 700
                  }}
                />
              );
            })}
            <Area type="monotone" dataKey="elevation" stroke="#7eaaff" fill="url(#elevColor)" strokeWidth={2} dot={false} isAnimationActive={true} animationDuration={1200} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ color: '#b0b8c9', marginTop: '2em' }}>Upload GPX file to see elevation chart</div>
      )}
      {/* Таблица-памятка */}
      {nutritionTable.length > 0 && (
        <>
          {/* Кнопки сворачивания и экспорта в PNG в одной строке */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: '1em', alignItems: 'center', marginTop: '2em', marginBottom: '0.5em' }}>
            <button
              onClick={handleExportPNG}
              className="accent-btn"
            >
              Download PNG
            </button>
            <button
              onClick={() => setMemoCollapsed(v => !v)}
              className="memo-toggle-btn"
            >
              {memoCollapsed ? 'Expand' : 'Collapse'}
              <span style={{ fontSize: '1.1em', transition: 'transform 0.2s', display: 'inline-block', transform: memoCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', color: '#fff' }}>
                ▼
              </span>
            </button>
          </div>
          {/* Памятка всегда в DOM, но скрыта если свернута */}
          <div
            ref={memoRef}
            style={memoCollapsed
              ? { display: 'none', marginTop: '2.5em', padding: '1.5em 2em', maxWidth: 520 }
              : { marginTop: '2.5em', padding: '1.5em 2em', maxWidth: 520 }
            }
          >
            <h3 style={{ margin: 0, marginBottom: '1em', fontSize: '1.1em', fontWeight: 700 }}>Reminder for nutrition and hydration</h3>
            <table style={{ width: '32%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
              <thead>
                <tr style={{ color: '#888', fontWeight: 600 }}>
                  <th style={{ textAlign: 'left', padding: '0.3em 0.7em' }}>Km</th>
                  <th style={{ textAlign: 'left', padding: '0.3em 0.7em' }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '0.3em 0.7em' }}>What</th>
                </tr>
              </thead>
              <tbody>
                {nutritionTable.map((row, i) => (
                  <tr key={i} style={i !== nutritionTable.length - 1 ? { borderBottom: '1px solid #484848' } : {}}>
                    <td style={{ padding: '0.3em 0.7em', fontSize: '0.85em', fontWeight: 700 }}>{row.km}</td>
                    <td style={{ padding: '0.3em 0.7em', fontSize: '0.85em', fontWeight: 700 }}>{formatTime(row.time)}</td>
                    <td style={{ padding: '0.3em 0.7em', fontSize: '0.85em', fontWeight: 700 }}>{row.type.join(',')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ color: '#888', fontSize: '0.98em', marginTop: '1em' }}>
              W — water, G — gel (every 40 min), B — bar (every 1.5 h)
            </div>
          </div>
        </>
      )}
    </div>
  );
} 