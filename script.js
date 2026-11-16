const DISTRICT_DATA_URL = "./library.zip";
const STATE_LEGAL_INFO_URL = "https://ed.cde.state.co.us/cdelib/librarydevelopment-publiclibraries-legaldocuments";
const OFFICIAL_DISTRICTS_URL = "https://ed.cde.state.co.us/cdelib/librarydevelopment-publiclibraries-legaldocuments";
const STORAGE_KEY = "colorado-library-card-finder.saved.v1";

const COLORADO_BOUNDS = L.latLngBounds([36.95, -109.1], [41.1, -102.0]);
const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: true,
  preferCanvas: true,
  worldCopyJump: false,
  zoomSnap: 0.5,
  zoomDelta: 0.5,
  minZoom: 5.5,
  maxZoom: 16,
  maxBounds: COLORADO_BOUNDS.pad(0.08),
  maxBoundsViscosity: 1
}).fitBounds(COLORADO_BOUNDS, { padding: [24, 24] });

// Lock the current Colorado overview as the furthest-out zoom level.
map.setMinZoom(map.getZoom());

const overviewMinZoom = map.getMinZoom();
function updatePanAvailability() {
  if (map.getZoom() <= overviewMinZoom) {
    map.dragging.disable();
  } else {
    map.dragging.enable();
  }
}
updatePanAvailability();
map.on("zoomend", updatePanAvailability);

// Keep library markers in a dedicated pane above district polygons. The district
// layer uses a canvas renderer, which can otherwise sit over and intercept marker
// hover/click events even where its polygons are visually transparent.
map.createPane("libraryMarkerPane");
map.getPane("libraryMarkerPane").style.zIndex = "625";
const jurisdictionMarkerRenderer = L.svg({ pane: "libraryMarkerPane" });
const jurisdictionMarkerLayer = L.layerGroup().addTo(map);
let jurisdictionMarkers = [];

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16,
  attribution: 'Tiles &copy; Esri',
  bounds: COLORADO_BOUNDS,
  noWrap: true
}).addTo(map);

L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16,
  bounds: COLORADO_BOUNDS,
  noWrap: true,
  attribution: 'Labels &copy; Esri'
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);
map.createPane("maskPane");
map.getPane("maskPane").style.zIndex = "300";
map.createPane("countyPane");
map.getPane("countyPane").style.zIndex = "350";

// Cover the basemap outside Colorado using the state's official boundary.
async function loadColoradoMask() {
  const boundaryUrl = "https://www.cohealthmaps.dphe.state.co.us/arcgis/rest/services/OPEN_DATA/cdphe_geographic_analysis_boundaries/MapServer/9/query?where=1%3D1&outFields=NAME&returnGeometry=true&outSR=4326&f=geojson";
  try {
    const response = await fetch(boundaryUrl);
    if (!response.ok) throw new Error("Colorado boundary request failed: " + response.status);
    const data = await response.json();
    const feature = data.features && data.features[0];
    if (!feature || !feature.geometry) throw new Error("Colorado boundary geometry was missing.");
    // A regional outer ring avoids a world-sized polygon, which can render oddly
    // when the map is zoomed out or the basemap wraps horizontally.
    const world = [[-120, 30], [-95, 30], [-95, 50], [-120, 50], [-120, 30]];
    const geometry = feature.geometry;
    const stateRings = geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.flatMap(polygon => polygon)
        : null;
    if (!stateRings || !stateRings.length) throw new Error("Unsupported Colorado boundary geometry.");
    const mask = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [world, ...stateRings] }
    };
    L.geoJSON(mask, {
      interactive: false,
      renderer: L.svg({ padding: 2 }),
      pane: "maskPane",
      style: { stroke: false, fillColor: "#171d25", fillOpacity: 1, fillRule: "evenodd" }
    }).addTo(map);
    L.geoJSON(feature, {
      interactive: false,
      pane: "maskPane",
      style: { color: "#718091", weight: 1.5, opacity: 0.9, fill: false }
    }).addTo(map);
  } catch (error) {
    console.warn("Could not apply Colorado-only map mask:", error);
  }
}
loadColoradoMask();

// County outlines are a geographic reference only. County borders do not define
// library-card eligibility or imply that every library in a county shares a card.
async function loadCountyBoundaries() {
  try {
    const response = await fetch("./colorado_counties.geojson");
    if (!response.ok) throw new Error("County boundary file returned " + response.status);
    const data = await response.json();
    countyLayer = L.geoJSON(data, {
      interactive: true,
      pane: "countyPane",
      style: { color: "#758292", weight: 0.8, opacity: 0.58, dashArray: "3 5", fill: false },
      onEachFeature: (feature, layer) => {
        const name = feature.properties && (feature.properties.FULL || feature.properties.COUNTY);
        if (name) layer.bindTooltip(name, { className: "county-tooltip", sticky: true });
      }
    }).addTo(map);
  } catch (error) {
    console.warn("Could not load Colorado county reference boundaries:", error);
  }
}
loadCountyBoundaries();

let districtLayer = null;
let countyLayer = null;
let jurisdictionRecords = [];
let districts = [];
let selectedDistrictId = null;
let selectedLibraryId = null;
let selectedLibraryName = null;
let savedCards = loadSavedCards();

const els = {
  search: document.getElementById("district-search"),
  clearSearch: document.getElementById("clear-search"),
  showAll: document.getElementById("show-all"),
  mapError: document.getElementById("map-error"),
  districtCount: document.getElementById("district-count"),
  welcomeCount: document.getElementById("welcome-district-count"),
  savedCount: document.getElementById("saved-count"),
  welcomeSavedCount: document.getElementById("welcome-saved-count"),
  savedHeadingCount: document.getElementById("saved-heading-count"),
  savedList: document.getElementById("saved-list"),
  savedEmpty: document.getElementById("saved-empty"),
  welcomePanel: document.getElementById("welcome-panel"),
  jurisdictionDirectory: document.getElementById("jurisdiction-directory"),
  jurisdictionCount: document.getElementById("jurisdiction-count"),
  districtPanel: document.getElementById("district-panel"),
  districtName: document.getElementById("district-name"),
  districtSubtitle: document.getElementById("district-subtitle"),
  saveButton: document.getElementById("save-card"),
  eligibility: document.getElementById("eligibility-value"),
  ecard: document.getElementById("ecard-value"),
  libby: document.getElementById("libby-value"),
  officialLink: document.getElementById("official-link"),
  systemTypeLabel: document.getElementById("system-type-label")
};

function loadSavedCards() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedCards() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCards));
  renderSavedCards();
}

function districtId(feature) {
  const p = feature.properties || {};
  return String(p.lgid ?? p.LGID ?? p.objectid ?? p.OBJECTID ?? p.id ?? p.ID ?? p.name ?? p.NAME ?? "");
}

function districtName(feature) {
  const p = feature.properties || {};
  return p.name || p.NAME || p.district_name || p.DISTRICT || "Unnamed library district";
}

function normalizeFeature(record) {
  // The Socrata .json endpoint returns rows, not GeoJSON Features.
  // Convert each row into a standard Feature using its the_geom field.
  const isFeature = record && record.type === "Feature";
  const props = isFeature ? { ...(record.properties || {}) } : { ...(record || {}) };
  let geometry = isFeature ? record.geometry : null;

  const rawGeometry = props.the_geom ?? props.theGeom ?? props.THEGEOM ?? props.geometry;
  if (!geometry && rawGeometry && typeof rawGeometry === "object") {
    // Socrata may wrap the actual GeoJSON geometry in a "geometry" property.
    geometry = rawGeometry.type === "Feature" ? rawGeometry.geometry : rawGeometry;
    if (geometry && geometry.geometry && !geometry.coordinates) geometry = geometry.geometry;
  } else if (!geometry && typeof rawGeometry === "string") {
    const parser = window.wellknown || (typeof wellknown !== "undefined" ? wellknown : null);
    if (parser && typeof parser.parse === "function") {
      try {
        geometry = parser.parse(rawGeometry);
      } catch (error) {
        console.warn("Could not parse district geometry for", props.name || props.lgid, error);
      }
    }
  }

  return { type: "Feature", properties: props, geometry };
}

function baseStyle(feature) {
  const isSelected = districtId(feature) === selectedDistrictId;
  return {
    color: isSelected ? "#d2f2df" : "#86c9a4",
    weight: isSelected ? 2.8 : 1.1,
    opacity: isSelected ? 1 : 0.88,
    fillColor: isSelected ? "#80c7a0" : "#4e8667",
    fillOpacity: isSelected ? 0.62 : 0.35
  };
}

function legalBasisLabel(value) {
  const raw = String(value || "").trim();
  const labels = { LD: "Library district", CI: "City or town library", CO: "County library", MJ: "Joint / multijurisdictional library", CC: "City-county library", SD: "School-administered library" };
  return labels[raw.toUpperCase()] || raw || "Public library system";
}
function systemId(record) {
  return "system:" + jurisdictionName(record.attributes || {}).toLocaleLowerCase();
}
function findJurisdictionForDistrict(feature) {
  const key = normalizeDistrictKey(districtName(feature));
  return jurisdictionRecords.find(record => normalizeDistrictKey(jurisdictionName(record.attributes || {})) === key) || null;
}
function findJurisdictionBoundary(record) {
  const key = normalizeDistrictKey(jurisdictionName(record.attributes || {}));
  return districts.find(feature => normalizeDistrictKey(districtName(feature)) === key) || null;
}
function showJurisdiction(record, linkedFeature = null) {
  const a = record.attributes || {};
  const name = jurisdictionName(a);
  selectedLibraryId = systemId(record);
  selectedLibraryName = name;
  selectedDistrictId = linkedFeature ? districtId(linkedFeature) : null;
  if (districtLayer) districtLayer.setStyle(baseStyle);
  if (linkedFeature && districtLayer) districtLayer.eachLayer(layer => {
    if (districtId(layer.feature) === selectedDistrictId) layer.bringToFront();
  });
  const type = legalBasisLabel(a.Legal_Basis || a.USER_Organization_Legal_Basis || a.USER_Type);
  const county = a.County || a.USER_County || "";
  const city = a.USER_City || "";
  els.districtName.textContent = name;
  els.systemTypeLabel.textContent = type.toLocaleUpperCase();
  els.districtSubtitle.textContent = [city, county ? county + " County" : ""].filter(Boolean).join(" · ") || "Colorado public library system";
  els.eligibility.textContent = "Check with library";
  els.ecard.textContent = "Not yet verified";
  els.libby.textContent = "Not yet verified";
  const website = a.USER_URL;
  const hasWebsite = website && /^https?:\/\//i.test(website);
  els.officialLink.href = hasWebsite ? website : STATE_LEGAL_INFO_URL;
  els.officialLink.textContent = hasWebsite ? "Visit library website ↗" : "Find state library information ↗";
  els.saveButton.classList.toggle("is-saved", isSaved(selectedLibraryId));
  els.saveButton.textContent = isSaved(selectedLibraryId) ? "✓ Added to my library cards" : "＋ Add to my library cards";
  els.welcomePanel.hidden = true;
  els.districtPanel.hidden = false;
}
function showDistrict(feature) {
  const record = findJurisdictionForDistrict(feature);
  if (record) { showJurisdiction(record, feature); return; }
  selectedDistrictId = districtId(feature);
  selectedLibraryId = "district:" + selectedDistrictId;
  selectedLibraryName = districtName(feature);
  districtLayer.setStyle(baseStyle);
  districtLayer.eachLayer(layer => { if (districtId(layer.feature) === selectedDistrictId) layer.bringToFront(); });
  els.districtName.textContent = districtName(feature);
  els.systemTypeLabel.textContent = "LIBRARY DISTRICT";
  els.districtSubtitle.textContent = "Boundary shown; matching system record not available";
  els.eligibility.textContent = "Check with library";
  els.ecard.textContent = "Not yet verified";
  els.libby.textContent = "Not yet verified";
  els.officialLink.href = STATE_LEGAL_INFO_URL;
  els.officialLink.textContent = "Find state library information ↗";
  els.saveButton.classList.toggle("is-saved", isSaved(selectedLibraryId));
  els.saveButton.textContent = isSaved(selectedLibraryId) ? "✓ Added to my library cards" : "＋ Add to my library cards";
  els.welcomePanel.hidden = true;
  els.districtPanel.hidden = false;
}
function isSaved(id) {
  return savedCards.some(card => card.id === id);
}

function resetSelection() {
  selectedDistrictId = null;
  selectedLibraryId = null;
  selectedLibraryName = null;
  if (districtLayer) districtLayer.setStyle(baseStyle);
  els.districtPanel.hidden = true;
  els.welcomePanel.hidden = false;
}

function renderSavedCards() {
  const count = savedCards.length;
  els.savedCount.textContent = count + (count === 1 ? " saved card" : " saved cards");
  els.welcomeSavedCount.textContent = String(count);
  els.savedHeadingCount.textContent = String(count);
  els.savedEmpty.hidden = count > 0;
  els.savedList.replaceChildren();
  savedCards.forEach(card => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = card.name;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", "Remove " + card.name + " from my library cards");
    remove.addEventListener("click", () => {
      savedCards = savedCards.filter(item => item.id !== card.id);
      persistSavedCards();
      if (selectedDistrictId === card.id) {
        els.saveButton.classList.remove("is-saved");
        els.saveButton.textContent = "＋ Add to my library cards";
      }
    });
    li.append(name, remove);
    els.savedList.append(li);
  });
}

function normalizeDistrictKey(value) {
  return String(value || "").toLocaleLowerCase()
    .replaceAll("county", "")
    .replaceAll("regional", "")
    .replaceAll("public", "")
    .replaceAll("library", "")
    .replaceAll("district", "")
    .replaceAll("no.", "")
    .replace(/[^a-z0-9]/g, "");
}

const JURISDICTION_DATA_URL = "https://gis.colorado.gov/public/rest/services/CDE/Libraries/MapServer/0/query?where=1%3D1&outFields=Library%2CLibrary_1%2CLibrary_12%2CLegal_Basis%2CLSA_Population%2CTotal_Central_and_Branches%2CCounty%2CUSER_County%2CUSER_URL%2CUSER_Address%2CUSER_City%2CUSER_Phone%2CUSER_Type%2CUSER___of_branches%2CUSER_Organization%2CUSER_Organization_Legal_Basis&returnGeometry=true&outSR=4326&f=json";

function jurisdictionName(attributes) {
  return attributes.Library || attributes.Library_1 || attributes.Library_12 ||
    attributes.USER_Organization || "Unnamed public library jurisdiction";
}

function renderJurisdictionMarkers() {
  jurisdictionMarkerLayer.clearLayers();
  jurisdictionMarkers = [];
  jurisdictionRecords.forEach(record => {
    const geometry = record.geometry;
    if (!geometry || !Number.isFinite(geometry.x) || !Number.isFinite(geometry.y)) return;
    const a = record.attributes || {};
    const name = jurisdictionName(a);
    const marker = L.circleMarker([geometry.y, geometry.x], {
      radius: 5,
      color: "#eaf2ff",
      weight: 1.4,
      opacity: 1,
      fillColor: "#65b8ff",
      fillOpacity: 0.95,
      pane: "libraryMarkerPane",
      renderer: jurisdictionMarkerRenderer,
      interactive: true,
      bubblingMouseEvents: false
    });
    const details = [a.USER_Address, [a.USER_City, a.USER_State].filter(Boolean).join(", "), a.USER_County || a.County].filter(Boolean);
    marker.bindTooltip(name, {
      direction: "top",
      offset: [0, -7],
      sticky: true,
      opacity: 1,
      className: "jurisdiction-tooltip"
    });
    const popup = document.createElement("div");
    const popupTitle = document.createElement("strong");
    popupTitle.textContent = name;
    popup.append(popupTitle);
    details.forEach(detail => {
      const line = document.createElement("div");
      line.textContent = detail;
      popup.append(line);
    });
    if (a.USER_URL && /^https?:\/\//i.test(a.USER_URL)) {
      const link = document.createElement("a");
      link.href = a.USER_URL;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Library website";
      popup.append(link);
    }
    marker.bindPopup(popup);
    marker.on("click", () => showJurisdiction(record, findJurisdictionBoundary(record)));
    marker.on("mouseover", () => marker.setStyle({ radius: 7, weight: 2, fillOpacity: 1 }));
    marker.on("mouseout", () => marker.setStyle({ radius: 5, weight: 1.4, fillOpacity: 0.95 }));
    marker.addTo(jurisdictionMarkerLayer);
    jurisdictionMarkers.push({ marker, record });
  });
  applyJurisdictionMarkerSearch();
}

function applyJurisdictionMarkerSearch() {
  const query = els.search.value.trim().toLocaleLowerCase();
  jurisdictionMarkers.forEach(({ marker, record }) => {
    const a = record.attributes || {};
    const searchable = [jurisdictionName(a), a.Legal_Basis, a.County, a.USER_County,
      a.USER_City, a.USER_Type].filter(Boolean).join(" ").toLocaleLowerCase();
    const matches = !query || searchable.includes(query);
    marker.setStyle({ opacity: matches ? 0.95 : 0.12, fillOpacity: matches ? 0.9 : 0.04 });
  });
}

function renderJurisdictionDirectory() {
  if (!els.jurisdictionDirectory) return;
  const query = els.search.value.trim().toLocaleLowerCase();
  const entries = jurisdictionRecords.filter(record => {
    const a = record.attributes || {};
    const searchable = [jurisdictionName(a), legalBasisLabel(a.Legal_Basis || a.USER_Organization_Legal_Basis || a.USER_Type), a.County, a.USER_County, a.USER_City].filter(Boolean).join(" ").toLocaleLowerCase();
    return !query || searchable.includes(query);
  }).sort((a, b) => jurisdictionName(a.attributes || {}).localeCompare(jurisdictionName(b.attributes || {})));
  const districtTotal = jurisdictionRecords.filter(record => /^LD$/i.test(String((record.attributes || {}).Legal_Basis || "").trim())).length;
  els.jurisdictionCount.textContent = entries.length + " of " + jurisdictionRecords.length + " systems" + (districtTotal ? " · " + districtTotal + " districts" : "");
  els.jurisdictionDirectory.replaceChildren();
  entries.forEach(record => {
    const a = record.attributes || {};
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "directory-system-button";
    const title = document.createElement("strong");
    title.textContent = jurisdictionName(a);
    const meta = document.createElement("span");
    const type = legalBasisLabel(a.Legal_Basis || a.USER_Organization_Legal_Basis || a.USER_Type);
    const county = a.County || a.USER_County || "";
    const location = [a.USER_City, county ? county + " County" : ""].filter(Boolean).join(" · ");
    const hasBoundary = Boolean(findJurisdictionBoundary(record));
    meta.textContent = [type, location, hasBoundary ? "District boundary mapped" : ""].filter(Boolean).join(" · ");
    button.append(title, meta);
    button.addEventListener("click", () => {
      const boundary = findJurisdictionBoundary(record);
      showJurisdiction(record, boundary);
      const markerEntry = jurisdictionMarkers.find(item => systemId(item.record) === systemId(record));
      if (markerEntry) {
        map.setView(markerEntry.marker.getLatLng(), Math.max(map.getZoom(), 8));
        markerEntry.marker.openPopup();
      } else if (boundary) zoomToDistrict(boundary);
    });
    li.append(button);
    els.jurisdictionDirectory.append(li);
  });
  if (!entries.length) {
    const li = document.createElement("li");
    li.className = "directory-no-results";
    li.textContent = "No matching public library systems.";
    els.jurisdictionDirectory.append(li);
  }
}
async function loadJurisdictions() {
  try {
    // This Colorado State GIS layer is a jurisdiction-level inventory, not an
    // outlet-level branch list. Keep it separate from physical library markers.
    const response = await fetch(JURISDICTION_DATA_URL);
    if (!response.ok) throw new Error("Library jurisdiction inventory returned " + response.status);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw new Error("Unexpected library jurisdiction data format.");
    const unique = new Map();
    data.features.forEach(feature => {
      const a = feature.attributes || {};
      const name = jurisdictionName(a);
      if (name !== "Unnamed public library jurisdiction") unique.set(name.toLocaleLowerCase(), feature);
    });
    jurisdictionRecords = [...unique.values()];
    // Preserve cards saved under the previous district-only interface by matching
    // their displayed names to the unified library-system records.
    let migrated = false;
    savedCards = savedCards.map(card => {
      const match = jurisdictionRecords.find(record =>
        normalizeDistrictKey(jurisdictionName(record.attributes || {})) === normalizeDistrictKey(card.name)
      );
      if (match && card.id !== systemId(match)) {
        migrated = true;
        return { id: systemId(match), name: jurisdictionName(match.attributes || {}) };
      }
      return card;
    });
    if (migrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCards));
      renderSavedCards();
    }
    renderJurisdictionMarkers();
    renderJurisdictionDirectory();
  } catch (error) {
    console.warn("Could not load Colorado public library jurisdiction inventory:", error);
    if (els.jurisdictionCount) els.jurisdictionCount.textContent = "Inventory unavailable";
    if (els.jurisdictionDirectory) {
      const li = document.createElement("li");
      li.className = "directory-no-results";
      li.textContent = "The state library inventory could not be loaded. Use the official Colorado library standards for the current jurisdiction breakdown.";
      els.jurisdictionDirectory.replaceChildren(li);
    }
  }
}

function applySearch() {
  const query = els.search.value.trim().toLocaleLowerCase();
  els.clearSearch.hidden = !query;
  if (districtLayer) {
    districtLayer.eachLayer(layer => {
      const matches = !query || districtName(layer.feature).toLocaleLowerCase().includes(query);
      layer.setStyle({
        ...baseStyle(layer.feature),
        opacity: matches ? (districtId(layer.feature) === selectedDistrictId ? 1 : 0.88) : 0.12,
        fillOpacity: matches ? (districtId(layer.feature) === selectedDistrictId ? 0.62 : 0.35) : 0.025
      });
    });
  }
  applyJurisdictionMarkerSearch();
  renderJurisdictionDirectory();
}

function zoomToDistrict(feature) {
  const matchingLayers = districtLayer.getLayers().filter(item => districtId(item.feature) === districtId(feature));
  if (matchingLayers.length) {
    const bounds = L.featureGroup(matchingLayers).getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 10 });
  }
}

function onEachDistrict(feature, layer) {
  layer.bindTooltip(districtName(feature), { className: "district-tooltip", sticky: true });
  layer.on({
    mouseover: () => {
      if (districtId(feature) !== selectedDistrictId) layer.setStyle({ weight: 2, fillOpacity: 0.52 });
    },
    mouseout: () => {
      if (districtId(feature) !== selectedDistrictId) layer.setStyle(baseStyle(feature));
      applySearch();
    },
    click: () => {
      showDistrict(feature);
      zoomToDistrict(feature);
    }
  });
}

async function loadDistricts() {
  try {
    if (typeof window.shp !== "function") {
      throw new Error("The shapefile parser did not load. Please refresh and try again.");
    }
    // Parse the locally hosted official GIS ZIP into GeoJSON in the browser.
    const data = await window.shp(DISTRICT_DATA_URL);
    // shpjs returns a GeoJSON FeatureCollection when the ZIP contains one shapefile.
    const records = Array.isArray(data) ? data : (data && Array.isArray(data.features) ? data.features : null);
    if (!records) throw new Error("The boundary service returned an unexpected data format.");
    districts = records.map(normalizeFeature).filter(feature =>
      feature.geometry &&
      Array.isArray(feature.geometry.coordinates) &&
      districtName(feature) !== "Unnamed library district"
    );
    if (!districts.length) {
      const sample = records[0] ? Object.keys(records[0]).join(", ") : "no records";
      throw new Error("The service returned " + records.length + " records, but none had usable geometry. Fields in first record: " + sample);
    }
    districtLayer = L.geoJSON(districts, { renderer: L.canvas(), smoothFactor: 5, style: baseStyle, onEachFeature: onEachDistrict }).addTo(map);
    const districtCount = new Set(districts.map(feature => normalizeDistrictKey(districtName(feature)))).size;
    els.welcomeCount.textContent = String(districtCount);
    applySearch();
  } catch (error) {
    console.error("Failed to load Colorado library district boundaries:", error);
    els.mapError.hidden = false;
    els.mapError.textContent = "The library district map could not load. Please try refreshing. " + error.message;
    els.districtCount.textContent = "Map unavailable";
  }
}

els.search.addEventListener("input", applySearch);
els.clearSearch.addEventListener("click", () => {
  els.search.value = "";
  applySearch();
  els.search.focus();
});
els.showAll.addEventListener("click", () => {
  resetSelection();
  els.search.value = "";
  applySearch();
  map.fitBounds(COLORADO_BOUNDS, { padding: [24, 24] });
});
document.getElementById("back-to-overview").addEventListener("click", resetSelection);
els.saveButton.addEventListener("click", () => {
  if (!selectedLibraryId) return;
  if (isSaved(selectedLibraryId)) savedCards = savedCards.filter(card => card.id !== selectedLibraryId);
  else savedCards.push({ id: selectedLibraryId, name: selectedLibraryName || "Library system" });
  persistSavedCards();
  els.saveButton.classList.toggle("is-saved", isSaved(selectedLibraryId));
  els.saveButton.textContent = isSaved(selectedLibraryId) ? "✓ Added to my library cards" : "＋ Add to my library cards";
});

renderSavedCards();
loadDistricts();
loadJurisdictions();
