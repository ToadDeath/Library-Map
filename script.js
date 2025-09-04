// ------------------ SECTION 1: MAP INITIALIZATION ------------------
var map = L.map('map', {
  zoomControl: true,
  attributionControl: false
}).setView([40.0, -105.5], 8); // Centered on Colorado

// ------------------ SECTION 2: CLAIMED COUNTIES STATE ------------------
var claimedCounties = {}; // Tracks which counties are claimed

// ------------------ SECTION 3: STYLE HANDLER ------------------
function style(feature) {
  return {
    fillColor: claimedCounties[feature.properties.FULL] ? '#002868' : '#BF0A30', // Blue if claimed, Red if unclaimed
    weight: 2,
    opacity: 1,
    color: 'white', // solid white borders
    dashArray: '', // no dashed lines
    fillOpacity: 0.8
  };
}

// ------------------ SECTION 4: HIGHLIGHT & RESET ------------------
function highlightFeature(e) {
  var layer = e.target;
  layer.setStyle({
    weight: 4,
    color: '#333', // darker gray shadow effect
    dashArray: '',
    fillOpacity: 0.9
  });
  layer.bringToFront();
}

function resetHighlight(e) {
  geojson.resetStyle(e.target);
}

// ------------------ SECTION 5: TOGGLE CLAIM ------------------
function toggleClaim(e) {
  var layer = e.target;
  var countyName = layer.feature.properties.FULL;

  if (!countyName) {
    layer.bindPopup("Error: County name undefined.").openPopup();
    return;
  }

  if (claimedCounties[countyName]) {
    // Already claimed → unclaim it
    delete claimedCounties[countyName];
    geojson.resetStyle(layer);
    layer.bindPopup(countyName + "<br><button onclick='claimCounty(\"" + countyName + "\")'>Claim</button>").openPopup();
  } else {
    // Not claimed → claim it
    claimedCounties[countyName] = true;
    geojson.resetStyle(layer);
    layer.bindPopup(countyName + "<br><button onclick='unclaimCounty(\"" + countyName + "\")'>Unclaim</button>").openPopup();
  }
}

// ------------------ SECTION 6: POPUP BUTTON HELPERS ------------------
function claimCounty(countyName) {
  claimedCounties[countyName] = true;
  geojson.eachLayer(function(layer) {
    if (layer.feature.properties.FULL === countyName) {
      geojson.resetStyle(layer);
      layer.closePopup();
    }
  });
}

function unclaimCounty(countyName) {
  delete claimedCounties[countyName];
  geojson.eachLayer(function(layer) {
    if (layer.feature.properties.FULL === countyName) {
      geojson.resetStyle(layer);
      layer.closePopup();
    }
  });
}

// ------------------ SECTION 7: EVENT HANDLER ------------------
function onEachFeature(feature, layer) {
  var countyName = feature.properties.FULL || "Unknown County";
  layer.bindPopup(countyName + "<br><button onclick='claimCounty(\"" + countyName + "\")'>Claim</button>");

  layer.on({
    mouseover: highlightFeature,
    mouseout: resetHighlight,
    click: toggleClaim
  });
}

// ------------------ SECTION 8: LOAD GEOJSON ------------------
var geojson;
fetch('colorado_counties.geojson')
  .then(response => response.json())
  .then(data => {
    geojson = L.geoJson(data, {
      style: style,
      onEachFeature: onEachFeature
    }).addTo(map);
  });
