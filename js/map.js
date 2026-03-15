/* js/map.js – Leaflet-kartta ja WFS-postinumerorajaus */
'use strict';

const MapModule = (() => {
  let _map        = null;
  let _boundary   = null;   // GeoJSON-kerros
  let _popup      = null;   // avoin popup-viite
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

  /* Alusta kartta, hae WFS-rajaus */
  async function init() {
    /* Leaflet-kartta */
    _map = L.map('map', {
      center: CONFIG.MAP_CENTER,
      zoom:   CONFIG.MAP_ZOOM,
    });

    /* OpenStreetMap -taustakartta */
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-tekijät',
    }).addTo(_map);

    /* Hae postinumerorajaus WFS:stä */
    try {
      const res = await fetch(_buildWfsUrl());
      if (!res.ok) throw new Error(`WFS HTTP ${res.status}`);
      const geojson = await res.json();

      if (!geojson.features || geojson.features.length === 0) {
        console.warn('MapModule: postinumeroaluetta 33870 ei löydy WFS:stä.');
        return;
      }

      _boundary = L.geoJSON(geojson, {
        style: {
          color:       '#003580',
          weight:      2.5,
          opacity:     1,
          fillColor:   '#003580',
          fillOpacity: 0.08,
        },
        onEachFeature: (_feature, layer) => {
          layer.on('click', e => {
            if (_popup) _popup.remove();
            _popup = L.popup({ maxWidth: 240 })
              .setLatLng(e.latlng)
              .setContent(_popupHTML(_currentYear))
              .addTo(_map);
          });
          layer.on('mouseover', () => {
            layer.setStyle({ fillOpacity: 0.18, weight: 3 });
          });
          layer.on('mouseout', () => {
            layer.setStyle({ fillOpacity: 0.08, weight: 2.5 });
          });
        },
      }).addTo(_map);

      /* Zoomaa rajaukseen */
      _map.fitBounds(_boundary.getBounds(), { padding: [20, 20] });
    } catch (err) {
      console.warn('MapModule: WFS-haku epäonnistui –', err.message);
      /* Kartta toimii silti ilman rajausta */
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
