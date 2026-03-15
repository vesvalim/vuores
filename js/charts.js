/* js/charts.js – Chart.js 4.x -visualisoinnit */
'use strict';

const ChartModule = (() => {
  /* Viittaukset Chart-instansseihin */
  const _charts = {
    popTrend:  null,
    age:       null,
    gender:    null,
    activity:  null,
    edu:       null,
    buildings: null,
    income:    null,
    household: null,
  };

  /* Formatointiapuri */
  const fmt = n => (n == null ? '–' : n.toLocaleString('fi-FI'));

  /* Perusoptions kaikille kaavioille */
  const _baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.formattedValue}`,
        },
      },
    },
  };

  /* Piirakkakaavion yhteiset options */
  function _doughnutOpts(showLegend = true) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 }, padding: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => (a ?? 0) + (b ?? 0), 0);
              if (!total) return ` ${fmt(ctx.raw)}`;
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${fmt(ctx.raw)} (${pct} %)`;
            },
          },
        },
      },
    };
  }

  /* Luo kaavio tai päivitä olemassa oleva */
  function _upsert(key, canvasId, type, data, options) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (_charts[key]) {
      _charts[key].data    = data;
      _charts[key].options = options;
      _charts[key].update('active');
    } else {
      _charts[key] = new Chart(ctx, { type, data, options });
    }
  }

  /* ---------- 1. Väkiluvun kehitys (viivakaavio) ---------- */
  function _renderPopTrend(years) {
    const series = PaavoDB.getSeries('he_vakiy');
    _upsert('popTrend', 'chart-pop-trend', 'line',
      {
        labels: years,
        datasets: [{
          label: 'Asukkaita',
          data: series,
          borderColor: CONFIG.COLORS.blue,
          backgroundColor: 'rgba(37,99,235,.12)',
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
          spanGaps: false,
        }],
      },
      {
        ..._baseOpts,
        scales: {
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
          y: {
            beginAtZero: false,
            ticks: {
              font: { size: 11 },
              callback: v => v.toLocaleString('fi-FI'),
            },
          },
        },
        plugins: {
          ..._baseOpts.plugins,
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmt(ctx.raw)} asukasta`,
            },
          },
        },
      },
    );
  }

  /* ---------- 2. Rakennusten kehitys (viivakaavio, 2 sarjaa) ---------- */
  function _renderBuildingsTrend(years) {
    _upsert('buildings', 'chart-buildings', 'line',
      {
        labels: years,
        datasets: [
          {
            label: 'Rakennuksia',
            data: PaavoDB.getSeries('ra_ke'),
            borderColor: CONFIG.COLORS.accent,
            backgroundColor: 'rgba(0,137,90,.1)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: false,
          },
          {
            label: 'Asuntoja',
            data: PaavoDB.getSeries('ra_asunn'),
            borderColor: CONFIG.COLORS.amber,
            backgroundColor: 'rgba(217,119,6,.08)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: false,
          },
        ],
      },
      {
        ..._baseOpts,
        plugins: {
          ..._baseOpts.plugins,
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} kpl`,
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
          y: {
            beginAtZero: false,
            ticks: {
              font: { size: 11 },
              callback: v => v.toLocaleString('fi-FI'),
            },
          },
        },
      },
    );
  }

  /* ---------- 3. Ikäjakauma (vaakapalkit) ---------- */
  function _renderAge(year) {
    const labels = CONFIG.AGE_CODES.map(c => CONFIG.VAR_LABELS[c] ?? c);
    const values = CONFIG.AGE_CODES.map(c => PaavoDB.get(year, c));

    /* Gradienttiväri ikäryhmittäin */
    const colors = CONFIG.AGE_CODES.map((_, i) => {
      const t = i / (CONFIG.AGE_CODES.length - 1);
      const r = Math.round(37  + (220 - 37)  * t);
      const g = Math.round(99  + (38  - 99)  * t);
      const b = Math.round(235 + (38  - 235) * t);
      return `rgba(${r},${g},${b},0.82)`;
    });

    _upsert('age', 'chart-age', 'bar',
      {
        labels,
        datasets: [{
          label: 'Henkilöä',
          data: values,
          backgroundColor: colors,
          borderRadius: 3,
        }],
      },
      {
        ..._baseOpts,
        indexAxis: 'y',
        plugins: {
          ..._baseOpts.plugins,
          tooltip: {
            callbacks: {
              label: ctx => ` ${fmt(ctx.raw)} henkilöä`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              font: { size: 10 },
              callback: v => v.toLocaleString('fi-FI'),
            },
          },
          y: { ticks: { font: { size: 10 } } },
        },
      },
    );
  }

  /* ---------- 4. Tulokehitys (viivakaavio, 2 sarjaa) ---------- */
  function _renderIncome(years) {
    _upsert('income', 'chart-income', 'line',
      {
        labels: years,
        datasets: [
          {
            label: 'Keskitulot',
            data: PaavoDB.getSeries('hr_ktu'),
            borderColor: CONFIG.COLORS.primary,
            backgroundColor: 'rgba(0,53,128,.08)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: false,
          },
          {
            label: 'Mediaanitulot',
            data: PaavoDB.getSeries('hr_mtu'),
            borderColor: CONFIG.COLORS.accent,
            backgroundColor: 'rgba(0,137,90,.06)',
            fill: false,
            tension: 0.3,
            pointRadius: 3,
            spanGaps: false,
          },
        ],
      },
      {
        ..._baseOpts,
        plugins: {
          ..._baseOpts.plugins,
          legend: {
            display: true,
            position: 'top',
            labels: { boxWidth: 12, font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)} €/v`,
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 11 } }, grid: { display: false } },
          y: {
            beginAtZero: false,
            ticks: {
              font: { size: 11 },
              callback: v => v.toLocaleString('fi-FI') + ' €',
            },
          },
        },
      },
    );
  }

  /* ---------- 5. Talouksien rakenne (rengaskaavio) ---------- */
  function _renderHousehold(year) {
    const codes  = ['te_yks', 'te_laps', 'te_aik', 'te_elak'];
    const labels = codes.map(c => CONFIG.VAR_LABELS[c] ?? c);
    const values = codes.map(c => PaavoDB.get(year, c));
    _upsert('household', 'chart-household', 'doughnut',
      {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [
            CONFIG.COLORS.teal,
            CONFIG.COLORS.blue,
            CONFIG.COLORS.orange,
            CONFIG.COLORS.gray,
          ],
          hoverOffset: 4,
        }],
      },
      _doughnutOpts(true),
    );
  }

  /* ---------- 6. Sukupuolijakauma (rengaskaavio) ---------- */
  function _renderGender(year) {
    const miehet = PaavoDB.get(year, 'he_miehet');
    const naiset = PaavoDB.get(year, 'he_naiset');
    _upsert('gender', 'chart-gender', 'doughnut',
      {
        labels: ['Miehiä', 'Naisia'],
        datasets: [{
          data: [miehet, naiset],
          backgroundColor: [CONFIG.COLORS.blue, CONFIG.COLORS.red],
          hoverOffset: 4,
        }],
      },
      _doughnutOpts(true),
    );
  }

  /* ---------- 7. Pääasiallinen toiminta (rengaskaavio) ---------- */
  function _renderActivity(year) {
    const codes  = ['pt_tyoll', 'pt_tyott', 'pt_elakk', 'pt_muut'];
    const labels = codes.map(c => CONFIG.VAR_LABELS[c] ?? c);
    const values = codes.map(c => PaavoDB.get(year, c));
    _upsert('activity', 'chart-activity', 'doughnut',
      {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [
            CONFIG.COLORS.green,
            CONFIG.COLORS.red,
            CONFIG.COLORS.gray,
            CONFIG.COLORS.purple,
          ],
          hoverOffset: 4,
        }],
      },
      _doughnutOpts(true),
    );
  }

  /* ---------- 8. Koulutusaste (rengaskaavio) ---------- */
  function _renderEdu(year) {
    const codes  = ['ko_perus', 'ko_koul', 'ko_yliop'];
    const labels = codes.map(c => CONFIG.VAR_LABELS[c] ?? c);
    const values = codes.map(c => PaavoDB.get(year, c));
    _upsert('edu', 'chart-edu', 'doughnut',
      {
        labels,
        datasets: [{
          data: values,
          backgroundColor: [CONFIG.COLORS.amber, CONFIG.COLORS.teal, CONFIG.COLORS.primary],
          hoverOffset: 4,
        }],
      },
      _doughnutOpts(true),
    );
  }

  /* =========================================================
     Julkinen API
     ========================================================= */

  /* Luo kaikki kaaviot ensimmäisen kerran */
  function init(years) {
    _renderPopTrend(years);    _renderIncome(years);    _renderBuildingsTrend(years);
  }

  /* Päivitä vuodesta riippuvat kaaviot */
  function updateYear(year) {
    _renderAge(year);
    _renderGender(year);
    _renderActivity(year);
    _renderEdu(year);
    _renderHousehold(year);

    /* Vuositunnisteet kaavioiden otsikoissa */
    ['label-age-year', 'label-gender-year', 'label-activity-year', 'label-edu-year', 'label-household-year'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = year;
    });
  }

  return { init, updateYear };
})();
