/**
 * ============================================================
 * EV CHARGE LOCATOR — Lógica principal
 * Autor: EV Charge Locator App
 *
 * Tecnologías: HTML5, CSS3, Bootstrap 5, jQuery 3, Ajax,
 *              Google Maps JS API, Open Charge Map API
 * ============================================================
 */

'use strict';

/* ============================================================
   CONFIGURACIÓN — Las claves se cargan desde js/config.js
   (ese archivo está en .gitignore y no se sube al repositorio)
   Copia js/config.example.js como js/config.js para empezar.
============================================================ */
// GOOGLE_MAPS_API_KEY y OCM_API_KEY se declaran en config.js

/* ============================================================
   CONFIGURACIÓN DE LA BÚSQUEDA
============================================================ */
const CONFIG = {
    searchRadiusKm:  10,      // Radio de búsqueda en kilómetros
    maxResults:      50,      // Máximo de estaciones a mostrar
    defaultLat:      40.4168, // Latitud por defecto (Madrid) si geolocalización falla
    defaultLng:      -3.7038, // Longitud por defecto
    defaultZoom:     13,      // Zoom inicial del mapa
    markerZoom:      16       // Zoom al centrar en una estación
};

/* ============================================================
   ESTADO GLOBAL DE LA APLICACIÓN
============================================================ */
const appState = {
    map:             null,   // Instancia del mapa de Google
    markers:         [],     // Array de marcadores en el mapa
    infoWindow:      null,   // InfoWindow activo
    geocoder:        null,   // Instancia del Geocoder de Google
    stations:        [],     // Datos de estaciones cargados
    activeCardId:    null,   // ID de la tarjeta seleccionada
    currentFilter:   'all',  // Filtro activo ('all', 'operational', 'unknown')
    currentModal:    null    // Datos de la estación en el modal
};

/* ============================================================
   CALLBACK DE GOOGLE MAPS
   Esta función es llamada automáticamente por el SDK de Google
   Maps cuando termina de cargarse (parámetro &callback=initMap)
============================================================ */
function initMap() {
    // Ocultar el overlay de carga del mapa
    $('#mapOverlay').addClass('hidden');

    // Crear la instancia del mapa centrada en la posición por defecto
    appState.map = new google.maps.Map(document.getElementById('map'), {
        center: { lat: CONFIG.defaultLat, lng: CONFIG.defaultLng },
        zoom:   CONFIG.defaultZoom,
        // Estilo oscuro personalizado para el mapa
        styles: getMapStyles(),
        // Ocultar controles de Google que no necesitamos
        mapTypeControl:        false,
        streetViewControl:     false,
        fullscreenControl:     false,
        zoomControlOptions: {
            position: google.maps.ControlPosition.RIGHT_CENTER
        }
    });

    // Inicializar el InfoWindow reutilizable
    appState.infoWindow = new google.maps.InfoWindow();

    // Inicializar el Geocoder para convertir texto en coordenadas
    appState.geocoder = new google.maps.Geocoder();

    // Inicializar los eventos de la interfaz
    initEventListeners();

    // Intentar geolocalización automática al cargar
    attemptGeolocation();
}

/* ============================================================
   ESTILOS PERSONALIZADOS DEL MAPA (tema oscuro)
============================================================ */
function getMapStyles() {
    return [
        { elementType: 'geometry',        stylers: [{ color: '#1a2535' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#0b1120' }] },
        { featureType: 'road',
          elementType: 'geometry',       stylers: [{ color: '#232f45' }] },
        { featureType: 'road',
          elementType: 'geometry.stroke', stylers: [{ color: '#111827' }] },
        { featureType: 'road.highway',
          elementType: 'geometry',       stylers: [{ color: '#2d3f60' }] },
        { featureType: 'road.highway',
          elementType: 'geometry.stroke', stylers: [{ color: '#1a2535' }] },
        { featureType: 'water',
          elementType: 'geometry',       stylers: [{ color: '#0b1120' }] },
        { featureType: 'water',
          elementType: 'labels.text.fill', stylers: [{ color: '#4b5e82' }] },
        { featureType: 'poi',
          stylers: [{ visibility: 'off' }] },
        { featureType: 'transit',
          stylers: [{ visibility: 'off' }] },
        { featureType: 'administrative',
          elementType: 'geometry',       stylers: [{ color: '#232f45' }] },
        { featureType: 'administrative.country',
          elementType: 'labels.text.fill', stylers: [{ color: '#6b7f9e' }] },
        { featureType: 'administrative.locality',
          elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
        { featureType: 'landscape',
          elementType: 'geometry',       stylers: [{ color: '#1a2535' }] }
    ];
}

/* ============================================================
   INICIALIZACIÓN DE EVENTOS
============================================================ */
function initEventListeners() {
    // ---- Formulario de búsqueda manual ----
    $('#searchForm').on('submit', function(e) {
        e.preventDefault();
        const query = $('#searchInput').val().trim();
        if (query.length > 0) {
            searchByAddress(query);
        }
    });

    // ---- Botón de geolocalización ----
    $('#geoBtn').on('click', function() {
        attemptGeolocation(true); // true = mostrar feedback aunque ya tengamos ubicación
    });

    // ---- Filtros de estaciones ----
    $(document).on('click', '.pill', function() {
        $('.pill').removeClass('active');
        $(this).addClass('active');
        appState.currentFilter = $(this).data('filter');
        renderStationsList(appState.stations);
    });

    // ---- Botón FAB (móvil) para mostrar/ocultar panel ----
    $('#togglePanel').on('click', function() {
        $('#sidebar').toggleClass('open');
    });

    // ---- Centrar mapa desde el modal ----
    $('#modalCenterBtn').on('click', function() {
        if (appState.currentModal) {
            const station = appState.currentModal;
            const lat = station.AddressInfo.Latitude;
            const lng = station.AddressInfo.Longitude;
            centerMapOnStation(lat, lng, station.ID);

            // Cerrar el modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('stationModal'));
            if (modal) modal.hide();
        }
    });
}

/* ============================================================
   GEOLOCALIZACIÓN AUTOMÁTICA
   Usa la API nativa del navegador para obtener la ubicación
============================================================ */
function attemptGeolocation(forced) {
    // Verificar soporte del navegador
    if (!navigator.geolocation) {
        showStatusMessage(
            'error',
            'fa-solid fa-location-slash',
            'Geolocalización no soportada',
            'Tu navegador no soporta geolocalización. Usa el buscador para encontrar estaciones.'
        );
        showToast('Tu navegador no soporta geolocalización.', 'warning');
        return;
    }

    // Indicar visualmente que se está buscando ubicación
    $('#geoBtn').addClass('loading').attr('title', 'Obteniendo ubicación...');

    navigator.geolocation.getCurrentPosition(
        // ---- Éxito ----
        function(position) {
            $('#geoBtn').removeClass('loading').addClass('active');
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;

            // Centrar el mapa en la ubicación del usuario
            appState.map.setCenter({ lat: lat, lng: lng });
            appState.map.setZoom(CONFIG.defaultZoom);

            // Añadir marcador de posición del usuario
            addUserLocationMarker(lat, lng);

            // Buscar estaciones cercanas
            fetchChargingStations(lat, lng);

            showToast('<i class="bi bi-geo-alt-fill me-1"></i> Ubicación obtenida correctamente.', 'success');
        },
        // ---- Error ----
        function(error) {
            $('#geoBtn').removeClass('loading');
            let mensaje = '';
            let titulo  = 'Error de geolocalización';

            switch (error.code) {
                case error.PERMISSION_DENIED:
                    titulo  = 'Permiso denegado';
                    mensaje = 'Has denegado el acceso a tu ubicación. Usa el buscador para encontrar estaciones manualmente.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    titulo  = 'Ubicación no disponible';
                    mensaje = 'No se pudo determinar tu ubicación. Intenta de nuevo o usa el buscador.';
                    break;
                case error.TIMEOUT:
                    titulo  = 'Tiempo agotado';
                    mensaje = 'La solicitud de geolocalización tardó demasiado. Intenta de nuevo.';
                    break;
                default:
                    titulo  = 'Error desconocido';
                    mensaje = 'Ocurrió un error al obtener tu ubicación. Usa el buscador.';
            }

            showStatusMessage('error', 'fa-solid fa-location-slash', titulo, mensaje);
            showToast('<i class="bi bi-exclamation-triangle-fill me-1"></i> ' + titulo + ': ' + mensaje, 'error');
        },
        // ---- Opciones ----
        {
            enableHighAccuracy: true,
            timeout:            10000, // 10 segundos máximo
            maximumAge:         60000  // Aceptar caché de hasta 1 minuto
        }
    );
}

/* ---- Marcador especial para la posición del usuario ---- */
function addUserLocationMarker(lat, lng) {
    // Crear marcador SVG para la posición del usuario
    const userMarker = new google.maps.Marker({
        position: { lat: lat, lng: lng },
        map: appState.map,
        title: 'Tu ubicación',
        icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" width="36" height="36">
                  <circle cx="18" cy="18" r="16" fill="#0d6efd" opacity="0.2"/>
                  <circle cx="18" cy="18" r="8"  fill="#0d6efd"/>
                  <circle cx="18" cy="18" r="4"  fill="#ffffff"/>
                </svg>
            `),
            scaledSize: new google.maps.Size(36, 36),
            anchor:     new google.maps.Point(18, 18)
        },
        zIndex: 999
    });

    // Guardar referencia para poder eliminarlo si se busca otra ubicación
    if (appState.userMarker) {
        appState.userMarker.setMap(null);
    }
    appState.userMarker = userMarker;
}

/* ============================================================
   BÚSQUEDA POR DIRECCIÓN (Geocoding API)
   Convierte texto en coordenadas usando Google Geocoder
============================================================ */
function searchByAddress(query) {
    // Mostrar spinner mientras se geocodifica
    showLoadingSpinner();

    appState.geocoder.geocode({ address: query }, function(results, status) {
        if (status === 'OK' && results.length > 0) {
            const location = results[0].geometry.location;
            const lat = location.lat();
            const lng = location.lng();

            // Centrar el mapa en la dirección encontrada
            appState.map.setCenter({ lat: lat, lng: lng });
            appState.map.setZoom(CONFIG.defaultZoom);

            // Añadir marcador de búsqueda
            addUserLocationMarker(lat, lng);

            // Actualizar el campo de búsqueda con la dirección formateada
            $('#searchInput').val(results[0].formatted_address);

            // Buscar estaciones en esas coordenadas
            fetchChargingStations(lat, lng);

        } else {
            // No se encontró la dirección
            hideLoadingSpinner();
            let errorMsg = 'No se encontró la dirección "' + query + '". Intenta con otro término.';

            if (status === 'ZERO_RESULTS') {
                errorMsg = 'No se encontraron resultados para "' + query + '".';
            } else if (status === 'OVER_QUERY_LIMIT') {
                errorMsg = 'Se ha superado el límite de consultas. Intenta de nuevo en unos momentos.';
            }

            showStatusMessage('error', 'fa-solid fa-map-location-dot', 'Dirección no encontrada', errorMsg);
            showToast('<i class="bi bi-exclamation-triangle-fill me-1"></i> ' + errorMsg, 'error');
        }
    });
}

/* ============================================================
   CONSULTA AJAX A OPEN CHARGE MAP API
   Obtiene las estaciones de carga cercanas a las coordenadas
============================================================ */
function fetchChargingStations(lat, lng) {
    // Mostrar spinner en el panel lateral
    showLoadingSpinner();

    // Limpiar marcadores anteriores del mapa
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
            maxresults:   CONFIG.maxResults,
            compact:      true,
            verbose:      false
        },
        // ---- Respuesta exitosa ----
        success: function(data) {
            hideLoadingSpinner();

            if (!data || data.length === 0) {
                // No se encontraron estaciones en la zona
                showStatusMessage(
                    'no-results',
                    'fa-solid fa-charging-station',
                    'Sin estaciones cercanas',
                    'No se encontraron estaciones de carga en un radio de ' +
                    CONFIG.searchRadiusKm + ' km. Prueba a aumentar el radio o busca otra zona.'
                );
                showToast('No se encontraron estaciones cercanas.', 'warning');
                return;
            }

            // Guardar los datos en el estado global
            appState.stations = data;

            // Crear marcadores en el mapa
            createMarkers(data);

            // Renderizar la lista en el panel lateral
            renderStationsList(data);

            // Actualizar el contador
            updateStationsCount(data.length);

            // Mostrar toast de confirmación
            showToast(
                '<i class="bi bi-check-circle-fill me-1"></i> Se encontraron <strong>' +
                data.length + '</strong> estaciones en un radio de ' + CONFIG.searchRadiusKm + ' km.',
                'success'
            );

            // En móvil, mostrar el panel automáticamente
            if ($(window).width() <= 767) {
                $('#sidebar').addClass('open');
                updateFabBadge(data.length);
            }
        },
        // ---- Error de la petición Ajax ----
        error: function(xhr, status, error) {
            hideLoadingSpinner();

            let errorMsg = 'Error al conectar con Open Charge Map. Verifica tu conexión a internet.';

            if (xhr.status === 401) {
                errorMsg = 'API key inválida. Comprueba la clave OCM_API_KEY en app.js.';
            } else if (xhr.status === 429) {
                errorMsg = 'Demasiadas peticiones. Espera unos segundos y vuelve a intentarlo.';
            } else if (xhr.status === 0) {
                errorMsg = 'Sin conexión a internet o la API no está disponible.';
            }

            showStatusMessage(
                'error',
                'fa-solid fa-triangle-exclamation',
                'Error al cargar estaciones',
                errorMsg
            );
            showToast('<i class="bi bi-wifi-off me-1"></i> ' + errorMsg, 'error');

            console.error('[EV Charge Locator] Error Ajax:', status, error, xhr.responseText);
        }
    });
}

/* ============================================================
   CREAR MARCADORES EN EL MAPA
   Genera un marcador SVG personalizado para cada estación
============================================================ */
function createMarkers(stations) {
    stations.forEach(function(station, index) {
        const lat = station.AddressInfo.Latitude;
        const lng = station.AddressInfo.Longitude;

        // Determinar el color del marcador según el estado
        const color = getStatusColor(station.StatusType);

        // Crear el icono SVG del marcador
        const markerIcon = {
            url: createMarkerSVG(color),
            scaledSize: new google.maps.Size(36, 44),
            anchor:     new google.maps.Point(18, 44)
        };

        // Crear el marcador
        const marker = new google.maps.Marker({
            position: { lat: lat, lng: lng },
            map:      appState.map,
            title:    station.AddressInfo.Title,
            icon:     markerIcon,
            // Guardar el ID de la estación en el marcador para referencia
            stationId: station.ID,
            stationIndex: index
        });

        // Evento clic en el marcador — mostrar InfoWindow
        marker.addListener('click', function() {
            openInfoWindow(marker, station);
            highlightCard(station.ID);
        });

        appState.markers.push(marker);
    });
}

/* ---- Crear SVG del marcador con color dinámico ---- */
function createMarkerSVG(color) {
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 44" width="36" height="44">
          <!-- Pin exterior -->
          <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26s18-12.5 18-26C36 8.06 27.94 0 18 0z"
                fill="${color}" opacity="0.95"/>
          <!-- Círculo interior blanco -->
          <circle cx="18" cy="17" r="10" fill="rgba(255,255,255,0.15)"/>
          <!-- Icono de rayo (bolt) simplificado -->
          <path d="M20.5 8.5l-5 9h4.5l-4.5 9 8-11h-4.5z"
                fill="#ffffff" opacity="0.95"/>
        </svg>
    `;
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

/* ---- Limpiar todos los marcadores del mapa ---- */
function clearMarkers() {
    appState.markers.forEach(function(marker) {
        marker.setMap(null);
    });
    appState.markers = [];

    // Cerrar el InfoWindow si está abierto
    if (appState.infoWindow) {
        appState.infoWindow.close();
    }
}

/* ============================================================
   INFOWINDOW — Ventana emergente al hacer clic en un marcador
============================================================ */
function openInfoWindow(marker, station) {
    const info = station.AddressInfo;

    // Construir el contenido del InfoWindow
    const connectors = getConnectorsList(station);
    const statusText = getStatusText(station.StatusType);
    const statusColor = getStatusColor(station.StatusType);
    const numPoints = station.NumberOfPoints || 'N/D';

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
                    <span>${connectors || 'Tipo de conector desconocido'}</span>
                </div>
                <div class="info-window-row">
                    <i class="fa-solid fa-charging-station"></i>
                    <span>${numPoints} punto(s) de carga</span>
                </div>
                <button class="info-window-btn" onclick="openStationModal(${station.ID})">
                    <i class="fa-solid fa-circle-info"></i> Ver detalles completos
                </button>
            </div>
        </div>
    `;

    appState.infoWindow.setContent(content);
    appState.infoWindow.open(appState.map, marker);
}

/* ============================================================
   RENDERIZAR LISTA DE ESTACIONES EN EL PANEL LATERAL
============================================================ */
function renderStationsList(stations) {
    const $list = $('#stationsList');
    $list.empty();

    // Aplicar filtro activo
    const filteredStations = filterStations(stations, appState.currentFilter);

    if (filteredStations.length === 0) {
        $list.html(`
            <div class="text-center py-4" style="color: var(--color-text-muted); font-size: 0.82rem;">
                <i class="fa-solid fa-filter mb-2 d-block" style="font-size: 1.5rem;"></i>
                No hay estaciones que coincidan con el filtro activo.
            </div>
        `);
    } else {
        // Crear una tarjeta por cada estación
        filteredStations.forEach(function(station) {
            const $card = createStationCard(station);
            $list.append($card);
        });
    }

    // Mostrar la lista y ocultar el mensaje de estado
    $('#statusMessage').hide();
    $list.removeClass('d-none').show();

    // Actualizar el contador con el filtro aplicado
    updateStationsCount(filteredStations.length);
}

/* ---- Crear tarjeta HTML para una estación ---- */
function createStationCard(station) {
    const info = station.AddressInfo;
    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const connectors  = getConnectorsList(station, 2); // Máximo 2 conectores en la tarjeta
    const numPoints   = station.NumberOfPoints || '?';

    // Calcular distancia aproximada si está disponible
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
                    ${numPoints} punto(s)
                </span>
                ${connectors ? `
                <span class="station-meta-item">
                    <i class="fa-solid fa-plug"></i>
                    ${escapeHtml(connectors)}
                </span>` : ''}
            </div>
        </div>
    `);

    // Evento clic en la tarjeta — centrar el mapa y abrir InfoWindow
    $card.on('click', function() {
        const lat = info.Latitude;
        const lng = info.Longitude;
        centerMapOnStation(lat, lng, station.ID);
    });

    return $card;
}

/* ---- Centrar el mapa en una estación y abrir su InfoWindow ---- */
function centerMapOnStation(lat, lng, stationId) {
    appState.map.panTo({ lat: lat, lng: lng });
    appState.map.setZoom(CONFIG.markerZoom);

    // Encontrar el marcador correspondiente y abrir su InfoWindow
    const marker = appState.markers.find(m => m.stationId === stationId);
    if (marker) {
        const station = appState.stations.find(s => s.ID === stationId);
        if (station) {
            openInfoWindow(marker, station);
        }
    }

    // Resaltar la tarjeta en el panel lateral
    highlightCard(stationId);
}

/* ---- Resaltar la tarjeta activa en el panel ---- */
function highlightCard(stationId) {
    $('.station-card').removeClass('active');
    const $card = $(`.station-card[data-id="${stationId}"]`);
    $card.addClass('active');

    // Hacer scroll suave hasta la tarjeta activa
    if ($card.length) {
        const list = document.getElementById('stationsList');
        if (list) {
            const cardTop = $card[0].offsetTop - list.offsetTop;
            list.scrollTo({ top: cardTop - 16, behavior: 'smooth' });
        }
    }

    appState.activeCardId = stationId;
}

/* ============================================================
   MODAL DE DETALLE COMPLETO
   Se abre al hacer clic en "Ver detalles completos" en el InfoWindow
============================================================ */
function openStationModal(stationId) {
    const station = appState.stations.find(s => s.ID === stationId);
    if (!station) return;

    appState.currentModal = station;
    const info = station.AddressInfo;

    // Título y dirección en el header del modal
    $('#stationModalLabel').text(info.Title);
    $('#modalAddress').text(buildAddress(info));

    // Construir contenido del modal
    const statusText  = getStatusText(station.StatusType);
    const statusClass = getStatusClass(station.StatusType);
    const numPoints   = station.NumberOfPoints || 'N/D';
    const operator    = station.OperatorInfo ? station.OperatorInfo.Title : 'No disponible';
    const usageType   = station.UsageType    ? station.UsageType.Title    : 'No disponible';

    // Lista completa de conectores
    let connectorsHtml = '<div class="connector-list">';
    if (station.Connections && station.Connections.length > 0) {
        station.Connections.forEach(function(conn) {
            const type  = conn.ConnectionType ? conn.ConnectionType.Title : 'Desconocido';
            const level = conn.Level          ? conn.Level.Title           : '';
            const power = conn.PowerKW        ? conn.PowerKW + ' kW'      : '';

            const label = [type, level, power].filter(Boolean).join(' · ');
            connectorsHtml += `<span class="connector-tag"><i class="fa-solid fa-plug me-1"></i>${escapeHtml(label)}</span>`;
        });
    } else {
        connectorsHtml += '<span class="connector-tag">No especificado</span>';
    }
    connectorsHtml += '</div>';

    const modalHtml = `
        <div class="modal-info-grid">
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-circle-check me-1"></i>Estado</div>
                <div class="modal-info-value">
                    <span class="station-status ${statusClass}" style="font-size:0.8rem;">
                        <i class="bi bi-circle-fill" style="font-size:0.5rem;"></i>
                        ${statusText}
                    </span>
                </div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-charging-station me-1"></i>Puntos de carga</div>
                <div class="modal-info-value">${numPoints}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-building me-1"></i>Operador</div>
                <div class="modal-info-value">${escapeHtml(operator)}</div>
            </div>
            <div class="modal-info-item">
                <div class="modal-info-label"><i class="fa-solid fa-users me-1"></i>Tipo de acceso</div>
                <div class="modal-info-value">${escapeHtml(usageType)}</div>
            </div>
        </div>
        <div class="modal-info-item mb-0">
            <div class="modal-info-label mb-2"><i class="fa-solid fa-plug me-1"></i>Conectores disponibles</div>
            ${connectorsHtml}
        </div>
    `;

    $('#modalBody').html(modalHtml);

    // Mostrar el modal usando Bootstrap 5
    const modal = new bootstrap.Modal(document.getElementById('stationModal'));
    modal.show();
}

// Exponer la función globalmente para poder usarla desde el HTML del InfoWindow
window.openStationModal = openStationModal;

/* ============================================================
   FILTRADO DE ESTACIONES
============================================================ */
function filterStations(stations, filter) {
    if (filter === 'all') return stations;

    return stations.filter(function(station) {
        const statusClass = getStatusClass(station.StatusType);
        return statusClass === filter;
    });
}

/* ============================================================
   FUNCIONES DE UTILIDAD — Estado de estaciones
============================================================ */

/* Obtener texto del estado */
function getStatusText(statusType) {
    if (!statusType) return 'Desconocido';
    const title = (statusType.Title || statusType.IsOperational !== undefined)
        ? statusType.Title
        : '';

    if (statusType.IsOperational === true)  return 'Operativa';
    if (statusType.IsOperational === false) return 'Fuera de servicio';

    // Mapeo de títulos comunes de OCM
    const map = {
        'Operational':         'Operativa',
        'Not Operational':     'Fuera de servicio',
        'Planned For Future Date': 'Planificada',
        'Temporarily Unavailable': 'Temporalmente no disponible',
        'Unknown':             'Desconocido'
    };
    return map[title] || title || 'Desconocido';
}

/* Obtener clase CSS del estado */
function getStatusClass(statusType) {
    if (!statusType) return 'unknown';
    if (statusType.IsOperational === true)  return 'operational';
    if (statusType.IsOperational === false) return 'offline';
    return 'unknown';
}

/* Obtener color del marcador según estado */
function getStatusColor(statusType) {
    const cls = getStatusClass(statusType);
    const colors = {
        'operational': '#00d084', // Verde eléctrico
        'offline':     '#ef4444', // Rojo
        'unknown':     '#f59e0b'  // Ámbar
    };
    return colors[cls] || colors['unknown'];
}

/* Construir texto de conectores (limitado al número indicado) */
function getConnectorsList(station, maxItems) {
    if (!station.Connections || station.Connections.length === 0) return '';
    const items = station.Connections
        .map(function(conn) {
            return conn.ConnectionType ? conn.ConnectionType.Title : null;
        })
        .filter(Boolean);

    // Eliminar duplicados
    const unique = [...new Set(items)];

    if (maxItems && unique.length > maxItems) {
        return unique.slice(0, maxItems).join(', ') + '...';
    }
    return unique.join(', ');
}

/* Construir dirección legible a partir de AddressInfo */
function buildAddress(info) {
    const parts = [
        info.AddressLine1,
        info.Town,
        info.StateOrProvince,
        info.Country ? info.Country.Title : null
    ].filter(Boolean);
    return parts.join(', ') || 'Dirección no disponible';
}

/* Escapar HTML para prevenir XSS */
function escapeHtml(text) {
    if (typeof text !== 'string') return text || '';
    return text
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#039;');
}

/* ============================================================
   FUNCIONES DE UI — Spinner, Toast, Contador
============================================================ */

/* Mostrar spinner de carga en el panel lateral */
function showLoadingSpinner() {
    $('#statusMessage').hide();
    $('#stationsList').addClass('d-none').hide();
    $('#loadingSpinner').removeClass('d-none').show();
}

/* Ocultar spinner */
function hideLoadingSpinner() {
    $('#loadingSpinner').addClass('d-none').hide();
}

/* Mostrar mensaje de estado en el panel lateral */
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

/* Actualizar el contador de estaciones */
function updateStationsCount(count) {
    $('#stationsCount').text(count);
    updateFabBadge(count);
}

/* Actualizar badge del botón FAB */
function updateFabBadge(count) {
    const $badge = $('#fabBadge');
    if (count > 0) {
        $badge.text(count > 99 ? '99+' : count).removeClass('d-none');
    } else {
        $badge.addClass('d-none');
    }
}

/* Mostrar notificación Toast */
function showToast(message, type) {
    const $toast    = $('#notificationToast');
    const $toastBody = $('#toastBody');

    // Quitar clases de tipo anteriores
    $toast.removeClass('success error info warning');
    $toast.addClass(type || 'info');

    // Establecer el mensaje
    $toastBody.html(message);

    // Mostrar con Bootstrap Toast
    const toastEl = document.getElementById('notificationToast');
    const bsToast = bootstrap.Toast.getOrCreateInstance(toastEl, {
        delay: 4000,
        autohide: true
    });
    bsToast.show();
}

/* ============================================================
   INICIALIZACIÓN AL CARGAR LA PÁGINA (sin Google Maps)
   Solo configuramos eventos que no dependen del mapa
============================================================ */
$(document).ready(function() {
    // Manejo de errores de carga de Google Maps
    // Si el script de Google Maps falla (ej: API key inválida),
    // mostramos un mensaje amigable
    window.gm_authFailure = function() {
        $('#mapOverlay').find('p').text('Error: API key de Google Maps inválida.');
        $('#mapOverlay').find('.progress').replaceWith(`
            <div class="alert alert-danger mt-3" style="background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #fca5a5; font-size: 0.8rem; max-width: 320px;">
                <i class="bi bi-exclamation-triangle-fill me-1"></i>
                <strong>Error de autenticación de Google Maps.</strong><br>
                Comprueba que GOOGLE_MAPS_API_KEY en app.js es válida y tiene la API JavaScript habilitada.
            </div>
        `);
    };

    // Detectar si Google Maps no carga en 10 segundos
    setTimeout(function() {
        if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
            $('#mapOverlay').find('p').text('No se pudo cargar Google Maps.');
            console.warn('[EV Charge Locator] Google Maps API no cargó. Verifica la API key y la conexión a internet.');
        }
    }, 10000);
});
