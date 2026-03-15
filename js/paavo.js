/* js/paavo.js – PAAVO PxWeb -tietojen haku ja välimuistitus */
'use strict';

const PaavoDB = (() => {
  /*
   * Sisäinen tila:
   *   _data[year][varCode] = number | null
   *   _years = string[]  (esim. ["2010","2011",...])
   *   _meta  = PxWeb metadata-objekti
   */
  let _data  = {};
  let _years = [];
  let _meta  = null;

  /* Apufunktio: hae URL ja palauta JSON tai heitä virhe */
  async function _fetchJSON(url, options = {}) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    return res.json();
  }

  /* Muunna PxWeb-arvo numeroksi; ".." = ei tietoa → null */
  function _toNum(val) {
    if (val === '..' || val === '' || val == null) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }

  /*
   * init() – lataa metadata ja koko datasetti
   *   Palauttaa { years: string[] }
   */
  async function init() {
    /* 1. Metadata – löydä dimensiokoodit ja saatavilla olevat vuodet */
    _meta = await _fetchJSON(CONFIG.PAAVO_URL);

    /* Etsi oikeat dimensiot joustavan nimeämisen takia */
    const dims = { area: null, year: null, data: null };
    for (const v of _meta.variables) {
      const code = v.code.toLowerCase();
      if (code.includes('vuosi') || code === 'year')                 dims.year = v;
      else if (code.includes('alue') || code.includes('postinumero')) dims.area = v;
      else if (code.includes('tiedot') || code.includes('tunnusluku')) dims.data = v;
    }

    if (!dims.area || !dims.year) {
      throw new Error('PAAVO: dimensioita ei löydy metadatasta.');
    }

    _years = dims.year.values.slice(); // kopio

    /* 2. Hae kaikki vuodet + kaikki muuttujat yhdellä POST-pyynnöllä
          Suodatus vain postinumeroalueelle 33870 */
    const query = {
      query: [
        {
          code: dims.area.code,
          selection: {
            filter: 'item',
            values: [CONFIG.POSTAL_CODE],
          },
        },
      ],
      response: { format: 'json' },
    };

    const result = await _fetchJSON(CONFIG.PAAVO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });

    /* 3. Jäsennä vastaus → _data[year][varCode] = number|null
          Rivien avain-järjestys noudattaa columns-listaa (ilman type:"m" -saraketta) */
    const keyCols = result.columns.filter(c => c.type !== 'm');
    const yearIdx = keyCols.findIndex(c => c.code === dims.year.code);
    const varIdx  = dims.data
      ? keyCols.findIndex(c => c.code === dims.data.code)
      : -1;

    /* Vuosiavain voi olla vain numero TAI "2024 Vuores" – normalisoidaan */
    for (const row of result.data) {
      const rawYear = row.key[yearIdx] ?? '';
      const year    = rawYear.trim().split(' ')[0]; // ota vain numerinen osa
      /* Muuttujakoodi joko omassa dimensiossaan tai ensimmäisessä muussa */
      const varCode = varIdx >= 0
        ? row.key[varIdx]
        : row.key.find((k, i) => i !== yearIdx) ?? 'unknown';

      if (!_data[year]) _data[year] = {};
      _data[year][varCode] = _toNum(row.values[0]);
    }

    return { years: _years };
  }

  /* Palauttaa saatavilla olevat vuodet (kasvavassa järjestyksessä) */
  function getYears() {
    return _years;
  }

  /* Palauttaa yhden muuttujan arvon tietylle vuodelle tai null */
  function get(year, varCode) {
    return _data[year]?.[varCode] ?? null;
  }

  /* Palauttaa yhden muuttujan aikasarjan kaikille vuosille (null = puuttuu) */
  function getSeries(varCode) {
    return _years.map(y => get(y, varCode));
  }

  /* Palauttaa useamman muuttujan arvot yhdelle vuodelle { varCode: value } */
  function getMany(year, varCodes) {
    const out = {};
    for (const code of varCodes) out[code] = get(year, code);
    return out;
  }

  return { init, getYears, get, getSeries, getMany };
})();
