/* js/config.js – Sovelluksen vakiot */
'use strict';

const CONFIG = Object.freeze({

  /* Alue */
  POSTAL_CODE: '33870',
  AREA_NAME:   'Vuores, Tampere',
  MAP_CENTER:  [61.435, 23.793],   // [lat, lon]
  MAP_ZOOM:    13,

  /* WFS – postinumeroalueen rajaus */
  WFS_URL:       'https://geo.stat.fi/geoserver/wfs',
  WFS_LAYER:     'postialue:pno',
  WFS_FIELD:     'posti_alue',         // kenttä, johon postinumero suodatetaan

  /* Näytettävät muuttujat ja niiden suomenkieliset nimet
     Kaikkia ei välttämättä löydy joka taulusta – puuttuva data käsitellään null:ina */
  VAR_LABELS: {
    /* Väestö */
    he_vakiy:  'Asukkaita yhteensä',
    he_miehet: 'Miehiä',
    he_naiset: 'Naisia',
    he_kika:   'Keski-ikä (v)',
    /* Ikäluokat */
    he_0_2:    '0–2 v',
    he_3_6:    '3–6 v',
    he_7_12:   '7–12 v',
    he_13_15:  '13–15 v',
    he_16_17:  '16–17 v',
    he_18_19:  '18–19 v',
    he_20_24:  '20–24 v',
    he_25_29:  '25–29 v',
    he_30_34:  '30–34 v',
    he_35_39:  '35–39 v',
    he_40_44:  '40–44 v',
    he_45_49:  '45–49 v',
    he_50_54:  '50–54 v',
    he_55_59:  '55–59 v',
    he_60_64:  '60–64 v',
    he_65_69:  '65–69 v',
    he_70_74:  '70–74 v',
    he_75_79:  '75–79 v',
    he_80_84:  '80–84 v',
    he_85_:    '85 v+',
    /* Rakennukset */
    ra_ke:     'Rakennuksia yht.',
    ra_raky:   'Asuinrakennuksia',
    ra_asunn:  'Asuntoja',
    te_as_valj:'Asumisväljyys (m²/as.)',
    ra_as_kpa: 'Asunnon keskim. koko (m²)',
    /* Koulutus (18+) */
    ko_ika18y: 'Väestö 18+',
    ko_perus:  'Perusaste',
    ko_koul:   'Toinen aste',
    ko_yliop:  'Korkea-aste',
    /* Pääasiallinen toiminta */
    pt_tyoll:  'Työlliset',
    pt_tyott:  'Työttömät',
    pt_elakk:  'Eläkeläiset',
    pt_muut:   'Muut',
    /* Toimipaikat */
    tp_tyopy:  'Toimipaikkoja yht.',
    /* Tulot */
    hr_ktu:    'Asukkaiden keskitulot (€/v)',
    hr_mtu:    'Asukkaiden mediaanitulot (€/v)',
    /* Taloudet */
    te_yks:    'Yksinasuvat',
    te_laps:   'Lapsitaloudet',
    te_aik:    'Aikuistaloudet',
    te_elak:   'Eläkeläistaloudet',
  },

  /* Ikäluokkakoodit järjestyksessä kaavioihin */
  AGE_CODES: [
    'he_0_2','he_3_6','he_7_12','he_13_15','he_16_17','he_18_19',
    'he_20_24','he_25_29','he_30_34','he_35_39','he_40_44','he_45_49',
    'he_50_54','he_55_59','he_60_64','he_65_69','he_70_74','he_75_79',
    'he_80_84','he_85_',
  ],

  /* WFS – 1 km väestöruudukko (2024) */
  GRID_WFS_URL:   'https://geo.stat.fi/geoserver/vaestoruutu/ows',
  GRID_WFS_LAYER: 'vaestoruutu:vaki2024_1km',

  GRID_VAR_GROUPS: [
    { group: 'Väestö', vars: [
      { code: 'vaesto',    label: 'Asukkaat yht.' },
      { code: 'miehet',    label: 'Miehet' },
      { code: 'naiset',    label: 'Naiset' },
    ]},
    { group: 'Ikäluokat', vars: [
      { code: 'ika_0_14',  label: '0–14 v' },
      { code: 'ika_15_64', label: '15–64 v' },
      { code: 'ika_65_',   label: '65+ v' },
    ]},
  ],

  /* WFS – LIPAS liikuntapaikat */
  LIPAS_WFS_URL:   'https://lipas.fi/geoserver/lipas/ows',
  LIPAS_WFS_LAYER: 'lipas:lipas_kaikki_pisteet',

  /* Väripaletti */
  COLORS: {
    primary:  '#003580',
    accent:   '#00895a',
    blue:     '#2563eb',
    green:    '#16a34a',
    red:      '#dc2626',
    orange:   '#ea580c',
    purple:   '#7c3aed',
    gray:     '#94a3b8',
    teal:     '#0891b2',
    amber:    '#d97706',
  },
});
