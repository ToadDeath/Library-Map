const DISTRICT_DATA_URL = "https://data.colorado.gov/resource/3thw-b7wj.geojson?$limit=1000";
const STATE_LEGAL_INFO_URL = "https://ed.cde.state.co.us/cdelib/librarydevelopment-publiclibraries-legaldocuments";
const STORAGE_KEY = "colorado-library-card-finder.saved.v1";

const map = L.map("map", {
  zoomControl: false,
  scrollWheelZoom: false,
  preferCanvas: true
}).setView([39.0, -105.5], 6);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  subdomains: "abcd",
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);
L.control.zoom({ position: "bottomright" }).addTo(map);

let districtLayer = null;
let districts = [];
let selectedDistrictId = null;
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
  districtPanel: document.getElementById("district-panel"),
  districtName: document.getElementById("district-name"),
  districtSubtitle: document.getElementById("district-subtitle"),
  saveButton: document.getElementById("save-card"),
  eligibility: document.getElementById("eligibility-value"),
  ecard: document.getElementById("ecard-value"),
  libby: document.getElementById("libby-value"),
  officialLink: document.getElementById("official-link")
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

function normalizeFeature(feature) {
  const copy = { ...feature, properties: { ...(feature.properties || {}) } };
  if (!copy.geometry) {
    const wkt = copy.properties.theGeom || copy.properties.THEGEOM || copy.properties.the_geom;
    if (typeof wkt === "string" && window.wellknown) {
      try { copy.geometry = wellknown.parse(wkt); } catch (error) { console.warn("Could not parse district geometry", error); }
    }
  }
  return copy;
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

function showDistrict(feature) {
  selectedDistrictId = districtId(feature);
  districtLayer.setStyle(baseStyle);
  districtLayer.eachLayer(layer => {
    if (districtId(layer.feature) === selectedDistrictId) layer.bringToFront();
  });
  const name = districtName(feature);
  els.districtName.textContent = name;
  els.districtSubtitle.textContent = "Colorado library district";
  els.eligibility.textContent = "Research needed";
  els.ecard.textContent = "Research needed";
  els.libby.textContent = "Research needed";
  els.officialLink.href = STATE_LEGAL_INFO_URL;
  els.officialLink.textContent = "Find official district information ↗";
  els.saveButton.classList.toggle("is-saved", isSaved(selectedDistrictId));
  els.saveButton.textContent = isSaved(selectedDistrictId) ? "✓ Added to my library cards" : "＋ Add to my library cards";
  els.welcomePanel.hidden = true;
  els.districtPanel.hidden = false;
}

function isSaved(id) {
  return savedCards.some(card => card.id === id);
}

function resetSelection() {
  selectedDistrictId = null;
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

function applySearch() {
  const query = els.search.value.trim().toLocaleLowerCase();
  els.clearSearch.hidden = !query;
  if (!districtLayer) return;
  districtLayer.eachLayer(layer => {
    const matches = !query || districtName(layer.feature).toLocaleLowerCase().includes(query);
    layer.setStyle({
      ...baseStyle(layer.feature),
      opacity: matches ? (districtId(layer.feature) === selectedDistrictId ? 1 : 0.88) : 0.12,
      fillOpacity: matches ? (districtId(layer.feature) === selectedDistrictId ? 0.62 : 0.35) : 0.025
    });
  });
}

function zoomToDistrict(feature) {
  const layer = districtLayer.getLayers().find(item => districtId(item.feature) === districtId(feature));
  if (layer && layer.getBounds().isValid()) map.fitBounds(layer.getBounds(), { padding: [45, 45], maxZoom: 10 });
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
    const response = await fetch(DISTRICT_DATA_URL);
    if (!response.ok) throw new Error("The public district boundary service returned " + response.status);
    const data = await response.json();
    if (!data || !Array.isArray(data.features)) throw new Error("The boundary service did not return a GeoJSON feature collection.");
    districts = data.features.map(normalizeFeature).filter(feature => feature.geometry && districtName(feature) !== "Unnamed library district");
    if (!districts.length) throw new Error("No usable district boundaries were returned.");
    districtLayer = L.geoJSON(districts, { style: baseStyle, onEachFeature: onEachDistrict }).addTo(map);
    map.fitBounds(districtLayer.getBounds(), { padding: [25, 25] });
    const countLabel = districts.length + " districts mapped";
    els.districtCount.textContent = countLabel;
    els.welcomeCount.textContent = String(districts.length);
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
  if (districtLayer) map.fitBounds(districtLayer.getBounds(), { padding: [25, 25] });
});
document.getElementById("back-to-overview").addEventListener("click", resetSelection);
els.saveButton.addEventListener("click", () => {
  if (!selectedDistrictId) return;
  if (isSaved(selectedDistrictId)) {
    savedCards = savedCards.filter(card => card.id !== selectedDistrictId);
  } else {
    const feature = districts.find(item => districtId(item) === selectedDistrictId);
    if (feature) savedCards.push({ id: selectedDistrictId, name: districtName(feature) });
  }
  persistSavedCards();
  els.saveButton.classList.toggle("is-saved", isSaved(selectedDistrictId));
  els.saveButton.textContent = isSaved(selectedDistrictId) ? "✓ Added to my library cards" : "＋ Add to my library cards";
});

renderSavedCards();
loadDistricts();
