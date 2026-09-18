// Filters box extracted from TrainingsPage (T-6.3, audit W-26). Pure
// presentational component — filtering itself happens in lib.js via
// useActivityView. Markup/classnames unchanged (still styled by
// `../TrainingsPage.css`, imported by the page).
import React from 'react';

export function ActivityFilters({ filters, onFiltersChange, types, showFilters, onToggleFilters, onReset }) {
  const setField = (field) => (e) => onFiltersChange({ ...filters, [field]: e.target.value });

  return (
    <div className="filters">
      <span className="filters-title">Filters</span>
      <button
        onClick={onToggleFilters}
        title="Collapse/Expand filters"
        className="filters-toggle"
      >
        {showFilters ? '▼' : '▲'}
      </button>
      <div className="filters-fields" style={{ display: showFilters ? 'flex' : 'none' }}>
        <div>
          <label>
            Search by name
            <br />
            <input
              type="text"
              value={filters.name}
              onChange={setField('name')}
              placeholder="Name..."
              style={{ width: 160 }}
            />
          </label>
        </div>
        <div>
          <label>
            From date
            <br />
            <input type="date" value={filters.dateFrom} onChange={setField('dateFrom')} />
          </label>
        </div>
        <div>
          <label>
            To date
            <br />
            <input type="date" value={filters.dateTo} onChange={setField('dateTo')} />
          </label>
        </div>
        <div>
          <label>
            Type
            <br />
            <select value={filters.type} onChange={setField('type')} style={{ width: 120 }}>
              <option value="">All</option>
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <label>
            Distance (km)
            <br />
            <input type="number" value={filters.distMin} onChange={setField('distMin')} placeholder="from" style={{ width: 60 }} /> –
            <input type="number" value={filters.distMax} onChange={setField('distMax')} placeholder="to" style={{ width: 60 }} />
          </label>
        </div>
        <div>
          <label>
            Average speed (km/h)
            <br />
            <input type="number" value={filters.speedMin} onChange={setField('speedMin')} placeholder="from" style={{ width: 60 }} /> –
            <input type="number" value={filters.speedMax} onChange={setField('speedMax')} placeholder="to" style={{ width: 60 }} />
          </label>
        </div>
        <div>
          <label>
            Average heartrate
            <br />
            <input type="number" value={filters.hrMin} onChange={setField('hrMin')} placeholder="from" style={{ width: 60 }} /> –
            <input type="number" value={filters.hrMax} onChange={setField('hrMax')} placeholder="to" style={{ width: 60 }} />
          </label>
        </div>
        <div>
          <label>
            Elevation gain (m)
            <br />
            <input type="number" value={filters.elevMin} onChange={setField('elevMin')} placeholder="from" style={{ width: 60 }} /> –
            <input type="number" value={filters.elevMax} onChange={setField('elevMax')} placeholder="to" style={{ width: 60 }} />
          </label>
        </div>
        <div className="filters-reset">
          <button onClick={onReset} className="reset-btn">
            Reset Filters
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActivityFilters;
