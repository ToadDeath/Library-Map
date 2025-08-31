// script.js

// initialize map
var map = L.map('map').setView([39.0, -105.5], 8);

// basemap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// store claimed counties
var claimed = {};

// style function for counties
function style(feature) {
  let id = feature.properties.NAME; // change if your GeoJSON uses different property
  return {
    fillColor: claimed[id] ? '#66c2a5' : '#fee08b', // claimed = greenish, unclaimed = yellow
    weight: 1,
    opacity: 1,
    color: '#333',
    fillOpacity: 0.7
  };
}

// update style when toggled
function updateStyle(layer) {
  layer.setStyle(style(layer.feature));
}

// on each county
function onEachFeature(feature, layer) {
  let id = feature.properties.NAME;

  layer.on('click', function () {
    let isClaimed = claimed[id] || false;
    let buttonLabel = isClaimed ? "Unclaim" : "Claim Library Card";

    let popupContent = `
      <strong>${id} County</strong><br>
      <button id="toggle-${id}">${buttonLabel}</button>
    `;

    layer.bindPopup(popupContent).openPopup();

    // wait for DOM render then attach button click
    setTimeout(() => {
      document.getElementById(`toggle-${id}`).addEventListener('click', () => {
        claimed[id] = !isClaimed; // toggle claim
        updateStyle(layer); // refresh color
        layer.closePopup(); // close popup after clicking
      });
    }, 10);
  });
}

// load GeoJSON
fetch('colorado_counties.geojson')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);
  });

