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

  /* Hae tilastoruudut WFS-aluerajaukselta – kokeile eri vuosia ja resoluutioita */
  async function _fetchGridData(bounds) {
    const pad  = 0.005;
    const bbox = `${bounds.getWest() - pad},${bounds.getSouth() - pad},` +
                 `${bounds.getEast() + pad},${bounds.getNorth() + pad},CRS:84`;

    for (const year of ['2024', '2023', '2022', '2021', '2020']) {
      for (const res of ['250m', '1km']) {
        const layerName = `vaestoruutu:vaki${year}_${res}`;
        const url = new URL(CONFIG.WFS_URL);
        url.searchParams.set('service',      'WFS');
        url.searchParams.set('version',      '2.0.0');
        url.searchParams.set('request',      'GetFeature');
        url.searchParams.set('typeNames',    layerName);
        url.searchParams.set('outputFormat', 'application/json');
        url.searchParams.set('srsName',      'CRS:84');
        url.searchParams.set('BBOX',         bbox);
        try {
          const r = await fetch(url.toString());
          if (!r.ok) continue;
          const gj = await r.json();
          if (gj.features?.length) {
            console.info(`MapModule: grid ${layerName} – ${gj.features.length} ruutua`);
            return { gj, year, res };
          }
          console.debug(`MapModule: ${layerName} – ei ruutuja`);
        } catch (e2) {
          console.debug(`MapModule: ${layerName} –`, e2.message);
        }
      }
    }
    return null;
  }

  /* Ruudun väri ColorBrewer YlGnBu -asteikolla väkiluvun mukaan */
  function _cellColor(pop, maxPop) {
    if (!pop || pop <= 0) return 'rgba(200,200,200,0.15)';
    const t  = Math.sqrt(Math.min(pop / maxPop, 1));
    const cs = [[255,255,204],[161,218,180],[65,182,196],[44,127,184],[37,52,148]];
    const p  = t * (cs.length - 1);
    const lo = Math.floor(p), hi = Math.min(lo + 1, cs.length - 1);
    const f  = p - lo;
    const [r, g, b] = [0, 1, 2].map(i => Math.round(cs[lo][i] + (cs[hi][i] - cs[lo][i]) * f));
    return `rgba(${r},${g},${b},0.82)`;
  }

  /* Leaflet-selite tilastoruudukkoväritykselle */
  function _buildLegend(maxPop, year, res) {
    if (_legend) { _legend.remove(); _legend = null; }
    const ctrl = L.control({ position: 'bottomright' });
    ctrl.onAdd = () => {
      const div   = L.DomUtil.create('div', 'grid-legend');
      const label = res === '250m' ? '250 m × 250 m' : '1 km × 1 km';
      const rows  = [1, 0.75, 0.5, 0.25, 0].map(t => {
        const v = Math.round(t * maxPop);
        return `<div class="grid-legend-row"><span class="grid-legend-swatch" style="background:${_cellColor(v, maxPop)}"></span><span>${v.toLocaleString('fi-FI')}</span></div>`;
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
        const { gj, year: gy, res: gr } = grid;
        const pops   = gj.features.map(f => f.properties.vaesto ?? 0);
        const maxPop = Math.max(...pops, 1);
        const size   = gr === '250m' ? '250 m × 250 m' : '1 km × 1 km';

        _gridLayer = L.geoJSON(gj, {
          style: feature => ({
            color:       '#888',
            weight:      0.5,
            fillColor:   _cellColor(feature.properties.vaesto ?? 0, maxPop),
            fillOpacity: 0.82,
          }),
          onEachFeature: (feature, layer) => {
            const pop = feature.properties.vaesto ?? 0;
            layer.bindTooltip(
              `<strong>${pop > 0 ? pop.toLocaleString('fi-FI') + '\u00a0as.' : '&lt;\u00a03 as. (suojattu)'}</strong>` +
              `<br><small>${size}\u00a0·\u00a0${gy}</small>`,
              { sticky: true, direction: 'top' }
            );
          },
        }).addTo(_map);

        _buildLegend(maxPop, gy, gr).addTo(_map);
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
