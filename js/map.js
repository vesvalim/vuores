/* js/map.js – Leaflet-kartta, WFS-postinumerorajaus ja OSM-rakennukset */
'use strict';

const MapModule = (() => {
  let _map         = null;
  let _boundary    = null;   // postinumerorajaus
  let _gridLayer   = null;   // rakennukset
  let _legend      = null;   // selite
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

  /* Hae rakennukset Overpass API:sta (OpenStreetMap) */
  async function _fetchBuildings(bounds) {
    const pad = 0.001;
    const s = (bounds.getSouth() - pad).toFixed(6);
    const w = (bounds.getWest()  - pad).toFixed(6);
    const n = (bounds.getNorth() + pad).toFixed(6);
    const e = (bounds.getEast()  + pad).toFixed(6);
    // Overpass bbox-järjestys: etelä,länsi,pohjoinen,itä
    const query = `[out:json][bbox:${s},${w},${n},${e}];(way[building];);out geom;`;
    console.log(`MapModule: haetaan rakennukset Overpass API:sta bbox=${s},${w},${n},${e}`);
    const r = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const data = await r.json();
    const elems = data.elements ?? [];
    console.info(`MapModule: ${elems.length} rakennusta löytyi`);
    return _osmToGeoJSON(elems);
  }

  /* Muunna Overpass-elementit GeoJSON:ksi */
  function _osmToGeoJSON(elements) {
    const features = [];
    for (const el of elements) {
      if (el.type !== 'way' || !el.geometry?.length) continue;
      const coords = el.geometry.map(p => [p.lon, p.lat]);
      // Sulje rengas tarvittaessa
      if (coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push(coords[0]);
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [coords] },
        properties: el.tags ?? {},
      });
    }
    return { type: 'FeatureCollection', features };
  }

  /* Rakennuksen täyttöväri tyypin mukaan */
  function _buildingColor(type) {
    switch (type) {
      case 'apartments':
      case 'flat':
      case 'residential': return '#3b82f6';          // sininen – kerrostalo
      case 'house':
      case 'detached':
      case 'semidetached_house': return '#f59e0b';   // oranssi – omakotitalo
      case 'terrace': return '#fbbf24';              // keltainen – rivitalo
      case 'garage':
      case 'garages':
      case 'carport': return '#9ca3af';              // harmaa – autotalli
      case 'construction': return '#f97316';         // oranssi – rakenteilla
      case 'office':
      case 'commercial':
      case 'retail':
      case 'supermarket': return '#0d9488';          // vihreä – toimisto/kauppa
      case 'school':
      case 'kindergarten': return '#8b5cf6';         // violetti – koulu/päiväkoti
      default: return '#d1d5db';                     // vaalea – muu/tuntematon
    }
  }

  /* Rakennustyyppi suomeksi */
  function _buildingLabel(type) {
    const m = {
      apartments: 'Kerrostalo', flat: 'Kerrostalo',
      residential: 'Asuinrakennus',
      house: 'Omakotitalo', detached: 'Omakotitalo',
      semidetached_house: 'Paritalo',
      terrace: 'Rivitalo',
      garage: 'Autotalli', garages: 'Autotallit', carport: 'Autokatos',
      construction: 'Rakenteilla',
      office: 'Toimisto', commercial: 'Liike', retail: 'Myymälä',
      supermarket: 'Kauppa',
      school: 'Koulu', kindergarten: 'Päiväkoti',
    };
    return m[type] ?? 'Muu rakennus';
  }

  /* Leaflet-selite rakennustyypeille */
  function _buildLegend() {
    if (_legend) { _legend.remove(); _legend = null; }
    const ctrl = L.control({ position: 'bottomright' });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create('div', 'grid-legend');
      const entries = [
        ['apartments',   'Kerrostalo'],
        ['house',        'Omakotitalo'],
        ['terrace',      'Rivitalo'],
        ['garage',       'Autotalli'],
        ['office',       'Toimisto/kauppa'],
        ['school',       'Koulu/päiväkoti'],
        ['construction', 'Rakenteilla'],
        ['yes',          'Muu rakennus'],
      ];
      const rows = entries.map(([type, label]) =>
        `<div class="grid-legend-row"><span class="grid-legend-swatch" style="background:${_buildingColor(type)};opacity:.80"></span><span>${label}</span></div>`
      ).join('');
      div.innerHTML = `<div class="grid-legend-title">Rakennukset (OSM)</div>${rows}`;
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

      /* 1. OSM-rakennukset ensin (kartan alemmalle tasolle) */
      let buildings = null;
      try {
        buildings = await _fetchBuildings(bounds);
      } catch (bErr) {
        console.warn('MapModule: rakennushaku epäonnistui –', bErr.message);
      }

      if (buildings?.features?.length) {
        _gridLayer = L.geoJSON(buildings, {
          style: feature => {
            const type = feature.properties.building ?? 'yes';
            return {
              color:       '#555',
              weight:      0.4,
              fillColor:   _buildingColor(type),
              fillOpacity: 0.75,
            };
          },
          onEachFeature: (feature, layer) => {
            const p    = feature.properties;
            const type = p.building ?? 'yes';
            const name = p.name ? `<br><small>${p.name}</small>` : '';
            const addr = p['addr:street']
              ? `<br><small>${p['addr:street']}${p['addr:housenumber'] ? ' ' + p['addr:housenumber'] : ''}</small>`
              : '';
            layer.bindTooltip(
              `<strong>${_buildingLabel(type)}</strong>${name}${addr}`,
              { sticky: true, direction: 'top' }
            );
          },
        }).addTo(_map);

        _buildLegend().addTo(_map);
      }

      /* 2. Postinumerorajaus päällimmäiseksi */
      _boundary = L.geoJSON(geojson, {
        style: {
          color:       '#003580',
          weight:      2.5,
          opacity:     1,
          fillColor:   '#003580',
          fillOpacity: buildings?.features?.length ? 0 : 0.08,
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
