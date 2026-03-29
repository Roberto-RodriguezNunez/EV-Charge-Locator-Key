'use strict';

/**
 * EV CHARGE LOCATOR — app.js
 * Aplicación SPA estática (sin framework, sin build step).
 * Dependencias: jQuery 3.7, Bootstrap 5, Google Maps JS API, Open Charge Map API.
 *
 * ÍNDICE
 * ──────────────────────────────────────────────────────────────
 *  1.  CONFIG & STATE       ln ~7   Configuración global y estado compartido
 *  2.  INIT                 ln ~47  Callback de Google Maps, arranque de la app
 *  3.  THEME                ln ~85  Modo oscuro/claro, estilos del mapa
 *  4.  EVENT LISTENERS      ln ~196 Registro de todos los eventos DOM
 *  5.  FILTERS & SYNC       ln ~379 Re-renderizado y sincronización de marcadores
 *  6.  VIEW MODES           ln ~417 Modos: mapa+lista / solo mapa / solo lista
 *  7.  GEOLOCATION          ln ~444 GPS del navegador, marcador de posición
 *  8.  SEARCH               ln ~525 Geocodificación de texto con Google Maps
 *  9.  SEARCH HISTORY       ln ~559 Historial de búsquedas (localStorage)
 * 10.  AUTOCOMPLETE         ln ~607 Sugerencias de Places mientras se escribe
 * 11.  OCM API              ln ~650 Petición AJAX a Open Charge Map
 * 12.  MARKERS & CLUSTERING ln ~726 Pins SVG, MarkerClusterer, limpieza
 * 13.  INFO WINDOW          ln ~817 Popup al hacer clic en un marcador
 * 14.  STATION LIST         ln ~878 Cards del sidebar, modal de detalle
 * 15.  FAVORITES            ln ~1112 Guardar/cargar estaciones en localStorage
 * 16.  COMPARE              ln ~1173 Comparativa de hasta 3 estaciones
 * 17.  ZONE STATISTICS      ln ~1251 Barra de estadísticas general y filtrada
 * 18.  ADVANCED FILTERS     ln ~1313 Lógica de filtrado por conector/velocidad/coste
 * 19.  STATUS HELPERS       ln ~1410 Texto, clase CSS y color según estado OCM
 * 20.  UI HELPERS           ln ~1475 Spinner, toasts, badges, FAB
 * ──────────────────────────────────────────────────────────────
 */

// Las claves de API se cargan desde config.js (excluido del repositorio).
// Copiar config.example.js como config.js y rellenar las claves para ejecutar.

/* Search settings */
const CONFIG = {
    searchRadiusKm: 10,      // km radius for the OCM query (updated by slider)
    maxResults:     500,     // base value — overridden dynamically by getMaxResults()
    defaultLat:     40.4168, // fallback center (Madrid)
    defaultLng:     -3.7038,
    defaultZoom:    13,
    markerZoom:     16       // zoom when centering on a station
};

/* LocalStorage keys */
const LS_THEME     = 'ev-theme';
const LS_FAVORITES = 'ev-favorites';
const LS_HISTORY   = 'ev-history';
const LS_RADIUS    = 'ev-radius';
const MAX_HISTORY  = 8;

/* App state */
const appState = {
    map:           null,
    markers:       [],
    infoWindow:    null,
    geocoder:      null,
    stations:      [],
    activeCardId:  null,
    currentFilter: 'all',
    currentModal:  null,
    userMarker:    null,
    clusterer:     null,
    favorites:     [],        // Station objects saved to localStorage
    compareList:   [],        // Station IDs selected for comparison (max 3)
    advFilters:    {
        connectors: [],       // 'ccs' | 'chademo' | 'type2' | 'type1'
        speeds:     [],       // 'slow' | 'fast' | 'ultra'
        costs:      []        // 'free' | 'paid'
    },
    searchHistory: [],
    viewMode:      'both'     // 'both' | 'map' | 'list'
};

/**
 * initMap — callback invocado por el SDK de Google Maps al terminar de cargarse.
 * Crea el mapa, el geocoder, el servicio de autocompletado y arranca la app.
 */
function initMap() {
    $('#mapOverlay').addClass('hidden');

    appState.map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: CONFIG.defaultLat, lng: CONFIG.defaultLng },
        zoom:   CONFIG.defaultZoom,
        styles: getMapStyles(),
        mapTypeControl:    false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER
        }
    });

    appState.infoWindow          = new google.maps.InfoWindow();
    appState.geocoder            = new google.maps.Geocoder();
    appState.autocompleteService = new google.maps.places.AutocompleteService();

    // Close InfoWindow on desktop click
    appState.map.addListener('click', function() {
        appState.infoWindow.close();
    });
    // Close InfoWindow when user starts dragging the map
    appState.map.addListener('dragstart', function() {
        appState.infoWindow.close();
    });
    // Close InfoWindow on mobile tap
    document.getElementById('map').addEventListener('pointerdown', function(e) {
        if (!e.target.closest('.gm-style-iw-c') && !e.target.closest('.gm-style-iw')) {
            appState.infoWindow.close();
        }
    });

    initEventListeners();
    attemptGeolocation();
}

/* ============================================================
   THEME
============================================================ */

/** Lee el tema guardado en localStorage; si no existe, usa la preferencia del sistema. */
function initTheme() {
    var saved  = localStorage.getItem(LS_THEME);
    var system = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    applyTheme(saved || system, false);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
        if (!localStorage.getItem(LS_THEME)) {
            applyTheme(e.matches ? 'dark' : 'light', true);
        }
    });
}

/** Aplica 'dark' o 'light' al atributo data-theme del HTML y actualiza el icono del botón. */
function applyTheme(theme, updateMap) {
    document.documentElement.classList.add('theme-switching');
    document.documentElement.setAttribute('data-theme', theme);
    setTimeout(function() {
        document.documentElement.classList.remove('theme-switching');
    }, 300);

    if (theme === 'dark') {
        $('#themeBtn').find('i').attr('class', 'bi bi-sun-fill');
        $('#themeBtn').attr('title', 'Switch to light mode');
    } else {
        $('#themeBtn').find('i').attr('class', 'bi bi-moon-fill');
        $('#themeBtn').attr('title', 'Switch to dark mode');
    }

    if (updateMap && appState.map) {
        appState.map.setOptions({ styles: getMapStyles() });
    }
}

/** Alterna entre dark y light y persiste la elección en localStorage. */
function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme');
    var next    = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(LS_THEME, next);
    applyTheme(next, true);
}

/* Map styles — returns dark or light depending on current theme */
function getMapStyles() {
    return document.documentElement.getAttribute('data-theme') === 'light'
        ? getLightMapStyles()
        : getDarkMapStyles();
}

/** Devuelve el array de estilos JSON para el mapa en tema oscuro (paleta azul marino). */
function getDarkMapStyles() {
    return [
        { elementType: 'geometry',             stylers: [{ color: '#1a2535' }] },
        { elementType: 'labels.text.fill',     stylers: [{ color: '#94a3b8' }] },
        { elementType: 'labels.text.stroke',   stylers: [{ color: '#0b1120' }] },
        { featureType: 'road',
          elementType: 'geometry',             stylers: [{ color: '#232f45' }] },
        { featureType: 'road',
          elementType: 'geometry.stroke',      stylers: [{ color: '#111827' }] },
        { featureType: 'road.highway',
          elementType: 'geometry',             stylers: [{ color: '#2d3f60' }] },
        { featureType: 'road.highway',
          elementType: 'geometry.stroke',      stylers: [{ color: '#1a2535' }] },
        { featureType: 'water',
          elementType: 'geometry',             stylers: [{ color: '#0b1120' }] },
        { featureType: 'water',
          elementType: 'labels.text.fill',     stylers: [{ color: '#4b5e82' }] },
        { featureType: 'poi',                  stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',              stylers: [{ visibility: 'off' }] },
        { featureType: 'administrative',
          elementType: 'geometry',             stylers: [{ color: '#232f45' }] },
        { featureType: 'administrative.country',
          elementType: 'labels.text.fill',     stylers: [{ color: '#6b7f9e' }] },
        { featureType: 'administrative.locality',
          elementType: 'labels.text.fill',     stylers: [{ color: '#94a3b8' }] },
        { featureType: 'landscape',
          elementType: 'geometry',             stylers: [{ color: '#1a2535' }] }
    ];
}

/** Devuelve el array de estilos JSON para el mapa en tema claro (grises y blancos). */
function getLightMapStyles() {
    return [
        { elementType: 'geometry',             stylers: [{ color: '#f5f5f5' }] },
        { elementType: 'labels.text.fill',     stylers: [{ color: '#616161' }] },
        { elementType: 'labels.text.stroke',   stylers: [{ color: '#f5f5f5' }] },
        { featureType: 'road',
          elementType: 'geometry',             stylers: [{ color: '#ffffff' }] },
        { featureType: 'road',
          elementType: 'geometry.stroke',      stylers: [{ color: '#e0e0e0' }] },
        { featureType: 'road.highway',
          elementType: 'geometry',             stylers: [{ color: '#dadada' }] },
        { featureType: 'road.highway',
          elementType: 'geometry.stroke',      stylers: [{ color: '#cccccc' }] },
        { featureType: 'water',
          elementType: 'geometry',             stylers: [{ color: '#c9d8e8' }] },
        { featureType: 'water',
          elementType: 'labels.text.fill',     stylers: [{ color: '#9e9e9e' }] },
        { featureType: 'poi',                  stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',              stylers: [{ visibility: 'off' }] },
        { featureType: 'administrative',
          elementType: 'geometry',             stylers: [{ color: '#e0e0e0' }] },
        { featureType: 'administrative.locality',
          elementType: 'labels.text.fill',     stylers: [{ color: '#757575' }] },
        { featureType: 'landscape',
          elementType: 'geometry',             stylers: [{ color: '#f5f5f5' }] }
    ];
}

/* ============================================================
   EVENT LISTENERS
============================================================ */
/**
 * initEventListeners — registra todos los eventos de la interfaz.
 * Organizado en bloques: búsqueda, geolocalización, filtros, tema,
 * sidebar mobile, modal, comparador, historial y autocompletado.
 */
function initEventListeners() {
    // Search form
    $('#searchForm').on('submit', function(e) {
        e.preventDefault();
        const query = $('#searchInput').val().trim();
        if (query.length > 0) {
            hideSearchHistory();
            searchByAddress(query);
        }
    });

    // Geolocation button
    $('#geoBtn').on('click', function() {
        attemptGeolocation(true);
    });

    // Status filter pills
    $(document).on('click', '.pill', function() {
        $('.pill').removeClass('active');
        $(this).addClass('active');
        appState.currentFilter = $(this).data('filter');
        renderStationsList(appState.stations);
        syncMarkersToFilter();
        updateFilteredStats();
    });

    // Theme toggle
    $('#themeBtn').on('click', toggleTheme);

    // Mobile: toggle sidebar
    $('#togglePanel').on('click', function() {
        const opening = !$('#sidebar').hasClass('open');
        $('#sidebar').toggleClass('open');
        updateFabIcon(opening);
    });

    // Mobile: close panel via header button
    $('#closePanelBtn').on('click', function() {
        $('#sidebar').removeClass('open');
        updateFabIcon(false);
    });

    // Center map from modal
    $('#modalCenterBtn').on('click', function() {
        if (!appState.currentModal) return;
        const s = appState.currentModal;
        centerMapOnStation(s.AddressInfo.Latitude, s.AddressInfo.Longitude, s.ID);
        bootstrap.Modal.getInstance(document.getElementById('stationModal')).hide();
    });

    // ---- Advanced filters ----

    // Toggle advanced filter panel
    $('#advancedFilterToggle').on('click', function() {
        const $panel = $('#advancedFiltersPanel');
        const open   = $panel.hasClass('d-none');
        $panel.toggleClass('d-none', !open);
        $('#advancedFilterToggle').toggleClass('active', open);
        $('#advFilterChevron').css('transform', open ? 'rotate(180deg)' : '');
    });

    // Radius slider — persist value and re-fetch if stations already loaded
    var _radiusTimer = null;
    $('#radiusSlider').on('input', function() {
        const val = parseInt($(this).val());
        CONFIG.searchRadiusKm = val;
        $('#radiusValue').text(val);
        localStorage.setItem(LS_RADIUS, val);
        if (appState.userMarker) {
            clearTimeout(_radiusTimer);
            _radiusTimer = setTimeout(function() {
                const pos = appState.userMarker.getPosition();
                fetchChargingStations(pos.lat(), pos.lng());
            }, 600);
        }
    });

    // Connector checkboxes
    $(document).on('change', '[name="connector"]', function() {
        appState.advFilters.connectors = $('[name="connector"]:checked').map(function() {
            return $(this).val();
        }).get();
        applyAndRender();
    });

    // Speed checkboxes
    $(document).on('change', '[name="speed"]', function() {
        appState.advFilters.speeds = $('[name="speed"]:checked').map(function() {
            return $(this).val();
        }).get();
        applyAndRender();
    });

    // Cost checkboxes
    $(document).on('change', '[name="cost"]', function() {
        appState.advFilters.costs = $('[name="cost"]:checked').map(function() {
            return $(this).val();
        }).get();
        applyAndRender();
    });

    // Reset all advanced filters
    $('#resetFilters').on('click', function() {
        appState.advFilters = { connectors: [], speeds: [], costs: [] };
        $('[name="connector"], [name="speed"], [name="cost"]').prop('checked', false);
        CONFIG.searchRadiusKm = 10;
        $('#radiusSlider').val(10);
        $('#radiusValue').text(10);
        applyAndRender();
    });

    // ---- View toggle (desktop) ----
    $('#viewBoth').on('click', function() { setViewMode('both'); });
    $('#viewMap').on('click',  function() { setViewMode('map');  });
    $('#viewList').on('click', function() { setViewMode('list'); });

    // ---- Compare bar ----
    $('#compareBtn').on('click', openCompareModal);
    $('#compareClearBtn').on('click', function() {
        appState.compareList = [];
        $('.btn-compare-check').removeClass('active');
        $('#compareBar').addClass('d-none');
    });

    // ---- Search history ----
    $('#searchInput').on('focus', function() {
        showSearchHistory();
    });

    $('#searchInput').on('blur', function() {
        // Delay so clicks inside the dropdown register first
        setTimeout(hideSearchHistory, 200);
    });

    $('#searchInput').on('input', function() {
        const val = $(this).val().trim();
        if (val.length >= 2) {
            fetchAutocompleteSuggestions(val);
        } else if (val.length === 0) {
            showSearchHistory();
        } else {
            hideSearchHistory();
        }
    });

    // Autocomplete suggestion click
    $(document).on('click', '.suggestion-item', function() {
        const description = $(this).data('description');
        $('#searchInput').val(description);
        hideSearchHistory();
        searchByAddress(description);
    });

    // History item click (delegated)
    $(document).on('click', '.history-item', function(e) {
        if ($(e.target).closest('.history-remove').length) return; // handled below
        const query = $(this).data('query');
        if (query) {
            $('#searchInput').val(query);
            hideSearchHistory();
            searchByAddress(query);
        }
    });

    // History item remove
    $(document).on('click', '.history-remove', function(e) {
        e.stopPropagation();
        const idx = parseInt($(this).data('index'));
        appState.searchHistory.splice(idx, 1);
        localStorage.setItem(LS_HISTORY, JSON.stringify(appState.searchHistory));
        showSearchHistory();
    });

    // Clear all history
    $(document).on('click', '#clearHistoryBtn', function(e) {
        e.stopPropagation();
        appState.searchHistory = [];
        localStorage.removeItem(LS_HISTORY);
        hideSearchHistory();
    });
}

/** Punto de entrada único para cualquier cambio de filtro: actualiza lista, marcadores y stats. */
function applyAndRender() {
    updateAdvancedFilterIndicator();
    if (appState.stations.length > 0 || appState.currentFilter === 'favorites') {
        renderStationsList(appState.stations);
        syncMarkersToFilter();
        updateFilteredStats();
    }
}

/* Show only markers whose station passes the current filters */
function syncMarkersToFilter() {
    if (appState.markers.length === 0) return;

    const filtered   = filterStations(appState.stations, appState.currentFilter);
    const visibleIds = new Set(filtered.map(s => s.ID));

    const visible = appState.markers.filter(m => visibleIds.has(m.stationId));
    const hidden  = appState.markers.filter(m => !visibleIds.has(m.stationId));

    // Explicitly hide non-matching markers (handles markers placed directly
    // via setMap, which clusterer.clearMarkers() won't catch)
    hidden.forEach(m => m.setMap(null));

    if (appState.clusterer) {
        appState.clusterer.clearMarkers();
        if (visible.length > 0) appState.clusterer.addMarkers(visible);
    } else {
        visible.forEach(m => m.setMap(appState.map));
    }

    if (appState.activeCardId && !visibleIds.has(appState.activeCardId)) {
        appState.infoWindow.close();
    }
}

/* ============================================================
   VIEW MODES (desktop)
============================================================ */
/** Cambia la distribución del layout en desktop: 'both' | 'map' | 'list'. */
function setViewMode(mode) {
    appState.viewMode = mode;
    $('.view-btn').removeClass('active');
    $('#view' + mode.charAt(0).toUpperCase() + mode.slice(1)).addClass('active');

    const $sidebar = $('#sidebar');
    const $map     = $('#mapSection');

    $sidebar.removeClass('view-hidden view-full');
    $map.removeClass('view-hidden');

    if (mode === 'map') {
        $sidebar.addClass('view-hidden');
        if (appState.map) {
            setTimeout(function() {
                google.maps.event.trigger(appState.map, 'resize');
            }, 50);
        }
    } else if (mode === 'list') {
        $map.addClass('view-hidden');
        $sidebar.addClass('view-full');
    }
}

/* ============================================================
   GEOLOCATION
============================================================ */
/** Solicita la posición GPS al navegador y lanza fetchChargingStations si tiene éxito. */
function attemptGeolocation() {
    if (!navigator.geolocation) {
        showStatusMessage('error', 'fa-solid fa-location-slash',
            'Geolocation not supported',
            'Your browser does not support geolocation. Use the search bar instead.');
        showToast('Geolocation is not supported by your browser.', 'warning');
        return;
    }

    $('#geoBtn').addClass('loading').attr('title', 'Getting location...');

    navigator.geolocation.getCurrentPosition(
        function(position) {
            $('#geoBtn').removeClass('loading').addClass('active');
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            appState.map.setCenter({ lat, lng });
            appState.map.setZoom(CONFIG.defaultZoom);
            addUserLocationMarker(lat, lng);
            fetchChargingStations(lat, lng);

            showToast('<i class="bi bi-geo-alt-fill me-1"></i> Location acquired.', 'success');
        },
        function(error) {
            $('#geoBtn').removeClass('loading');

            let title, msg;
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    title = 'Permission denied';
                    msg   = 'Location access was denied. Use the search bar to find stations manually.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    title = 'Position unavailable';
                    msg   = 'Could not determine your location. Try again or use the search bar.';
                    break;
                case error.TIMEOUT:
                    title = 'Request timed out';
                    msg   = 'Geolocation request took too long. Please try again.';
                    break;
                default:
                    title = 'Unknown error';
                    msg   = 'Could not get your location. Use the search bar.';
            }

            showStatusMessage('error', 'fa-solid fa-location-slash', title, msg);
            showToast('<i class="bi bi-exclamation-triangle-fill me-1"></i> ' + title + ': ' + msg, 'error');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

/** Dibuja el punto azul (posición del usuario) en el mapa; reemplaza el anterior si existe. */
function addUserLocationMarker(lat, lng) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
          <circle cx="18" cy="18" r="16" fill="#0d6efd" opacity="0.2"/>
          <circle cx="18" cy="18" r="8"  fill="#0d6efd"/>
          <circle cx="18" cy="18" r="4"  fill="#ffffff"/>
        </svg>`;

    const marker = new google.maps.Marker({
        position: { lat, lng },
        map:   appState.map,
        title: 'Your location',
        icon: {
            url:       'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
            scaledSize: new google.maps.Size(36, 36),
            anchor:     new google.maps.Point(18, 18)
        },
        zIndex: 999
    });

    if (appState.userMarker) appState.userMarker.setMap(null);
    appState.userMarker = marker;
}

/* ============================================================
   SEARCH
============================================================ */
/** Geocodifica la dirección con Google Maps y lanza fetchChargingStations con las coordenadas. */
function searchByAddress(query) {
    showLoadingSpinner();

    appState.geocoder.geocode({ address: query }, function(results, status) {
        if (status === 'OK' && results.length > 0) {
            const loc = results[0].geometry.location;
            const lat = loc.lat();
            const lng = loc.lng();

            appState.map.setCenter({ lat, lng });
            appState.map.setZoom(CONFIG.defaultZoom);
            addUserLocationMarker(lat, lng);
            $('#searchInput').val(results[0].formatted_address);

            // Save to search history
            saveSearchHistory(results[0].formatted_address);

            fetchChargingStations(lat, lng);
        } else {
            hideLoadingSpinner();

            let msg = 'Address "' + query + '" not found. Try a different term.';
            if (status === 'ZERO_RESULTS')      msg = 'No results for "' + query + '".';
            if (status === 'OVER_QUERY_LIMIT')  msg = 'Query limit reached. Try again in a moment.';

            showStatusMessage('error', 'fa-solid fa-map-location-dot', 'Address not found', msg);
            showToast('<i class="bi bi-exclamation-triangle-fill me-1"></i> ' + msg, 'error');
        }
    });
}

/* ============================================================
   SEARCH HISTORY
============================================================ */
/** Carga el historial desde localStorage a appState.searchHistory. */
function loadSearchHistory() {
    try {
        appState.searchHistory = JSON.parse(localStorage.getItem(LS_HISTORY)) || [];
    } catch(e) {
        appState.searchHistory = [];
    }
}

/** Añade la búsqueda al historial (sin duplicados, máx MAX_HISTORY entradas) y lo persiste. */
function saveSearchHistory(query) {
    loadSearchHistory();
    appState.searchHistory = appState.searchHistory.filter(
        q => q.toLowerCase() !== query.toLowerCase()
    );
    appState.searchHistory.unshift(query);
    appState.searchHistory = appState.searchHistory.slice(0, MAX_HISTORY);
    localStorage.setItem(LS_HISTORY, JSON.stringify(appState.searchHistory));
}

/** Renderiza el historial de búsquedas en el dropdown del input. */
function showSearchHistory() {
    loadSearchHistory();
    const $dropdown = $('#searchHistoryDropdown');

    if (appState.searchHistory.length === 0) {
        $dropdown.addClass('d-none');
        return;
    }

    let html = `<div class="history-header">
        <span>Recent searches</span>
        <button id="clearHistoryBtn" class="history-clear-all">Clear all</button>
    </div>`;

    appState.searchHistory.forEach(function(q, i) {
        html += `<div class="history-item" data-query="${escapeHtml(q)}">
            <i class="bi bi-clock-history"></i>
            <span>${escapeHtml(q)}</span>
            <button class="history-remove" data-index="${i}" title="Remove">
                <i class="bi bi-x"></i>
            </button>
        </div>`;
    });

    $dropdown.html(html).removeClass('d-none');
}

/* ============================================================
   AUTOCOMPLETE SUGGESTIONS
============================================================ */
var _autocompleteTimer = null; // Timer del debounce para no disparar una petición por tecla

/** Consulta Places AutocompleteService con debounce de 200 ms y muestra hasta 5 sugerencias. */
function fetchAutocompleteSuggestions(query) {
    if (!appState.autocompleteService) return;
    clearTimeout(_autocompleteTimer);
    _autocompleteTimer = setTimeout(function() {
        appState.autocompleteService.getPlacePredictions(
            { input: query, types: ['geocode'] },
            function(predictions, status) {
                if (status === google.maps.places.PlacesServiceStatus.OK && predictions) {
                    showAutocompleteSuggestions(predictions.slice(0, 5));
                } else {
                    hideSearchHistory();
                }
            }
        );
    }, 200);
}

/** Renderiza las predicciones de Places en el mismo dropdown que el historial. */
function showAutocompleteSuggestions(predictions) {
    const $dropdown = $('#searchHistoryDropdown');
    let html = '';
    predictions.forEach(function(p) {
        const main      = escapeHtml(p.structured_formatting.main_text);
        const secondary = p.structured_formatting.secondary_text
            ? escapeHtml(p.structured_formatting.secondary_text)
            : '';
        html += `<div class="suggestion-item" data-place-id="${p.place_id}" data-description="${escapeHtml(p.description)}">
            <i class="bi bi-geo-alt"></i>
            <span class="suggestion-main">${main}</span>
            ${secondary ? `<span class="suggestion-secondary">${secondary}</span>` : ''}
        </div>`;
    });
    $dropdown.html(html).removeClass('d-none');
}

function hideSearchHistory() {
    $('#searchHistoryDropdown').addClass('d-none');
}

/* ============================================================
   OPEN CHARGE MAP API
============================================================ */

/**
 * getMaxResults — escala el límite de resultados según el radio activo.
 * Evita que búsquedas pequeñas hagan peticiones innecesariamente grandes
 * y que búsquedas amplias queden truncadas por el límite por defecto.
 */
function getMaxResults() {
    const r = CONFIG.searchRadiusKm;
    if (r <= 10) return 500;
    if (r <= 20) return 1000;
    if (r <= 35) return 2000;
    return 5000;
}

/**
 * fetchChargingStations — petición AJAX a la API REST de Open Charge Map.
 * Parámetros clave: lat/lng, distance (km), maxresults (escalado por getMaxResults).
 * En éxito: crea marcadores, renderiza lista, aplica filtros activos y actualiza stats.
 */
function fetchChargingStations(lat, lng) {
    showLoadingSpinner();
    clearMarkers();

    $.ajax({
        url:      'https://api.openchargemap.io/v3/poi/',
        method:   'GET',
        dataType: 'json',
        data: {
            key:          OCM_API_KEY,
            latitude:     lat,
            longitude:    lng,
            distance:     CONFIG.searchRadiusKm,
            distanceunit: 'KM',
            maxresults:   getMaxResults()
        },
        success: function(data) {
            hideLoadingSpinner();

            if (!data || data.length === 0) {
                showStatusMessage('no-results', 'fa-solid fa-charging-station',
                    'No stations nearby',
                    'No charging stations found within ' + CONFIG.searchRadiusKm + ' km. Try searching another area.');
                showToast('No stations found nearby.', 'warning');
                return;
            }

            appState.stations = data;
            createMarkers(data);
            renderStationsList(data);
            syncMarkersToFilter();
            updateStationsCount(filterStations(data, appState.currentFilter).length);
            updateZoneStats(data);
            updateFilteredStats();

            showToast(
                '<i class="bi bi-check-circle-fill me-1"></i> Found <strong>' +
                data.length + '</strong> stations within ' + CONFIG.searchRadiusKm + ' km.',
                'success'
            );

            // Auto-open sidebar on mobile
            if ($(window).width() <= 767) {
                $('#sidebar').addClass('open');
                updateFabIcon(true);
                updateFabBadge(data.length);
            }
        },
        error: function(xhr) {
            hideLoadingSpinner();

            let msg = 'Could not connect to Open Charge Map. Check your internet connection.';
            if (xhr.status === 401) msg = 'Invalid API key. Check OCM_API_KEY in config.js.';
            if (xhr.status === 429) msg = 'Too many requests. Wait a moment and try again.';
            if (xhr.status === 0)   msg = 'No internet connection or API unavailable.';

            showStatusMessage('error', 'fa-solid fa-triangle-exclamation', 'Failed to load stations', msg);
            showToast('<i class="bi bi-wifi-off me-1"></i> ' + msg, 'error');
            console.error('[EV Charge Locator] Ajax error:', xhr.status, xhr.responseText);
        }
    });
}

/* ============================================================
   MARKERS & CLUSTERING
============================================================ */
/**
 * createMarkers — crea un Marker SVG por estación y los agrupa con MarkerClusterer.
 * Los marcadores no se añaden directamente al mapa; el clusterer gestiona su visibilidad.
 */
function createMarkers(stations) {
    stations.forEach(function(station, index) {
        const lat   = station.AddressInfo.Latitude;
        const lng   = station.AddressInfo.Longitude;
        const isFav = isFavorite(station.ID);
        const color = isFav ? '#f59e0b' : getStatusColor(station.StatusType);

        const marker = new google.maps.Marker({
            position:     { lat, lng },
            // map NOT set here — clusterer manages it
            title:        station.AddressInfo.Title,
            icon: {
                url:        createMarkerSVG(color),
                scaledSize: new google.maps.Size(36, 44),
                anchor:     new google.maps.Point(18, 44)
            },
            stationId:    station.ID,
            stationIndex: index
        });

        marker.addListener('click', function() {
            openInfoWindow(marker, station);
            highlightCard(station.ID);
        });

        appState.markers.push(marker);
    });

    // Initialize MarkerClusterer if available
    if (typeof markerClusterer !== 'undefined' && appState.markers.length > 0) {
        appState.clusterer = new markerClusterer.MarkerClusterer({
            map:      appState.map,
            markers:  appState.markers,
            renderer: { render: clusterRenderer }
        });
    } else {
        // Fallback: add markers directly to map
        appState.markers.forEach(m => m.setMap(appState.map));
    }
}

/** Renderer personalizado para clusters: círculo verde con el número de estaciones agrupadas. */
function clusterRenderer({ count, position }) {
    const size = count < 10 ? 40 : count < 100 ? 48 : 54;
    const svg  = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#00d084" opacity="0.92"/>
        <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 7}" fill="none" stroke="#fff" stroke-width="2" opacity="0.5"/>
        <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" fill="#fff"
              font-size="14" font-weight="700" font-family="system-ui,sans-serif">${count}</text>
    </svg>`;
    const url  = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
    const half = size / 2;

    return new google.maps.Marker({
        position,
        icon: {
            url,
            scaledSize: new google.maps.Size(size, size),
            anchor:     new google.maps.Point(half, half)
        },
        label: '',
        zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count
    });
}

/** Genera el SVG del pin de mapa (gota + rayo) con el color indicado. Devuelve data URI. */
function createMarkerSVG(color) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 44" width="36" height="44">
          <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z"
                fill="${color}" opacity="0.95"/>
          <circle cx="18" cy="17" r="10" fill="rgba(255,255,255,0.15)"/>
          <path d="M20.5 8.5l-5 9h4.5l-4.5 9 8-11h-4.5z" fill="#ffffff" opacity="0.95"/>
        </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/** Elimina todos los marcadores del mapa y destruye el clusterer (llamado antes de cada búsqueda). */
function clearMarkers() {
    if (appState.clusterer) {
        appState.clusterer.clearMarkers();
        appState.clusterer = null;
    }
    appState.markers.forEach(m => m.setMap(null));
    appState.markers = [];
    if (appState.infoWindow) appState.infoWindow.close();
}

/* ============================================================
   INFO WINDOW
============================================================ */
/**
 * openInfoWindow — construye el HTML del popup y lo muestra sobre el marcador.
 * Contiene: nombre, dirección, estado, conectores, nº de puntos, coste,
 * y botones de Detalles, Guardar (★) y Navegar.
 */
function openInfoWindow(marker, station) {
    const info       = station.AddressInfo;
    const connectors = getConnectorsList(station);
    const statusText = getStatusText(station.StatusType);
    const statusColor= getStatusColor(station.StatusType);
    const numPoints  = station.NumberOfPoints || 'N/A';
    const cost       = station.UsageCost || '';
    const favIcon    = isFavorite(station.ID) ? 'bi-star-fill' : 'bi-star';

    const content = `
        <div class="info-window">
            <div class="info-window-header">
                <h6>${escapeHtml(info.Title)}</h6>
            </div>
            <div class="info-window-body">
                <div class="info-window-row">
                    <i class="fa-solid fa-location-dot"></i>
                    <span>${escapeHtml(buildAddress(info))}</span>
                </div>
                <div class="info-window-row">
                    <i class="fa-solid fa-circle-check" style="color:${statusColor}"></i>
                    <span style="color:${statusColor}">${statusText}</span>
                </div>
                <div class="info-window-row">
                    <i class="fa-solid fa-plug"></i>
                    <span>${connectors || 'Connector type unknown'}</span>
                </div>
                <div class="info-window-row">
                    <i class="fa-solid fa-charging-station"></i>
                    <span>${numPoints} charging point(s)</span>
                </div>
                ${cost ? `
                <div class="info-window-row">
                    <i class="fa-solid fa-tag"></i>
                    <span>${escapeHtml(cost)}</span>
                </div>` : ''}
                <div style="display:flex;gap:6px;margin-top:0.75rem;">
                    <button class="info-window-btn" style="margin-top:0;"
                            onclick="openStationModal(${station.ID})">
                        <i class="fa-solid fa-circle-info"></i> Details
                    </button>
                    <button class="info-window-btn info-window-btn-star" style="margin-top:0;width:auto;padding:5px 10px;"
                            onclick="toggleFavorite(${station.ID})" title="Save to favorites">
                        <i class="bi ${favIcon}"></i>
                    </button>
                    <a class="info-window-btn" style="margin-top:0;text-align:center;text-decoration:none;"
                       href="https://www.google.com/maps/dir/?api=1&destination=${info.Latitude},${info.Longitude}"
                       target="_blank" rel="noopener">
                        <i class="fa-solid fa-diamond-turn-right"></i> Navigate
                    </a>
                </div>
            </div>
        </div>`;

    appState.infoWindow.setContent(content);
    appState.infoWindow.open(appState.map, marker);
}

/* ============================================================
   STATION LIST RENDERING
============================================================ */
/** Filtra las estaciones con el filtro activo y renderiza las cards en el sidebar. */
function renderStationsList(stations) {
    const $list  = $('#stationsList');
    const toShow = filterStations(stations, appState.currentFilter);

    $list.empty();

    if (toShow.length === 0) {
        const isFavs = appState.currentFilter === 'favorites';
        $list.html(`
            <div class="text-center py-4" style="color: var(--color-text-muted); font-size: 0.82rem;">
                <i class="${isFavs ? 'bi bi-star' : 'fa-solid fa-filter'} mb-2 d-block" style="font-size: 1.5rem;"></i>
                ${isFavs
                    ? 'No saved stations yet.<br>Tap ★ on a card to save one.'
                    : 'No stations match the active filters.'}
            </div>`);
    } else {
        toShow.forEach(s => $list.append(createStationCard(s)));
    }

    $('#statusMessage').hide();
    $list.removeClass('d-none').show();
    updateStationsCount(toShow.length);
}

/**
 * createStationCard — crea el elemento jQuery de una card de estación.
 * Incluye estado, nombre, dirección, distancia, conectores y botones de favorito/comparar.
 */
function createStationCard(station) {
    const info        = station.AddressInfo;
    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const connectors  = getConnectorsList(station, 2);
    const numPoints   = station.NumberOfPoints || '?';
    const distanceStr = info.Distance
        ? (Math.round(info.Distance * 10) / 10) + ' km'
        : '';
    const isFav       = isFavorite(station.ID);
    const inCompare   = appState.compareList.includes(station.ID);

    const $card = $(`
        <div class="station-card" data-id="${station.ID}">
            <div class="card-top-row">
                <span class="station-status ${statusClass}">
                    <i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i>
                    ${statusText}
                </span>
                <div class="card-actions">
                    ${distanceStr ? `<small class="card-distance">${distanceStr}</small>` : ''}
                    <button class="btn-card-action btn-favorite ${isFav ? 'active' : ''}"
                            title="${isFav ? 'Remove from saved' : 'Save station'}">
                        <i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'}"></i>
                    </button>
                    <button class="btn-card-action btn-compare-check ${inCompare ? 'active' : ''}"
                            title="${inCompare ? 'Remove from comparison' : 'Add to comparison'}">
                        <i class="bi bi-bar-chart-steps"></i>
                    </button>
                </div>
            </div>
            <p class="station-name">${escapeHtml(info.Title)}</p>
            <p class="station-address">
                <i class="bi bi-geo-alt" style="font-size: 0.7rem;"></i>
                ${escapeHtml(buildAddress(info))}
            </p>
            <div class="station-meta">
                <span class="station-meta-item">
                    <i class="fa-solid fa-charging-station"></i>
                    ${numPoints} point(s)
                </span>
                ${connectors ? `
                <span class="station-meta-item">
                    <i class="fa-solid fa-plug"></i>
                    ${escapeHtml(connectors)}
                </span>` : ''}
            </div>
        </div>`);

    // Click card body → center map
    $card.on('click', function(e) {
        if ($(e.target).closest('.btn-card-action').length) return;
        centerMapOnStation(info.Latitude, info.Longitude, station.ID);
    });

    // Favorite button
    $card.find('.btn-favorite').on('click', function(e) {
        e.stopPropagation();
        toggleFavorite(station.ID, $card);
    });

    // Compare button
    $card.find('.btn-compare-check').on('click', function(e) {
        e.stopPropagation();
        toggleCompare(station.ID);
    });

    return $card;
}

/**
 * centerMapOnStation — centra el mapa en la estación al zoom markerZoom (16).
 * Espera al evento 'idle' para que los clusters se disuelvan antes de abrir el InfoWindow.
 */
function centerMapOnStation(lat, lng, stationId) {
    if ($(window).width() <= 767) {
        $('#sidebar').removeClass('open');
        updateFabIcon(false);
    }

    appState.map.panTo({ lat, lng });
    appState.map.setZoom(CONFIG.markerZoom);

    // Wait for map to settle so clusters dissolve before opening InfoWindow
    google.maps.event.addListenerOnce(appState.map, 'idle', function() {
        const marker  = appState.markers.find(m => m.stationId === stationId);
        const station = appState.stations.find(s => s.ID === stationId)
                     || appState.favorites.find(s => s.ID === stationId);
        if (station && marker) {
            if (!marker.getMap()) {
                // Marker still managed by clusterer — extract it to avoid duplicates
                if (appState.clusterer) appState.clusterer.removeMarker(marker);
                marker.setMap(appState.map);
            }
            openInfoWindow(marker, station);
        }
    });

    highlightCard(stationId);
}

/** Resalta la card activa en el sidebar y hace scroll suave hasta ella. */
function highlightCard(stationId) {
    $('.station-card').removeClass('active');
    const $card = $(`.station-card[data-id="${stationId}"]`);
    $card.addClass('active');

    const list = document.getElementById('stationsList');
    if ($card.length && list) {
        list.scrollTo({ top: $card[0].offsetTop - list.offsetTop - 16, behavior: 'smooth' });
    }

    appState.activeCardId = stationId;
}

/**
 * openStationModal — abre el modal Bootstrap con el detalle completo de la estación:
 * estado, puntos, operador, tipo de acceso, coste, conectores y botón de favorito.
 */
function openStationModal(stationId) {
    const station = appState.stations.find(s => s.ID === stationId)
                 || appState.favorites.find(s => s.ID === stationId);
    if (!station) return;

    appState.currentModal = station;
    const info = station.AddressInfo;

    $('#stationModalLabel').text(info.Title);
    $('#modalAddress').text(buildAddress(info));

    const navUrl = 'https://www.google.com/maps/dir/?api=1&destination='
                   + info.Latitude + ',' + info.Longitude;
    $('#modalNavigateBtn').attr('href', navUrl);

    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const numPoints   = station.NumberOfPoints || 'N/A';
    const operator    = station.OperatorInfo ? station.OperatorInfo.Title : 'Not available';
    const usageType   = station.UsageType    ? station.UsageType.Title    : 'Not available';
    const cost        = station.UsageCost    || '';
    const isFav       = isFavorite(station.ID);

    let connectorsHtml = '<div class="connector-list">';
    if (station.Connections && station.Connections.length > 0) {
        station.Connections.forEach(function(conn) {
            const type  = conn.ConnectionType ? conn.ConnectionType.Title : 'Unknown';
            const level = conn.Level          ? conn.Level.Title           : '';
            const power = conn.PowerKW        ? conn.PowerKW + ' kW'      : '';
            const label = [type, level, power].filter(Boolean).join(' · ');
            connectorsHtml += `<span class="connector-tag"><i class="fa-solid fa-plug me-1"></i>${escapeHtml(label)}</span>`;
        });
    } else {
        connectorsHtml += '<span class="connector-tag">Not specified</span>';
    }
    connectorsHtml += '</div>';

    $('#modalBody').html(`
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-circle-check me-1"></i>Status</div>
                <div class="modal-info-value">
                    <span class="station-status ${statusClass}" style="font-size:0.8rem;">
                        <i class="bi bi-circle-fill" style="font-size:0.5rem;"></i>
                        ${statusText}
                    </span>
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-charging-station me-1"></i>Charging points</div>
                <div class="modal-info-value">${numPoints}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-building me-1"></i>Operator</div>
                <div class="modal-info-value">${escapeHtml(operator)}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-users me-1"></i>Access type</div>
                <div class="modal-info-value">${escapeHtml(usageType)}</div>
            </div>
        </div>
        ${cost ? `
        <div class="modal-info-item">
            <div class="modal-info-label"><i class="fa-solid fa-tag me-1"></i>Usage cost</div>
            <div class="modal-info-value">${escapeHtml(cost)}</div>
        </div>` : ''}
        <div class="modal-info-item mb-0">
            <div class="modal-info-label mb-2"><i class="fa-solid fa-plug me-1"></i>Available connectors</div>
            ${connectorsHtml}
        </div>
        <div class="mt-3">
            <button class="btn btn-sm ${isFav ? 'btn-warning' : 'btn-outline-warning'} modal-fav-btn"
                    onclick="toggleFavoriteModal(${station.ID}, this)">
                <i class="bi ${isFav ? 'bi-star-fill' : 'bi-star'} me-1"></i>
                ${isFav ? 'Remove from saved' : 'Save to favorites'}
            </button>
        </div>`);

    new bootstrap.Modal(document.getElementById('stationModal')).show();
}

window.openStationModal = openStationModal;

/** Versión del toggle de favorito para el modal: también actualiza el estilo del botón in situ. */
function toggleFavoriteModal(stationId, btn) {
    toggleFavorite(stationId);
    const nowFav = isFavorite(stationId);
    $(btn).toggleClass('btn-warning', nowFav).toggleClass('btn-outline-warning', !nowFav);
    $(btn).find('i').attr('class', nowFav ? 'bi bi-star-fill me-1' : 'bi bi-star me-1');
    $(btn).contents().last()[0].textContent = ' ' + (nowFav ? 'Remove from saved' : 'Save to favorites');
}
window.toggleFavoriteModal = toggleFavoriteModal;

/* ============================================================
   FAVORITES
============================================================ */
/** Lee los favoritos desde localStorage a appState.favorites. */
function loadFavorites() {
    try {
        appState.favorites = JSON.parse(localStorage.getItem(LS_FAVORITES)) || [];
    } catch(e) {
        appState.favorites = [];
    }
}

/** Persiste appState.favorites en localStorage (objeto completo de la estación OCM). */
function saveFavorites() {
    localStorage.setItem(LS_FAVORITES, JSON.stringify(appState.favorites));
}

/** Devuelve true si la estación con ese ID está en la lista de favoritos. */
function isFavorite(stationId) {
    return appState.favorites.some(s => s.ID === stationId);
}

/**
 * toggleFavorite — añade o elimina una estación de favoritos.
 * Actualiza: localStorage, estrella de la card, color del marcador en el mapa.
 */
function toggleFavorite(stationId, $card) {
    const station = appState.stations.find(s => s.ID === stationId)
                 || appState.favorites.find(s => s.ID === stationId);
    if (!station) return;

    if (isFavorite(stationId)) {
        appState.favorites = appState.favorites.filter(s => s.ID !== stationId);
        showToast('<i class="bi bi-star me-1"></i> Removed from saved.', 'info');
    } else {
        appState.favorites.push(station);
        showToast('<i class="bi bi-star-fill me-1"></i> Station saved!', 'success');
    }
    saveFavorites();

    const nowFav = isFavorite(stationId);

    // Update star in card (if $card element was passed or find it)
    const $target = $card || $(`.station-card[data-id="${stationId}"]`);
    $target.find('.btn-favorite')
        .toggleClass('active', nowFav)
        .attr('title', nowFav ? 'Remove from saved' : 'Save station')
        .find('i').attr('class', nowFav ? 'bi bi-star-fill' : 'bi bi-star');

    // Update marker color on map
    const marker = appState.markers.find(m => m.stationId === stationId);
    if (marker) {
        const color = nowFav ? '#f59e0b' : getStatusColor(station.StatusType);
        marker.setIcon({
            url:        createMarkerSVG(color),
            scaledSize: new google.maps.Size(36, 44),
            anchor:     new google.maps.Point(18, 44)
        });
    }

    // Re-render if viewing favorites
    if (appState.currentFilter === 'favorites') {
        renderStationsList(appState.stations);
    }
}

window.toggleFavorite = toggleFavorite;

/* ============================================================
   COMPARE
============================================================ */
/** Añade o elimina una estación de la lista de comparación (máximo 3). Muestra/oculta la barra. */
function toggleCompare(stationId) {
    const idx = appState.compareList.indexOf(stationId);

    if (idx > -1) {
        appState.compareList.splice(idx, 1);
    } else {
        if (appState.compareList.length >= 3) {
            showToast('You can compare up to 3 stations at a time.', 'warning');
            return;
        }
        appState.compareList.push(stationId);
    }

    const inCompare = appState.compareList.includes(stationId);
    const $btn = $(`.station-card[data-id="${stationId}"] .btn-compare-check`);
    $btn.toggleClass('active', inCompare)
        .attr('title', inCompare ? 'Remove from comparison' : 'Add to comparison');

    const count = appState.compareList.length;
    if (count > 0) {
        $('#compareBar').removeClass('d-none');
        $('#compareCount').text(count + (count === 1 ? ' selected' : ' selected'));
        $('#compareBtn').prop('disabled', count < 2);
    } else {
        $('#compareBar').addClass('d-none');
    }
}

/**
 * openCompareModal — construye una tabla HTML comparando las estaciones seleccionadas.
 * Filas: estado, distancia, puntos, conectores, potencia máx., coste, operador, acceso.
 */
function openCompareModal() {
    const stations = appState.compareList
        .map(id => appState.stations.find(s => s.ID === id)
                || appState.favorites.find(s => s.ID === id))
        .filter(Boolean);

    if (stations.length < 2) return;

    const headerCols = stations.map(s =>
        `<th><span title="${escapeHtml(s.AddressInfo.Title)}">${escapeHtml(s.AddressInfo.Title)}</span></th>`
    ).join('');

    const rows = [
        ['Status', s => {
            const cls = getStatusClass(s.StatusType);
            return `<span class="station-status ${cls}">${getStatusText(s.StatusType)}</span>`;
        }],
        ['Distance', s => {
            const d = s.AddressInfo.Distance;
            return d ? (Math.round(d * 10) / 10) + ' km' : '—';
        }],
        ['Charging points', s => s.NumberOfPoints || '—'],
        ['Connectors', s => getConnectorsList(s) || '—'],
        ['Max power', s => {
            const powers = (s.Connections || []).map(c => c.PowerKW).filter(p => p > 0);
            return powers.length > 0 ? Math.max(...powers) + ' kW' : '—';
        }],
        ['Cost', s => escapeHtml(s.UsageCost || 'Not specified')],
        ['Operator', s => escapeHtml(s.OperatorInfo ? s.OperatorInfo.Title : '—')],
        ['Access', s => escapeHtml(s.UsageType ? s.UsageType.Title : '—')]
    ];

    let tableHtml = `<table class="compare-table">
        <thead><tr><th class="compare-feature-col">Feature</th>${headerCols}</tr></thead>
        <tbody>`;

    rows.forEach(function([label, fn]) {
        const cells = stations.map(s => `<td>${fn(s)}</td>`).join('');
        tableHtml += `<tr><td class="compare-feature">${label}</td>${cells}</tr>`;
    });

    tableHtml += '</tbody></table>';

    $('#compareModalBody').html(`<div class="compare-table-wrapper">${tableHtml}</div>`);
    new bootstrap.Modal(document.getElementById('compareModal')).show();
}

/* ============================================================
   ZONE STATISTICS
============================================================ */
/** Calcula y muestra la fila de estadísticas generales: total, operacionales, tipos conector, kW medio. */
function updateZoneStats(stations) {
    const total       = stations.length;
    const operational = stations.filter(s => s.StatusType && s.StatusType.IsOperational === true).length;

    const connTypes = new Set();
    const powers    = [];

    stations.forEach(function(s) {
        if (s.Connections) {
            s.Connections.forEach(function(c) {
                if (c.ConnectionType) connTypes.add(c.ConnectionType.Title);
                if (c.PowerKW && c.PowerKW > 0) powers.push(c.PowerKW);
            });
        }
    });

    const avgPower = powers.length > 0
        ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
        : null;

    $('#statTotal').text(total);
    $('#statOperational').text(operational);
    $('#statConnTypes').text(connTypes.size);
    $('#statAvgPower').text(avgPower ? avgPower : '—');
    $('#zoneStats').removeClass('d-none');
}

/** Muestra una segunda fila de stats (en ámbar) con los totales del filtro activo. Se oculta si filtro='all'. */
function updateFilteredStats() {
    const { connectors, speeds, costs } = appState.advFilters;
    const hasAdvanced = connectors.length > 0 || speeds.length > 0 || costs.length > 0;
    const hasFilter   = appState.currentFilter !== 'all' || hasAdvanced;

    if (!hasFilter || appState.stations.length === 0) {
        $('#filteredStats').addClass('d-none');
        return;
    }

    const filtered    = filterStations(appState.stations, appState.currentFilter);
    const operational = filtered.filter(s => s.StatusType && s.StatusType.IsOperational === true).length;
    const powers      = [];

    filtered.forEach(function(s) {
        if (s.Connections) {
            s.Connections.forEach(function(c) {
                if (c.PowerKW && c.PowerKW > 0) powers.push(c.PowerKW);
            });
        }
    });

    const avgPower = powers.length > 0
        ? Math.round(powers.reduce((a, b) => a + b, 0) / powers.length)
        : null;

    $('#fstatTotal').text(filtered.length);
    $('#fstatOperational').text(operational);
    $('#fstatAvgPower').text(avgPower ? avgPower : '—');
    $('#filteredStats').removeClass('d-none');
}

/* ============================================================
   ADVANCED FILTERS
============================================================ */
/** Muestra/oculta el badge "Active" y resalta el botón si hay filtros avanzados activos. */
function updateAdvancedFilterIndicator() {
    const { connectors, speeds, costs } = appState.advFilters;
    const hasActive = connectors.length > 0 || speeds.length > 0 || costs.length > 0;
    $('#filterActiveIndicator').toggleClass('d-none', !hasActive);
    $('#advancedFilterToggle').toggleClass('active', hasActive);
}

/**
 * filterStations — aplica el pill activo y los filtros avanzados sobre un array de estaciones.
 * @param {Array}  stations — array de objetos OCM
 * @param {string} filter   — 'all' | 'operational' | 'unknown' | 'favorites'
 * @returns {Array} estaciones que pasan todos los filtros
 */
function filterStations(stations, filter) {
    let result;

    if (filter === 'favorites') {
        result = [...appState.favorites];
    } else if (filter === 'all') {
        result = stations;
    } else {
        result = stations.filter(s => getStatusClass(s.StatusType) === filter);
    }

    return applyAdvancedFilters(result);
}

/** Aplica los filtros avanzados (conector, velocidad, coste) sobre el array recibido. */
function applyAdvancedFilters(stations) {
    const { connectors, speeds, costs } = appState.advFilters;

    return stations.filter(function(station) {
        if (connectors.length > 0) {
            const ok = connectors.some(type => stationHasConnector(station, type));
            if (!ok) return false;
        }
        if (speeds.length > 0) {
            const ok = speeds.some(speed => stationHasSpeed(station, speed));
            if (!ok) return false;
        }
        if (costs.length > 0) {
            const costType = getStationCostType(station);
            if (!costs.includes(costType)) return false;
        }
        return true;
    });
}

// OCM connector type IDs — primary matching method (immune to name changes)
const CONNECTOR_IDS = {
    ccs:     new Set([32, 33]),              // CCS Combo 2 (EU), CCS Combo 1 (US/JP)
    chademo: new Set([2]),                   // CHAdeMO
    type2:   new Set([25, 1036]),            // Type 2 Socket (Mennekes), Type 2 Tethered
    type1:   new Set([1]),                   // Type 1 / J1772
    tesla:   new Set([27, 30, 1032, 1033]),  // Tesla Roadster, Model S/X, V3, NACS
    schuko:  new Set([28])                   // Schuko / CEE 7/4
};

/**
 * stationHasConnector — comprueba si una estación tiene el tipo de conector indicado.
 * Usa primero el ID numérico de OCM (más fiable) y como fallback el nombre del conector.
 * @param {Object} station — objeto estación de OCM
 * @param {string} type    — 'ccs' | 'chademo' | 'type2' | 'type1' | 'tesla' | 'schuko'
 * @returns {boolean}
 */
function stationHasConnector(station, type) {
    if (!station.Connections) return false;
    const ids = CONNECTOR_IDS[type];
    return station.Connections.some(function(c) {
        if (!c.ConnectionType) return false;
        // Primary: match by numeric ID
        if (ids && ids.has(c.ConnectionType.ID)) return true;
        // Fallback: string match for unknown/future IDs
        const title = c.ConnectionType.Title.toLowerCase();
        switch (type) {
            case 'ccs':     return title.includes('ccs') || title.includes('combo');
            case 'chademo': return title.includes('chademo');
            case 'type2':   return (title.includes('type 2') || title.includes('mennekes')) && !title.includes('ccs') && !title.includes('combo');
            case 'type1':   return (title.includes('type 1') || title.includes('j1772')) && !title.includes('ccs') && !title.includes('combo');
            case 'tesla':   return title.includes('tesla') || title.includes('nacs');
            case 'schuko':  return title.includes('schuko') || title.includes('cee 7');
            default:        return false;
        }
    });
}

/**
 * stationHasSpeed — comprueba si alguna conexión de la estación entra en el rango de velocidad.
 * @param {Object} station — objeto OCM
 * @param {string} speed   — 'slow' (≤7kW) | 'fast' (7–50kW) | 'ultra' (>50kW)
 */
function stationHasSpeed(station, speed) {
    if (!station.Connections) return false;
    return station.Connections.some(function(c) {
        const kw = c.PowerKW || 0;
        if (kw <= 0) return false;
        switch (speed) {
            case 'slow':  return kw <= 7;
            case 'fast':  return kw > 7 && kw <= 50;
            case 'ultra': return kw > 50;
            default:      return false;
        }
    });
}

/** Devuelve 'free' o 'paid' a partir del campo UsageCost de la estación. */
function getStationCostType(station) {
    if (!station.UsageCost || station.UsageCost.trim() === '') return 'free';
    const cost = station.UsageCost.toLowerCase().trim();
    if (cost === 'free' || cost === '0' || cost === '0.00' || cost.startsWith('free')) return 'free';
    return 'paid';
}

/* ============================================================
   STATUS HELPERS
============================================================ */
/**
 * getStatusText — convierte el objeto StatusType de OCM en un texto legible.
 * @param {Object|null} statusType
 * @returns {string} p.ej. 'Operational', 'Out of service', 'Unknown'
 */
function getStatusText(statusType) {
    if (!statusType) return 'Unknown';
    if (statusType.IsOperational === true)  return 'Operational';
    if (statusType.IsOperational === false) return 'Out of service';
    const map = {
        'Operational':             'Operational',
        'Not Operational':         'Out of service',
        'Planned For Future Date': 'Planned',
        'Temporarily Unavailable': 'Temporarily unavailable',
        'Unknown':                 'Unknown'
    };
    return map[statusType.Title] || statusType.Title || 'Unknown';
}

/** Devuelve la clase CSS ('operational' | 'offline' | 'unknown') para estilizar badges y pills. */
function getStatusClass(statusType) {
    if (!statusType) return 'unknown';
    if (statusType.IsOperational === true)  return 'operational';
    if (statusType.IsOperational === false) return 'offline';
    return 'unknown';
}

/** Devuelve el color hex del marcador SVG según el estado: verde / rojo / ámbar. */
function getStatusColor(statusType) {
    const colors = { operational: '#00d084', offline: '#ef4444', unknown: '#f59e0b' };
    return colors[getStatusClass(statusType)] || colors.unknown;
}

/**
 * getConnectorsList — devuelve los tipos de conector únicos como string separado por comas.
 * @param {Object} station  — objeto OCM
 * @param {number} maxItems — límite opcional; añade '…' si hay más
 */
function getConnectorsList(station, maxItems) {
    if (!station.Connections || station.Connections.length === 0) return '';
    const unique = [...new Set(
        station.Connections
            .map(c => c.ConnectionType ? c.ConnectionType.Title : null)
            .filter(Boolean)
    )];
    if (maxItems && unique.length > maxItems) {
        return unique.slice(0, maxItems).join(', ') + '…';
    }
    return unique.join(', ');
}

/** buildAddress — construye una dirección legible a partir del objeto AddressInfo de OCM. */
function buildAddress(info) {
    const parts = [
        info.AddressLine1,
        info.Town,
        info.StateOrProvince,
        info.Country ? info.Country.Title : null
    ].filter(Boolean);
    return parts.join(', ') || 'Address not available';
}

/** escapeHtml — escapa caracteres HTML especiales para prevenir XSS al insertar datos externos en el DOM. */
function escapeHtml(text) {
    if (typeof text !== 'string') return text || '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* ============================================================
   UI HELPERS
============================================================ */
/** Muestra el spinner de carga y oculta la lista y el mensaje de estado. */
function showLoadingSpinner() {
    $('#statusMessage').hide();
    $('#stationsList').addClass('d-none').hide();
    $('#loadingSpinner').removeClass('d-none').show();
}

/** Oculta el spinner de carga. */
function hideLoadingSpinner() {
    $('#loadingSpinner').addClass('d-none').hide();
}

/**
 * showStatusMessage — muestra el panel de estado vacío/error/sin resultados en el sidebar.
 * @param {string} type    — 'default' | 'error' | 'no-results'
 * @param {string} icon    — clase FontAwesome para el icono
 * @param {string} title   — título del mensaje
 * @param {string} message — texto descriptivo
 */
function showStatusMessage(type, icon, title, message) {
    hideLoadingSpinner();
    $('#stationsList').addClass('d-none').hide();
    const $msg = $('#statusMessage');
    $msg.removeClass('error no-results').addClass(type !== 'default' ? type : '');
    $msg.find('.status-icon i').attr('class', icon);
    $msg.find('h6').text(title);
    $msg.find('p').text(message);
    $msg.show();
}

/** Actualiza el badge de conteo en el sidebar y el badge del FAB. */
function updateStationsCount(count) {
    $('#stationsCount').text(count);
    updateFabBadge(count);
}

/** Cambia el icono del FAB según si el sidebar está abierto o cerrado. */
function updateFabIcon(isOpen) {
    $('#togglePanel i').attr('class', isOpen ? 'bi bi-chevron-down' : 'bi bi-list-ul');
}

/** Muestra el número de estaciones en el badge del FAB; se oculta si count=0 y limita a '99+'. */
function updateFabBadge(count) {
    const $badge = $('#fabBadge');
    count > 0
        ? $badge.text(count > 99 ? '99+' : count).removeClass('d-none')
        : $badge.addClass('d-none');
}

/**
 * showToast — muestra una notificación tipo toast de Bootstrap durante 4 segundos.
 * @param {string} message — contenido HTML del mensaje
 * @param {string} type    — 'info' | 'success' | 'error' | 'warning'
 */
function showToast(message, type) {
    const $toast = $('#notificationToast');
    $toast.removeClass('success error info warning').addClass(type || 'info');
    $('#toastBody').html(message);
    bootstrap.Toast.getOrCreateInstance(document.getElementById('notificationToast'), {
        delay: 4000, autohide: true
    }).show();
}

/* ============================================================
   INIT
============================================================ */
/**
 * $(document).ready — punto de entrada principal.
 * Restaura tema, favoritos, historial y radio guardados en localStorage.
 * También registra manejadores de errores de Google Maps API.
 */
$(document).ready(function() {
    initTheme();
    loadFavorites();
    loadSearchHistory();
    const savedRadius = parseInt(localStorage.getItem(LS_RADIUS));
    if (savedRadius && savedRadius >= 1 && savedRadius <= 50) {
        CONFIG.searchRadiusKm = savedRadius;
        $('#radiusSlider').val(savedRadius);
        $('#radiusValue').text(savedRadius);
    }

    window.gm_authFailure = function() {
        document.getElementById('mapOverlay').querySelector('p').textContent =
            'Google Maps auth error — check GOOGLE_MAPS_API_KEY in config.js.';
        $('#mapOverlay').find('.progress').replaceWith(`
            <div class="alert alert-danger mt-3"
                 style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.3);
                        color:#fca5a5;font-size:0.8rem;max-width:320px;">
                <i class="bi bi-exclamation-triangle-fill me-1"></i>
                <strong>Google Maps authentication failed.</strong><br>
                Make sure the key has the Maps JavaScript API enabled.
            </div>`);
    };

    setTimeout(function() {
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            console.warn('[EV Charge Locator] Google Maps did not load — check the API key and internet connection.');
        }
    }, 10000);
});
