# EV Charge Locator

A static single-page web application for finding electric vehicle charging stations on an interactive map.

## Features

- **Map search** — search by city or address using Google Maps Geocoding
- **Geolocation** — one-click button to search near your current GPS position
- **Live station data** — fetched in real time from the [Open Charge Map](https://openchargemap.org) public API
- **Marker clustering** — stations group into clusters at lower zoom levels to keep the map readable
- **Station list** — scrollable sidebar with cards showing status, connectors and distance
- **Detail modal** — full information for each station including operator, access type, cost and connector specs
- **Favorites** — save stations locally and filter to show only saved ones
- **Compare** — select up to 3 stations and view a side-by-side comparison table
- **Advanced filters** — filter by connector type (CCS, CHAdeMO, Type 2, Type 1, Tesla/NACS, Schuko), charging speed (slow / fast / ultra-fast) and cost (free / paid)
- **Zone statistics** — live counters for total stations, operational, connector types and average power in the current search area
- **Search history** — last 8 searches saved locally with one-click re-search
- **Autocomplete** — address suggestions powered by Google Places while typing
- **Dark / light theme** — persisted across sessions, applied before first paint to avoid flash
- **Responsive layout** — full desktop view with split map+list; mobile bottom-sheet panel

## Technologies

| Layer | Technology |
|---|---|
| Markup | HTML5 |
| Styles | CSS3 with custom properties |
| Logic | Vanilla JavaScript (ES6+) |
| UI framework | Bootstrap 5.3 |
| Icons | Bootstrap Icons 1.11 · Font Awesome 6.5 |
| DOM / Ajax | jQuery 3.7 |
| Map | Google Maps JavaScript API v3 |
| Geocoding | Google Maps Geocoding API |
| Autocomplete | Google Maps Places API |
| Marker clustering | @googlemaps/markerclusterer |
| Station data | Open Charge Map API v3 |

No build step, no bundler, no framework. Every dependency is loaded from a CDN.

## Project structure

```
/
├── index.html            — single page, all UI declared here
├── css/
│   └── styles.css        — custom styles and CSS variable theme system
├── js/
│   ├── app.js            — all application logic (~1500 lines, vanilla JS)
│   ├── config.js         — API keys (excluded from repository, see below)
│   └── config.example.js — template for config.js
├── img/                  — static image assets
├── README.md
└── MEMORIA.md            — detailed technical documentation (Spanish)
```

## Setup

1. Copy `js/config.example.js` to `js/config.js`
2. Fill in your API keys:

```js
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';
const OCM_API_KEY         = 'YOUR_OCM_API_KEY';
```

- Google Maps key: [console.cloud.google.com](https://console.cloud.google.com) — enable Maps JavaScript API, Geocoding API and Places API
- Open Charge Map key: [openchargemap.org/site/develop](https://openchargemap.org/site/develop)

## Running locally

The project is fully static — no server-side code, no build step. Options:

- **Double-click** `index.html` to open it directly in the browser
- **VS Code** — install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension and click *Go Live*
- **Python** — `python -m http.server 4200`

