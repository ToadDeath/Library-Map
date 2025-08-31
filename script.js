// Example GeoJSON with two "counties"
var counties = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Sample County A" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-105.05,40.26],[-105.05,40.34],[-105.34,40.34],[-105.34,40.26],[-105.05,40.26]
        ]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "Sample County B" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-104.8, 39.9],[-105.0, 39.9],[-105.0, 40.1],[-104.8, 40.1],[-104.8, 39.9]
        ]]
      }
    }
  ]
};

var map = L.map('map').setView([39.5, -105.5], 7);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

function style(feature) {
  return {
    fillColor: "lightblue",
    weight: 2,
    opacity: 1,
    color: "darkblue", // border
    fillOpacity: 0.6
  };
}

function onEachFeature(feature, layer) {
  layer.bindPopup(`
    <b>${feature.properties.name}</b><br>
    <button onclick="claimCounty('${feature.properties.name}')">Claim County</button>
  `);
  layer._countyName = feature.properties.name;
}

var countyLayers = {};

var geojson = L.geoJSON(counties, {
  style: style,
  onEachFeature: function(feature, layer) {
    onEachFeature(feature, layer);
    countyLayers[feature.properties.name] = layer;
  }
}).addTo(map);

function claimCounty(name) {
  var layer = countyLayers[name];
  if (!layer) return;

  var currentColor = layer.options.fillColor;
  layer.setStyle({
    fillColor: currentColor === "orange" ? "lightblue" : "orange"
  });
}