// Last-ride card — the web build of the app's hero: the map carries the card's
// top radius, a dark #191b20 panel underneath holds the date, the ride name,
// three stats and the blue "Analyze ride" pill.
//
// The old HeroTrackBanner stretched the user's uploaded photo across a
// full-bleed 480px band, which cropped portrait phone shots into a letterbox;
// those photos now live in the photo strip instead and the map gets a proper
// dark tile behind it.
import React, { useEffect, lazy, Suspense } from 'react';
import { MapContainer, Polyline, CircleMarker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import StravaLogo from './StravaLogo';

const TileLayer = lazy(() =>
  import('react-leaflet').then(module => ({ default: module.TileLayer }))
);

// Fits the view to the track. Uses map.fitBounds with the raw latlng array so
// no global Leaflet `L` is needed — the old MapBounds relied on `L` being on
// window, which it never is under an ESM import.
function FitTrack({ positions }) {
  const map = useMap();

  useEffect(() => {
    if (positions && positions.length > 0) {
      map.fitBounds(positions, { padding: [26, 26] });
    }
  }, [positions, map]);

  return null;
}

const ShareIcon = () => (
  <svg viewBox="0 -960 960 960" aria-hidden="true">
    <path d="M240-40q-33 0-56.5-23.5T160-120v-440q0-33 23.5-56.5T240-640h80v80h-80v440h480v-440h-80v-80h80q33 0 56.5 23.5T800-560v440q0 33-23.5 56.5T720-40H240Zm200-280v-447l-64 64-56-57 160-160 160 160-56 57-64-64v447h-80Z" />
  </svg>
);

export default function GarageLastRideCard({ lastRide, trackCoords, onAnalyze, onShare }) {
  const distance = lastRide?.distance ? (lastRide.distance / 1000).toFixed(1) : '—';
  const speed = lastRide?.average_speed ? (lastRide.average_speed * 3.6).toFixed(1) : '—';
  const elevation = lastRide?.total_elevation_gain
    ? Math.round(lastRide.total_elevation_gain)
    : '—';

  const date = lastRide?.start_date
    ? new Date(lastRide.start_date).toLocaleDateString('en-US', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    : '—';

  const hasTrack = Array.isArray(trackCoords) && trackCoords.length > 0;

  return (
    <div className="garage-ride-card">
      <div className="garage-ride-map">
        {hasTrack ? (
          <>
            <MapContainer
              center={trackCoords[0]}
              zoom={13}
              className="garage-ride-map-inner"
              scrollWheelZoom={false}
              dragging={false}
              doubleClickZoom={false}
              boxZoom={false}
              keyboard={false}
              zoomControl={false}
              attributionControl={false}
              touchZoom={false}
            >
              {/* CARTO's dark_all raster basemap now requires an API key
                  (returns "API KEY REQUIRED" placeholder tiles for anonymous
                  requests as of 2026 — see docs.carto.com/faqs/carto-basemaps).
                  Swapped to Esri's keyless legacy REST tile services instead:
                  World_Dark_Gray_Base (land/water) + World_Dark_Gray_Reference
                  (roads/labels) stacked on top, both {z}/{y}/{x} ordered (Esri's
                  REST convention, not the {z}/{x}/{y} CARTO/OSM use) and with
                  no {s} subdomain rotation — services.arcgisonline.com is a
                  single fixed host. Esri lists these as "mature support /
                  no longer updated" (a legacy tier, not actively developed)
                  but they're free and keyless; attribution is required
                  ("Esri, HERE, Garmin, (c) OpenStreetMap contributors, and
                  the GIS user community") — surface it somewhere if this
                  basemap stays long-term, since attributionControl is off
                  here for the card's clean look. */}
              <Suspense fallback={null}>
                <TileLayer url="https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" />
                <TileLayer url="https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
              </Suspense>
              <Polyline positions={trackCoords} color="#fff" weight={3} lineCap="round" lineJoin="round" />
              <CircleMarker
                center={trackCoords[0]}
                radius={7}
                color="#fff"
                fillColor="#274dd3"
                fillOpacity={1}
              />
              <FitTrack positions={trackCoords} />
            </MapContainer>
            <div className="garage-ride-map-scrim" />
          </>
        ) : (
          <div className="garage-ride-map-empty">No track data</div>
        )}

        {/* Strava attribution has to stay visible wherever their data is shown.
            PartnersLogo positions itself absolutely (top/right by default), so
            it is re-anchored to the map's bottom-right and lifted above the
            scrim rather than wrapped in a flex row. */}
        <StravaLogo
          style={{ top: 'auto', bottom: '12px', right: '16px', zIndex: 500 }}
        />
      </div>

      <div className="garage-ride-panel">
        <div className="garage-ride-head">
          <div>
            <div className="garage-ride-date">{date}</div>
            <h2 className="garage-ride-name">{lastRide?.name || 'Last ride track'}</h2>
          </div>
          {lastRide && onShare && (
            <button className="garage-ride-share" onClick={onShare} title="Share ride">
              <ShareIcon />
            </button>
          )}
        </div>

        <div className="garage-ride-stats">
          <div className="garage-ride-stat">
            <div className="garage-ride-stat-label">Distance<span></span></div>
            <div className="garage-ride-stat-value">{distance} km</div>
          </div>
          <div className="garage-ride-stat">
            <div className="garage-ride-stat-label">Avg speed<span></span></div>
            <div className="garage-ride-stat-value">{speed} km/h</div>
          </div>
          <div className="garage-ride-stat">
            <div className="garage-ride-stat-label">Elevation<span></span></div>
            <div className="garage-ride-stat-value">{elevation} m</div>
          </div>
        </div>

        <button className="garage-analyze-btn" onClick={onAnalyze} disabled={!lastRide}>
          Analyze ride
        </button>
      </div>
    </div>
  );
}
