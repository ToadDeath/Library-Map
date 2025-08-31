// Map setup
var map = L.map('map').setView([39.0, -105.5], 9); // zoomed in 1 level more

// Load actual GeoJSON file
fetch('colorado_counties.geojson')  // <-- rename file to avoid %
  .then(response => response.json())
  .then(data => {
    L.geoJSON(data, {
      style: {
        color: "black",
        weight: 1,
        fillColor: "#cccccc",
        fillOpacity: 0.6
      },
      onEachFeature: function (feature, layer) {
        layer.bindPopup("<b>" + feature.properties.NAME + "</b>");
        layer.on('click', function () {
          this.setStyle({
            fillColor: "#66cc66" // claimed color
          });
        });
      }
    }).addTo(map);
  });

