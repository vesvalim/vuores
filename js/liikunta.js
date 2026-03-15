/* js/liikunta.js – Liikuntapaikat Vuoreksen alueella (LIPAS WFS) */
'use strict';

const LiikuntaMap = (() => {
  let _map         = null;
  let _catLayers   = {};          // category key → L.LayerGroup
  let _borderLayer = null;
  let _features    = [];
  let _initialized = false;
  let _visibleCats = new Set();

  const CATS = [
    { key: 'kentta', label: 'Urheilukentät ja -alueet',    color: '#16a34a',
      test: s => /kenttä|rata|aukio|stadion|areena|pallok|golf|tennis|sulkapallo/i.test(s) },
    { key: 'halli',  label: 'Hallit ja sisäliikuntatilat',  color: '#2563eb',
      test: s => /halli|liikuntasali|kuntosali|harjoittelu|urheilutalo|squash/i.test(s) },
    { key: 'uinti',  label: 'Uinti ja vesiliikunta',        color: '#0891b2',
      test: s => /uima|uinti|vesi|ranta|lammikko|altaa/i.test(s) },
    { key: 'talvi',  label: 'Talviurheilu',                 color: '#7c3aed',
      test: s => /talvi|hiihto|latu|luistelu|jää|lumi|pulkka/i.test(s) },
    { key: 'ulko',   label: 'Ulkoliikunta ja reitit',       color: '#ea580c',
      test: s => /reitti|polku|ulko|puisto|leikkipaikka|pyöräil|frisb|skate|koripallo|lähiliikunta/i.test(s) },
    { key: 'muu',    label: 'Muut liikuntapaikat',          color: '#64748b',
      test: () => true },
  ];

  /* ── Ray-casting point-in-polygon ── */
  function _pip(pt, ring) {
    const [px, py] = pt;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (((yi > py) !== (yj > py)) &&
          px < ((xj - xi) * (py - yi) / (yj - yi)) + xi)
        inside = !inside;
    }
    return inside;
  }

  /* ── Poimii edustuspisteen geometriasta ── */
  function _coords(feature) {
    const g = feature.geometry;
    if (!g) return null;
    if (g.type === 'Point')           return g.coordinates;
    if (g.type === 'MultiPoint')      return g.coordinates[0];
    if (g.type === 'LineString')      return g.coordinates[Math.floor(g.coordinates.length / 2)];
    if (g.type === 'MultiLineString') return g.coordinates[0][0];
    return null;
  }

  /* ── Kategoria tekstin perusteella ── */
  function _getCat(f) {
    const type = f.properties.tyyppi_nimi  ?? f.properties.type_name  ?? '';
    const name = f.properties.nimi_fi      ?? f.properties.nimi       ?? f.properties.name ?? '';
    const text = type + ' ' + name;
    return CATS.find(c => c.test(text)) ?? CATS[CATS.length - 1];
  }

  /* ── SVG pin-ikoni ── */
  function _makeIcon(color) {
    const html = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="28" viewBox="0 0 22 28">
      <path d="M11 1C5.5 1 1 5.5 1 11c0 7 10 17 10 17s10-10 10-17C21 5.5 16.5 1 11 1z"
            fill="${color}" stroke="white" stroke-width="1.5"/>
      <circle cx="11" cy="11" r="4" fill="white" fill-opacity="0.9"/>
    </svg>`;
    return L.divIcon({
      html,
      className: '',
      iconSize:   [22, 28],
      iconAnchor: [11, 28],
      popupAnchor:[0, -30],
    });
  }

  /* ── Popup ── */
  function _popupHtml(p) {
    const name = p.nimi_fi ?? p.nimi ?? p.name ?? 'Nimetön liikuntapaikka';
    const type = p.tyyppi_nimi ?? p.type_name ?? '';
    const www  = p.www ?? '';
    let html = `<div class="popup-title">${name}</div><div class="popup-grid">`;
    if (type) html += `<span class="popup-label">Tyyppi</span><span class="popup-val">${type}</span>`;
    if (www)  html += `<span class="popup-label">WWW</span><span class="popup-val"><a href="${www}" target="_blank" rel="noopener noreferrer">linkki</a></span>`;
    return html + '</div>';
  }

  /* ── WFS URL ── */
  function _buildUrl(llBounds) {
    const pad  = 0.02;
    const bbox = [
      (llBounds.getWest()  - pad).toFixed(5),
      (llBounds.getSouth() - pad).toFixed(5),
      (llBounds.getEast()  + pad).toFixed(5),
      (llBounds.getNorth() + pad).toFixed(5),
    ].join(',');
    const url = new URL(CONFIG.LIPAS_WFS_URL);
    url.searchParams.set('service',      'WFS');
    url.searchParams.set('version',      '1.0.0');
    url.searchParams.set('request',      'GetFeature');
    url.searchParams.set('typeName',     CONFIG.LIPAS_WFS_LAYER);
    url.searchParams.set('maxFeatures',  '500');
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName',      'CRS:84');
    url.searchParams.set('BBOX',         bbox + ',CRS:84');
    return url.toString();
  }

  /* ── Renderöi markkerit layer-ryhmiin ── */
  function _populateLayers() {
    CATS.forEach(c => _catLayers[c.key].clearLayers());
    _features.forEach(f => {
      const cat   = _getCat(f);
      if (!_visibleCats.has(cat.key)) return;
      const coord = _coords(f);
      if (!coord) return;
      const [lon, lat] = coord;
      L.marker([lat, lon], { icon: _makeIcon(cat.color) })
        .bindPopup(_popupHtml(f.properties), { maxWidth: 260 })
        .addTo(_catLayers[cat.key]);
    });
  }

  /* ── Sivupalkki: kategoriasuodattimet + paikkalista ── */
  function _buildControls() {
    const catsEl = document.getElementById('liikunta-cats');
    const listEl = document.getElementById('liikunta-list');
    if (!catsEl || !listEl) return;

    /* Laske per-kategoria */
    const counts = {};
    _features.forEach(f => {
      const k = _getCat(f).key;
      counts[k] = (counts[k] ?? 0) + 1;
    });

    /* Kategoriapainikkeet + lukumäärät */
    let html = `<p class="liikunta-total">${_features.length} liikuntapaikkaa</p>`;
    CATS.forEach(c => {
      if (!(counts[c.key] > 0)) return;
      html += `<label class="liikunta-cat-item">
        <input type="checkbox" class="liikunta-cat-cb" data-cat="${c.key}" checked>
        <span class="liikunta-cat-dot" style="background:${c.color}"></span>
        <span class="liikunta-cat-label">${c.label}</span>
        <span class="liikunta-cat-count">${counts[c.key]}</span>
      </label>`;
    });
    catsEl.innerHTML = html;

    /* Liikuntapaikkalista aakkosjärjestyksessä */
    const sorted = [..._features].sort((a, b) => {
      const na = a.properties.nimi_fi ?? a.properties.nimi ?? '';
      const nb = b.properties.nimi_fi ?? b.properties.nimi ?? '';
      return na.localeCompare(nb, 'fi');
    });
    let listHtml = '<ul class="liikunta-list">';
    sorted.forEach(f => {
      const name  = f.properties.nimi_fi ?? f.properties.nimi ?? f.properties.name ?? 'Nimetön';
      const type  = f.properties.tyyppi_nimi ?? '';
      const cat   = _getCat(f);
      const coord = _coords(f);
      const pos   = coord ? `data-lat="${coord[1].toFixed(6)}" data-lon="${coord[0].toFixed(6)}"` : '';
      listHtml += `<li class="liikunta-list-item" ${pos}>
        <span class="liikunta-cat-dot" style="background:${cat.color}"></span>
        <span class="liikunta-list-name">${name}</span>
        ${type ? `<span class="liikunta-list-type">${type}</span>` : ''}
      </li>`;
    });
    listHtml += '</ul>';
    listEl.innerHTML = listHtml;

    /* Tapahtumakuuntelijat: kategoriavalintaruudut */
    catsEl.querySelectorAll('.liikunta-cat-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        const k = cb.dataset.cat;
        if (cb.checked) { _visibleCats.add(k);    _catLayers[k].addTo(_map); }
        else            { _visibleCats.delete(k);  _catLayers[k].remove();   }
      });
    });

    /* Tapahtumakuuntelijat: klikkaa listaa → zoom kartalle */
    listEl.querySelectorAll('.liikunta-list-item[data-lat]').forEach(item => {
      item.addEventListener('click', () => {
        _map.setView([parseFloat(item.dataset.lat), parseFloat(item.dataset.lon)], 17);
      });
    });
  }

  /* ════════════════════════════════════════════════════════
     Julkiset metodit
     ════════════════════════════════════════════════════════ */
  async function init(llBounds, boundaryFeature) {
    if (_initialized) return;
    _initialized = true;

    try {

    /* Varmista kontin korkeus ennen Leaflet-alustusta */
    const container = document.getElementById('liikunta-map');
    if (!container) { console.error('LiikuntaMap: #liikunta-map ei löydy'); return; }
    if (!container.clientHeight) container.style.height = '500px';
    console.log('LiikuntaMap: kontin korkeus', container.clientHeight, 'px');

    _map = L.map('liikunta-map', { center: CONFIG.MAP_CENTER, zoom: CONFIG.MAP_ZOOM });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-tekijät',
    }).addTo(_map);

    if (boundaryFeature) {
      _borderLayer = L.geoJSON(boundaryFeature, {
        style: { color: '#003580', weight: 2.5, opacity: 1, fill: false },
      }).addTo(_map);
      _map.fitBounds(_borderLayer.getBounds(), { padding: [24, 24] });
    }

    /* Luo per-kategoria layer-ryhmät */
    CATS.forEach(c => {
      _visibleCats.add(c.key);
      _catLayers[c.key] = L.layerGroup().addTo(_map);
    });

    /* Kartta on nyt näkyvissä – päivitä koko heti ja pienen viiveen jälkeen */
    _map.invalidateSize();
    setTimeout(() => _map.invalidateSize(), 200);

    const bounds = llBounds ?? _borderLayer?.getBounds() ?? _map.getBounds();
    const res    = await fetch(_buildUrl(bounds));
    if (!res.ok) throw new Error(`LIPAS WFS HTTP ${res.status}`);

    /* Lue tekstitä ensin – palvelin saattaa palauttaa XML-virhettä JSONin sijaan */
    const text = await res.text();
    if (text.trimStart().startsWith('<')) {
      const m = text.match(/<(?:ows:)?ExceptionText[^>]*>([^<]+)</);
      const hint = m ? m[1].trim()
        : 'Palvelin palautti XML:ää (kerrosnimi virheellinen? Tarkista LIPAS_WFS_LAYER config.js:stä)';
      console.error('LiikuntaMap XML-vastaus:', text.slice(0, 400));
      throw new Error(hint);
    }
    const data = JSON.parse(text);

    /* Normalisoi property-avaimet pieniksi */
    const norm = f => ({
      ...f,
      properties: Object.fromEntries(
        Object.entries(f.properties ?? {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
    });
    const all = (data.features ?? []).map(norm);
    console.info(`LiikuntaMap: ${all.length} kohdetta WFS:stä`);
    if (all.length) console.debug('LiikuntaMap esim.:', all[0].properties);

    /* Suodata Vuoreksen postinumeroalueelle */
    let ring = null;
    if (boundaryFeature?.geometry) {
      const g = boundaryFeature.geometry;
      ring = g.type === 'Polygon'      ? g.coordinates[0]
           : g.type === 'MultiPolygon' ? g.coordinates[0][0]
           : null;
    }
    _features = ring
      ? all.filter(f => { const c = _coords(f); return c ? _pip(c, ring) : false; })
      : all;
    console.info(`LiikuntaMap: ${_features.length} liikuntapaikkaa Vuoreksen sisällä`);

    if (!_features.length) {
      const el = document.getElementById('liikunta-cats');
      if (el) el.innerHTML = '<p class="stats-empty">Liikuntapaikkoja ei löytynyt alueelta.</p>';
      return;
    }

    _populateLayers();
    _buildControls();

    } catch (err) {
      console.error('LiikuntaMap init error:', err);
      const el = document.getElementById('liikunta-cats');
      if (el) el.innerHTML =
        `<p class="stats-empty" style="color:var(--c-error)">Virhe: ${err.message}</p>`;
    }
  }

  function invalidateSize() { if (_map) _map.invalidateSize(); }

  return { init, invalidateSize };
})();
