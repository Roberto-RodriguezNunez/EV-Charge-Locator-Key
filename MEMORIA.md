# Memoria técnica — EV Charge Locator

Este documento explica cómo funciona el proyecto por dentro: qué hace cada parte, por qué se eligió cada tecnología y cómo fluye la información de principio a fin.

---

## 1. Qué es el proyecto

Una **SPA (Single Page Application) 100% estática**: no hay servidor, no hay base de datos propia, no hay proceso de compilación. Todo lo que el usuario ve se construye en el navegador a partir de tres ficheros:

- `index.html` — la estructura visual (HTML)
- `css/styles.css` — el aspecto (CSS)
- `js/app.js` — toda la lógica (JavaScript)

Las **dependencias** (Bootstrap, jQuery, Google Maps…) se cargan directamente desde CDNs externos en el HTML, sin necesidad de `npm install` ni nada similar.

---

## 2. Tecnologías utilizadas y por qué

### HTML5 / CSS3 / JavaScript ES6+
La base de cualquier web. Se usa JavaScript moderno (arrow functions, template literals, `const`/`let`, destructuring…) pero sin transpilador porque todos los navegadores actuales lo soportan directamente.

### Bootstrap 5
Framework CSS de Bootstrap que proporciona:
- El sistema de grid para el layout
- Componentes listos: modales, badges, toasts (notificaciones), botones
- Clases utilitarias como `d-flex`, `d-none`, `gap-2`…

Se usa vía CDN, no se modifica el fuente de Bootstrap.

### jQuery 3.7
Librería JavaScript que simplifica:
- La manipulación del DOM (`$('#elemento')`)
- Los eventos (`$('#btn').on('click', ...)`)
- Las llamadas Ajax (`$.ajax(...)`) — la petición a la API de Open Charge Map usa exactamente esto

### Bootstrap Icons + Font Awesome
Dos colecciones de iconos vectoriales (SVG embebido como font). Bootstrap Icons se usa en la UI general (chevrons, estrellas, filtros…) y Font Awesome para iconos específicos de estaciones y navegación.

### Google Maps JavaScript API
La librería oficial de Google para embeber mapas interactivos. Proporciona:
- `google.maps.Map` — el mapa en sí
- `google.maps.Marker` — los pines en el mapa
- `google.maps.InfoWindow` — el popup que aparece al clicar un pin
- `google.maps.Geocoder` — convierte texto ("Madrid") en coordenadas (lat/lng)
- `google.maps.ControlPosition` — para posicionar los controles del mapa

Se carga de forma **dinámica** al final del `<body>` con `callback=initMap`, lo que significa que cuando termina de cargarse llama automáticamente a nuestra función `initMap()`.

### Google Places API
Extensión de Google Maps que proporciona sugerencias de autocompletado mientras el usuario escribe en el buscador. Se activa con `&libraries=places` en la URL de carga del SDK.

### Open Charge Map API v3
API pública y gratuita (con key) que devuelve datos de puntos de carga reales de todo el mundo. Se consulta vía Ajax con parámetros como:
- `latitude`, `longitude` — centro de la búsqueda
- `distance` — radio en km
- `maxresults` — límite de resultados
- `compact=true`, `verbose=false` — para reducir el tamaño de la respuesta

### @googlemaps/markerclusterer
Librería auxiliar que agrupa marcadores cercanos en un solo icono con contador. Sin esto, con 500 marcadores el mapa sería ilegible.

---

## 3. Estructura del fichero app.js

El fichero tiene ~1500 líneas divididas en 20 secciones numeradas (el índice está al principio del fichero). Las más importantes:

### CONFIG y appState (sección 1)
Dos objetos globales que viven durante toda la sesión:

```js
const CONFIG = {
    searchRadiusKm: 10,  // radio de búsqueda en km
    maxResults: 500,     // máximo de estaciones a pedir
    defaultLat: 40.4168, // Madrid como posición inicial
    defaultLng: -3.7038,
    defaultZoom: 13,
    markerZoom: 16       // zoom al centrar en una estación
};
```

```js
const appState = {
    map,           // el objeto google.maps.Map
    markers[],     // array de los pines actuales en el mapa
    stations[],    // array de datos de estaciones (respuesta de OCM)
    favorites[],   // estaciones guardadas (desde localStorage)
    compareList[], // IDs seleccionados para comparar (máx 3)
    searchHistory[], // últimas búsquedas (desde localStorage)
    viewMode,      // 'both' | 'map' | 'list'
    ...
};
```

### initMap (sección 2)
Es el **punto de arranque** de toda la app. Google Maps la llama automáticamente cuando termina de cargarse. Crea el mapa, el geocoder, el infoWindow y llama a `initEventListeners()` y `attemptGeolocation()`.

### initEventListeners (sección 4)
Registra **todos** los eventos de la UI: el formulario de búsqueda, el botón de geolocalización, los pills de filtro, el toggle de tema, el botón de filtros avanzados, el FAB mobile… Es como el "panel de control" de la app — si algo deja de funcionar al hacer clic, lo primero que hay que mirar es esta sección.

### fetchChargingStations (sección 11)
La función más importante del proyecto. Hace la petición Ajax a la API de Open Charge Map:

```js
$.ajax({
    url: 'https://api.openchargemap.io/v3/poi/',
    data: {
        key: OCM_API_KEY,
        latitude: lat,
        longitude: lng,
        distance: CONFIG.searchRadiusKm,
        maxresults: getMaxResults(),
        compact: true,
        verbose: false,
        output: 'json'
    },
    success: function(data) {
        appState.stations = data;
        createMarkers(data);
        renderStationsList(data);
        updateZoneStats(data);
    }
});
```

### createMarkers (sección 12)
Para cada estación recibida, crea un marcador SVG con color según el estado:
- **Verde** (`#00d084`) → operacional
- **Rojo** (`#ef4444`) → fuera de servicio
- **Ámbar** (`#f59e0b`) → estado desconocido / favorito

Los marcadores se agrupan con `MarkerClusterer`. Al clicar un marcador se llama a `openInfoWindow()`.

### filterStations (sección 18)
Filtra el array `appState.stations` **sin rellamar a la API**. Combina:
- El filtro rápido activo (`all` / `operational` / `unknown` / `favorites`)
- Los filtros avanzados (tipo de conector, velocidad, coste)

Después llama a `renderStationsList()` y sincroniza los marcadores del mapa para que solo se vean los que pasan el filtro.

---

## 4. Flujo completo de una búsqueda

```
Usuario escribe "Barcelona" y pulsa Search
    ↓
searchByAddress("Barcelona")
    ↓
Google Geocoder → {lat: 41.38, lng: 2.17}
    ↓
map.setCenter({lat, lng})
addUserLocationMarker(lat, lng)   ← pin azul en el mapa
    ↓
fetchChargingStations(lat, lng)
    ↓
Ajax GET → api.openchargemap.io/v3/poi/?latitude=41.38&longitude=2.17&distance=10...
    ↓
Respuesta JSON con array de estaciones
    ↓
appState.stations = data
createMarkers(data)          ← pines en el mapa + clustering
renderStationsList(data)     ← cards en el sidebar
updateZoneStats(data)        ← barra de estadísticas
showToast("Found 47 stations")
```

---

## 5. Sistema de temas (dark / light)

Los colores están definidos como **CSS custom properties** (variables CSS):

```css
:root {                          /* tema oscuro (por defecto) */
    --color-dark:    #0f1117;
    --color-accent:  #00d084;    /* verde principal */
    ...
}

[data-theme="light"] {           /* sobreescribe solo lo necesario */
    --color-dark:    #f8f9fa;
    --color-accent:  #00a866;
    ...
}
```

Al cambiar el tema, `applyTheme()` solo cambia el atributo `data-theme` en el `<html>` y el CSS se actualiza solo.

El tema se guarda en `localStorage` con la clave `ev-theme`. Para evitar el "flash" (que se vea el tema incorrecto un instante al cargar), hay un **inline script en el `<head>`** que aplica el tema antes de que el navegador pinte nada:

```html
<script>
    (function() {
        var t = localStorage.getItem('ev-theme') ||
                (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
        document.documentElement.setAttribute('data-theme', t);
    })();
</script>
```

---

## 6. Persistencia con localStorage

La app guarda tres cosas en el navegador del usuario:

| Clave | Qué guarda | Cuándo se usa |
|---|---|---|
| `ev-theme` | `'dark'` o `'light'` | Recordar el tema entre sesiones |
| `ev-favorites` | Array JSON de objetos estación completos | La pestaña "Saved" y los marcadores ámbar |
| `ev-history` | Array de strings (últimas 8 búsquedas) | El dropdown de historial al hacer clic en el buscador |
| `ev-radius` | Número (km) | Recordar el radio de búsqueda elegido |

`localStorage` es como una "mini base de datos" del navegador que persiste aunque se cierre la pestaña. Se accede con `localStorage.getItem('clave')` y `localStorage.setItem('clave', valor)`.

---

## 7. Layout responsive (móvil vs escritorio)

En **escritorio**: el layout es horizontal — sidebar a la izquierda, mapa a la derecha, ambos siempre visibles. El sidebar tiene un ancho fijo de 380px.

En **móvil** (≤767px): el mapa ocupa toda la pantalla. El sidebar es un **bottom-sheet** — un panel que se desliza desde abajo. Empieza oculto (`transform: translateY(100%)`) y al pulsar el FAB (botón verde flotante) se muestra (`transform: translateY(0)`).

La transición entre layouts la gestiona CSS con `@media (max-width: 767px)`. No hay JavaScript para el responsive básico.

---

## 8. Seguridad

La app muestra datos externos (nombres de estaciones, direcciones, costes…) en el DOM. Para evitar ataques XSS (que un nombre de estación malicioso inyecte HTML/JavaScript en la página), **todos los strings de datos externos** pasan por `escapeHtml()` antes de insertarse:

```js
function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str || ''));
    return div.innerHTML;
}
```

Esto convierte caracteres peligrosos (`<`, `>`, `&`, `"`) en sus entidades HTML equivalentes.

Las API keys están en `config.js` que está en `.gitignore` — nunca se suben al repositorio.

---

## 9. Cómo levantar el proyecto localmente

```bash
# 1. Copia la plantilla de configuración
cp js/config.example.js js/config.js
# Edita config.js y pon tus API keys

# 2. Arranca un servidor HTTP estático
npx serve -l 4200

# 3. Abre http://localhost:4200 en el navegador
```

Para probarlo desde el móvil sin publicarlo:
```bash
./cloudflared tunnel --url http://localhost:4200
# Te da una URL pública tipo https://xxxxx.trycloudflare.com
```

---

## 10. Lo que NO hace el proyecto (y por qué)

- **No tiene backend propio**: no hay servidor Node/PHP/Python. Toda la lógica corre en el navegador.
- **No tiene base de datos**: los favoritos se guardan en localStorage del navegador del usuario, no en un servidor.
- **No tiene autenticación**: cualquiera que abra la URL puede usar la app.
- **No tiene build step**: no hay Webpack, Vite, npm run build… Se edita el fichero y se recarga el navegador.

Esto es una decisión de diseño deliberada para mantener el proyecto simple y sin dependencias de infraestructura.
