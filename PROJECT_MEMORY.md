# EV Charge Locator — Technical Project Memory

**Project:** EV Charge Locator
**Type:** Client-side web application (no backend)
**Purpose:** Help users find nearby electric vehicle charging stations using their real-time location or a manual address search.

---

## 1. Project Overview

EV Charge Locator is a fully client-side web application that runs directly in the browser without any server or build step. Opening `index.html` is all that is needed.

The app combines three external services:

- **Google Maps JavaScript API** renders an interactive dark-themed map and handles address-to-coordinates conversion (geocoding).
- **Open Charge Map API (OCM)** is the data source. It is a free, public database of EV charging stations worldwide, queried via Ajax.
- **The browser's native Geolocation API** obtains the user's GPS coordinates automatically on page load.

The user flow is simple: the page loads, the map appears, and the app immediately asks for location permission. If granted, it centers the map on the user and fires an Ajax request to OCM. Stations come back as JSON and are rendered as custom SVG pin markers on the map and as clickable cards in a sidebar panel. If geolocation is denied, a search bar lets the user type any city or address instead.

---

## 2. File Structure and Responsibilities

```
ev-charge-locator/
├── index.html              Main document — structure and script loading order
├── css/
│   └── styles.css          All visual styling — layout, theme, animations, responsive
├── js/
│   ├── config.js           API keys (gitignored — never committed)
│   ├── config.example.js   Placeholder template for config.js (committed)
│   └── app.js              All application logic — maps, Ajax, DOM, events
└── img/
    └── marker.svg          SVG pin icon (also generated inline in app.js)
```

### `index.html`
Defines the page skeleton: a fixed navbar with the logo and search form, a two-column main layout (`<aside>` sidebar + `<section>` map), a Bootstrap Toast for notifications, and a Bootstrap Modal for station detail. It also controls the script loading order, which is critical.

### `css/styles.css`
Contains every custom style. Bootstrap handles the grid and utility classes; `styles.css` adds the dark color palette, the sidebar, card animations, custom scrollbar, Google Maps InfoWindow overrides, and all responsive breakpoints.

### `js/config.js` and `js/config.example.js`
`config.js` declares two global constants (`GOOGLE_MAPS_API_KEY` and `OCM_API_KEY`) with the real credentials. It is listed in `.gitignore` and never pushed to the repository. `config.example.js` is an identical file with placeholder strings — it is committed so any developer who clones the repo knows exactly what to create.

### `js/app.js`
The entire application logic lives here. It is loaded after jQuery and Bootstrap but before the Google Maps script, because it exposes the `initMap` function that Maps calls as a callback once it finishes loading.

### `img/marker.svg`
A static SVG pin with a bolt icon used as reference. The actual markers placed on the map are generated programmatically inside `createMarkerSVG()` in `app.js` with dynamic color values, so this file serves as a visual reference.

---

## 3. Technologies — Where and How Each One Is Used

### 3.1 HTML5

**File:** `index.html`

HTML5 semantic elements structure the document:

- `<nav>` wraps the top navigation bar.
- `<main>` wraps the primary content area.
- `<aside>` is the results sidebar — semantically correct because it is supplementary content relative to the map.
- `<section>` wraps the map area.

The `data-filter` attribute on the filter pills is a custom HTML5 data attribute read by jQuery:

```html
<button class="pill active" data-filter="all">All</button>
<button class="pill" data-filter="operational">Operational</button>
```

In `app.js`, jQuery reads it with `$(this).data('filter')`.

The `<meta name="viewport">` tag enables proper scaling on mobile devices:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

The Bootstrap animated progress bar in the map overlay uses standard HTML5 `<div>` roles:

```html
<div class="progress-bar progress-bar-striped progress-bar-animated bg-accent"
     role="progressbar" style="width: 100%"></div>
```

---

### 3.2 CSS3

**File:** `css/styles.css`

**CSS Custom Properties (variables)** define the entire color palette and spacing system in one place under `:root`, making theming trivial to change:

```css
:root {
    --color-accent:      #00d084;   /* main green */
    --color-accent-dark: #00a86b;   /* hover green */
    --color-dark:        #0b1120;   /* page background */
    --navbar-height:     64px;
    --sidebar-width:     380px;
}
```

**Flexbox** powers the two-column layout. `.main-container` uses `display: flex` to place the sidebar and map section side by side:

```css
.main-container {
    display: flex;
    height: calc(100vh - var(--navbar-height));
    overflow: hidden;
}
```

**CSS Animations** are used in three places:
1. `@keyframes spin` rotates the loading spinner ring at 0.8s per revolution.
2. `@keyframes pulse-geo` creates a ripple glow on the geolocation button while it is fetching.
3. `@keyframes slideInUp` animates each station card appearing from below when results load. The first 10 cards have staggered `animation-delay` values (0ms, 40ms, 80ms...) for a cascading entrance effect.

```css
@keyframes slideInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}
.station-card:nth-child(2) { animation-delay: 0.04s; }
.station-card:nth-child(3) { animation-delay: 0.08s; }
```

**CSS Grid** is used inside the station detail modal to display the metadata in a two-column layout:

```css
.modal-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
}
```

**Custom Scrollbar** styling via `::-webkit-scrollbar` pseudo-elements gives the sidebar list a thin, subtle scrollbar consistent with the dark theme.

**Google Maps InfoWindow override** — the InfoWindow component rendered by the Maps SDK injects its own HTML and styles. CSS overrides force it to match the app's dark theme:

```css
.gm-style .gm-style-iw-c {
    background: var(--color-dark-3) !important;
    border-radius: var(--border-radius-sm) !important;
    padding: 0 !important;
}
```

---

### 3.3 Bootstrap 5

**File:** `index.html` (loaded via CDN), `css/styles.css` (extended), `js/app.js` (JS components used programmatically)

Bootstrap is loaded entirely from CDN — no local files:

```html
<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
```

Bootstrap components used in the project:

**Navbar** (`index.html`, line 23): `navbar navbar-dark fixed-top` sticks the navigation bar to the top of the viewport. It contains the logo and the search form using Bootstrap's `input-group` to fuse the text input and submit button.

**Badge** (`index.html`, line 74): `badge badge-count` displays the station count number next to the sidebar title. Updated dynamically via `$('#stationsCount').text(count)` in `app.js`.

**Toast** (`index.html`, lines 138–145): Used for all transient notifications (success, error, warning). The Toast is instantiated and shown programmatically in `showToast()` in `app.js`:

```javascript
bootstrap.Toast.getOrCreateInstance(document.getElementById('notificationToast'), {
    delay: 4000, autohide: true
}).show();
```

The toast element has four color variants applied via CSS classes: `.toast.success`, `.toast.error`, `.toast.info`, `.toast.warning`, each adding a left colored border.

**Modal** (`index.html`, lines 148–167): The station detail modal uses `modal-dialog-centered modal-lg`. It is triggered programmatically in `openStationModal()`:

```javascript
new bootstrap.Modal(document.getElementById('stationModal')).show();
```

The "Center on map" button inside the modal retrieves the existing instance to close it:

```javascript
bootstrap.Modal.getInstance(document.getElementById('stationModal')).hide();
```

**Progress bar** (`index.html`, lines 122–125): The animated striped progress bar in the map loading overlay uses `progress-bar-animated progress-bar-striped`.

**Utility classes** used throughout: `d-flex`, `align-items-center`, `justify-content-between`, `gap-2`, `mt-2`, `mb-0`, `d-none`, `position-fixed`, `text-muted`, `border-0`.

---

### 3.4 jQuery 3.7

**File:** `js/app.js` (throughout), loaded via CDN before `app.js`

```html
<script src="https://code.jquery.com/jquery-3.7.1.min.js"></script>
```

jQuery is used for four main purposes:

**1. Event binding** — all UI interactions go through jQuery's `.on()`:

```javascript
$('#searchForm').on('submit', function(e) { ... });
$('#geoBtn').on('click', function() { ... });
$(document).on('click', '.pill', function() { ... });
```

The filter pills use event delegation (`$(document).on(...)`) because the pills exist in the static HTML, but this pattern also works for dynamically created elements.

**2. DOM manipulation** — station cards are built as jQuery objects and appended to the list:

```javascript
const $card = $(`<div class="station-card" data-id="${station.ID}">...</div>`);
$list.append($card);
```

Showing and hiding panels is done with `.show()`, `.hide()`, `.addClass()`, `.removeClass()`:

```javascript
$('#loadingSpinner').removeClass('d-none').show();
$('#stationsList').addClass('d-none').hide();
```

**3. Reading data attributes** — the active filter is read from the clicked pill's `data-filter` attribute:

```javascript
appState.currentFilter = $(this).data('filter');
```

**4. Smooth scroll inside the sidebar** — when a marker is clicked, the corresponding card is scrolled into view via native `scrollTo` after jQuery locates it:

```javascript
const $card = $(`.station-card[data-id="${stationId}"]`);
list.scrollTo({ top: $card[0].offsetTop - list.offsetTop - 16, behavior: 'smooth' });
```

---

### 3.5 Ajax with `$.ajax()`

**File:** `js/app.js`, function `fetchChargingStations()` (line 224)

This is the core data-fetching call. It fires every time new coordinates are obtained — either from geolocation or from the geocoder. The request is a `GET` to the Open Charge Map v3 POI endpoint:

```javascript
$.ajax({
    url:      'https://api.openchargemap.io/v3/poi/',
    method:   'GET',
    dataType: 'json',
    data: {
        key:          OCM_API_KEY,
        latitude:     lat,
        longitude:    lng,
        distance:     CONFIG.searchRadiusKm,   // 10 km
        distanceunit: 'KM',
        maxresults:   CONFIG.maxResults,        // 50
        compact:      true,
        verbose:      false
    },
    success: function(data) { ... },
    error:   function(xhr)  { ... }
});
```

Setting `dataType: 'json'` tells jQuery to parse the response body as JSON automatically, so `data` in the `success` callback is already a JavaScript array of station objects.

The `compact: true, verbose: false` flags are OCM-specific — they strip non-essential fields from the response to reduce payload size.

**Before the request fires**, `showLoadingSpinner()` hides the list and shows the animated spinner. `clearMarkers()` removes any existing pins from the map.

**On success**, if `data.length === 0` a "no results" status is shown. Otherwise the array is saved to `appState.stations` and passed to `createMarkers()` and `renderStationsList()`.

**On error**, the HTTP status code distinguishes the cause:
- `401` → invalid API key
- `429` → rate limit exceeded
- `0` → no network / CORS block

---

### 3.6 Google Maps JavaScript API

**Files:** `index.html` (script injection), `js/app.js` (all map logic)

**Loading strategy** — the Maps script is NOT hardcoded in HTML with the API key in the `src`. Instead, an IIFE at the bottom of `index.html` reads the key from `config.js` and injects a `<script>` tag dynamically:

```javascript
(function() {
    if (typeof GOOGLE_MAPS_API_KEY === 'undefined') { /* show error */ return; }
    var script = document.createElement('script');
    script.src = 'https://maps.googleapis.com/maps/api/js?key='
                 + GOOGLE_MAPS_API_KEY
                 + '&callback=initMap&libraries=places';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
})();
```

The `&callback=initMap` parameter tells the SDK to call `initMap()` once loaded. The `&libraries=places` parameter loads the Places library (needed for the Geocoder).

**`initMap()`** — the entry point for all map functionality (`js/app.js`, line 29):

```javascript
function initMap() {
    $('#mapOverlay').addClass('hidden');
    appState.map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: CONFIG.defaultLat, lng: CONFIG.defaultLng },
        zoom:   CONFIG.defaultZoom,
        styles: getMapStyles(),
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false
    });
    appState.infoWindow = new google.maps.InfoWindow();
    appState.geocoder   = new google.maps.Geocoder();
    initEventListeners();
    attemptGeolocation();
}
```

**Map styling** — `getMapStyles()` returns a JSON array of style rules that override Google's default look with a custom dark navy/blue theme. Every element type (roads, water, POIs, labels) is recolored to match the app's CSS palette.

**`google.maps.Marker`** — one marker is created per station in `createMarkers()`. Each marker receives a dynamically generated SVG icon via `createMarkerSVG(color)`:

```javascript
const marker = new google.maps.Marker({
    position:  { lat, lng },
    map:       appState.map,
    title:     station.AddressInfo.Title,
    icon: {
        url:        createMarkerSVG(color),  // data URI
        scaledSize: new google.maps.Size(36, 44),
        anchor:     new google.maps.Point(18, 44)
    },
    stationId: station.ID  // custom property for cross-referencing
});
marker.addListener('click', function() {
    openInfoWindow(marker, station);
    highlightCard(station.ID);
});
```

The marker color is determined by station status: green (`#00d084`) for operational, red (`#ef4444`) for offline, amber (`#f59e0b`) for unknown.

**`google.maps.InfoWindow`** — a single reusable InfoWindow instance is stored in `appState.infoWindow`. Its content is set to a custom HTML string each time a marker is clicked, showing station name, address, status, connectors, and a "View full details" button:

```javascript
appState.infoWindow.setContent(content);
appState.infoWindow.open(appState.map, marker);
```

**`google.maps.Geocoder`** — converts a free-text address into coordinates in `searchByAddress()`:

```javascript
appState.geocoder.geocode({ address: query }, function(results, status) {
    if (status === 'OK') {
        const lat = results[0].geometry.location.lat();
        const lng = results[0].geometry.location.lng();
        fetchChargingStations(lat, lng);
    }
});
```

**`window.gm_authFailure`** — a global function that the Maps SDK calls automatically if authentication fails (wrong or restricted API key). It updates the loading overlay with a descriptive error message.

---

### 3.7 Open Charge Map API

**File:** `js/app.js`, function `fetchChargingStations()`

**Endpoint:** `GET https://api.openchargemap.io/v3/poi/`

The API returns a JSON array where each element is a charging station object. The fields used in this project are:

| JSON field | Used in |
|---|---|
| `AddressInfo.Title` | Station name in cards, markers, modal |
| `AddressInfo.Latitude` / `.Longitude` | Marker position and map centering |
| `AddressInfo.AddressLine1`, `.Town`, `.StateOrProvince`, `.Country.Title` | Address string built by `buildAddress()` |
| `AddressInfo.Distance` | Distance label shown in the card (if returned) |
| `StatusType.IsOperational` | Determines color, class, and label |
| `StatusType.Title` | Fallback text when `IsOperational` is not a boolean |
| `NumberOfPoints` | Shown in card and modal |
| `Connections[].ConnectionType.Title` | Connector type tags |
| `Connections[].Level.Title` | Charging level (AC/DC, etc.) |
| `Connections[].PowerKW` | Power output in kW |
| `OperatorInfo.Title` | Operator name in modal |
| `UsageType.Title` | Public/private access type in modal |

The `compact: true` flag strips nested objects that are not needed, keeping the payload smaller.

---

### 3.8 navigator.geolocation

**File:** `js/app.js`, function `attemptGeolocation()` (line 117)

The browser's native Geolocation API is called immediately after `initMap()` runs:

```javascript
navigator.geolocation.getCurrentPosition(
    successCallback,
    errorCallback,
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
);
```

- `enableHighAccuracy: true` requests GPS-level accuracy instead of Wi-Fi triangulation.
- `timeout: 10000` gives the device 10 seconds before triggering a timeout error.
- `maximumAge: 60000` allows the browser to reuse a cached position up to 1 minute old, which speeds up repeat uses.

The error callback handles the four standard error codes separately:

```javascript
switch (error.code) {
    case error.PERMISSION_DENIED:     // user clicked "Block"
    case error.POSITION_UNAVAILABLE:  // device cannot determine position
    case error.TIMEOUT:               // exceeded the 10s limit
    default:                          // anything else
}
```

Each case shows a different message in the sidebar's status area and as a toast notification.

If the browser does not support `navigator.geolocation` at all (very old browsers), the check `if (!navigator.geolocation)` at the top of the function handles that before any call is attempted.

---

## 4. Complete Data Flow

The following sequence describes what happens from the moment the page is opened until markers appear on the map.

```
1. Browser parses index.html
   → Bootstrap CSS, Bootstrap Icons, Font Awesome load (CDN)
   → styles.css loads
   → jQuery loads
   → Bootstrap JS loads
   → config.js loads → GOOGLE_MAPS_API_KEY and OCM_API_KEY are now global

2. app.js loads → CONFIG and appState are initialized, functions are defined
   → $(document).ready() fires → gm_authFailure handler is registered

3. The IIFE at the bottom of index.html runs
   → Validates GOOGLE_MAPS_API_KEY is not a placeholder
   → Injects <script src="maps.googleapis.com/...?callback=initMap"> into <head>

4. Google Maps SDK loads asynchronously
   → Calls initMap() when done

5. initMap()
   → Hides the loading overlay (#mapOverlay)
   → Creates google.maps.Map centered on Madrid (fallback default)
   → Creates google.maps.InfoWindow (reusable, one instance)
   → Creates google.maps.Geocoder
   → Calls initEventListeners() → all jQuery .on() handlers registered
   → Calls attemptGeolocation()

6. attemptGeolocation()
   → Checks navigator.geolocation support
   → Adds .loading class to #geoBtn (pulse animation starts)
   → Calls navigator.geolocation.getCurrentPosition()

7a. Geolocation SUCCESS
   → lat/lng extracted from position.coords
   → map.setCenter({ lat, lng }) + map.setZoom(13)
   → addUserLocationMarker() → blue SVG dot placed at user position
   → fetchChargingStations(lat, lng) →

7b. Geolocation ERROR
   → showStatusMessage() → sidebar shows error message with icon
   → showToast() → toast slides in bottom-right with error text
   → User must use search bar manually

8. fetchChargingStations(lat, lng)
   → showLoadingSpinner() → spinner visible, list hidden
   → clearMarkers() → previous markers removed from map, InfoWindow closed
   → $.ajax() GET to api.openchargemap.io/v3/poi/
     params: key, latitude, longitude, distance=10, distanceunit=KM, maxresults=50

9. Ajax SUCCESS — data = array of station objects
   → hideLoadingSpinner()
   → data.length === 0 → showStatusMessage('no-results') → stop
   → appState.stations = data
   → createMarkers(data) → one google.maps.Marker per station, colored by status
   → renderStationsList(data) → one .station-card per station in #stationsList
   → updateStationsCount(data.length) → badge and FAB badge updated
   → showToast('Found X stations...', 'success')
   → If mobile (width ≤ 767px) → #sidebar.open → sidebar slides up

10. User clicks a marker on the map
    → openInfoWindow(marker, station) → InfoWindow HTML injected, .open() called
    → highlightCard(station.ID) → card gets .active class, sidebar scrolls to it

11. User clicks a station card in the sidebar
    → centerMapOnStation(lat, lng, stationId)
    → map.panTo() + map.setZoom(16)
    → openInfoWindow() on matching marker
    → highlightCard()

12. User clicks "View full details" in InfoWindow
    → openStationModal(stationId) (called via inline onclick)
    → station data found in appState.stations
    → Bootstrap Modal HTML built dynamically with status, points, operator, connectors
    → new bootstrap.Modal().show()
```

---

## 5. API Key Security Pattern

Keeping API keys out of version control is a standard security practice. A committed key in a public GitHub repository can be scraped by bots within minutes and used to rack up charges on the developer's account.

The solution used here:

**`.gitignore`** contains the line `js/config.js`. Git never stages or commits this file regardless of `git add .`.

**`js/config.js`** (local only) declares the real keys:
```javascript
const GOOGLE_MAPS_API_KEY = 'AIzaSy...real_key...';
const OCM_API_KEY         = '5535c2...real_key...';
```

**`js/config.example.js`** (committed) is identical in structure but uses placeholder strings:
```javascript
const GOOGLE_MAPS_API_KEY = 'YOUR_GOOGLE_MAPS_API_KEY';
const OCM_API_KEY         = 'YOUR_OCM_API_KEY';
```

Any developer who clones the repository knows exactly what to do: copy `config.example.js`, rename it `config.js`, and fill in their own keys.

**Dynamic Maps script injection** means the Google Maps API key never appears in `index.html` source. Instead of:

```html
<!-- BAD: key visible in HTML source -->
<script src="https://maps.googleapis.com/maps/api/js?key=REAL_KEY&callback=initMap"></script>
```

The IIFE reads the key from the already-loaded `config.js` variable and builds the URL at runtime:

```javascript
script.src = 'https://maps.googleapis.com/maps/api/js?key=' + GOOGLE_MAPS_API_KEY + '&callback=initMap';
document.head.appendChild(script);
```

The IIFE also validates the key before injecting: if `GOOGLE_MAPS_API_KEY` is `undefined` or still the placeholder string, it aborts and shows an error message on the overlay instead of making a useless Maps request.

---

## 6. Responsive Design

The app has three layout modes controlled by media queries in `styles.css`.

### Desktop (> 991px)
The default layout: sidebar (`--sidebar-width: 380px`) and map section side by side using `display: flex`. The sidebar occupies a fixed width; the map takes all remaining space with `flex: 1`.

### Tablet (≤ 991px)
Only the sidebar width changes: `--sidebar-width: 320px`. Layout remains horizontal.

### Mobile (≤ 767px)
The layout switches to a single-column stack (`flex-direction: column`). The map takes the full viewport height (`height: 100vh`). The sidebar is absolutely positioned at the bottom and hidden off-screen by default using `transform: translateY(100%)`. When the user taps the FAB button (the green circular button, `#togglePanel`), the `.open` class is toggled on `#sidebar`, which slides it up:

```css
.sidebar {
    transform: translateY(100%);
    transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.sidebar.open {
    transform: translateY(0);
}
```

The FAB button (`btn-fab`) is `display: none` on desktop and `display: flex` on mobile. It shows a red badge with the station count when results are loaded:

```javascript
if ($(window).width() <= 767) {
    $('#sidebar').addClass('open');
    updateFabBadge(data.length);
}
```

On mobile, the search button text ("Search") is hidden with `.btn-search .btn-text { display: none }` and the brand name disappears too (`.brand-text { display: none }`), leaving only the icon — saving horizontal space in the navbar.

The station detail modal's info grid collapses from `grid-template-columns: 1fr 1fr` to a single column on mobile.

---

## 7. Error Handling

Every failure point in the app surfaces a clear message to the user. There are no silent failures.

| Failure | Where detected | User feedback |
|---|---|---|
| Browser has no geolocation support | `attemptGeolocation()` before any call | Sidebar status message + warning toast |
| User denies location permission | `error.code === PERMISSION_DENIED` | Sidebar error message + toast |
| Device cannot get position | `error.code === POSITION_UNAVAILABLE` | Sidebar error message + toast |
| Geolocation timeout (> 10s) | `error.code === TIMEOUT` | Sidebar error message + toast |
| Address not found by geocoder | `status === 'ZERO_RESULTS'` | Sidebar error message + toast |
| Geocoder query limit reached | `status === 'OVER_QUERY_LIMIT'` | Sidebar error message + toast |
| OCM API key invalid | `xhr.status === 401` | Sidebar error message + toast |
| OCM rate limit exceeded | `xhr.status === 429` | Sidebar error message + toast |
| No network / CORS block | `xhr.status === 0` | Sidebar error message + toast |
| Zero stations returned | `data.length === 0` | "No stations nearby" status in sidebar |
| Google Maps key invalid | `window.gm_authFailure()` | Map overlay replaced with error alert |
| Google Maps never loads | `setTimeout` after 10s | Console warning (no API to update UI) |

The sidebar status message area (`#statusMessage`) has three visual states controlled by CSS classes:
- Default (no class): green icon, "Enable your location" prompt
- `.error`: red icon, error description
- `.no-results`: amber icon, no stations message

---

## 8. Application State Management

Rather than using scattered global variables, all mutable runtime data is grouped into one object: `appState`.

```javascript
const appState = {
    map:           null,   // google.maps.Map instance
    markers:       [],     // all station markers currently on the map
    infoWindow:    null,   // single reusable InfoWindow
    geocoder:      null,   // google.maps.Geocoder instance
    stations:      [],     // raw JSON array from last OCM response
    activeCardId:  null,   // ID of the currently highlighted card
    currentFilter: 'all',  // active filter pill value
    currentModal:  null    // station object currently shown in the modal
};
```

This makes it easy to:
- Clear all markers: iterate `appState.markers` and call `.setMap(null)` on each.
- Re-filter the list: call `renderStationsList(appState.stations)` with the new `appState.currentFilter`.
- Find a station by ID: `appState.stations.find(s => s.ID === stationId)`.

`CONFIG` is a separate constant object for settings that never change at runtime (radius, zoom levels, defaults).

---

*Document generated from source code analysis of EV Charge Locator v1.0*
*Repository: https://github.com/Roberto-RodriguezNunez/EV-Charge-Locator-Key*
