/**
 * ============================================================
 *  DRIVESENSE — Script principal d'optimisation de trajets IA
 * ============================================================
 * Équipe : Lucas - Ulrich · Rouchy ·  · Gafar - Erwan 
 * Stack  : HTML5 · JavaScript ES6+ · Google Maps API · PostgreSQL
 *
 * ARCHITECTURE :
 *  1. Initialisation de la carte Google Maps
 *  2. Récupération des points de livraison (mock PostgreSQL / REST)
 *  3. Calcul d'itinéraire optimisé avec DirectionsService
 *  4. Géolocalisation en temps réel du chauffeur
 *  5. UI responsive — gestion des boutons et du panneau latéral
 * ============================================================
 */

// ─────────────────────────────────────────────
// SECTION 1 — CONFIGURATION GLOBALE
// ─────────────────────────────────────────────

/**
 * Config centrale.
 * → Ulrich / Abdoul : modifiez API_BASE_URL pour pointer vers votre backend.
 */
const CONFIG = {
  API_BASE_URL: "https://localhost:3000/api", // 
  DEFAULT_CENTER: { lat: 48.8566, lng: 2.3522 },        // Paris par défaut
  DEFAULT_ZOOM: 12,
  GEOLOCATION_INTERVAL_MS: 5000,  // Mise à jour position chauffeur toutes les 5s
  MAP_STYLE_ID: "drivesense-style" // ID du style custom Google Maps (optionnel)
};

// ─────────────────────────────────────────────
// SECTION 2 — ÉTAT DE L'APPLICATION
// ─────────────────────────────────────────────

/**
 * Objet d'état global — source de vérité unique.
 * → Rouchy : vous pouvez brancher un store Redux/Zustand ici si besoin.
 */
const AppState = {
  map: null,                    // Instance Google Map
  directionsService: null,      // Service de calcul d'itinéraire
  directionsRenderer: null,     // Rendu de l'itinéraire sur la carte
  driverMarker: null,           // Marqueur de position du chauffeur
  deliveryMarkers: [],          // Tableau des marqueurs de livraison
  geolocationWatchId: null,     // ID du watcher de géolocalisation
  deliveryPoints: [],           // Points chargés depuis la BDD
  optimizedRoute: null,         // Résultat de l'optimisation
  isRouteStarted: false         // Trajet en cours ?
};

// ─────────────────────────────────────────────
// SECTION 3 — INITIALISATION DE LA CARTE
// ─────────────────────────────────────────────

/**
 * initMap() — Point d'entrée appelé automatiquement par l'API Google Maps.
 * 
 * Google Maps appelle cette fonction quand le script est chargé
 * (paramètre &callback=initMap dans l'URL de l'API).
 * 
 * →
 */
async function initMap() {
  console.log("[DRIVESENSE] Initialisation de la carte...");

  // --- 3.1 : Création de la carte ---
  AppState.map = new google.maps.Map(document.getElementById("map"), {
    center: CONFIG.DEFAULT_CENTER,
    zoom: CONFIG.DEFAULT_ZOOM,
    mapId: CONFIG.MAP_STYLE_ID, // Pour Advanced Markers (Google Maps v3.55+)
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: false,       // On cache le switch Satellite/Plan
    streetViewControl: false,
    fullscreenControl: true
  });

  // --- 3.2 : Instanciation des services Google Maps ---
  AppState.directionsService = new google.maps.DirectionsService();
  AppState.directionsRenderer = new google.maps.DirectionsRenderer({
    map: AppState.map,
    suppressMarkers: false,       // On garde les marqueurs A, B, C... de Google
    polylineOptions: {
      strokeColor: "#00C9A7",     // Couleur de la route DRIVESENSE
      strokeWeight: 5,
      strokeOpacity: 0.85
    }
  });

  // --- 3.3 : Chargement initial des points de livraison ---
  await loadDeliveryPoints();

  // --- 3.4 : Bind des boutons UI ---
  bindUIEvents();

  console.log("[DRIVESENSE] Carte initialisée avec succès.");
}

// ─────────────────────────────────────────────
// SECTION 4 — GESTION DES POINTS DE LIVRAISON
// (Connexion PostgreSQL via API REST)
// ─────────────────────────────────────────────

/**
 * loadDeliveryPoints() — Récupère les livraisons depuis l'API backend.
 * 
 * L'API doit retourner un tableau JSON de ce format :
 * [
 *   { id: 1, address: "12 rue de Rivoli, Paris", priority: "haute", lat: 48.86, lng: 2.34 },
 *   ...
 * ]
 * 
 *   La priorité peut être : "haute", "normale", "basse"
 */
async function loadDeliveryPoints() {
  setLoadingState(true, "Chargement des livraisons...");

  try {
    // Appel API REST → votre backend PostgreSQL
    const response = await fetch(`${CONFIG.API_BASE_URL}/deliveries/today`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getDriverToken()}` // Token JWT du chauffeur
      }
    });

    if (!response.ok) throw new Error(`Erreur API: ${response.status}`);

    const deliveries = await response.json();
    AppState.deliveryPoints = deliveries;

    // Affiche les marqueurs sur la carte
    renderDeliveryMarkers(deliveries);

    // Met à jour le compteur dans l'UI
    updateDeliveryCount(deliveries.length);

    console.log(`[DRIVESENSE] ${deliveries.length} livraison(s) chargée(s).`);

  } catch (error) {
    console.error("[DRIVESENSE] Impossible de charger les livraisons:", error);
    showNotification("Erreur de connexion. Données de démonstration utilisées.", "warning");

    // ⚙️ FALLBACK — Données de démonstration si l'API n'est pas disponible
    const demoData = getDemoDeliveryPoints();
    AppState.deliveryPoints = demoData;
    renderDeliveryMarkers(demoData);
    updateDeliveryCount(demoData.length);
  } finally {
    setLoadingState(false);
  }
}

/**
 * getDemoDeliveryPoints() — Données de démo pour les tests sans backend.
 * → Toute l'équipe peut utiliser ces données pour tester l'UI.
 */
function getDemoDeliveryPoints() {
  return [
    { id: 1, address: "Place de la République, Paris", priority: "haute",   lat: 48.8674, lng: 2.3633, recipient: "Marie Dupont",   packages: 2 },
    { id: 2, address: "Avenue de la Nation, Paris",    priority: "normale",  lat: 48.8488, lng: 2.3960, recipient: "Jean Martin",    packages: 1 },
    { id: 3, address: "Rue de la Paix, Paris",         priority: "haute",   lat: 48.8700, lng: 2.3310, recipient: "Sophie Bernard",  packages: 3 },
    { id: 4, address: "Boulevard Voltaire, Paris",     priority: "basse",   lat: 48.8579, lng: 2.3783, recipient: "Lucas Petit",    packages: 1 },
    { id: 5, address: "Rue du Faubourg Saint-Antoine", priority: "normale", lat: 48.8533, lng: 2.3730, recipient: "Emma Leroy",     packages: 2 }
  ];
}

// ─────────────────────────────────────────────
// SECTION 5 — AFFICHAGE DES MARQUEURS
// ─────────────────────────────────────────────

/**
 * renderDeliveryMarkers() — Place les épingles de livraison sur la carte.
 * 
 * Couleur des marqueurs selon la priorité :
 *  🔴 haute   → rouge
 *  🟠 normale → orange
 *  🟢 basse   → vert
 * 
 * → Arioty : vous pouvez remplacer les icônes SVG inline par des PNG custom.
 */
function renderDeliveryMarkers(deliveries) {
  // Nettoyage des anciens marqueurs
  AppState.deliveryMarkers.forEach(m => m.setMap(null));
  AppState.deliveryMarkers = [];

  const priorityColors = {
    haute:   "#FF4444",
    normale: "#FF8C00",
    basse:   "#00C9A7"
  };

  deliveries.forEach((point, index) => {
    const color = priorityColors[point.priority] || "#888888";

    const marker = new google.maps.Marker({
      position: { lat: point.lat, lng: point.lng },
      map: AppState.map,
      title: `Livraison #${point.id} — ${point.recipient}`,
      label: {
        text: String(index + 1),
        color: "#FFFFFF",
        fontWeight: "bold",
        fontSize: "13px"
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 16,
        fillColor: color,
        fillOpacity: 1,
        strokeColor: "#FFFFFF",
        strokeWeight: 2
      },
      animation: google.maps.Animation.DROP
    });

    // Info-bulle au clic sur le marqueur
    const infoWindow = new google.maps.InfoWindow({
      content: buildInfoWindowContent(point, index + 1)
    });

    marker.addListener("click", () => {
      infoWindow.open(AppState.map, marker);
    });

    AppState.deliveryMarkers.push(marker);
  });
}

/**
 * buildInfoWindowContent() — Génère le HTML de l'info-bulle d'un marqueur.
 */
function buildInfoWindowContent(point, stopNumber) {
  return `
    <div style="font-family: 'Segoe UI', sans-serif; min-width: 180px; padding: 4px;">
      <div style="font-weight: 700; font-size: 14px; color: #1a1a2e; margin-bottom: 4px;">
        Arrêt ${stopNumber} — ${point.recipient}
      </div>
      <div style="font-size: 12px; color: #555; margin-bottom: 6px;">
        📦 ${point.packages} colis · Priorité : 
        <strong style="color: ${point.priority === 'haute' ? '#FF4444' : point.priority === 'normale' ? '#FF8C00' : '#00C9A7'}">
          ${point.priority.toUpperCase()}
        </strong>
      </div>
      <div style="font-size: 11px; color: #777;">${point.address}</div>
    </div>
  `;
}

// ─────────────────────────────────────────────
// SECTION 6 — OPTIMISATION DE L'ITINÉRAIRE (IA)
// ─────────────────────────────────────────────

/**
 * calculateOptimizedRoute() — Calcule et affiche l'itinéraire optimisé.
 * 
 * LOGIQUE D'OPTIMISATION :
 *  1. Les livraisons "haute priorité" sont placées en tête de liste
 *  2. Google Maps DirectionsService (optimizeWaypoints: true) réordonne
 *     les waypoints restants pour minimiser la distance totale
 *  3. Le trafic en temps réel est pris en compte (drivingOptions)
 * 
 * → Ulrich : l'ordre final optimisé est dans `response.routes[0].waypoint_order`
 * → Rouchy : vous pouvez remplacer la logique de tri par un appel à votre
 *   algorithme d'IA backend si vous en avez un.
 */
async function calculateOptimizedRoute() {
  if (AppState.deliveryPoints.length === 0) {
    showNotification("Aucun point de livraison disponible.", "error");
    return;
  }

  setLoadingState(true, "Calcul de l'itinéraire IA en cours...");

  // --- 6.1 : Récupération de la position actuelle du chauffeur ---
  let origin;
  try {
    const position = await getCurrentPosition();
    origin = { lat: position.coords.latitude, lng: position.coords.longitude };
    console.log("[DRIVESENSE] Position chauffeur:", origin);
  } catch {
    // Fallback : on démarre du centre de Paris
    console.warn("[DRIVESENSE] Géolocalisation refusée. Départ depuis Paris centre.");
    origin = CONFIG.DEFAULT_CENTER;
    showNotification("Géolocalisation non disponible. Départ depuis le dépôt.", "warning");
  }

  // --- 6.2 : Tri par priorité (haute en premier) ---
  const sortedPoints = [...AppState.deliveryPoints].sort((a, b) => {
    const priorityOrder = { haute: 0, normale: 1, basse: 2 };
    return (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1);
  });

  // --- 6.3 : Construction des waypoints Google Maps ---
  // On garde le 1er point de haute priorité comme destination directe,
  // les autres deviennent des waypoints à optimiser.
  const destination = {
    lat: sortedPoints[sortedPoints.length - 1].lat,
    lng: sortedPoints[sortedPoints.length - 1].lng
  };

  const waypoints = sortedPoints.slice(0, -1).map(point => ({
    location: { lat: point.lat, lng: point.lng },
    stopover: true  // true = arrêt réel (pas juste passer par)
  }));

  // --- 6.4 : Requête à l'API Directions ---
  const request = {
    origin: origin,
    destination: destination,
    waypoints: waypoints,
    optimizeWaypoints: true,       // 🤖 L'IA de Google réordonne les waypoints
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),   // Trafic en temps réel
      trafficModel: google.maps.TrafficModel.BEST_GUESS
    },
    unitSystem: google.maps.UnitSystem.METRIC,
    region: "FR"                   // Priorité aux routes françaises
  };

  AppState.directionsService.route(request, (response, status) => {
    setLoadingState(false);

    if (status === google.maps.DirectionsStatus.OK) {
      // --- 6.5 : Affichage de l'itinéraire sur la carte ---
      AppState.directionsRenderer.setDirections(response);
      AppState.optimizedRoute = response;

      // Récupère l'ordre optimisé des waypoints
      const waypointOrder = response.routes[0].waypoint_order;
      const leg = response.routes[0].legs;

      // Calcul des métriques globales
      const totalDistance = leg.reduce((sum, l) => sum + l.distance.value, 0);
      const totalDuration = leg.reduce((sum, l) => sum + l.duration_in_traffic.value, 0);

      updateRouteStats(totalDistance, totalDuration, sortedPoints, waypointOrder);
      displayStopList(sortedPoints, waypointOrder, leg);

      showNotification(`Itinéraire optimisé — ${formatDistance(totalDistance)} · ${formatDuration(totalDuration)}`, "success");
      console.log("[DRIVESENSE] Ordre optimisé des arrêts:", waypointOrder);

    } else {
      console.error("[DRIVESENSE] Erreur DirectionsService:", status);
      showNotification(`Impossible de calculer l'itinéraire : ${status}`, "error");
    }
  });
}

// ─────────────────────────────────────────────
// SECTION 7 — GÉOLOCALISATION EN TEMPS RÉEL
// ─────────────────────────────────────────────

/**
 * startRealtimeTracking() — Active le suivi GPS du chauffeur en temps réel.
 * 
 * Un marqueur bleu suit la position du chauffeur et la carte se recentre.
 * La position est aussi envoyée au backend pour le suivi flotte.
 * 
 * → Abdoul : l'envoi de position au backend se fait dans sendPositionToServer().
 */
function startRealtimeTracking() {
  if (!navigator.geolocation) {
    showNotification("La géolocalisation n'est pas supportée sur cet appareil.", "error");
    return;
  }

  // Options de géolocalisation haute précision
  const geoOptions = {
    enableHighAccuracy: true,
    maximumAge: 2000,          // Cache position max 2 secondes
    timeout: 5000              // Timeout 5 secondes
  };

  AppState.geolocationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const driverPos = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };

      // Mise à jour du marqueur du chauffeur
      updateDriverMarker(driverPos);

      // Envoi optionnel au backend pour tracking flotte
      sendPositionToServer(driverPos, position.coords.speed);
    },
    (error) => {
      console.warn("[DRIVESENSE] Erreur géolocalisation:", error.message);
    },
    geoOptions
  );

  console.log("[DRIVESENSE] Suivi GPS démarré (watchId:", AppState.geolocationWatchId, ")");
}

/**
 * stopRealtimeTracking() — Arrête le suivi GPS.
 */
function stopRealtimeTracking() {
  if (AppState.geolocationWatchId !== null) {
    navigator.geolocation.clearWatch(AppState.geolocationWatchId);
    AppState.geolocationWatchId = null;
    console.log("[DRIVESENSE] Suivi GPS arrêté.");
  }
}

/**
 * updateDriverMarker() — Place/déplace le marqueur bleu du chauffeur.
 */
function updateDriverMarker(position) {
  if (AppState.driverMarker) {
    // Déplace le marqueur existant
    AppState.driverMarker.setPosition(position);
  } else {
    // Crée le marqueur la première fois
    AppState.driverMarker = new google.maps.Marker({
      position: position,
      map: AppState.map,
      title: "📍 Votre position",
      icon: {
        url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="18" fill="#4285F4" stroke="white" stroke-width="3"/>
            <circle cx="20" cy="20" r="6" fill="white"/>
          </svg>
        `),
        scaledSize: new google.maps.Size(40, 40),
        anchor: new google.maps.Point(20, 20)
      },
      zIndex: 1000 // Toujours au-dessus des autres marqueurs
    });
  }

  // Recentre doucement la carte sur le chauffeur
  AppState.map.panTo(position);
}

/**
 * sendPositionToServer() — Envoie la position GPS au backend (tracking flotte).
 * → Ulrich : créez le endpoint POST /api/driver/position côté serveur.
 */
async function sendPositionToServer(position, speed) {
  try {
    await fetch(`${CONFIG.API_BASE_URL}/driver/position`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getDriverToken()}`
      },
      body: JSON.stringify({
        lat: position.lat,
        lng: position.lng,
        speed: speed || 0,
        timestamp: new Date().toISOString()
      })
    });
  } catch {
    // Silencieux — pas critique si le serveur est indisponible
  }
}

/**
 * getCurrentPosition() — Wrapper Promise pour navigator.geolocation.getCurrentPosition.
 */
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 8000
    });
  });
}

// ─────────────────────────────────────────────
// SECTION 8 — CONTRÔLE DU TRAJET
// ─────────────────────────────────────────────

/**
 * startTrip() — Lance le trajet : calcule l'itinéraire + démarre le GPS.
 * Appelé par le bouton "Démarrer le trajet" dans l'HTML.
 */
async function startTrip() {
  if (AppState.isRouteStarted) {
    showNotification("Un trajet est déjà en cours.", "warning");
    return;
  }

  AppState.isRouteStarted = true;
  updateTripButton("started");

  // Lance les deux processus en parallèle
  await calculateOptimizedRoute();
  startRealtimeTracking();

  console.log("[DRIVESENSE] Trajet démarré.");
}

/**
 * stopTrip() — Arrête le trajet en cours.
 */
function stopTrip() {
  AppState.isRouteStarted = false;
  stopRealtimeTracking();

  // Réinitialise la carte
  AppState.directionsRenderer.setDirections({ routes: [] });
  AppState.optimizedRoute = null;

  updateTripButton("stopped");
  showNotification("Trajet terminé. Bonne journée !", "success");
  console.log("[DRIVESENSE] Trajet arrêté.");
}

/**
 * recenterMap() — Recentre la carte sur la position du chauffeur.
 * Appelé par le bouton de recentrage.
 */
async function recenterMap() {
  try {
    const position = await getCurrentPosition();
    const pos = { lat: position.coords.latitude, lng: position.coords.longitude };
    AppState.map.setCenter(pos);
    AppState.map.setZoom(15);
  } catch {
    showNotification("Position non disponible.", "warning");
  }
}

// ─────────────────────────────────────────────
// SECTION 9 — MISE À JOUR DE L'INTERFACE
// ─────────────────────────────────────────────

/**
 * bindUIEvents() — Associe les événements aux boutons HTML.
 * → Rouchy : ajoutez ici tout nouveau bouton de l'interface.
 */
function bindUIEvents() {
  const btnStart      = document.getElementById("btn-start-trip");
  const btnStop       = document.getElementById("btn-stop-trip");
  const btnRecenter   = document.getElementById("btn-recenter");
  const btnRefresh    = document.getElementById("btn-refresh-deliveries");

  if (btnStart)    btnStart.addEventListener("click",  startTrip);
  if (btnStop)     btnStop.addEventListener("click",   stopTrip);
  if (btnRecenter) btnRecenter.addEventListener("click", recenterMap);
  if (btnRefresh)  btnRefresh.addEventListener("click", loadDeliveryPoints);
}

/**
 * updateTripButton() — Change l'état visuel du bouton principal.
 */
function updateTripButton(state) {
  const btnStart = document.getElementById("btn-start-trip");
  const btnStop  = document.getElementById("btn-stop-trip");
  if (!btnStart || !btnStop) return;

  if (state === "started") {
    btnStart.disabled = true;
    btnStart.classList.add("btn--disabled");
    btnStop.disabled = false;
    btnStop.classList.remove("btn--disabled");
  } else {
    btnStart.disabled = false;
    btnStart.classList.remove("btn--disabled");
    btnStop.disabled = true;
    btnStop.classList.add("btn--disabled");
  }
}

/**
 * updateRouteStats() — Met à jour les métriques dans le panneau info.
 */
function updateRouteStats(totalDistanceM, totalDurationS, points, order) {
  const statsEl = document.getElementById("route-stats");
  if (!statsEl) return;

  statsEl.innerHTML = `
    <div class="stat-item">
      <span class="stat-icon">📏</span>
      <span class="stat-value">${formatDistance(totalDistanceM)}</span>
      <span class="stat-label">Distance</span>
    </div>
    <div class="stat-item">
      <span class="stat-icon">⏱️</span>
      <span class="stat-value">${formatDuration(totalDurationS)}</span>
      <span class="stat-label">Durée estimée</span>
    </div>
    <div class="stat-item">
      <span class="stat-icon">📦</span>
      <span class="stat-value">${points.length}</span>
      <span class="stat-label">Arrêts</span>
    </div>
  `;
}

/**
 * displayStopList() — Affiche la liste ordonnée des arrêts dans le panneau.
 */
function displayStopList(points, order, legs) {
  const listEl = document.getElementById("stop-list");
  if (!listEl) return;

  // Recompose l'ordre optimisé
  const orderedStops = order.map(i => points[i]);
  // Ajoute le dernier point (destination)
  orderedStops.push(points[points.length - 1]);

  listEl.innerHTML = orderedStops.map((stop, i) => {
    const leg = legs[i];
    const priorityClass = `priority--${stop.priority}`;
    return `
      <div class="stop-item ${priorityClass}">
        <div class="stop-number">${i + 1}</div>
        <div class="stop-details">
          <div class="stop-name">${stop.recipient}</div>
          <div class="stop-address">${stop.address}</div>
          <div class="stop-meta">
            ${leg ? `${leg.distance.text} · ${leg.duration_in_traffic?.text || leg.duration.text}` : ""}
            · <span class="stop-priority">${stop.priority.toUpperCase()}</span>
          </div>
        </div>
        <button class="stop-action" onclick="markDelivered(${stop.id})">✓</button>
      </div>
    `;
  }).join("");
}

/**
 * markDelivered() — Marque une livraison comme effectuée.
 * → Abdoul : appelez votre API PATCH /deliveries/{id}/status ici.
 */
async function markDelivered(deliveryId) {
  try {
    await fetch(`${CONFIG.API_BASE_URL}/deliveries/${deliveryId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getDriverToken()}`
      },
      body: JSON.stringify({ status: "delivered", deliveredAt: new Date().toISOString() })
    });
    showNotification(`Livraison #${deliveryId} validée ✓`, "success");
    // Retire le marqueur de la carte
    const idx = AppState.deliveryPoints.findIndex(p => p.id === deliveryId);
    if (idx !== -1 && AppState.deliveryMarkers[idx]) {
      AppState.deliveryMarkers[idx].setMap(null);
    }
  } catch (error) {
    console.error("[DRIVESENSE] Erreur validation livraison:", error);
    showNotification("Erreur lors de la validation.", "error");
  }
}

/**
 * updateDeliveryCount() — Met à jour le badge du nombre de livraisons.
 */
function updateDeliveryCount(count) {
  const badge = document.getElementById("delivery-count");
  if (badge) badge.textContent = count;
}

/**
 * setLoadingState() — Affiche/cache l'overlay de chargement.
 */
function setLoadingState(isLoading, message = "Chargement...") {
  const overlay = document.getElementById("loading-overlay");
  const loadingText = document.getElementById("loading-text");
  if (!overlay) return;
  overlay.style.display = isLoading ? "flex" : "none";
  if (loadingText) loadingText.textContent = message;
}

/**
 * showNotification() — Affiche une notification toast.
 * Types : "success" | "warning" | "error"
 */
function showNotification(message, type = "success") {
  let toast = document.getElementById("toast-notification");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast-notification";
    document.body.appendChild(toast);
  }

  const icons = { success: "✅", warning: "⚠️", error: "❌" };
  toast.className = `toast toast--${type} toast--visible`;
  toast.innerHTML = `${icons[type] || "ℹ️"} ${message}`;

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove("toast--visible");
  }, 4000);
}

// ─────────────────────────────────────────────
// SECTION 10 — UTILITAIRES
// ─────────────────────────────────────────────

/** formatDistance() — Convertit des mètres en km lisible. */
function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${meters} m`;
}

/** formatDuration() — Convertit des secondes en "Xh Ymin". */
function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m} min`;
}

/**
 * getDriverToken() — Récupère le JWT du chauffeur depuis le localStorage.
 * → Ulrich : stocker le token après login avec localStorage.setItem("drivesense_token", token)
 */
function getDriverToken() {
  return localStorage.getItem("drivesense_token") || "";
}

// ─────────────────────────────────────────────
// SECTION 11 — EXPOSITION GLOBALE
// L'API Google Maps appelle initMap() en global.
// ─────────────────────────────────────────────
window.initMap = initMap;
window.markDelivered = markDelivered; // Appelé depuis le HTML généré dynamiquement
