/* js/gridmap.js – 1 km väestöruutukartta (Tilastokeskus vaestoruutu WFS, 2024) */
'use strict';

const GridMap = (() => {
  let _map           = null;
  let _gridLayer     = null;
  let _boundaryLayer = null;
  let _features      = [];
  let _currentVar    = 'vaesto';
  let _currentScheme = 'blues';
  let _legendControl = null;
  let _initialized   = false;

  const SCHEMES = {
    blues:   ['#eff3ff','#c6dbef','#9ecae1','#6baed6','#3182bd','#08519c','#08306b'],
    reds:    ['#fee5d9','#fcbba1','#fc9272','#fb6a4a','#ef3b2c','#cb181d','#99000d'],
    greens:  ['#edf8e9','#c7e9c0','#a1d99b','#74c476','#41ab5d','#238b45','#005a32'],
    heat:    ['#ffffcc','#ffeda0','#fed976','#feb24c','#fd8d3c','#f03b20','#bd0026'],
    purples: ['#f2f0f7','#dadaeb','#bcbddc','#9e9ac8','#807dba','#6a51a3','#4a1486'],
  };

  /* ── Ray-casting point-in-polygon ── */
  function _pip(point, ring) {
    const [px, py] = point;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > py) !== (yj > py)) &&
          (px < ((xj - xi) * (py - yi) / (yj - yi)) + xi))
        inside = !inside;
    }
    return inside;
  }

  function _centroid(feature) {
    const ring = feature.geometry.coordinates[0];
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
  }

  function _intersectsBoundary(feature, ring) {
    try {
      const coords = feature.geometry.coordinates[0];
      if (_pip(_centroid(feature), ring)) return true;
      for (const pt of coords) { if (_pip(pt, ring))   return true; }
      for (const pt of ring)   { if (_pip(pt, coords)) return true; }
      return false;
    } catch { return false; }
  }

  /* ── WFS URL-rakentaja ── */
  function _buildWfsUrl(llBounds) {
    const pad  = 0.02;
    const bbox = [
      (llBounds.getWest()  - pad).toFixed(5),
      (llBounds.getSouth() - pad).toFixed(5),
      (llBounds.getEast()  + pad).toFixed(5),
      (llBounds.getNorth() + pad).toFixed(5),
    ].join(',');
    const url = new URL(CONFIG.GRID_WFS_URL);
    url.searchParams.set('service',      'WFS');
    url.searchParams.set('version',      '1.0.0');
    url.searchParams.set('request',      'GetFeature');
    url.searchParams.set('typeName',     CONFIG.GRID_WFS_LAYER);
    url.searchParams.set('maxFeatures',  '300');
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName',      'CRS:84');
    url.searchParams.set('BBOX',         bbox + ',CRS:84');
    return url.toString();
  }

  /* ── Apurit ── */
  function _val(f) {
    const v = f.properties[_currentVar];
    return (v == null || v < 0) ? null : +v;
  }

  function _minMax() {
    const vals = _features.map(_val).filter(v => v != null);
    if (!vals.length) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }

  function _getColor(val) {
    if (val == null) return '#d0d0d0';
    const { min, max } = _minMax();
    const steps = SCHEMES[_currentScheme];
    const t = max > min ? (val - min) / (max - min) : 0;
    return steps[Math.min(Math.floor(t * steps.length), steps.length - 1)];
  }

  function _style(f) {
    return {
      fillColor:   _getColor(_val(f)),
      fillOpacity: 0.80,
      color:       '#ffffff',
      weight:      0.8,
      opacity:     0.9,
    };
  }

  function _varLabel(code) {
    for (const g of CONFIG.GRID_VAR_GROUPS) {
      const f = g.vars.find(v => v.code === code);
      if (f) return f.label;
    }
    return code;
  }

  /* ── Popup ── */
  function _popupContent(p) {
    const fmt = v => (v == null || v < 0) ? '–' : Number(v).toLocaleString('fi-FI');
    const id  = p.grd_id ?? p.euref_id ?? p.id ?? '–';
    return `
      <div class="popup-title">Ruutu&nbsp;${id}</div>
      <div class="popup-grid">
        <span class="popup-label">Asukkaita</span>  <span class="popup-val">${fmt(p.vaesto)}</span>
        <span class="popup-label">– Miehiä</span>   <span class="popup-val">${fmt(p.miehet)}</span>
        <span class="popup-label">– Naisia</span>   <span class="popup-val">${fmt(p.naiset)}</span>
        <span class="popup-label">0–14 v</span>     <span class="popup-val">${fmt(p.ika_0_14)}</span>
        <span class="popup-label">15–64 v</span>    <span class="popup-val">${fmt(p.ika_15_64)}</span>
        <span class="popup-label">65+ v</span>      <span class="popup-val">${fmt(p.ika_65_)}</span>
      </div>`;
  }

  /* ── Karttaselite ── */
  function _updateLegend() {
    if (!_legendControl) return;
    const { min, max } = _minMax();
    const steps = SCHEMES[_currentScheme];
    const label = _varLabel(_currentVar);
    let html = `<div class="legend-title">${label}</div><div class="legend-rows">`;
    for (let i = steps.length - 1; i >= 0; i--) {
      const v = min + (max - min) * (i / (steps.length - 1));
      html += `<div class="legend-row">
        <span class="legend-swatch" style="background:${steps[i]}"></span>
        <span>${Math.round(v).toLocaleString('fi-FI')}</span>
      </div>`;
    }
    html += `<div class="legend-row">
      <span class="legend-swatch" style="background:#d0d0d0"></span>
      <span>–</span>
    </div></div>`;
    _legendControl.getContainer().innerHTML = html;
  }

  /* ── Ruutukerroksen piirto ── */
  function _renderGrid() {
    if (_gridLayer) { _map.removeLayer(_gridLayer); _gridLayer = null; }
    if (!_features.length) return;
    _gridLayer = L.geoJSON(
      { type: 'FeatureCollection', features: _features },
      {
        style: _style,
        onEachFeature: (feature, layer) => {
          layer.bindPopup(_popupContent(feature.properties), { maxWidth: 280 });
          layer.on('mouseover', function () {
            this.setStyle({ weight: 2, color: '#333', fillOpacity: 0.95 });
            this.bringToFront();
          });
          layer.on('mouseout', () => _gridLayer.resetStyle(layer));
        },
      },
    ).addTo(_map);
    _updateLegend();
    _updateStats();
  }

  /* ── Tilastolaatikko ── */
  function _updateStats() {
    const el = document.getElementById('grid-stats-box');
    if (!el) return;
    const vals = _features.map(_val).filter(v => v != null);
    if (!vals.length) {
      el.innerHTML = '<p class="stats-empty">Ei dataa valitulle muuttujalle.</p>';
      return;
    }
    const total = vals.reduce((a, b) => a + b, 0);
    const mean  = total / vals.length;
    const isAbs = true;
    const fmtN  = v => Math.round(v).toLocaleString('fi-FI');
    el.innerHTML = `
      <div class="grid-stats-title">${_varLabel(_currentVar)}</div>
      <div class="grid-stats-grid">
        <span>Ruutuja</span>   <span>${_features.length}&nbsp;kpl</span>
        ${isAbs ? `<span>Yhteensä</span><span>${fmtN(total)}</span>` : ''}
        <span>Keskiarvo</span> <span>${mean.toFixed(1)}</span>
        <span>Pienin</span>    <span>${Math.min(...vals).toFixed(1)}</span>
        <span>Suurin</span>    <span>${Math.max(...vals).toFixed(1)}</span>
      </div>`;
  }

  /* ── Muuttujavalinnan painikkeet ── */
  function _renderVarControls() {
    const container = document.getElementById('grid-var-selector');
    if (!container) return;
    let html = '';
    for (const group of CONFIG.GRID_VAR_GROUPS) {
      html += `<div class="var-group">
        <div class="var-group-label">${group.group}</div>
        <div class="var-btn-row">`;
      for (const v of group.vars)
        html += `<button class="var-btn${v.code === _currentVar ? ' active' : ''}"
                         data-var="${v.code}">${v.label}</button>`;
      html += `</div></div>`;
    }
    container.innerHTML = html;
    container.addEventListener('click', e => {
      const btn = e.target.closest('.var-btn');
      if (!btn) return;
      _currentVar = btn.dataset.var;
      container.querySelectorAll('.var-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.var === _currentVar));
      _renderGrid();
    });
  }

  /* ════════════════════════════════════════════════════════
     Julkiset metodit
     ════════════════════════════════════════════════════════ */
  async function init(llBounds, boundaryFeature) {
    if (_initialized) return;
    _initialized = true;

    _map = L.map('grid-map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-tekijät',
    }).addTo(_map);

    if (boundaryFeature) {
      _boundaryLayer = L.geoJSON(boundaryFeature, {
        style: { color: '#003580', weight: 2.5, opacity: 1, fill: false },
      }).addTo(_map);
      _map.fitBounds(_boundaryLayer.getBounds(), { padding: [24, 24] });
    }

    _legendControl = L.control({ position: 'bottomleft' });
    _legendControl.onAdd = () => {
      const div = L.DomUtil.create('div', 'grid-legend');
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    _legendControl.addTo(_map);

    try {
      const bounds = llBounds ?? _boundaryLayer?.getBounds() ?? _map.getBounds();
      const res = await fetch(_buildWfsUrl(bounds));
      if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
      const geojson = await res.json();
      console.info(`GridMap: ${geojson.features?.length ?? 0} ruutua WFS:stä haettu`);

      let ring = null;
      if (boundaryFeature?.geometry) {
        const g = boundaryFeature.geometry;
        ring = g.type === 'Polygon'      ? g.coordinates[0]
             : g.type === 'MultiPolygon' ? g.coordinates[0][0]
             : null;
      }
      const normalise = f => ({
        ...f,
        properties: Object.fromEntries(
          Object.entries(f.properties ?? {}).map(([k, v]) => [k.toLowerCase(), v])
        ),
      });
      const all = (geojson.features ?? []).map(normalise);
      _features = ring
        ? all.filter(f => _intersectsBoundary(f, ring))
        : all;
      console.info(`GridMap: ${_features.length} ruutua postinumeroalueen sisällä`);
      if (_features.length) console.debug('GridMap: esim. properties:', _features[0].properties);

      _renderGrid();
      _renderVarControls();
    } catch (err) {
      console.error('GridMap:', err.message);
      const el = document.getElementById('grid-stats-box');
      if (el) el.innerHTML =
        `<p class="stats-empty" style="color:var(--c-error)">Virhe: ${err.message}</p>`;
    }

    /* Väripalettipainikkeet */
    document.querySelectorAll('.scheme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scheme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _currentScheme = btn.dataset.scheme;
        _renderGrid();
      });
    });
  }

  function invalidateSize() { if (_map) _map.invalidateSize(); }

  return { init, invalidateSize };
})();
