/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define(["jquery", "leaflet", "leaflet-markercluster", "mage/translate"], function ($, L, translateFn) {
  "use strict";

  // Get translate function - mage/translate returns $.mage.__
  // Create a safe wrapper that always returns a function
  var $t = function (text) {
    // Try translateFn first (return value from mage/translate)
    if (translateFn && typeof translateFn === "function") {
      return translateFn(text);
    }
    // Fallback to $.mage.__ if available
    if ($ && $.mage && $.mage.__ && typeof $.mage.__ === "function") {
      return $.mage.__(text);
    }
    // Fallback to original text if no translation available
    return text;
  };

  var mapInstance = null;
  var markers = [];
  var markerClusterGroup = null;
  var infoWindow = null;
  var mapConfig = {};

  return {
    /**
     * Create marker icon for pickup point
     * Uses mark_image from courier.images.mark (as per API reference)
     *
     * @param {Object} point - Pickup point object
     * @param {string} mapType - Map type: 'leaflet' or 'google'
     * @returns {Object|null} - Icon object for the map library or null if no icon available
     */
    createMarkerIcon: function (point, mapType) {
      if (!point) {
        return null;
      }

      // Get marker image from point.mark_image (extracted from courier.images.mark in API)
      // According to API reference: courier.images.mark contains the marker image URL
      var markerIconUrl = point.mark_image || point.logo || null;

      if (!markerIconUrl) {
        // Fallback to default Leaflet marker if no image available
        if (mapType === "leaflet" || !mapType) {
          return L.icon({
            iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40],
          });
        }
        return null;
      }

      // Create icon based on map type
      if (mapType === "google" || mapType === "google_maps") {
        // Google Maps icon
        return {
          url: markerIconUrl,
          scaledSize: new google.maps.Size(40, 40),
          anchor: new google.maps.Point(20, 40),
        };
      } else {
        // Leaflet icon (default)
        return L.icon({
          iconUrl: markerIconUrl,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40],
        });
      }
    },

    /**
     * Initialize map
     */
    initMap: function (elementId, pickupPoints, selectedPoint, config) {
      mapConfig = config || {};
      var mapType = mapConfig.mapType || "open_maps";

      if (mapType === "google_maps") {
        this.initGoogleMap(elementId, pickupPoints, selectedPoint, config);
      } else {
        this.initOpenStreetMap(elementId, pickupPoints, selectedPoint, config);
      }
    },

    /**
     * Initialize Google Maps
     */
    initGoogleMap: function (elementId, pickupPoints, selectedPoint, config) {
      var self = this;
      var apiKey = mapConfig.googleMapsApiKey || "";

      if (!apiKey) {
        return;
      }

      // Load Google Maps API if not already loaded
      if (typeof google === "undefined" || typeof google.maps === "undefined") {
        var callbackName = "initGoogleMapCallback_" + Date.now();
        var script = document.createElement("script");
        script.src = "https://maps.googleapis.com/maps/api/js?key=" + apiKey + "&callback=" + callbackName;
        script.async = true;
        script.defer = true;

        window[callbackName] = function () {
          self.renderGoogleMap(elementId, pickupPoints, selectedPoint);
          delete window[callbackName];
        };

        document.head.appendChild(script);
      } else {
        this.renderGoogleMap(elementId, pickupPoints, selectedPoint);
      }
    },

    /**
     * Render Google Maps
     */
    renderGoogleMap: function (elementId, pickupPoints, selectedPoint) {
      if (!pickupPoints || pickupPoints.length === 0) {
        return;
      }

      var mapElement = document.getElementById(elementId);
      if (!mapElement) {
        return;
      }

      // Calculate center and bounds
      var bounds = new google.maps.LatLngBounds();
      var centerLat = 0;
      var centerLng = 0;
      var validPoints = 0;

      pickupPoints.forEach(function (point) {
        if (point.latitude && point.longitude) {
          var lat = parseFloat(point.latitude);
          var lng = parseFloat(point.longitude);
          bounds.extend(new google.maps.LatLng(lat, lng));
          centerLat += lat;
          centerLng += lng;
          validPoints++;
        }
      });

      if (validPoints === 0) {
        return;
      }

      // Center on selected point if available, otherwise center of all points
      var center;
      if (selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        center = new google.maps.LatLng(parseFloat(selectedPoint.latitude), parseFloat(selectedPoint.longitude));
      } else {
        center = new google.maps.LatLng(centerLat / validPoints, centerLng / validPoints);
      }

      // Create map
      mapInstance = new google.maps.Map(mapElement, {
        center: center,
        zoom: 13,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
      });

      // Fit bounds if multiple points
      if (validPoints > 1) {
        mapInstance.fitBounds(bounds);
      }

      // Create markers
      this.markers = [];
      var self = this;

      pickupPoints.forEach(
        function (point) {
          if (!point.latitude || !point.longitude) {
            return;
          }

          var position = new google.maps.LatLng(parseFloat(point.latitude), parseFloat(point.longitude));

          // Create marker icon using mark_image from courier.images.mark
          var icon = self.createMarkerIcon(point, "google");

          var marker = new google.maps.Marker({
            position: position,
            map: mapInstance,
            title: point.name,
            icon: icon,
            pickupPoint: point,
          });

          // Create info window content
          var infoContent = this.createInfoWindowContent(point);

          // Add click listener
          marker.addListener("click", function () {
            if (self.infoWindow) {
              self.infoWindow.close();
            }
            self.infoWindow = new google.maps.InfoWindow({
              content: infoContent,
            });
            self.infoWindow.open(mapInstance, marker);

            // Trigger marker click callback
            if (mapConfig.onMarkerClick) {
              mapConfig.onMarkerClick(point);
            }
          });

          // Open info window for selected point
          if (selectedPoint && selectedPoint.id === point.id) {
            if (self.infoWindow) {
              self.infoWindow.close();
            }
            self.infoWindow = new google.maps.InfoWindow({
              content: infoContent,
            });
            self.infoWindow.open(mapInstance, marker);
            mapInstance.setCenter(position);
          }

          this.markers.push(marker);
        }.bind(this)
      );
    },

    /**
     * Initialize OpenStreetMap (Leaflet)
     */
    initOpenStreetMap: function (elementId, pickupPoints, selectedPoint, config) {
      // Load Leaflet CSS if not already loaded
      this.loadLeafletCSS();

      // Leaflet is now loaded via RequireJS, so L is available
      if (typeof L === "undefined") {
        return;
      }

      this.renderOpenStreetMap(elementId, pickupPoints, selectedPoint);
    },

    /**
     * Load Leaflet CSS (same version as WordPress plugin)
     */
    loadLeafletCSS: function () {
      if (!$("#leaflet-css").length) {
        $("<link>")
          .attr("id", "leaflet-css")
          .attr("rel", "stylesheet")
          .attr("href", "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css")
          .appendTo("head");
      }
    },

    /**
     * Render OpenStreetMap
     */
    renderOpenStreetMap: function (elementId, pickupPoints, selectedPoint) {
      if (!pickupPoints || pickupPoints.length === 0) {
        return;
      }

      var mapElement = document.getElementById(elementId);
      if (!mapElement) {
        return;
      }

      // If map instance already exists, remove it first to avoid conflicts
      if (mapInstance) {
        try {
          // Remove all event listeners
          mapInstance.off();
          // Remove all layers
          mapInstance.eachLayer(function (layer) {
            mapInstance.removeLayer(layer);
          });
          // Remove the map instance
          mapInstance.remove();
        } catch (e) {}
        mapInstance = null;
      }

      // Clear markers array
      markers = [];

      // Clear marker cluster group
      if (markerClusterGroup) {
        try {
          markerClusterGroup.clearLayers();
          markerClusterGroup.off();
        } catch (e) {}
        markerClusterGroup = null;
      }

      // Clear the map element completely - remove all child nodes and classes
      // This ensures a clean slate for the new map
      mapElement.innerHTML = "";
      mapElement.className = "pickup-points-map";

      // Remove any Leaflet-specific classes that might remain
      var leafletClasses = [
        "leaflet-container",
        "leaflet-touch",
        "leaflet-fade-anim",
        "leaflet-grab",
        "leaflet-touch-drag",
        "leaflet-touch-zoom",
      ];
      leafletClasses.forEach(function (className) {
        mapElement.classList.remove(className);
      });

      var self = this;

      // Calculate center
      var centerLat = 0;
      var centerLng = 0;
      var validPoints = 0;
      var bounds = [];

      pickupPoints.forEach(function (point) {
        if (point.latitude && point.longitude) {
          var lat = parseFloat(point.latitude);
          var lng = parseFloat(point.longitude);
          bounds.push([lat, lng]);
          centerLat += lat;
          centerLng += lng;
          validPoints++;
        }
      });

      if (validPoints === 0) {
        return;
      }

      // Center on selected point if available
      var center;
      if (selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        center = [parseFloat(selectedPoint.latitude), parseFloat(selectedPoint.longitude)];
      } else {
        center = [centerLat / validPoints, centerLng / validPoints];
      }

      // Check if Leaflet is available (L is loaded via RequireJS)
      if (typeof L === "undefined") {
        return;
      }

      // Create map with same settings as WordPress plugin
      mapInstance = L.map(elementId, {
        center: center,
        zoom: 13,
        minZoom: 1,
        maxZoom: 19,
        zoomControl: false, // We'll add it manually to ensure it's visible
        attributionControl: true,
      });

      // Add zoom control explicitly (top-left position, same as WordPress plugin)
      L.control
        .zoom({
          position: "topleft",
        })
        .addTo(mapInstance);

      // Add tile layer (same as WordPress plugin)
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
        maxZoom: 19,
        tileSize: 256,
        zoomOffset: 0,
      }).addTo(mapInstance);

      // Create marker cluster group for better performance with many markers
      // Configured to split clusters earlier by zooming in more
      markerClusterGroup = L.markerClusterGroup({
        maxClusterRadius: 30, // Smaller radius means markers cluster less aggressively
        spiderfyOnMaxZoom: true, // Split cluster into individual markers at max zoom
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true, // Zoom in when clicking on cluster
        disableClusteringAtZoom: 14, // Disable clustering at zoom level 14 and above
        // Custom function to control when to zoom in on cluster click
        spiderfyDistanceMultiplier: 2, // Increase distance between markers when spiderfying
      });

      // Create markers
      this.markers = [];
      var self = this;
      var selectedMarker = null;

      pickupPoints.forEach(function (point) {
        if (!point.latitude || !point.longitude) {
          return;
        }

        var position = [parseFloat(point.latitude), parseFloat(point.longitude)];

        // Create marker icon using mark_image from courier.images.mark
        var icon = self.createMarkerIcon(point, "leaflet");

        // Configure popup options - standard Leaflet positioning above marker
        var popupOptions = {
          autoPan: true,
          autoPanPaddingTopLeft: [496, 25], // Space for list on left, 25px from top
          autoPanPaddingBottomRight: [50, 50],
          className: "innosend-pickup-popup",
          maxWidth: 350,
          minWidth: 300,
        };

        var marker = L.marker(position, { icon: icon }).bindPopup(self.createInfoWindowContent(point), popupOptions);

        // Store point data on marker for later reference
        marker.pickupPoint = point;

        // Add click listener
        marker.on("click", function () {
          // Trigger marker click callback
          if (mapConfig && mapConfig.onMarkerClick) {
            mapConfig.onMarkerClick(point);
          }
        });

        // Store selected marker to open popup and center map
        // Compare IDs as strings to handle type mismatches
        if (selectedPoint && selectedPoint.id && point.id) {
          if (String(selectedPoint.id) === String(point.id)) {
            selectedMarker = marker;
          }
        }

        // Add marker to cluster group
        markerClusterGroup.addLayer(marker);
        self.markers.push(marker);
      });

      // Add cluster group to map
      mapInstance.addLayer(markerClusterGroup);

      // Add event listeners for map movement to update visible pickup points list
      if (mapConfig && mapConfig.onMapMove) {
        mapInstance.on("moveend", function () {
          if (mapConfig.onMapMove) {
            var bounds = mapInstance.getBounds();
            mapConfig.onMapMove(bounds);
          }
        });

        mapInstance.on("zoomend", function () {
          if (mapConfig.onMapMove) {
            var bounds = mapInstance.getBounds();
            mapConfig.onMapMove(bounds);
          }
        });
      }

      // Open popup for selected point and center map
      // Use higher zoom level to split clusters when there are many nearby points
      if (selectedMarker) {
        // Function to open popup and add selected class
        var openSelectedMarkerPopup = function () {
          try {
            var markerLatLng = selectedMarker.getLatLng();
            if (!markerLatLng) {
              return false;
            }

            // Center map first with zoom level 16 to split clusters
            mapInstance.setView(markerLatLng, 16);

            // Wait for map to finish moving/zooming before opening popup
            mapInstance.once("moveend", function () {
              try {
                // Check if marker is still in a cluster
                var markerParent = selectedMarker._parent || selectedMarker.__parent;
                if (markerParent && markerParent.spiderfy) {
                  // Marker is in a cluster, spiderfy it first
                  markerParent.spiderfy();

                  // Wait for spiderfy to complete
                  setTimeout(function () {
                    try {
                      selectedMarker.openPopup();
                      // Add .selected class to marker icon
                      if (selectedMarker._icon && selectedMarker._icon.classList) {
                        selectedMarker._icon.classList.add("selected");
                      }
                    } catch (e) {}
                  }, 300);
                } else {
                  // Marker is not in a cluster, open popup directly
                  selectedMarker.openPopup();
                  // Add .selected class to marker icon
                  if (selectedMarker._icon && selectedMarker._icon.classList) {
                    selectedMarker._icon.classList.add("selected");
                  } else {
                    // Try again after a short delay if icon is not ready
                    setTimeout(function () {
                      if (selectedMarker._icon && selectedMarker._icon.classList) {
                        selectedMarker._icon.classList.add("selected");
                      }
                    }, 200);
                  }
                }
              } catch (e) {}
            });

            return true;
          } catch (e) {
            return false;
          }
        };

        // Wait a bit for the map and markers to be fully rendered before opening popup
        setTimeout(function () {
          if (!openSelectedMarkerPopup()) {
            // Try again after a longer delay if first attempt failed
            setTimeout(function () {
              openSelectedMarkerPopup();
            }, 500);
          }
        }, 300);
      } else {
        // Fit bounds if multiple points
        // Use higher maxZoom to encourage zooming in and splitting clusters
        if (bounds.length > 1) {
          mapInstance.fitBounds(bounds, {
            padding: [50, 50],
            maxZoom: 16, // Increased from 15 to split clusters better
          });
        } else if (bounds.length === 1) {
          // Single point: use zoom level 16
          mapInstance.setView(bounds[0], 16);
        }
      }
    },

    /**
     * Create info window/popup content
     */
    /**
     * Format distance - show meters if under 1km, otherwise show km
     */
    formatDistance: function (distance) {
      if (distance === null || distance === undefined || distance === "") {
        return "";
      }
      var dist = parseFloat(distance);
      if (isNaN(dist)) {
        return "";
      }
      if (dist < 1) {
        // Convert to meters and round to nearest integer
        var meters = Math.round(dist * 1000);
        return meters + " m";
      }
      // Round to 2 decimal places for km
      return dist.toFixed(2) + " km";
    },

    createInfoWindowContent: function (point) {
      var content = '<div class="pickup-point-info-window">';
      content += "<span class='pickup-point-name'>" + this.escapeHtml(point.name || "") + "</span>";
      content += "<span class='pickup-point-address'>" + this.escapeHtml(point.address || "") + "</span>";

      if (point.distance) {
        var formattedDistance = this.formatDistance(point.distance);
        if (formattedDistance) {
          // Use translate function
          var distanceLabel = $t("Distance:");
          content += "<span class='pickup-point-distance'>" + distanceLabel + " " + formattedDistance + "</span>";
        }
      }

      if (point.opening_hours && point.opening_hours.length > 0) {
        content += '<div class="business-hours-info">';
        content += '<table class="business-hours-table">';
        // Use translate function
        var dayLabel = $t("Day");
        var hoursLabel = $t("Business Hours");
        var closedLabel = $t("Closed");
        content += "<thead><tr><th>" + dayLabel + "</th><th>" + hoursLabel + "</th></tr></thead>";
        content += "<tbody>";
        point.opening_hours.forEach(
          function (hours) {
            // Use day_name_short, fallback to day_name_long, then day_of_week, then day
            var day = hours.day_name_short || hours.day_name_long || hours.day || "";
            // Use hours property (merged hours string from backend), fallback to opens/closes
            var time =
              hours.hours ||
              (hours.opens && hours.closes ? hours.opens + " - " + hours.closes : hours.opens || closedLabel) ||
              "";
            content += "<tr><td>" + this.escapeHtml(day) + "</td><td>" + this.escapeHtml(time) + "</td></tr>";
          }.bind(this)
        );
        content += "</tbody></table>";
        content += "</div>";
      }

      content += "</div>";
      return content;
    },

    /**
     * Escape HTML
     */
    escapeHtml: function (text) {
      if (!text) {
        return "";
      }
      var map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      };
      return text.replace(/[&<>"']/g, function (m) {
        return map[m];
      });
    },

    /**
     * Update map with new selection
     */
    updateMap: function (pickupPoints, selectedPoint, filteredPoints) {
      if (!mapInstance) {
        return;
      }

      // Close existing info windows and popups
      if (this.infoWindow) {
        this.infoWindow.close();
      }

      // Close all Leaflet popups
      if (mapInstance.closePopup) {
        mapInstance.closePopup();
      }

      // Create sets for quick lookup
      var pickupPointIds = new Set();
      if (pickupPoints && Array.isArray(pickupPoints)) {
        pickupPoints.forEach(function (point) {
          if (point && point.id) {
            pickupPointIds.add(String(point.id));
          }
        });
      }

      var filteredPointIds = new Set();
      if (filteredPoints && Array.isArray(filteredPoints)) {
        filteredPoints.forEach(function (point) {
          if (point && point.id) {
            filteredPointIds.add(String(point.id));
          }
        });
      }

      var self = this;
      var existingMarkerIds = new Set();

      // First, update existing markers and identify which ones to keep
      var markersToRemove = [];
      this.markers.forEach(function (marker) {
        var point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);
        var pointId = point && point.id ? String(point.id) : null;

        // Track existing marker IDs
        if (pointId) {
          existingMarkerIds.add(pointId);
        }

        // If marker's point is no longer in pickupPoints, mark for removal
        if (pointId && !pickupPointIds.has(pointId)) {
          markersToRemove.push(marker);
          return; // Skip processing this marker
        }

        var isFiltered = filteredPointIds.size === 0 || (pointId && filteredPointIds.has(pointId));

        if (marker._icon) {
          // Leaflet marker
          marker._icon.classList.remove("selected");

          // Show or hide marker using opacity and pointer-events
          // Keep markers in cluster group to maintain functionality
          if (isFiltered) {
            // Marker should be visible
            if (marker._icon) {
              marker._icon.style.opacity = "1";
              marker._icon.style.pointerEvents = "auto";
              marker._icon.style.display = "";
              marker._icon.style.visibility = "visible";
              // Remove any classes that might hide it
              marker._icon.classList.remove("leaflet-zoom-hide");
            }
            if (marker._shadow) {
              marker._shadow.style.opacity = "1";
              marker._shadow.style.display = "";
              marker._shadow.style.visibility = "visible";
              marker._shadow.classList.remove("leaflet-zoom-hide");
            }
            // Use Leaflet's setOpacity method if available
            if (marker.setOpacity && typeof marker.setOpacity === "function") {
              marker.setOpacity(1);
            }
          } else {
            // Marker should be hidden - use opacity 0 and pointer-events none
            // Keep marker in cluster group so it can be shown again easily
            if (marker._icon) {
              marker._icon.style.opacity = "0";
              marker._icon.style.pointerEvents = "none";
              marker._icon.style.display = "none";
              marker._icon.style.visibility = "hidden";
            }
            if (marker._shadow) {
              marker._shadow.style.opacity = "0";
              marker._shadow.style.display = "none";
              marker._shadow.style.visibility = "hidden";
            }
            // Use Leaflet's setOpacity method if available
            if (marker.setOpacity && typeof marker.setOpacity === "function") {
              marker.setOpacity(0);
            }
          }
        } else if (marker.setVisible && typeof marker.setVisible === "function") {
          // Google Maps marker - remove custom class if needed
          var iconElement = marker.getIcon();
          if (iconElement && iconElement.element) {
            iconElement.element.classList.remove("selected");
          }
          // Show or hide Google Maps marker
          if (isFiltered) {
            marker.setVisible(true);
          } else {
            marker.setVisible(false);
          }
        }
      });

      // Remove markers that are no longer in pickupPoints
      markersToRemove.forEach(function (marker) {
        // Remove from cluster group
        if (markerClusterGroup && markerClusterGroup.hasLayer(marker)) {
          markerClusterGroup.removeLayer(marker);
        }
        // Remove from map if it's directly on map
        if (mapInstance.hasLayer && mapInstance.hasLayer(marker)) {
          mapInstance.removeLayer(marker);
        }
        // Remove from markers array
        var index = self.markers.indexOf(marker);
        if (index > -1) {
          self.markers.splice(index, 1);
        }
      });

      // Create new markers for pickup points that don't have markers yet
      if (pickupPoints && Array.isArray(pickupPoints)) {
        pickupPoints.forEach(function (point) {
          if (!point.id || !point.latitude || !point.longitude) {
            return;
          }

          var pointId = String(point.id);

          // Skip if marker already exists
          if (existingMarkerIds.has(pointId)) {
            return;
          }

          // Create new marker
          var position = [parseFloat(point.latitude), parseFloat(point.longitude)];

          // Create marker icon using mark_image from courier.images.mark
          var icon = self.createMarkerIcon(point, "leaflet");

          // Configure popup options to position it correctly
          // List container is on the left: 6rem (96px) + max-width 400px = ~496px
          // Popup should be on the right side, always 25px from top
          var popupOptions = {
            autoPan: true,
            autoPanPaddingTopLeft: [496, 25], // Space for list on left, 25px from top
            autoPanPaddingBottomRight: [50, 50],
            offset: [0, -40], // Offset from marker
            className: "innosend-pickup-popup",
            maxWidth: 350,
            minWidth: 300,
          };

          var marker = L.marker(position, { icon: icon }).bindPopup(self.createInfoWindowContent(point), popupOptions);

          // Store point data on marker for later reference
          marker.pickupPoint = point;

          // Position popup to the right when opened
          marker.on("popupopen", function (e) {
            if (e.popup) {
              self.positionPopupRight(e.popup, marker);
            }
          });

          // Add click listener
          marker.on("click", function () {
            // Trigger marker click callback
            if (mapConfig && mapConfig.onMarkerClick) {
              mapConfig.onMarkerClick(point);
            }
          });

          // Add marker to cluster group
          if (markerClusterGroup) {
            markerClusterGroup.addLayer(marker);
          }

          // Add to markers array
          self.markers.push(marker);
        });
      }

      // Find and highlight selected marker
      var selectedMarker = null;
      if (!selectedPoint) {
        return;
      }

      this.markers.forEach(function (marker) {
        var point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);

        // Compare by ID if available, otherwise by position
        var isSelected = false;
        if (point && point.id && selectedPoint.id) {
          isSelected = String(point.id) === String(selectedPoint.id);
        } else if (point && point.latitude && point.longitude && selectedPoint.latitude && selectedPoint.longitude) {
          // Fallback: compare by coordinates
          var pointLat = parseFloat(point.latitude);
          var pointLng = parseFloat(point.longitude);
          var selectedLat = parseFloat(selectedPoint.latitude);
          var selectedLng = parseFloat(selectedPoint.longitude);
          isSelected = Math.abs(pointLat - selectedLat) < 0.0001 && Math.abs(pointLng - selectedLng) < 0.0001;
        }

        if (isSelected) {
          selectedMarker = marker;

          // Add .selected class to marker icon
          if (marker._icon) {
            // Leaflet marker - wait for icon to be rendered if needed
            if (marker._icon.classList) {
              marker._icon.classList.add("selected");
            } else {
              // Icon might not be rendered yet, try again after a short delay
              setTimeout(function () {
                if (marker._icon && marker._icon.classList) {
                  marker._icon.classList.add("selected");
                }
              }, 100);
            }
          } else if (marker.getIcon) {
            // Google Maps marker
            var iconElement = marker.getIcon();
            if (iconElement && iconElement.element) {
              iconElement.element.classList.add("selected");
            }
          }

          // Center map on selected marker
          // Check if it's a Leaflet marker (has getLatLng method) or Google Maps marker (has getPosition method)
          if (marker.getLatLng && typeof marker.getLatLng === "function") {
            // Leaflet marker
            var markerLatLng = marker.getLatLng();
            if (markerLatLng) {
              // Center map on selected marker with zoom level 16 to split clusters
              mapInstance.setView(markerLatLng, 16);
              // Open popup for selected marker (triggers leaflet-pane leaflet-popup-pane)
              marker.openPopup();
            }
          } else if (marker.getPosition && typeof marker.getPosition === "function") {
            // Google Maps marker
            var position = marker.getPosition();
            mapInstance.setCenter(position);
            mapInstance.setZoom(15);
            if (self.infoWindow) {
              self.infoWindow.close();
            }
            self.infoWindow = new google.maps.InfoWindow({
              content: self.createInfoWindowContent(point || selectedPoint),
            });
            self.infoWindow.open(mapInstance, marker);
          }
        }
      });

      // If no marker found but we have selectedPoint, try to find by coordinates
      if (!selectedMarker && selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        var selectedLat = parseFloat(selectedPoint.latitude);
        var selectedLng = parseFloat(selectedPoint.longitude);

        this.markers.forEach(function (marker) {
          var markerLatLng = marker.getLatLng ? marker.getLatLng() : marker.getPosition ? marker.getPosition() : null;
          if (markerLatLng) {
            var lat =
              markerLatLng.lat || (typeof markerLatLng.lat === "function" ? markerLatLng.lat() : markerLatLng.lat);
            var lng =
              markerLatLng.lng || (typeof markerLatLng.lng === "function" ? markerLatLng.lng() : markerLatLng.lng);
            if (Math.abs(lat - selectedLat) < 0.0001 && Math.abs(lng - selectedLng) < 0.0001) {
              selectedMarker = marker;

              // Add .selected class
              if (marker._icon) {
                if (marker._icon.classList) {
                  marker._icon.classList.add("selected");
                } else {
                  setTimeout(function () {
                    if (marker._icon && marker._icon.classList) {
                      marker._icon.classList.add("selected");
                    }
                  }, 100);
                }
              }

              // Center and open popup
              // Check if it's a Leaflet marker (has getLatLng method) or Google Maps marker (has getPosition method)
              if (marker.getLatLng && typeof marker.getLatLng === "function") {
                // Leaflet marker
                // Use zoom level 16 to split clusters
                mapInstance.setView(markerLatLng, 16);
                marker.openPopup();
              } else if (marker.getPosition && typeof marker.getPosition === "function") {
                // Google Maps marker
                var position = marker.getPosition();
                mapInstance.setCenter(position);
                mapInstance.setZoom(15);
                if (self.infoWindow) {
                  self.infoWindow.close();
                }
                self.infoWindow = new google.maps.InfoWindow({
                  content: self.createInfoWindowContent(selectedPoint),
                });
                self.infoWindow.open(mapInstance, marker);
              }
            }
          }
        });
      }
    },

    /**
     * Set map view to specific location
     */
    setMapView: function (center, zoom) {
      if (!mapInstance) {
        return;
      }

      if (mapInstance.getZoom) {
        // Google Maps
        mapInstance.setCenter(new google.maps.LatLng(center[0], center[1]));
        mapInstance.setZoom(zoom || 13);
      } else {
        // Leaflet
        mapInstance.setView(center, zoom || 13);
      }
    },

    /**
     * Get current map zoom level
     */
    getMapZoom: function () {
      if (!mapInstance) {
        return null;
      }

      if (mapInstance.getZoom) {
        // Google Maps
        return mapInstance.getZoom();
      } else {
        // Leaflet
        return mapInstance.getZoom ? mapInstance.getZoom() : null;
      }
    },

    /**
     * Destroy map instance completely
     */
    destroyMap: function () {
      if (mapInstance) {
        try {
          // Remove all event listeners
          if (mapInstance.off) {
            mapInstance.off();
          }
          // Remove all layers
          if (mapInstance.eachLayer) {
            mapInstance.eachLayer(function (layer) {
              mapInstance.removeLayer(layer);
            });
          }
          // Remove the map instance
          if (mapInstance.remove) {
            mapInstance.remove();
          }
        } catch (e) {}
        mapInstance = null;
      }

      // Clear markers array
      markers = [];

      // Clear marker cluster group
      if (markerClusterGroup) {
        try {
          markerClusterGroup.clearLayers();
          markerClusterGroup.off();
        } catch (e) {}
        markerClusterGroup = null;
      }

      // Clear info window
      if (infoWindow) {
        try {
          if (infoWindow.close) {
            infoWindow.close();
          }
        } catch (e) {}
        infoWindow = null;
      }

      // Clear map element
      const mapElement = document.getElementById("innosend-pickup-points-map");
      if (mapElement) {
        mapElement.innerHTML = "";
        mapElement.className = "pickup-points-map";
        // Remove any Leaflet-specific classes
        var leafletClasses = [
          "leaflet-container",
          "leaflet-touch",
          "leaflet-fade-anim",
          "leaflet-grab",
          "leaflet-touch-drag",
          "leaflet-touch-zoom",
        ];
        leafletClasses.forEach(function (className) {
          mapElement.classList.remove(className);
        });
      }
    },
  };
});
