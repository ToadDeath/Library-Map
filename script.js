// ------------------ SECTION 1 - MAP INITIALIZATION ------------------
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  dragging: false,
  scrollWheelZoom: false,
  doubleClickZoom: false,
  boxZoom: false,
  keyboard: false,
  touchZoom: false
}).setView([39.0, -105.5], 8);

let geojson; // will hold the layer


// ------------------ SECTION 2 - CLAIM STATE ------------------
const claimed = {}; // key by unique county id


// ------------------ SECTION 3 - HELPERS ------------------
function getCountyId(feature) {
  // Prefer unique FIPS if present, else fall back to FULL name
  return String(
    feature.properties.CNTY_FIPS ||
    feature.properties.US_FIPS ||
    feature.properties.FIPS ||
    feature.properties.FULL
  );
}

function getCountyName(feature) {
  return (
    feature.properties.FULL ||
    feature.properties.COUNTY ||
    feature.properties.LABEL ||
    "Unknown County"
  );
}

function sanitizeId(str) {
  return String(str).replace(/\s+/g, "-").replace(/[^A-Za-z0-9\-_]/g, "");
}


// ------------------ SECTION 4 - STYLES ------------------
function countyStyle(feature) {
  const id = getCountyId(feature);
  const isClaimed = !!claimed[id];
  return {
    fillColor: isClaimed ? "#002868" : "#BF0A30",
    color: "white",         // solid white borders
    weight: 2,
    dashArray: "",          // no dashes
    fillOpacity: 0.85
  };
}

function highlightFeature(e) {
  const layer = e.target;
  // simulate a shadow by thickening and darkening the stroke on hover
  layer.setStyle({
    weight: 4,
    color: "#333",
    fillOpacity: 0.9
  });
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function resetHighlight(e) {
  geojson.resetStyle(e.target);
}


// ------------------ SECTION 5 - POPUP ACTIONS ------------------
function claimById(id) {
  claimed[id] = true;
  refreshOne(id);
}

function unclaimById(id) {
  delete claimed[id];
  refreshOne(id);
}

function refreshOne(id) {
  geojson.eachLayer(layer => {
    if (getCountyId(layer.feature) === id) {
      geojson.resetStyle(layer);
      layer.closePopup();
    }
  });
}


// ------------------ SECTION 6 - INTERACTION ------------------
function onEachCounty(feature, layer) {
  const id = getCountyId(feature);
  const name = getCountyName(feature);
  const domId = sanitizeId(id);

  // hover effect
  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight
  });

  // click opens a Leaflet popup with a button - no auto toggle
  layer.on("click", function () {
    const isClaimed = !!claimed[id];
    const btnLabel = isClaimed ? "Unclaim Library Card" : "Claim Library Card";

    const html = `
      <strong>${name}</strong><br>
      <button id="btn-${domId}" class="claim-btn">${btnLabel}</button>
    `;

    layer.bindPopup(html, { autoPan: false }).openPopup();

    // attach handler after popup renders
    setTimeout(() => {
      const btn = document.getElementById(`btn-${domId}`);
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (claimed[id]) unclaimById(id);
        else claimById(id);
      });
    }, 0);
  });
}


// ------------------ SECTION 7 - LOAD GEOJSON ------------------
// No basemap. The counties are the whole visualization.
// Ensure your CSS gives #map a real size or you will see a skinny line.
fetch("colorado_counties.geojson")
  .then(r => r.json())
  .then(data => {
    geojson = L.geoJSON(data, {
      style: countyStyle,
      onEachFeature: onEachCounty
    }).addTo(map);

    // fit to the counties
    map.fitBounds(geojson.getBounds());
  })
  .catch(err => console.error("Failed to load GeoJSON:", err));




