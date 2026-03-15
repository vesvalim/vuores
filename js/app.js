/* js/app.js – Sovelluslogiikka: alustetaan moduulit ja hallitaan tila */
'use strict';

(async () => {
  /* ── Tilaobjekti ── */
  const state = { years: [], selectedYear: null };
  let _gridInitialized     = false;
  let _liikuntaInitialized = false;

  /* ── DOM-viitteet ── */
  const loadingOverlay = document.getElementById('loading-overlay');
  const loadingText    = document.getElementById('loading-text');
  const errorBanner    = document.getElementById('error-banner');
  const yearRange      = document.getElementById('year-range');
  const yearDisplay    = document.getElementById('year-display');
  const yearTicksEl    = document.getElementById('year-ticks');

  const valEls = {
    vakiy: document.getElementById('val-vakiy'),
    kika:  document.getElementById('val-kika'),
    ke:    document.getElementById('val-ke'),
    asunn: document.getElementById('val-asunn'),
    tyoll: document.getElementById('val-tyoll'),
    tyopy: document.getElementById('val-tyopy'),
    mtu:   document.getElementById('val-mtu'),
    asva:  document.getElementById('val-asva'),
  };

  /* ── Apufunktiot ── */
  function showError(msg) {
    errorBanner.textContent = `Virhe: ${msg}`;
    errorBanner.classList.remove('hidden');
  }

  function hideLoading() {
    loadingOverlay.classList.add('hidden');
  }

  function fmtNum(v) {
    if (v == null) return '–';
    return v.toLocaleString('fi-FI');
  }
  function fmtDec(v, d = 1) {
    if (v == null) return '–';
    return v.toFixed(d);
  }

  /* ── Mittarikorttien päivitys ── */
  function updateMetricCards(year) {
    valEls.vakiy.textContent = fmtNum(PaavoDB.get(year, 'he_vakiy'));
    valEls.kika.textContent  = fmtDec(PaavoDB.get(year, 'he_kika'));
    valEls.ke.textContent    = fmtNum(PaavoDB.get(year, 'ra_ke'));
    valEls.asunn.textContent = fmtNum(PaavoDB.get(year, 'ra_asunn'));
    valEls.tyoll.textContent = fmtNum(PaavoDB.get(year, 'pt_tyoll'));
    valEls.tyopy.textContent = fmtNum(PaavoDB.get(year, 'tp_tyopy'));
    valEls.mtu.textContent   = fmtNum(PaavoDB.get(year, 'hr_mtu'));
    valEls.asva.textContent  = fmtDec(PaavoDB.get(year, 'te_as_valj'));
  }

  /* ── Kaikki vuosi-riippuvaiset päivitykset ── */
  function applyYear(year) {
    state.selectedYear      = year;
    yearDisplay.textContent = year;
    updateMetricCards(year);
    ChartModule.updateYear(year);
    MapModule.updateYear(year);
  }

  /* ── Vuosivalitsimen rakentaminen ── */
  function buildYearSelector(years) {
    yearRange.min   = 0;
    yearRange.max   = years.length - 1;
    yearRange.value = years.length - 1;   // aloita uusimmasta

    /* Näytä vuosimerkit joka 3. vuos­i */
    yearTicksEl.innerHTML = '';
    years.forEach((y, i) => {
      if (i === 0 || i === years.length - 1 || i % 3 === 0) {
        const span = document.createElement('span');
        span.textContent = y;
        yearTicksEl.appendChild(span);
      }
    });

    yearRange.addEventListener('input', () => {
      const yr = years[parseInt(yearRange.value, 10)];
      applyYear(yr);
    });
  }

  /* ── Lasketaan otsikon ja välilehtien korkeus CSS-muuttujiin ── */
  function measureHeaderHeight() {
    const h = document.querySelector('.site-header')?.offsetHeight ?? 142;
    document.documentElement.style.setProperty('--header-height', `${h}px`);
    const t = document.querySelector('.tab-nav')?.offsetHeight ?? 42;
    document.documentElement.style.setProperty('--tab-height', `${t}px`);
  }

  /* ════════════════════════════════════════════════════════
     Pääohjelma
     ════════════════════════════════════════════════════════ */
  try {
    /* Käynnistä kartta rinnakkain PAAVO-haun kanssa */
    loadingText.textContent = 'Ladataan karttaa ja tilastoja…';

    const [, { years }] = await Promise.all([
      MapModule.init(),
      PaavoDB.init(),
    ]);

    state.years = years;

    /* Rakenna vuosivalitsin */
    buildYearSelector(years);

    /* Luo pysyvät (aikasarjan) kaaviot */
    ChartModule.init(years);

    /* Aseta alkuvuosi = uusin saatavilla oleva */
    const latest = years[years.length - 1];
    applyYear(latest);

    measureHeaderHeight();
    window.addEventListener('resize', measureHeaderHeight);

    /* ── Välilehtien vaihto ── */
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.tab-panel').forEach(p =>
          p.classList.toggle('active', p.id === `tab-${tab}`));
        if (tab === 'grid' && !_gridInitialized) {
          _gridInitialized = true;
          GridMap.init(MapModule.getBounds(), MapModule.getBoundaryFeature());
        }
        if (tab === 'grid') {
          setTimeout(() => GridMap.invalidateSize(), 300);
        }
        if (tab === 'liikunta' && !_liikuntaInitialized) {
          _liikuntaInitialized = true;
          LiikuntaMap.init(MapModule.getBounds(), MapModule.getBoundaryFeature());
        }
        if (tab === 'liikunta') {
          setTimeout(() => LiikuntaMap.invalidateSize(), 300);
        }
      });
    });

  } catch (err) {
    console.error('App init error:', err);
    showError(err.message || 'Tuntematon virhe tietojen latauksessa.');
  } finally {
    hideLoading();
  }
})();
