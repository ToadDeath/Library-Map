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
function toggleClaim(e) {
  var layer = e.target;
  var countyName = layer.feature.properties.FULL;

  if (!countyName) {
    alert("Error: County name undefined.");
    return;
  }

  if (claimedCounties[countyName]) {
    // Already claimed → unclaim it
    var confirmUnclaim = confirm("Do you want to unclaim " + countyName + "?");
    if (confirmUnclaim) {
      delete claimedCounties[countyName];
      geojson.resetStyle(layer);
    }
  } else {
    // Not claimed → claim it
    var confirmClaim = confirm("Do you want to claim " + countyName + "?");
    if (confirmClaim) {
      claimedCounties[countyName] = true;
      geojson.resetStyle(layer);
    }
  }
}

// ------------------ EVENT HANDLER ------------------
function onEachFeature(feature, layer) {
  var countyName = feature.properties.FULL || "Unknown County";
  layer.bindPopup(countyName);

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: toggleClaim
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
