/* js/map.js – Leaflet-kartta, WFS-postinumerorajaus ja tilastoruudut */
'use strict';

const MapModule = (() => {
  let _map         = null;
  let _boundary    = null;   // postinumerorajaus
  let _gridLayer   = null;   // tilastoruudut
  let _legend      = null;   // ruuuruutuselite
  let _popup       = null;   // avoin popup
  let _currentYear = null;

  /* Rakenna WFS-URL URL API:n avulla (turvallinen enkoodaus) */
  function _buildWfsUrl() {
    const url = new URL(CONFIG.WFS_URL);
    url.searchParams.set('service', 'WFS');
    url.searchParams.set('version', '2.0.0');
    url.searchParams.set('request', 'GetFeature');
    url.searchParams.set('typeNames', CONFIG.WFS_LAYER);
    url.searchParams.set('outputFormat', 'application/json');
    url.searchParams.set('srsName', 'CRS:84');
    // CQL_FILTER suodattaa postinumeron mukaan
    url.searchParams.set('CQL_FILTER', `${CONFIG.WFS_FIELD}='${CONFIG.POSTAL_CODE}'`);
    return url.toString();
  }

  /* Hae tilastoruudut WFS-aluerajaukselta – kokeile eri vuosia */
  async function _fetchGridData(bounds) {
    const pad  = 0.005;
    const w = (bounds.getWest()  - pad).toFixed(6);
    const s = (bounds.getSouth() - pad).toFixed(6);
    const e = (bounds.getEast()  + pad).toFixed(6);
    const n = (bounds.getNorth() + pad).toFixed(6);
    const bbox = `${w},${s},${e},${n},CRS:84`;
    console.log(`MapModule: _fetchGridData bbox=${bbox}`);

    for (const year of ['2024', '2023', '2022', '2021', '2020']) {
      const layerName = `vaestoruutu:vaki${year}_1km`;
      // Rakenna URL ilman searchParams-enkoodausta BBOX-parametrille
      const base = `${CONFIG.WFS_URL}?service=WFS&version=2.0.0&request=GetFeature` +
        `&typeNames=${encodeURIComponent(layerName)}&outputFormat=application%2Fjson` +
        `&srsName=CRS%3A84&BBOX=${bbox}`;
      console.log(`MapModule: haetaan ${layerName}`);
      try {
        const r = await fetch(base);
        if (!r.ok) {
          console.warn(`MapModule: ${layerName} — HTTP ${r.status}, kokeillaan seuraavaa vuotta`);
          continue;
        }
        const gj = await r.json();
        if (gj.features?.length) {
          console.info(`MapModule: grid ${layerName} — ${gj.features.length} ruutua löytyi`);
          return { gj, year, res: '1km' };
        }
        console.debug(`MapModule: ${layerName} — ei ruutuja bbox:ssä`);
      } catch (e2) {
        console.warn(`MapModule: ${layerName} — virhe:`, e2.message);
      }
    }
    console.warn('MapModule: ruututietoja ei löytynyt yhdelläkään vuodella');
    return null;
  }

  /* Ruudun väri ColorBrewer YlGnBu -asteikolla väkiluvun mukaan */
  function _cellColor(pop, maxPop) {
    if (!pop || pop <= 0) return null;   // käyttää fillOpacity: 0 tyhjille
    const t  = Math.sqrt(Math.min(pop / maxPop, 1));
    const cs = [[255,255,204],[161,218,180],[65,182,196],[44,127,184],[37,52,148]];
    const p  = t * (cs.length - 1);
    const lo = Math.floor(p), hi = Math.min(lo + 1, cs.length - 1);
    const f  = p - lo;
    const [rv, gv, bv] = [0, 1, 2].map(i => Math.round(cs[lo][i] + (cs[hi][i] - cs[lo][i]) * f));
    return `rgb(${rv},${gv},${bv})`;
  }

  /* Leaflet-selite tilastoruudukkoväritykselle */
  function _buildLegend(maxPop, year) {
    if (_legend) { _legend.remove(); _legend = null; }
    const ctrl = L.control({ position: 'bottomright' });
    ctrl.onAdd = () => {
      const div   = L.DomUtil.create('div', 'grid-legend');
      const label = '1 km × 1 km';
      const rows  = [1, 0.75, 0.5, 0.25, 0].map(t => {
        const v   = Math.round(t * maxPop);
        const col = _cellColor(v, maxPop) ?? '#cccccc';
        return `<div class="grid-legend-row"><span class="grid-legend-swatch" style="background:${col};opacity:${v > 0 ? 0.80 : 0.10}"></span><span>${v.toLocaleString('fi-FI')}</span></div>`;
      }).join('');
      div.innerHTML = `<div class="grid-legend-title">as. / ruutu<br><em>${year} · ${label}</em></div>${rows}`;
      return div;
    };
    _legend = ctrl;
    return ctrl;
  }

  /* Muodosta popupin HTML-sisältö vuoden datan pohjalta */
  function _popupHTML(year) {
    const fmt = v => (v == null ? '–' : v.toLocaleString('fi-FI'));
    const fmtKika = v => (v == null ? '–' : v.toFixed(1));

    const vakiy = PaavoDB.get(year, 'he_vakiy');
    const kika  = PaavoDB.get(year, 'he_kika');
    const ke    = PaavoDB.get(year, 'ra_ke');
    const asunn = PaavoDB.get(year, 'ra_asunn');

    return `
      <div class="popup-title">Vuores (${CONFIG.POSTAL_CODE}) &ndash; ${year}</div>
      <div class="popup-grid">
        <span class="popup-label">Asukkaita</span>
        <span class="popup-val">${fmt(vakiy)}</span>
        <span class="popup-label">Keski-ikä</span>
        <span class="popup-val">${fmtKika(kika)} v</span>
        <span class="popup-label">Rakennuksia</span>
        <span class="popup-val">${fmt(ke)}</span>
        <span class="popup-label">Asuntoja</span>
        <span class="popup-val">${fmt(asunn)}</span>
      </div>`;
  }

  /* Alusta kartta, hae postinumerorajaus ja tilastoruudut */
  async function init() {
    _map = L.map('map', {
      center: CONFIG.MAP_CENTER,
      zoom:   CONFIG.MAP_ZOOM,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-tekijät',
    }).addTo(_map);

    try {
      const res = await fetch(_buildWfsUrl());
      if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
      const geojson = await res.json();

      if (!geojson.features?.length) {
        console.warn('MapModule: postinumeroaluetta 33870 ei löydy WFS:stä.');
        return;
      }

      const bounds = L.geoJSON(geojson).getBounds();

      /* 1. Tilastoruudut ensin (tulevat kartan alemmalle tasolle) */
      const grid = await _fetchGridData(bounds);
      if (grid) {
        const { gj, year: gy } = grid;
        const pops   = gj.features.map(f => f.properties.vaesto ?? 0);
        const maxPop = Math.max(...pops, 1);

        _gridLayer = L.geoJSON(gj, {
          style: feature => {
            const pop   = feature.properties.vaesto ?? 0;
            const color = _cellColor(pop, maxPop);
            return {
              color:       '#666',
              weight:      0.5,
              fillColor:   color ?? '#cccccc',
              fillOpacity: color ? 0.80 : 0.10,
            };
          },
          onEachFeature: (feature, layer) => {
            const pop = feature.properties.vaesto ?? 0;
            layer.bindTooltip(
              `<strong>${pop > 0 ? pop.toLocaleString('fi-FI') + '\u00a0as.' : '&lt;\u00a03 as. (suojattu)'}</strong>` +
              `<br><small>1 km × 1 km · ${gy}</small>`,
              { sticky: true, direction: 'top' }
            );
          },
        }).addTo(_map);

        _buildLegend(maxPop, gy).addTo(_map);
      }

      /* 2. Postinumerorajaus päällimmäiseksi */
      _boundary = L.geoJSON(geojson, {
        style: {
          color:       '#003580',
          weight:      2.5,
          opacity:     1,
          fillColor:   '#003580',
          fillOpacity: grid ? 0 : 0.08,
        },
        onEachFeature: (_feature, layer) => {
          layer.on('click', e => {
            if (_popup) _popup.remove();
            _popup = L.popup({ maxWidth: 240 })
              .setLatLng(e.latlng)
              .setContent(_popupHTML(_currentYear))
              .addTo(_map);
          });
          layer.on('mouseover', () => layer.setStyle({ weight: 3.5 }));
          layer.on('mouseout',  () => layer.setStyle({ weight: 2.5 }));
        },
      }).addTo(_map);

      _map.fitBounds(bounds, { padding: [20, 20] });
    } catch (err) {
      console.warn('MapModule: WFS-haku epäonnistui –', err.message);
    }
  }

  /* Päivitä vuosi (puhutaan popupin sisältöä seuraavalla klikkauksella) */
  function updateYear(year) {
    _currentYear = year;
    if (_popup && _popup.isOpen()) {
      _popup.setContent(_popupHTML(year));
    }
  }

  return { init, updateYear };
})();
