/* js/paavo.js – PAAVO PxWeb -tietojen haku ja välimuistitus */
'use strict';

const PaavoDB = (() => {
  const _BASE  = 'https://pxdata.stat.fi/PxWeb/api/v1/fi/Postinumeroalueittainen_avoin_tieto/';
  const _TABLE = 'paavo_pxt_12f7.px';

  let _data  = {};
  let _years = [];

  async function _fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    return res.json();
  }

  function _toNum(val) {
    if (val === '..' || val === '.' || val === '' || val == null) return null;
    const n = parseFloat(String(val).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  /* Löydä oikea taulun URL:
     1. HAE hakemistolistaus → valitse uusin vuosikansio
     2. Fallback-lista, jos listaus epäonnistuu */
  async function _findTableUrl() {
    const fallbacks = ['uusin', '2024', '2023', '2022', '2021'];

    /* Yritä lisätä listauksen perusteella tunnettu uusin vuosi */
    try {
      const list = await _fetchJSON(_BASE);
      if (Array.isArray(list)) {
        const numYears = list
          .map(f => parseInt(f.id ?? f.dbid ?? f, 10))
          .filter(n => !isNaN(n) && n > 2000)
          .sort((a, b) => b - a);
        if (numYears.length > 0) fallbacks.unshift(String(numYears[0]));
      }
    } catch (e) {
      console.debug('PAAVO: hakemistolistaus epäonnistui –', e.message);
    }

    for (const folder of fallbacks) {
      const url = `${_BASE}${folder}/${_TABLE}`;
      try {
        const res = await fetch(url);
        if (res.ok) {
          console.info('PAAVO: taulupolku löytyi –', url);
          const meta = await res.json();
          return { url, meta };
        }
        console.debug(`PAAVO: ${url} → HTTP ${res.status}`);
      } catch (e) {
        console.debug(`PAAVO: ${url} →`, e.message);
      }
    }
    throw new Error('PAAVO-taulua ei löydy palvelimelta. Yhteys katkaistu tai URL muuttunut.');
  }

  async function init() {
    const { url: tableUrl, meta } = await _findTableUrl();

    /* Tunnista dimensiot joustavasti koodinimellä */
    const dims = { area: null, year: null, data: null };
    for (const v of meta.variables) {
      const lc = (v.code ?? '').toLowerCase();
      if (lc.includes('vuosi') || lc === 'year')                           dims.year = v;
      else if (lc.includes('posti') || lc.includes('alue'))               dims.area = v;
      else if (lc.includes('tiedot') || lc.includes('muuttuja') ||
               lc.includes('tunnusluku') || lc.includes('indicator'))     dims.data = v;
    }

    if (!dims.area || !dims.year) {
      console.error('PAAVO meta variables:', meta.variables.map(v => v.code).join(', '));
      throw new Error('PAAVO: aluetta tai vuotta ei löydy metadatasta. Ks. konsoli.');
    }

    _years = dims.year.values.map(String);
    console.info('PAAVO: vuodet –', _years.join(', '));

    /* Postinumeron arvo metadatassa voi olla "33870" TAI "33870 Vuores" –
       löydä oikea arvo alkuosan perusteella */
    const postalValue =
      dims.area.values.find(v => String(v).startsWith(CONFIG.POSTAL_CODE))
      ?? CONFIG.POSTAL_CODE;
    console.info('PAAVO: käytetty postinumeroarvo –', postalValue);

    /* POST: suodata vain tämä postinumero, kaikki vuodet ja muuttujat */
    const query = {
      query: [
        {
          code: dims.area.code,
          selection: { filter: 'item', values: [postalValue] },
        },
      ],
      response: { format: 'json' },
    };

    const result = await _fetchJSON(tableUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    if (!result.data || result.data.length === 0) {
      throw new Error(`PAAVO: postinumerolle ${CONFIG.POSTAL_CODE} ei löytynyt dataa.`);
    }

    /* Parsitaan sarakkeiden järjestys */
    const keyCols = (result.columns ?? []).filter(c => c.type !== 'm');
    const yearIdx = keyCols.findIndex(c => c.code === dims.year.code);
    const varIdx  = dims.data ? keyCols.findIndex(c => c.code === dims.data.code) : -1;

    console.info('PAAVO: columns –', keyCols.map(c => c.code).join(', '),
                 '| yearIdx=', yearIdx, 'varIdx=', varIdx);
    console.info('PAAVO: ensimmäisiä rivejä –', JSON.stringify(result.data.slice(0, 3)));

    for (const row of result.data) {
      const rawYear = String(row.key[yearIdx] ?? '');
      const year    = rawYear.trim().split(' ')[0];  // "2024 x" → "2024"

      let varCode;
      if (varIdx >= 0) {
        varCode = row.key[varIdx];
      } else {
        /* Jos muuttujadimensiota ei ole omana sarakkeenaan, käytetään muuta key-arvoa */
        varCode = row.key.find((k, i) => i !== yearIdx) ?? 'unknown';
      }

      if (!_data[year]) _data[year] = {};
      _data[year][varCode] = _toNum(row.values[0]);
    }

    console.info(`PAAVO: ladattu ${Object.keys(_data).length} vuoden data.`);
    if (Object.keys(_data).length > 0) {
      const sampleYear = Object.keys(_data)[0];
      console.info(`PAAVO: muuttujat vuodelta ${sampleYear} –`,
        Object.keys(_data[sampleYear]).join(', '));
    }

    return { years: _years };
  }

  function getYears()              { return _years; }
  function get(year, varCode)      { return _data[year]?.[varCode] ?? null; }
  function getSeries(varCode)      { return _years.map(y => get(y, varCode)); }
  function getMany(year, varCodes) {
    const out = {};
    for (const code of varCodes) out[code] = get(year, code);
    return out;
  }

  return { init, getYears, get, getSeries, getMany };
})();
