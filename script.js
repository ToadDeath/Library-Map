// ------------------ MAP INITIALIZATION ------------------
var map = L.map('map').setView([39.0, -105.5], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// ------------------ CLAIMED COUNTIES STATE ------------------
var claimedCounties = {}; // Tracks which counties are claimed

// ------------------ STYLE HANDLER ------------------
function style(feature) {
  return {
    fillColor: claimedCounties[feature.properties.FULL] ? 'orange' : 'lightblue',
    weight: 2,
    opacity: 1,
    color: 'white',
    dashArray: '3',
    fillOpacity: 0.7
  };
}

// ------------------ HIGHLIGHT & RESET ------------------
function highlightFeature(e) {
  var layer = e.target;
  layer.setStyle({
    weight: 3,
    color: '#666',
    dashArray: '',
    fillOpacity: 0.9
  });
  layer.bringToFront();
}

function resetHighlight(e) {
  geojson.resetStyle(e.target);
}

// ------------------ TOGGLE CLAIM ------------------
function toggleClaim(countyName, layer) {
  if (claimedCounties[countyName]) {
    delete claimedCounties[countyName]; // unclaim
  } else {
    claimedCounties[countyName] = true; // claim
  }
  geojson.resetStyle(layer); // refresh style
  layer.closePopup();        // close popup after clicking
}

// ------------------ EVENT HANDLER ------------------
function onEachFeature(feature, layer) {
  var countyName = feature.properties.FULL || "Unknown County";

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: function () {
      let isClaimed = claimedCounties[countyName] || false;
      let buttonLabel = isClaimed ? "Unclaim" : "Claim Library Card";

      // Leaflet popup with a button
      let popupContent = `
        <strong>${countyName}</strong><br>
        <button id="toggle-${countyName.replace(/\s+/g, '-')}">${buttonLabel}</button>
      `;

      layer.bindPopup(popupContent).openPopup();

      // attach button click after popup is rendered
      setTimeout(() => {
        let btn = document.getElementById(`toggle-${countyName.replace(/\s+/g, '-')}`);
        if (btn) {
          btn.addEventListener('click', () => toggleClaim(countyName, layer));
        }
      }, 50);
    }
  });
}

// ------------------ LOAD GEOJSON ------------------
var geojson;
fetch('colorado_counties.geojson')
  .then(response => response.json())
  .then(data => {
    geojson = L.geoJson(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);
  });
