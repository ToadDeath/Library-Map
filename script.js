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

let geojson;               // will hold the layer
let selectedCounty = null; // track which county is active
let activePopup = L.popup({ autoPan: false }); // global popup


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
    fillColor: isClaimed ? "#002868" : "#BF0A30", // blue if claimed, red if unclaimed
    color: "white",
    weight: 2,
    dashArray: "",
    fillOpacity: 0.85
  };
}

function highlightFeature(layer) {
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

function resetHighlight(layer) {
  if (selectedCounty === layer) return; // don’t reset if active
  geojson.resetStyle(layer);
  if (layer._path) {
    layer._path.classList.remove("leaflet-shadow");
  }
}


// ------------------ SECTION 5 - CLAIM LOGIC ------------------
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
// Shared interaction logic for counties and libraries
function onEachFeatureCommon(feature, layer) {
  const id =
    feature.properties.CNTY_FIPS ||
    feature.properties.US_FIPS ||
    feature.properties.FIPS ||
    feature.properties.FULL ||
    feature.properties.OBJECTID ||
    feature.properties.FID ||
    feature.properties.id ||
    feature.properties.lgid;

  const name =
    feature.properties.FULL ||
    feature.properties.COUNTY ||
    feature.properties.LABEL ||
    feature.properties.NAME ||
    feature.properties.NAMES2 ||
    feature.properties.lgname ||
    feature.properties.NAMELC ||
    feature.properties.name ||
    "Unknown Area";

  const domId = sanitizeId(id);

  // Compute centroid for popup/tooltip placement
  const centroid = turf.centroid(feature).geometry.coordinates;
  const centerLatLng = [centroid[1], centroid[0]];

  // Hover: show tooltip
  layer.on("mouseover", () => {
    if (map.hasLayer(activePopup)) return; // don’t show tooltip if popup is open
    highlightFeature(layer);
    layer
      .bindTooltip(name, {
        permanent: false,
        direction: "center",
        className: "county-tooltip"
      })
      .openTooltip(centerLatLng);
  });

  // Leave: reset style + remove tooltip
  layer.on("mouseout", () => {
    if (map.hasLayer(activePopup)) return;
    resetHighlight(layer);
    layer.closeTooltip();
  });

  // Click: popup with claim/unclaim button
  layer.on("click", () => {
    const isClaimed = !!claimed[id];
    const btnLabel = isClaimed ? "Unclaim Library Card" : "Claim Library Card";

    const popupContent = `
      <div style="text-align:center;">
        <strong>${name}</strong><br>
        <button id="btn-${domId}" class="claim-btn">${btnLabel}</button>
      </div>
    `;

    // Reset previously selected feature
    if (selectedCounty && selectedCounty !== layer) {
      resetHighlight(selectedCounty);
    }

    activePopup.setLatLng(centerLatLng).setContent(popupContent).openOn(map);

    highlightFeature(layer);
    selectedCounty = layer;

    setTimeout(() => {
      const btn = document.getElementById(`btn-${domId}`);
      if (!btn) return;
      btn.onclick = () => {
        if (claimed[id]) {
          unclaimById(id);
        } else {
          claimById(id);
        }
        map.closePopup();
      };
    }, 0);

    map.once("popupclose", () => {
      if (selectedCounty) {
        resetHighlight(selectedCounty);
        selectedCounty = null;
      }
    });
  });
}

// Highlight / reset logic
function highlightFeature(layer) {
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

function resetHighlight(layer) {
  if (selectedCounty === layer) return; // don’t reset if active

  // Use the correct parent GeoJSON layer to reset style
  const parent =
    layer.__parent ||
    (layer._eventParents && Object.values(layer._eventParents)[0]);
  if (parent && parent.resetStyle) {
    parent.resetStyle(layer);
  }

  if (layer._path) {
    layer._path.classList.remove("leaflet-shadow");
  }
}

// Styles (different shades of blue)
const styleCounty = { color: "#1f77b4", weight: 1, fillOpacity: 0.4 };
const styleLibrary = { color: "#2ca02c", weight: 1, fillOpacity: 0.4 };
const styleMultiJurisdictional = { color: "#17becf", weight: 1, fillOpacity: 0.4 };
const styleMunicipal = { color: "#7f7f7f", weight: 1, fillOpacity: 0.4 };
const styleUnresolved = { color: "#aec7e8", weight: 1, fillOpacity: 0.4 };

// Load layers
const countyLayer = new L.GeoJSON.AJAX("County_Library_Districts_10x.geojson", {
  style: styleCounty,
  onEachFeature: onEachFeatureCommon
});
const libraryLayer = new L.GeoJSON.AJAX("Library_Districts_10x.geojson", {
  style: styleLibrary,
  onEachFeature: onEachFeatureCommon
});
const multiLayer = new L.GeoJSON.AJAX("Multi-jurisdictional_Library_Districts_20x.geojson", {
  style: styleMultiJurisdictional,
  onEachFeature: onEachFeatureCommon
});
const municipalLayer = new L.GeoJSON.AJAX("Municipal_Library_Districts_10x.geojson", {
  style: styleMunicipal,
  onEachFeature: onEachFeatureCommon
});
const unresolvedLayer = new L.GeoJSON.AJAX("Unresolved_Library_Service_Areas.geojson", {
  style: styleUnresolved,
  onEachFeature: onEachFeatureCommon
});

// Add all by default
countyLayer.addTo(map);
libraryLayer.addTo(map);
multiLayer.addTo(map);
municipalLayer.addTo(map);
unresolvedLayer.addTo(map);

// Layer controls for toggling
L.control.layers(null, {
  "County Library Districts": countyLayer,
  "Library Districts": libraryLayer,
  "Multi-jurisdictional Districts": multiLayer,
  "Municipal Districts": municipalLayer,
  "Unresolved Areas": unresolvedLayer
}).addTo(map);


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





