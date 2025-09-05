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
let selectedCounty = null; // track which county is active


// ------------------ SECTION 2 - CLAIM STATE ------------------
const claimed = {}; // key by unique county id


// ------------------ SECTION 3 - HELPERS ------------------
function getCountyId(feature) {
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
    color: "white",
    weight: 2,
    dashArray: "",
    fillOpacity: 0.85
  };
}

function highlightFeature(e) {
  const layer = e.target;

  // Only highlight if no county is currently selected
  if (selectedCounty && selectedCounty !== layer) return;

  layer.setStyle({
    weight: 4,
    color: "#333",
    fillOpacity: 0.9
  });

  if (layer._path) {
    layer._path.classList.add("leaflet-shadow");
  }

  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
    layer.bringToFront();
  }
}

function resetHighlight(e) {
  const layer = e.target;

  // Don't reset if this is the selected county
  if (selectedCounty === layer) return;

  geojson.resetStyle(layer);

  if (layer._path) {
    layer._path.classList.remove("leaflet-shadow");
  }
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

  // click opens popup always at county centroid
  layer.on("click", function () {
    // If already selected and popup open, don’t re-open
    if (selectedCounty === layer) return;

    const isClaimed = !!claimed[id];
    const btnLabel = isClaimed ? "Unclaim Library Card" : "Claim Library Card";

    const popupContent = `
      <div style="text-align:center;">
        <strong>${name}</strong><br>
        <button id="btn-${domId}" class="claim-btn">${btnLabel}</button>
      </div>
    `;

    const center = layer.getBounds().getCenter();
    const popup = L.popup({ autoPan: false })
      .setLatLng(center)
      .setContent(popupContent);

    // Open popup and set this as selected
    popup.openOn(map);

    if (selectedCounty && selectedCounty !== layer) {
      geojson.resetStyle(selectedCounty);
      if (selectedCounty._path) {
        selectedCounty._path.classList.remove("leaflet-shadow");
      }
    }
    selectedCounty = layer;
    highlightFeature({ target: layer });

    // Handle popup close (reset selection)
    map.once("popupclose", () => {
      geojson.resetStyle(layer);
      if (layer._path) {
        layer._path.classList.remove("leaflet-shadow");
      }
      selectedCounty = null;
    });

    // attach handler after popup renders
    setTimeout(() => {
      const btn = document.getElementById(`btn-${domId}`);
      if (!btn) return;
      btn.addEventListener("click", () => {
        if (claimed[id]) {
          unclaimById(id);
          btn.textContent = "Claim Library Card"; // update label immediately
        } else {
          claimById(id);
          btn.textContent = "Unclaim Library Card"; // update label immediately
        }
      });
    }, 0);
  });
}


// ------------------ SECTION 7 - LOAD GEOJSON ------------------
fetch("colorado_counties.geojson")
  .then(r => r.json())
  .then(data => {
    geojson = L.geoJSON(data, {
      style: countyStyle,
      onEachFeature: onEachCounty
    }).addTo(map);

    map.fitBounds(geojson.getBounds());
  })
  .catch(err => console.error("Failed to load GeoJSON:", err));

