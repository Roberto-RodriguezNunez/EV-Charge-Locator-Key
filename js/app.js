'use strict';

// Keys are loaded from config.js (excluded from git).
// Copy config.example.js as config.js to get started.

/* Search settings */
const CONFIG = {
    searchRadiusKm: 10,      // km radius for the OCM query
    maxResults:     50,      // max stations returned
    defaultLat:     40.4168, // fallback center (Madrid)
    defaultLng:     -3.7038,
    defaultZoom:    13,
    markerZoom:     16       // zoom when centering on a station
};

/* App state */
const appState = {
    map:           null,
    markers:       [],
    infoWindow:    null,
    geocoder:      null,
    stations:      [],
    activeCardId:  null,
    currentFilter: 'all',
    currentModal:  null
};

// Called by the Google Maps SDK once the script loads
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

    appState.infoWindow = new google.maps.InfoWindow();
    appState.geocoder   = new google.maps.Geocoder();

    initEventListeners();
    attemptGeolocation();
}

/* Dark map theme */
function getMapStyles() {
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

/* Bind all UI events */
function initEventListeners() {
    $('#searchForm').on('submit', function(e) {
        e.preventDefault();
        const query = $('#searchInput').val().trim();
        if (query.length > 0) searchByAddress(query);
    });

    $('#geoBtn').on('click', function() {
        attemptGeolocation(true);
    });

    // Filter pills
    $(document).on('click', '.pill', function() {
        $('.pill').removeClass('active');
        $(this).addClass('active');
        appState.currentFilter = $(this).data('filter');
        renderStationsList(appState.stations);
    });

    // Mobile: toggle sidebar
    $('#togglePanel').on('click', function() {
        $('#sidebar').toggleClass('open');
    });

    // Center map from modal
    $('#modalCenterBtn').on('click', function() {
        if (!appState.currentModal) return;
        const s = appState.currentModal;
        centerMapOnStation(s.AddressInfo.Latitude, s.AddressInfo.Longitude, s.ID);
        bootstrap.Modal.getInstance(document.getElementById('stationModal')).hide();
    });
}

/* Ask browser for current position */
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

/* Blue dot for the user's own position */
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

/* Geocode a text query and load stations at that position */
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

/* Ajax request to Open Charge Map */
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
            maxresults:   CONFIG.maxResults
            // compact and verbose omitted — defaults (false/true) return full reference data
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
            updateStationsCount(data.length);

            showToast(
                '<i class="bi bi-check-circle-fill me-1"></i> Found <strong>' +
                data.length + '</strong> stations within ' + CONFIG.searchRadiusKm + ' km.',
                'success'
            );

            // Auto-open sidebar on mobile
            if ($(window).width() <= 767) {
                $('#sidebar').addClass('open');
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

/* Drop a marker for each station */
function createMarkers(stations) {
    stations.forEach(function(station, index) {
        const lat   = station.AddressInfo.Latitude;
        const lng   = station.AddressInfo.Longitude;
        const color = getStatusColor(station.StatusType);

        const marker = new google.maps.Marker({
            position:     { lat, lng },
            map:          appState.map,
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
}

/* Build the pin SVG with a dynamic color */
function createMarkerSVG(color) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 44" width="36" height="44">
          <!-- pin shape -->
          <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z"
                fill="${color}" opacity="0.95"/>
          <circle cx="18" cy="17" r="10" fill="rgba(255,255,255,0.15)"/>
          <!-- bolt icon -->
          <path d="M20.5 8.5l-5 9h4.5l-4.5 9 8-11h-4.5z" fill="#ffffff" opacity="0.95"/>
        </svg>`;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/* Remove all station markers from the map */
function clearMarkers() {
    appState.markers.forEach(m => m.setMap(null));
    appState.markers = [];
    if (appState.infoWindow) appState.infoWindow.close();
}

/* Open an InfoWindow for a station marker */
function openInfoWindow(marker, station) {
    const info       = station.AddressInfo;
    const connectors = getConnectorsList(station);
    const statusText = getStatusText(station.StatusType);
    const statusColor= getStatusColor(station.StatusType);
    const numPoints  = station.NumberOfPoints || 'N/A';
    const cost       = station.UsageCost || '';

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
                <button class="info-window-btn" onclick="openStationModal(${station.ID})">
                    <i class="fa-solid fa-circle-info"></i> View full details
                </button>
            </div>
        </div>`;

    appState.infoWindow.setContent(content);
    appState.infoWindow.open(appState.map, marker);
}

/* Render the sidebar list applying the active filter */
function renderStationsList(stations) {
    const $list   = $('#stationsList');
    const filtered = filterStations(stations, appState.currentFilter);

    $list.empty();

    if (filtered.length === 0) {
        $list.html(`
            <div class="text-center py-4" style="color: var(--color-text-muted); font-size: 0.82rem;">
                <i class="fa-solid fa-filter mb-2 d-block" style="font-size: 1.5rem;"></i>
                No stations match the active filter.
            </div>`);
    } else {
        filtered.forEach(s => $list.append(createStationCard(s)));
    }

    $('#statusMessage').hide();
    $list.removeClass('d-none').show();
    updateStationsCount(filtered.length);
}

/* Build a single station card element */
function createStationCard(station) {
    const info        = station.AddressInfo;
    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const connectors  = getConnectorsList(station, 2); // cap at 2 in the card
    const numPoints   = station.NumberOfPoints || '?';
    const distanceStr = info.Distance
        ? (Math.round(info.Distance * 10) / 10) + ' km'
        : '';

    const $card = $(`
        <div class="station-card" data-id="${station.ID}">
            <div class="d-flex justify-content-between align-items-start">
                <span class="station-status ${statusClass}">
                    <i class="bi bi-circle-fill" style="font-size: 0.5rem;"></i>
                    ${statusText}
                </span>
                ${distanceStr ? `<small style="color: var(--color-text-muted); font-size: 0.72rem;">${distanceStr}</small>` : ''}
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

    $card.on('click', function() {
        centerMapOnStation(info.Latitude, info.Longitude, station.ID);
    });

    return $card;
}

/* Pan map to a station and open its InfoWindow */
function centerMapOnStation(lat, lng, stationId) {
    appState.map.panTo({ lat, lng });
    appState.map.setZoom(CONFIG.markerZoom);

    const marker  = appState.markers.find(m => m.stationId === stationId);
    const station = appState.stations.find(s => s.ID === stationId);
    if (marker && station) openInfoWindow(marker, station);

    highlightCard(stationId);
}

/* Mark the matching sidebar card as active and scroll to it */
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

/* Open the detail modal for a station */
function openStationModal(stationId) {
    const station = appState.stations.find(s => s.ID === stationId);
    if (!station) return;

    appState.currentModal = station;
    const info = station.AddressInfo;

    $('#stationModalLabel').text(info.Title);
    $('#modalAddress').text(buildAddress(info));

    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const numPoints   = station.NumberOfPoints || 'N/A';
    const operator    = station.OperatorInfo ? station.OperatorInfo.Title : 'Not available';
    const usageType   = station.UsageType    ? station.UsageType.Title    : 'Not available';
    const cost        = station.UsageCost    || '';

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
        </div>`);

    new bootstrap.Modal(document.getElementById('stationModal')).show();
}

// Needs to be global so the InfoWindow inline onclick can reach it
window.openStationModal = openStationModal;

/* Filter station array by status class */
function filterStations(stations, filter) {
    if (filter === 'all') return stations;
    return stations.filter(s => getStatusClass(s.StatusType) === filter);
}

/* --- Status helpers --- */

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

function getStatusClass(statusType) {
    if (!statusType) return 'unknown';
    if (statusType.IsOperational === true)  return 'operational';
    if (statusType.IsOperational === false) return 'offline';
    return 'unknown';
}

function getStatusColor(statusType) {
    const colors = {
        operational: '#00d084',
        offline:     '#ef4444',
        unknown:     '#f59e0b'
    };
    return colors[getStatusClass(statusType)] || colors.unknown;
}

/* Return connector type names, optionally capped at maxItems */
function getConnectorsList(station, maxItems) {
    if (!station.Connections || station.Connections.length === 0) return '';
    const unique = [...new Set(
        station.Connections
            .map(c => c.ConnectionType ? c.ConnectionType.Title : null)
            .filter(Boolean)
    )];
    if (maxItems && unique.length > maxItems) {
        return unique.slice(0, maxItems).join(', ') + '...';
    }
    return unique.join(', ');
}

/* Build a readable address string from AddressInfo */
function buildAddress(info) {
    const parts = [
        info.AddressLine1,
        info.Town,
        info.StateOrProvince,
        info.Country ? info.Country.Title : null
    ].filter(Boolean);
    return parts.join(', ') || 'Address not available';
}

/* Escape user-facing strings to prevent XSS */
function escapeHtml(text) {
    if (typeof text !== 'string') return text || '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* --- UI helpers --- */

function showLoadingSpinner() {
    $('#statusMessage').hide();
    $('#stationsList').addClass('d-none').hide();
    $('#loadingSpinner').removeClass('d-none').show();
}

function hideLoadingSpinner() {
    $('#loadingSpinner').addClass('d-none').hide();
}

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

function updateStationsCount(count) {
    $('#stationsCount').text(count);
    updateFabBadge(count);
}

function updateFabBadge(count) {
    const $badge = $('#fabBadge');
    count > 0
        ? $badge.text(count > 99 ? '99+' : count).removeClass('d-none')
        : $badge.addClass('d-none');
}

function showToast(message, type) {
    const $toast = $('#notificationToast');
    $toast.removeClass('success error info warning').addClass(type || 'info');
    $('#toastBody').html(message);

    bootstrap.Toast.getOrCreateInstance(document.getElementById('notificationToast'), {
        delay: 4000, autohide: true
    }).show();
}

/* Runs on page load — sets up error handling before Maps loads */
$(document).ready(function() {
    // Called by Maps SDK if the API key fails auth
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

    // Warn in console if Maps never loads
    setTimeout(function() {
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            console.warn('[EV Charge Locator] Google Maps did not load — check the API key and internet connection.');
        }
    }, 10000);
});
