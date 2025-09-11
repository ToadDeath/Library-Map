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
let selectedCounty = null;
let activePopup = null;

function sanitizeId(str) {
  return str.toString().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function onEachFeatureCommon(feature, layer) {
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

  // Hover tooltip
  layer.on("mouseover", () => {
    highlightFeature(layer);
    layer.bindTooltip(name, {
      permanent: false,
      direction: "center",
      className: "county-tooltip"
    }).openTooltip();
  });

  layer.on("mouseout", () => {
    resetHighlight(layer);
    layer.closeTooltip();
  });

  // Click → update sidebar with libraries inside the polygon
  layer.on("click", () => {
    const sidebar = document.getElementById("sidebar");
    const librariesInDistrict = [];

    librariesLayer.eachLayer(l => {
      if (!l.feature) return;
      if (turf.booleanPointInPolygon(l.feature, feature)) {
        librariesInDistrict.push(l.feature.properties);
      }
    });

    let libraryListHtml = "";
    if (librariesInDistrict.length > 0) {
      libraryListHtml = librariesInDistrict.map(lib => `
        <div class="library-entry" data-lib-id="${sanitizeId(lib.name)}">
          <h3>${lib.name}</h3>
          <p><a href="${lib.website}" target="_blank">${lib.website}</a></p>
          <p>${lib.address}</p>
          <button class="claim-btn" data-lib-id="${sanitizeId(lib.name)}">Claim Library Card</button>
        </div>
      `).join("");
    } else {
      libraryListHtml = "<p>No libraries found in this district.</p>";
    }

    sidebar.innerHTML = `
      <h2 id="sidebar-title">${name}</h2>
      <div id="sidebar-content">${libraryListHtml}</div>
    `;
    sidebar.style.display = "block";

    // Toggle claim button logic
    document.querySelectorAll(".claim-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const libId = btn.getAttribute("data-lib-id");
        const entry = document.querySelector(\`.library-entry[data-lib-id="\${libId}"]\`);
        entry.classList.toggle("claimed");
        btn.textContent = entry.classList.contains("claimed")
          ? "Library Card Owned"
          : "Claim Library Card";
      });
    });

    highlightFeature(layer);
    selectedCounty = layer;
  });
}

function highlightFeature(layer) {
  if (layer._path) layer._path.classList.add("hover-highlight");
  if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) layer.bringToFront();
}

function resetHighlight(layer) {
  if (selectedCounty === layer) return;
  const parent = layer._eventParents ? Object.values(layer._eventParents)[0] : null;
  if (parent && parent.resetStyle) parent.resetStyle(layer);
  if (layer._path) layer._path.classList.remove("hover-highlight");
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






