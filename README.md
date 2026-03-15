# Vuores (33870) – Tilasto- ja karttasivusto

Interaktiivinen tilastosivusto Tampereen Vuoreksen postinumeroalueelle (33870).

## Sisältö

- **Kartta** – Vuoreksen postinumeroalueen rajaus (Tilastokeskus / geo.stat.fi WFS)
- **Väestötilastot** – väkiluku, ikäjakauma, sukupuolijakauma (PAAVO 2010–)
- **Rakennustilastot** – rakennusten ja asuntojen kehitys
- **Koulutus- ja toimintatilastot** – koulutusaste (18+) ja pääasiallinen toiminta
- **Vuosivalitsin** – kaikki kaaviot päivittyvät valitulle vuodelle

Kaikki data haetaan suoraan Tilastokeskuksen avoimista rajapinnoista (CC BY 4.0).

## Tekninen toteutus

| Teknologia | Käyttötarkoitus |
|---|---|
| [Leaflet 1.9](https://leafletjs.com/) | Interaktiivinen kartta |
| [Chart.js 4](https://www.chartjs.org/) | Tilastokaaviot |
| [geo.stat.fi WFS](https://geo.stat.fi/geoserver/wfs) | Postinumeroalueen rajaus |
| [PAAVO PxWeb API](https://pxdata.stat.fi/PxWeb/api/v1/fi/Postinumeroalueittainen_avoin_tieto/) | Tilastodata |

Staattinen sivusto — ei build-prosessia, kaikki kirjastot CDN:stä.

## GitHub Pages -aktivointi

1. Mene repon **Settings → Pages**
2. Valitse **Source: Deploy from a branch**
3. Branch: `main`, hakemisto: `/ (root)`
4. Tallenna → sivusto julkaistaan osoitteeseen `https://vesvalim.github.io/vuores/`

## Tietolähteet

- **PAAVO** – Postinumeroalueittainen avoin tieto, Tilastokeskus, CC BY 4.0
  `https://pxdata.stat.fi/PxWeb/api/v1/fi/Postinumeroalueittainen_avoin_tieto/uusin/paavo_pxt_12f7.px`
- **WFS** – Postinumeroalueiden rajaukset, Tilastokeskus / geo.stat.fi, CC BY 4.0
  `https://geo.stat.fi/geoserver/wfs`
- **Taustakartta** – © OpenStreetMap-tekijät, ODbL