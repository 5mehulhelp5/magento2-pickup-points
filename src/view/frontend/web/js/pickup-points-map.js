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
  /** @type {string|null} */
  var mapProvider = null;
  var markerClusterGroup = null;
  var activeInfoPoint = null;
  var activeInfoMarker = null;
  var mapConfig = {};

  /**
   * Leaflet L.Icon popupAnchor Y (negative = popup opens higher above iconAnchor).
   * Must stay in sync with .leaflet-marker-icon border + padding in pickup-points.css (4px border, ~4px padding).
   */
  var LEAFLET_ICON_POPUP_ANCHOR_Y = -48;

  /**
   * Escape a string for use in an HTML attribute value.
   *
   * @param {string} value
   * @returns {string}
   */
  var escapeHtmlAttr = function (value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  };

  /**
   * Max pixel size for the long edge of carrier marker images (pin + list parity).
   */
  var MARKER_ICON_MAX_PX = 40;

  /**
   * Compute scaled dimensions preserving aspect ratio (max edge = maxPx).
   *
   * @param {number} naturalWidth
   * @param {number} naturalHeight
   * @param {number} maxPx
   * @returns {{w: number, h: number}}
   */
  var scaleToMaxBox = function (naturalWidth, naturalHeight, maxPx) {
    var w = naturalWidth;
    var h = naturalHeight;
    if (!w || !h || w <= 0 || h <= 0) {
      return { w: maxPx, h: maxPx };
    }
    if (w >= h) {
      return { w: maxPx, h: Math.max(1, Math.round((maxPx * h) / w)) };
    }
    return { w: Math.max(1, Math.round((maxPx * w) / h)), h: maxPx };
  };

  return {
    /**
     * Google Maps InfoWindow instance (also exposed as this.infoWindow for destroy/update consistency).
     * @type {google.maps.InfoWindow|null}
     */
    infoWindow: null,

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
            popupAnchor: [0, LEAFLET_ICON_POPUP_ANCHOR_Y],
          });
        }
        return null;
      }

      // Create icon based on map type
      if (mapType === "google" || mapType === "google_maps") {
        // Prefer natural aspect ratio when the image is already decoded (cache hit).
        var gW = MARKER_ICON_MAX_PX;
        var gH = MARKER_ICON_MAX_PX;
        var preImg = new Image();
        preImg.src = markerIconUrl;
        if (preImg.complete && preImg.naturalWidth > 0 && preImg.naturalHeight > 0) {
          var gDim = scaleToMaxBox(preImg.naturalWidth, preImg.naturalHeight, MARKER_ICON_MAX_PX);
          gW = gDim.w;
          gH = gDim.h;
        }
        return {
          url: markerIconUrl,
          scaledSize: new google.maps.Size(gW, gH),
          anchor: new google.maps.Point(Math.round(gW / 2), gH),
        };
      }

      // Leaflet: L.divIcon so the logo keeps aspect ratio inside the circular pin (L.icon forces a stretched img box).
      var safeSrc = escapeHtmlAttr(markerIconUrl);
      return L.divIcon({
        className: "leaflet-marker-icon leaflet-zoom-animated leaflet-interactive innosend-pickup-div-marker",
        html:
          '<div class="innosend-pickup-marker-icon-inner"><img src="' +
          safeSrc +
          '" alt="" /></div>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, LEAFLET_ICON_POPUP_ANCHOR_Y],
      });
    },

    /**
     * Determine whether the pickup points list is currently visible.
     * Used to adjust Leaflet popup autopan padding so the selected pin stays centered
     * when the map is in full-width (list-hidden) mode on mobile.
     *
     * @returns {boolean}
     */
    isPickupPointsListVisible: function () {
      var listEl = document.querySelector(".innosend-pickup-points-modal .pickup-points-list-container");
      if (!listEl) {
        // Default to visible to keep reserved padding conservative.
        return true;
      }
      return !listEl.classList.contains("list-hidden");
    },

    /**
     * Leaflet popup padding for auto-pan.
     * When the list is visible we reserve the left column so the popup doesn't overlap it.
     * When the list is hidden we reduce padding to avoid panning the map away from the selected pin.
     *
     * @returns {number[]}
     */
    getAutoPanPaddingTopLeft: function () {
      var isVisible = mapConfig && typeof mapConfig.listVisible === "boolean" ? mapConfig.listVisible : this.isPickupPointsListVisible();
      var leftPadding = isVisible ? 496 : 25;
      return [leftPadding, 25];
    },

    /**
     * Enable Leaflet popup auto-pan only when the list column is visible.
     * When the list is hidden we rely on our explicit `setView` recentering instead.
     *
     * @returns {boolean}
     */
    getAutoPanEnabled: function () {
      return mapConfig && typeof mapConfig.listVisible === "boolean" ? mapConfig.listVisible : this.isPickupPointsListVisible();
    },

    /**
     * Update popup autopan padding for existing Leaflet markers.
     *
     * @param {boolean} isVisible
     */
    setListVisible: function (isVisible) {
      mapConfig.listVisible = !!isVisible;

      if (!this.markers || !Array.isArray(this.markers)) {
        return;
      }

      var self = this;
      var paddingTopLeft = this.getAutoPanPaddingTopLeft();

      this.markers.forEach(function (marker) {
        if (!marker || typeof marker.getPopup !== "function") {
          return;
        }

        var popup = marker.getPopup();
        if (popup && popup.options) {
          popup.options.autoPan = !!isVisible;
          popup.options.autoPanPaddingTopLeft = paddingTopLeft;
        }
      });
    },

    /**
     * True when the live DOM node for elementId is still the map's container (reuse path).
     *
     * @param {HTMLElement|null} el
     * @param {boolean} isGoogle
     * @returns {boolean}
     */
    isMapContainerReusable: function (el, isGoogle) {
      if (!el || !mapInstance) {
        return false;
      }
      var sameLeaflet =
        mapProvider === "leaflet" && !isGoogle && typeof mapInstance.invalidateSize === "function";
      var sameGoogle =
        mapProvider === "google" &&
        isGoogle &&
        typeof google !== "undefined" &&
        typeof google.maps !== "undefined" &&
        mapInstance instanceof google.maps.Map;
      if (!sameLeaflet && !sameGoogle) {
        return false;
      }
      if (sameGoogle && typeof mapInstance.getDiv === "function") {
        return mapInstance.getDiv() === el;
      }
      if (sameLeaflet && typeof mapInstance.getContainer === "function") {
        return mapInstance.getContainer() === el;
      }
      return false;
    },

    /**
     * Create a Google Maps marker for the given pickup point and wire its
     * click handler / selection-popup behavior. Returns the created marker
     * (AdvancedMarkerElement when available, falling back to google.maps.Marker).
     *
     * @param {Object} point
     * @param {Object|null} selectedPoint
     * @returns {Object|null}
     */
    createGoogleMarker: function (point, selectedPoint) {
      if (typeof google === "undefined" || typeof google.maps === "undefined") {
        return null;
      }
      var self = this;
      var position = new google.maps.LatLng(parseFloat(point.latitude), parseFloat(point.longitude));
      var markerIcon = this.createMarkerIcon(point, "google");
      var marker;

      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        var markerContent = null;
        if (markerIcon && markerIcon.url) {
          var iconImg = document.createElement("img");
          iconImg.src = markerIcon.url;
          var advW = markerIcon.scaledSize && markerIcon.scaledSize.width ? markerIcon.scaledSize.width : 40;
          var advH = markerIcon.scaledSize && markerIcon.scaledSize.height ? markerIcon.scaledSize.height : 40;
          iconImg.style.width = advW + "px";
          iconImg.style.height = advH + "px";
          iconImg.style.objectFit = "contain";
          markerContent = iconImg;
        }
        marker = new google.maps.marker.AdvancedMarkerElement({
          position: position,
          map: mapInstance,
          title: point.name,
          content: markerContent,
        });
        if (!window.innosendMarkerData) {
          window.innosendMarkerData = new Map();
        }
        window.innosendMarkerData.set(marker, point);
      } else {
        marker = new google.maps.Marker({
          position: position,
          map: mapInstance,
          title: point.name,
          icon: markerIcon,
          pickupPoint: point,
        });
      }

      var infoContent = this.createInfoWindowContent(point);
      marker.addListener("click", function () {
        if (self.openInfoWindow) {
          self.openInfoWindow(marker, infoContent, point);
        }
        if (mapConfig && mapConfig.onMarkerClick) {
          mapConfig.onMarkerClick(point);
        }
      });

      if (selectedPoint && selectedPoint.id === point.id && self.openInfoWindow) {
        setTimeout(function () {
          self.openInfoWindow(marker, infoContent, point);
        }, 200);
      }

      return marker;
    },

    /**
     * Resolve a sane fallback map center from mapConfig.fallbackCenter.
     * Returns null when no usable center is configured.
     *
     * @returns {{latitude: number, longitude: number, zoom: number}|null}
     */
    resolveFallbackCenter: function () {
      var raw = mapConfig && mapConfig.fallbackCenter ? mapConfig.fallbackCenter : null;
      if (!raw) {
        return null;
      }
      var lat = parseFloat(raw.latitude);
      var lng = parseFloat(raw.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return null;
      }
      var zoom = parseInt(raw.zoom, 10);
      if (Number.isNaN(zoom) || zoom <= 0) {
        zoom = 11;
      }
      return { latitude: lat, longitude: lng, zoom: zoom };
    },

    /**
     * Initialize map
     */
    initMap: function (elementId, pickupPoints, selectedPoint, config) {
      mapConfig = $.extend({}, mapConfig, config || {});
      var mapType = mapConfig.mapType || "open_maps";
      var isGoogle = mapType === "google_maps";

      if (mapInstance) {
        var el = document.getElementById(elementId);
        if (this.isMapContainerReusable(el, isGoogle)) {
          if (typeof this.setListVisible === "function" && typeof mapConfig.listVisible === "boolean") {
            this.setListVisible(mapConfig.listVisible);
          }
          if (typeof this.setChooseButtonEnabled === "function") {
            this.setChooseButtonEnabled(!!mapConfig.showChooseButton);
          }
          this.refreshMapForModalOpen(elementId, pickupPoints, selectedPoint, mapConfig);
          return;
        }
        // Provider changed or map is bound to a removed/replaced container — full teardown only then (not on modal close).
        this.destroyMap();
      }

      if (isGoogle) {
        this.initGoogleMap(elementId, pickupPoints, selectedPoint, mapConfig);
      } else {
        this.initOpenStreetMap(elementId, pickupPoints, selectedPoint, mapConfig);
      }
    },

    /**
     * After the pickup modal is shown again, fix map size and sync markers without recreating the map.
     *
     * @param {string} elementId
     * @param {Array} pickupPoints
     * @param {Object|null} selectedPoint
     * @param {Object} config merged map config (may include filteredPickupPoints)
     */
    refreshMapForModalOpen: function (elementId, pickupPoints, selectedPoint, config) {
      var self = this;
      var cfg = config || mapConfig || {};
      var filtered =
        cfg.filteredPickupPoints !== undefined && Array.isArray(cfg.filteredPickupPoints)
          ? cfg.filteredPickupPoints
          : pickupPoints;

      var run = function () {
        // First pass: tiles/layout after container became visible (display:none → block).
        self.refreshMapViewport(null);
        self.updateMap(pickupPoints, selectedPoint, filtered);
        setTimeout(function () {
          self.refreshMapViewport(selectedPoint || null);
        }, 120);
      };

      // After modal open: wait until layout/paint so dimensions are non-zero (200–350ms range).
      setTimeout(run, 280);
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
        script.src =
          "https://maps.googleapis.com/maps/api/js?key=" +
          apiKey +
          "&callback=" +
          callbackName +
          "&loading=async&libraries=marker";
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
      var self = this;
      var mapElement = document.getElementById(elementId);
      if (!mapElement) {
        return;
      }

      var fallbackCenter = this.resolveFallbackCenter();
      var safePoints = Array.isArray(pickupPoints) ? pickupPoints : [];

      // Calculate center and bounds
      var bounds = new google.maps.LatLngBounds();
      var centerLat = 0;
      var centerLng = 0;
      var validPoints = 0;

      safePoints.forEach(function (point) {
        if (point.latitude && point.longitude) {
          var lat = parseFloat(point.latitude);
          var lng = parseFloat(point.longitude);
          bounds.extend(new google.maps.LatLng(lat, lng));
          centerLat += lat;
          centerLng += lng;
          validPoints++;
        }
      });

      // When the API returned no pickup points for the shipping address, fall
      // back to the geocoded shipping coordinates (or a country center) so the
      // customer can still drag the map and search nearby areas.
      if (validPoints === 0 && !fallbackCenter) {
        return;
      }

      // Center on selected point if available, otherwise center of all points,
      // otherwise on the fallback center.
      var center;
      var initialZoom = 17;
      if (selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        center = new google.maps.LatLng(parseFloat(selectedPoint.latitude), parseFloat(selectedPoint.longitude));
      } else if (validPoints > 0) {
        center = new google.maps.LatLng(centerLat / validPoints, centerLng / validPoints);
      } else {
        center = new google.maps.LatLng(fallbackCenter.latitude, fallbackCenter.longitude);
        initialZoom = fallbackCenter.zoom || 11;
      }

      // Create map
      var mapOptions = {
        center: center,
        zoom: initialZoom,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
      };

      // Add Map ID if provided (required for AdvancedMarkerElement)
      if (mapConfig.googleMapsMapId && mapConfig.googleMapsMapId.trim() !== "") {
        mapOptions.mapId = mapConfig.googleMapsMapId;
      }

      mapInstance = new google.maps.Map(mapElement, mapOptions);
      mapProvider = "google";

      // Add zoom change listener for Google Maps
      google.maps.event.addListener(mapInstance, "zoom_changed", function () {
        // Zoom level tracking can be added here if needed
      });

      // Helper function to open InfoWindow for Google Maps markers
      // Store it on self so it's available in updateMap and other functions
      if (!self.openInfoWindow) {
        self.openInfoWindow = function (marker, content, point) {
          // Only proceed if Google Maps is available
          if (typeof google === "undefined" || typeof google.maps === "undefined") {
            return;
          }

          if (self.infoWindow) {
            self.infoWindow.close();
          }
          self.infoWindow = new google.maps.InfoWindow({
            content: content,
          });
          activeInfoPoint = point || null;
          activeInfoMarker = marker || null;

          // Bind choose button after Google renders InfoWindow DOM.
          // This supports the same behavior as Leaflet when list is closed on desktop.
          if (mapConfig && mapConfig.onChoosePickupPoint) {
            google.maps.event.addListenerOnce(self.infoWindow, "domready", function () {
              var chooseBtn = document.querySelector(".innosend-choose-pickup-point");
              if (!chooseBtn || !activeInfoPoint) {
                return;
              }

              chooseBtn.addEventListener(
                "click",
                function (ev) {
                  if (ev && typeof ev.preventDefault === "function") {
                    ev.preventDefault();
                  }
                  if (ev && typeof ev.stopPropagation === "function") {
                    ev.stopPropagation();
                  }
                  mapConfig.onChoosePickupPoint(activeInfoPoint);
                },
                { once: true }
              );
            });
          }

          // Use new API for AdvancedMarkerElement, old API for Marker
          if (google.maps.marker && marker instanceof google.maps.marker.AdvancedMarkerElement) {
            // For AdvancedMarkerElement, use anchor property with shouldFocus: false
            // This ensures the InfoWindow is positioned correctly above the marker
            self.infoWindow.open({
              anchor: marker,
              map: mapInstance,
              shouldFocus: false,
            });
          } else {
            // For old Marker class
            self.infoWindow.open(mapInstance, marker);
          }
        };
      }

      // Fit bounds only if no selected point, otherwise center on selected point
      if (selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        // Center on selected point
        // Only use Google Maps API if it's available
        if (typeof google !== "undefined" && typeof google.maps !== "undefined" &&
            mapInstance.getZoom && typeof mapInstance.getZoom === "function") {
          var selectedPosition = new google.maps.LatLng(
            parseFloat(selectedPoint.latitude),
            parseFloat(selectedPoint.longitude)
          );
          mapInstance.setCenter(selectedPosition);
          mapInstance.setZoom(17);
        } else {
          // Leaflet
          mapInstance.setView([parseFloat(selectedPoint.latitude), parseFloat(selectedPoint.longitude)], 17);
        }
      } else if (validPoints > 1) {
        // Only fit bounds if no selected point
        // Check if it's Google Maps or Leaflet
        if (typeof google !== "undefined" && typeof google.maps !== "undefined" &&
            mapInstance.getZoom && typeof mapInstance.getZoom === "function") {
          // Google Maps
          mapInstance.fitBounds(bounds);
          // Ensure minimum zoom level of 17 after fitBounds
          google.maps.event.addListenerOnce(mapInstance, "bounds_changed", function () {
            if (mapInstance.getZoom() < 17) {
              mapInstance.setZoom(17);
            }
          });
        } else {
          // Leaflet
          mapInstance.fitBounds(bounds);
        }
      }

      // Create markers
      this.markers = [];

      safePoints.forEach(
        function (point) {
          if (!point.latitude || !point.longitude) {
            return;
          }

          var position = new google.maps.LatLng(parseFloat(point.latitude), parseFloat(point.longitude));

          // Create marker using AdvancedMarkerElement (recommended by Google)
          // Fallback to old Marker class if AdvancedMarkerElement is not available
          var markerIcon = self.createMarkerIcon(point, "google");
          var marker;

          if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
            // Use AdvancedMarkerElement (new API)
            var markerContent = null;

            // Create custom icon element if we have a marker image
            if (markerIcon && markerIcon.url) {
              var iconImg = document.createElement("img");
              iconImg.src = markerIcon.url;
              var advW =
                markerIcon.scaledSize && markerIcon.scaledSize.width ? markerIcon.scaledSize.width : 40;
              var advH =
                markerIcon.scaledSize && markerIcon.scaledSize.height ? markerIcon.scaledSize.height : 40;
              iconImg.style.width = advW + "px";
              iconImg.style.height = advH + "px";
              iconImg.style.objectFit = "contain";
              markerContent = iconImg;
            }

            marker = new google.maps.marker.AdvancedMarkerElement({
              position: position,
              map: mapInstance,
              title: point.name,
              content: markerContent,
            });

            // Store pickupPoint data in Map (AdvancedMarkerElement doesn't support custom properties)
            if (!window.innosendMarkerData) {
              window.innosendMarkerData = new Map();
            }
            window.innosendMarkerData.set(marker, point);
          } else {
            // Fallback to old Marker class (deprecated but still works)
            marker = new google.maps.Marker({
              position: position,
              map: mapInstance,
              title: point.name,
              icon: markerIcon,
              pickupPoint: point,
            });
          }

          // Create info window content
          var infoContent = this.createInfoWindowContent(point);

          // Add click listener
          marker.addListener("click", function () {
            // Use helper function to open InfoWindow
            self.openInfoWindow(marker, infoContent, point);

            // Trigger marker click callback
            if (mapConfig.onMarkerClick) {
              mapConfig.onMarkerClick(point);
            }
          });

          // Open info window for selected point on initial load
          if (selectedPoint && selectedPoint.id === point.id) {
            // Use setTimeout to ensure map is centered before opening InfoWindow
            setTimeout(function () {
              self.openInfoWindow(marker, infoContent, point);
            }, 200);
          }

          this.markers.push(marker);
        }.bind(this)
      );

      // Trigger background pickup reload after user stops interacting (Google Maps parity with Leaflet moveend/zoomend).
      if (mapConfig && mapConfig.onMapMove) {
        google.maps.event.addListener(mapInstance, "idle", function () {
          if (!mapConfig.onMapMove || !mapInstance || typeof mapInstance.getBounds !== "function") {
            return;
          }
          var currentBounds = mapInstance.getBounds();
          if (currentBounds) {
            mapConfig.onMapMove(currentBounds);
          }
        });
      }
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
     * Load Leaflet CSS
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
      var mapElement = document.getElementById(elementId);
      if (!mapElement) {
        return;
      }

      var fallbackCenter = this.resolveFallbackCenter();
      var safePoints = Array.isArray(pickupPoints) ? pickupPoints : [];

      // Map teardown is handled by destroyMap() when switching providers or disposing; do not remove here.

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

      safePoints.forEach(function (point) {
        if (point.latitude && point.longitude) {
          var lat = parseFloat(point.latitude);
          var lng = parseFloat(point.longitude);
          bounds.push([lat, lng]);
          centerLat += lat;
          centerLng += lng;
          validPoints++;
        }
      });

      // When the API returned no pickup points for the shipping address, fall
      // back to the geocoded shipping coordinates (or a country center) so the
      // customer can still drag the map and search nearby areas.
      if (validPoints === 0 && !fallbackCenter) {
        return;
      }

      // Center on selected point if available, otherwise center on the points,
      // otherwise on the fallback center.
      var center;
      var initialZoom = 13;
      if (selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        center = [parseFloat(selectedPoint.latitude), parseFloat(selectedPoint.longitude)];
      } else if (validPoints > 0) {
        center = [centerLat / validPoints, centerLng / validPoints];
      } else {
        center = [fallbackCenter.latitude, fallbackCenter.longitude];
        initialZoom = fallbackCenter.zoom || 11;
      }

      // Check if Leaflet is available (L is loaded via RequireJS)
      if (typeof L === "undefined") {
        return;
      }

      // Create map
      mapInstance = L.map(elementId, {
        center: center,
        zoom: initialZoom,
        minZoom: 1,
        maxZoom: 19,
        zoomControl: false, // We'll add it manually to ensure it's visible
        attributionControl: true,
      });
      mapProvider = "leaflet";

      // Add zoom control explicitly (top-left position)
      L.control
        .zoom({
          position: "topleft",
        })
        .addTo(mapInstance);

      // Add tile layer
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

      this.bindMarkerClusterCarrierFilterHooks();

      // Create markers
      this.markers = [];
      var self = this;
      var selectedMarker = null;

      safePoints.forEach(function (point) {
        if (!point.latitude || !point.longitude) {
          return;
        }

        var position = [parseFloat(point.latitude), parseFloat(point.longitude)];

        // Create marker icon using mark_image from courier.images.mark
        var icon = self.createMarkerIcon(point, "leaflet");

        // Configure popup options - standard Leaflet positioning above marker
        var popupOptions = {
          autoPan: self.getAutoPanEnabled(),
          autoPanPaddingTopLeft: self.getAutoPanPaddingTopLeft(), // Space for list on left (or none when list hidden)
          autoPanPaddingBottomRight: [50, 50],
          className: "innosend-pickup-popup",
          maxWidth: 350,
          minWidth: 300,
          // Override Leaflet default [0, 7] so tip stays centered above the pin (with icon popupAnchor)
          offset: L.point(5, 0),
        };

        var marker = L.marker(position, { icon: icon }).bindPopup(self.createInfoWindowContent(point), popupOptions);

        // Store point data on marker for later reference
        marker.pickupPoint = point;

        // Bind "Choose this pickup-point" button click when the popup opens.
        marker.on("popupopen", function (e) {
          if (!e || !e.popup || !mapConfig || !mapConfig.onChoosePickupPoint) {
            return;
          }

          var popupNode = e.popup.getElement ? e.popup.getElement() : null;
          if (!popupNode) {
            popupNode = e.popup._contentNode || null;
          }
          if (!popupNode) {
            return;
          }

          var chooseBtn = popupNode.querySelector(".innosend-choose-pickup-point");
          if (!chooseBtn) {
            return;
          }

          // (Re)bind on every popup open; using once avoids stacking handlers.
          chooseBtn.addEventListener(
            "click",
            function (ev) {
              if (ev && typeof ev.preventDefault === "function") {
                ev.preventDefault();
              }
              if (ev && typeof ev.stopPropagation === "function") {
                ev.stopPropagation();
              }
              mapConfig.onChoosePickupPoint(point);
            },
            { once: true }
          );
        });

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

      // Desktop-only: when list is closed, show an explicit button in the popup.
      // This is used for both Leaflet and Google InfoWindow content.
      if (mapConfig && mapConfig.showChooseButton && point && point.id != null) {
        var chooseLabel = $t("Choose this Pickup Point");
        content +=
          "<button type='button' class='choose-pickup-point innosend-choose-pickup-point' data-pickup-point-id='" +
          this.escapeHtml(String(point.id)) +
          "'>" +
          this.escapeHtml(chooseLabel) +
          "</button>";
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
     * Schedule a callback after the next paint(s). Avoids Leaflet popup setContent → _adjustPan
     * while map panes are still inconsistent right after invalidateSize / CSS transitions.
     *
     * @param {function(): void} fn
     */
    runAfterMapLayoutPaint: function (fn) {
      if (typeof fn !== "function") {
        return;
      }
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(function () {
          window.requestAnimationFrame(fn);
        });
      } else {
        window.setTimeout(fn, 50);
      }
    },

    /**
     * Leaflet: setContent triggers update → _adjustPan, which throws if map panes are not ready.
     *
     * @param {Object|null} popup Leaflet Popup instance
     * @param {string} html
     * @returns {boolean} true if content was applied without error
     */
    safeLeafletPopupSetContent: function (popup, html) {
      if (!popup || typeof popup.setContent !== "function") {
        return false;
      }
      try {
        popup.setContent(html);
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Enable/disable the "Choose this pickup-point" button inside popup content.
     * Works for both Leaflet popups and Google InfoWindow.
     *
     * @param {boolean} enabled
     */
    setChooseButtonEnabled: function (enabled) {
      mapConfig.showChooseButton = !!enabled;
      var self = this;
      this.runAfterMapLayoutPaint(function () {
        self.updateChooseButtonInPopups();
      });
    },

    /**
     * Re-render popup content so the choose button shows/hides immediately.
     * Leaflet markers store their pickup point on marker.pickupPoint.
     * For Google, update currently open InfoWindow content if available.
     */
    updateChooseButtonInPopups: function (isRetry) {
      if (!this.markers || !Array.isArray(this.markers)) {
        return;
      }

      var self = this;
      var leafletRetry = false;

      this.markers.forEach(function (marker) {
        // Only handle Leaflet markers
        if (!marker || typeof marker.getPopup !== "function") {
          return;
        }

        var point = marker.pickupPoint;
        if (!point) {
          return;
        }

        var popup = marker.getPopup();
        if (!popup || typeof popup.setContent !== "function") {
          return;
        }

        var html = self.createInfoWindowContent(point);
        if (!self.safeLeafletPopupSetContent(popup, html)) {
          leafletRetry = mapProvider === "leaflet";
          return;
        }

        // If the popup is currently open, bind the click handler immediately
        // (popupopen won't fire again when only content changes).
        if (mapConfig && mapConfig.onChoosePickupPoint && typeof popup.getElement === "function") {
          var popupNode = popup.getElement();
          if (popupNode) {
            var chooseBtn = popupNode.querySelector(".innosend-choose-pickup-point");
            if (chooseBtn) {
              chooseBtn.addEventListener(
                "click",
                function (ev) {
                  if (ev && typeof ev.preventDefault === "function") {
                    ev.preventDefault();
                  }
                  if (ev && typeof ev.stopPropagation === "function") {
                    ev.stopPropagation();
                  }
                  mapConfig.onChoosePickupPoint(point);
                },
                { once: true }
              );
            }
          }
        }
      });

      if (leafletRetry && !isRetry) {
        window.setTimeout(function () {
          self.updateChooseButtonInPopups(true);
        }, 120);
      }

      // Google Maps: refresh currently open InfoWindow content so button visibility
      // updates immediately when toggling the list on desktop.
      if (activeInfoPoint && this.infoWindow && typeof this.infoWindow.setContent === "function") {
        try {
          this.infoWindow.setContent(this.createInfoWindowContent(activeInfoPoint));
        } catch (e) {
          // ignore
        }
      }
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
     * Re-apply carrier filter visibility to every marker (Leaflet + Google).
     * Call after cluster spiderfy/zoom animations — markercluster resets icon DOM/styles.
     *
     * @param {Array|undefined} filteredPoints - same semantics as updateMap: undefined = no filter; [] = hide all; non-empty = only those ids visible
     */
    applyCarrierFilterVisibilityToAllMarkers: function (filteredPoints) {
      var filteredPointIds = new Set();
      if (filteredPoints && Array.isArray(filteredPoints)) {
        filteredPoints.forEach(function (point) {
          if (point && point.id) {
            filteredPointIds.add(String(point.id));
          }
        });
      }
      var filterListProvided = Array.isArray(filteredPoints);
      var isMarkerVisibleForCarrierFilter = function (id) {
        if (!filterListProvided) {
          return true;
        }
        if (filteredPointIds.size === 0) {
          return false;
        }
        return Boolean(id && filteredPointIds.has(id));
      };

      this.markers.forEach(function (marker) {
        var point;
        if (marker.getLatLng) {
          point = marker.pickupPoint;
        } else if (window.innosendMarkerData && window.innosendMarkerData.has(marker)) {
          point = window.innosendMarkerData.get(marker);
        } else {
          point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);
        }
        var pointId = point && point.id ? String(point.id) : null;
        var isFiltered = isMarkerVisibleForCarrierFilter(pointId);

        if (marker._icon) {
          if (isFiltered) {
            if (marker._icon) {
              marker._icon.style.opacity = "1";
              marker._icon.style.pointerEvents = "auto";
              marker._icon.style.display = "";
              marker._icon.style.visibility = "visible";
              marker._icon.classList.remove("leaflet-zoom-hide");
            }
            if (marker._shadow) {
              marker._shadow.style.opacity = "1";
              marker._shadow.style.display = "";
              marker._shadow.style.visibility = "visible";
              marker._shadow.classList.remove("leaflet-zoom-hide");
            }
            if (marker.setOpacity && typeof marker.setOpacity === "function") {
              marker.setOpacity(1);
            }
          } else {
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
            if (marker.setOpacity && typeof marker.setOpacity === "function") {
              marker.setOpacity(0);
            }
          }
        } else if (marker.map !== undefined || (marker.setVisible && typeof marker.setVisible === "function")) {
          if (marker.map !== undefined) {
            if (isFiltered) {
              marker.map = mapInstance;
            } else {
              marker.map = null;
            }
          } else if (marker.setVisible) {
            marker.setVisible(isFiltered);
          }
        }
      });
    },

    /**
     * Keep carrier-filtered markers hidden after Leaflet.markercluster spiderfy / animations.
     */
    bindMarkerClusterCarrierFilterHooks: function () {
      var self = this;
      if (!markerClusterGroup || typeof markerClusterGroup.on !== "function") {
        return;
      }
      var reapply = function () {
        self.applyCarrierFilterVisibilityToAllMarkers(self._lastCarrierFilteredPoints);
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(function () {
            self.applyCarrierFilterVisibilityToAllMarkers(self._lastCarrierFilteredPoints);
          });
        }
      };
      if (this._innosendOnClusterSpiderfied) {
        markerClusterGroup.off("spiderfied", this._innosendOnClusterSpiderfied);
      }
      if (this._innosendOnClusterUnspiderfied) {
        markerClusterGroup.off("unspiderfied", this._innosendOnClusterUnspiderfied);
      }
      this._innosendOnClusterSpiderfied = reapply;
      this._innosendOnClusterUnspiderfied = reapply;
      markerClusterGroup.on("spiderfied", this._innosendOnClusterSpiderfied);
      markerClusterGroup.on("unspiderfied", this._innosendOnClusterUnspiderfied);
    },

    /**
     * Update map with new selection
     *
     * @param {Object|undefined} options - preserveViewport: keep center/zoom; silentIncremental: keep open popups during background marker updates
     */
    updateMap: function (pickupPoints, selectedPoint, filteredPoints, options) {
      if (!mapInstance) {
        return;
      }

      var self = this;
      var preserveViewport = options && options.preserveViewport === true;
      var silentIncremental = options && options.silentIncremental === true;

      // Close existing info windows and popups
      if (!silentIncremental && this.infoWindow) {
        this.infoWindow.close();
        activeInfoPoint = null;
        activeInfoMarker = null;
      }

      // Close all Leaflet popups
      if (!silentIncremental && mapInstance.closePopup) {
        mapInstance.closePopup();
      }

      // Persist for cluster spiderfy / animation callbacks (they reset marker icon DOM)
      this._lastCarrierFilteredPoints = filteredPoints;

      // Create sets for quick lookup
      var pickupPointIds = new Set();
      if (pickupPoints && Array.isArray(pickupPoints)) {
        pickupPoints.forEach(function (point) {
          if (point && point.id) {
            pickupPointIds.add(String(point.id));
          }
        });
      }

      var existingMarkerIds = new Set();

      // Clear selection styling; drop markers no longer in dataset (visibility: applyCarrierFilterVisibilityToAllMarkers)
      var markersToRemove = [];
      this.markers.forEach(function (marker) {
        var point;
        if (marker.getLatLng) {
          point = marker.pickupPoint;
        } else if (window.innosendMarkerData && window.innosendMarkerData.has(marker)) {
          point = window.innosendMarkerData.get(marker);
        } else {
          point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);
        }
        var pointId = point && point.id ? String(point.id) : null;

        if (pointId) {
          existingMarkerIds.add(pointId);
        }

        if (pointId && !pickupPointIds.has(pointId)) {
          markersToRemove.push(marker);
          return;
        }

        if (marker._icon) {
          marker._icon.classList.remove("selected");
        } else if (marker.content && marker.content.classList) {
          marker.content.classList.remove("selected");
        } else if (marker.getIcon) {
          var rmIconEl = marker.getIcon();
          if (rmIconEl && rmIconEl.element) {
            rmIconEl.element.classList.remove("selected");
          }
        }
      });

      // Remove markers that are no longer in pickupPoints
      markersToRemove.forEach(function (marker) {
        // Remove from cluster group (Leaflet)
        if (markerClusterGroup && markerClusterGroup.hasLayer(marker)) {
          markerClusterGroup.removeLayer(marker);
        }
        // Remove from map if it's directly on map (Leaflet)
        if (mapInstance.hasLayer && mapInstance.hasLayer(marker)) {
          mapInstance.removeLayer(marker);
        }
        // Remove from Google Maps (AdvancedMarkerElement)
        if (marker.map !== undefined) {
          marker.map = null;
        }
        // Remove from Map data if it's an AdvancedMarkerElement
        if (window.innosendMarkerData && window.innosendMarkerData.has(marker)) {
          window.innosendMarkerData.delete(marker);
        }
        // Remove from markers array
        var index = self.markers.indexOf(marker);
        if (index > -1) {
          self.markers.splice(index, 1);
        }
      });

      // Create new markers for pickup points that don't have markers yet.
      // Use the marker implementation that matches the current map provider —
      // creating Leaflet markers on a Google map (or vice versa) leaves
      // orphan markers that later crash setView/setCenter calls.
      if (pickupPoints && Array.isArray(pickupPoints)) {
        var providerIsGoogle = mapProvider === "google";

        pickupPoints.forEach(function (point) {
          if (!point.id || !point.latitude || !point.longitude) {
            return;
          }

          var pointId = String(point.id);
          if (existingMarkerIds.has(pointId)) {
            return;
          }

          if (providerIsGoogle) {
            var googleMarker = self.createGoogleMarker(point, selectedPoint);
            if (googleMarker) {
              self.markers.push(googleMarker);
            }
            return;
          }

          // Leaflet marker (default / open_maps provider)
          var position = [parseFloat(point.latitude), parseFloat(point.longitude)];
          var icon = self.createMarkerIcon(point, "leaflet");
          var popupOptions = {
            autoPan: self.getAutoPanEnabled(),
            autoPanPaddingTopLeft: self.getAutoPanPaddingTopLeft(),
            autoPanPaddingBottomRight: [50, 50],
            className: "innosend-pickup-popup",
            maxWidth: 350,
            minWidth: 300,
            offset: L.point(5, 0),
          };

          var marker = L.marker(position, { icon: icon }).bindPopup(self.createInfoWindowContent(point), popupOptions);
          marker.pickupPoint = point;

          marker.on("popupopen", function (e) {
            if (!e || !e.popup || !mapConfig || !mapConfig.onChoosePickupPoint) {
              return;
            }
            var popupNode = e.popup.getElement ? e.popup.getElement() : null;
            if (!popupNode) {
              popupNode = e.popup._contentNode || null;
            }
            if (!popupNode) {
              return;
            }
            var chooseBtn = popupNode.querySelector(".innosend-choose-pickup-point");
            if (!chooseBtn) {
              return;
            }
            chooseBtn.addEventListener(
              "click",
              function (ev) {
                if (ev && typeof ev.preventDefault === "function") {
                  ev.preventDefault();
                }
                if (ev && typeof ev.stopPropagation === "function") {
                  ev.stopPropagation();
                }
                mapConfig.onChoosePickupPoint(point);
              },
              { once: true }
            );
          });

          marker.on("click", function () {
            if (mapConfig && mapConfig.onMarkerClick) {
              mapConfig.onMarkerClick(point);
            }
          });

          if (markerClusterGroup) {
            markerClusterGroup.addLayer(marker);
          }

          self.markers.push(marker);
        });
      }

      this.applyCarrierFilterVisibilityToAllMarkers(filteredPoints);
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(function () {
          self.applyCarrierFilterVisibilityToAllMarkers(self._lastCarrierFilteredPoints);
        });
      }

      // Find and highlight selected marker
      var selectedMarker = null;
      if (!selectedPoint) {
        return;
      }

      // Always center map on selected point coordinates first (before finding marker)
      // This ensures the map moves even if marker is not found
      if (!preserveViewport && selectedPoint.latitude && selectedPoint.longitude) {
        var selectedLat = parseFloat(selectedPoint.latitude);
        var selectedLng = parseFloat(selectedPoint.longitude);

        // Capability detection rather than checking the global google object —
        // both providers have getZoom, so a loaded google.maps SDK on a Leaflet
        // map would otherwise call non-existent setCenter/setZoom.
        if (typeof mapInstance.setView === "function") {
          // Leaflet
          mapInstance.setView([selectedLat, selectedLng], 16);
        } else if (
          typeof mapInstance.setCenter === "function" &&
          typeof mapInstance.setZoom === "function" &&
          typeof google !== "undefined" &&
          typeof google.maps !== "undefined"
        ) {
          // Google Maps
          var position = new google.maps.LatLng(selectedLat, selectedLng);
          mapInstance.setCenter(position);
          mapInstance.setZoom(17);
        }
      }

      this.markers.forEach(function (marker) {
        // Get point data - different methods for different marker types
        var point;
        if (marker.getLatLng) {
          // Leaflet marker - use pickupPoint property
          point = marker.pickupPoint;
        } else if (window.innosendMarkerData && window.innosendMarkerData.has(marker)) {
          // Google Maps AdvancedMarkerElement - use Map
          point = window.innosendMarkerData.get(marker);
        } else {
          // Google Maps old Marker class or fallback
          point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);
        }

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
          } else if (marker.content) {
            // Google Maps AdvancedMarkerElement
            if (marker.content.classList) {
              marker.content.classList.add("selected");
            } else if (marker.content.style) {
              // Fallback: add visual indicator via style
              marker.content.style.border = "3px solid #007bff";
              marker.content.style.borderRadius = "50%";
            }
          } else if (marker.getIcon) {
            // Google Maps old Marker class
            var iconElement = marker.getIcon();
            if (iconElement && iconElement.element) {
              iconElement.element.classList.add("selected");
            }
          }

          if (!preserveViewport) {
            // Route by the actual map instance, not by the marker shape. A
            // Leaflet marker keeps `getLatLng` even when leaflet-markercluster
            // is loaded alongside a Google map, which would otherwise call
            // mapInstance.setView() on a google.maps.Map.
            var isLeafletMap = typeof mapInstance.setView === "function";
            var isGoogleMap = typeof mapInstance.setCenter === "function" && typeof mapInstance.setZoom === "function";
            var pointLat = selectedPoint && selectedPoint.latitude ? parseFloat(selectedPoint.latitude) : null;
            var pointLng = selectedPoint && selectedPoint.longitude ? parseFloat(selectedPoint.longitude) : null;

            if (isLeafletMap && marker.getLatLng && typeof marker.getLatLng === "function") {
              // Leaflet marker on Leaflet map
              var markerLatLng = marker.getLatLng();
              if (markerLatLng) {
                // Center map on selected marker with zoom level 16 to split clusters
                mapInstance.setView(markerLatLng, 16);
                // Open popup for selected marker (triggers leaflet-pane leaflet-popup-pane)
                if (typeof marker.openPopup === "function") {
                  marker.openPopup();
                }
              }
            } else if (isGoogleMap && marker.getPosition && typeof marker.getPosition === "function") {
              // Google Maps marker (AdvancedMarkerElement or old Marker)
              var position = marker.getPosition();
              // Center map immediately - don't wait
              mapInstance.setCenter(position);
              mapInstance.setZoom(17);
              // Store marker for InfoWindow opening
              selectedMarker = marker;
              // Use setTimeout to ensure map is centered before opening InfoWindow
              setTimeout(function () {
                if (self.openInfoWindow && selectedMarker) {
                  self.openInfoWindow(
                    selectedMarker,
                    self.createInfoWindowContent(point || selectedPoint),
                    point || selectedPoint
                  );
                }
              }, 250);
            } else if (pointLat !== null && pointLng !== null && !Number.isNaN(pointLat) && !Number.isNaN(pointLng)) {
              // Fallback: marker provider doesn't match map provider — center on
              // the selectedPoint coordinates using whichever map API is active.
              if (isGoogleMap && typeof google !== "undefined" && typeof google.maps !== "undefined") {
                mapInstance.setCenter(new google.maps.LatLng(pointLat, pointLng));
                mapInstance.setZoom(17);
                setTimeout(function () {
                  if (self.openInfoWindow && marker) {
                    self.openInfoWindow(marker, self.createInfoWindowContent(selectedPoint), selectedPoint);
                  }
                }, 250);
              } else if (isLeafletMap) {
                mapInstance.setView([pointLat, pointLng], 16);
              }
            }
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

              if (!preserveViewport) {
                // Route by the actual map instance (Leaflet vs Google) to avoid
                // calling Leaflet's setView on a google.maps.Map (and vice versa).
                var fallbackIsLeafletMap = typeof mapInstance.setView === "function";
                var fallbackIsGoogleMap = typeof mapInstance.setCenter === "function" && typeof mapInstance.setZoom === "function";

                if (fallbackIsLeafletMap && marker.getLatLng && typeof marker.getLatLng === "function") {
                  mapInstance.setView(markerLatLng, 16);
                  if (typeof marker.openPopup === "function") {
                    marker.openPopup();
                  }
                } else if (fallbackIsGoogleMap && marker.getPosition && typeof marker.getPosition === "function") {
                  var position = marker.getPosition();
                  mapInstance.setCenter(position);
                  mapInstance.setZoom(17);
                  setTimeout(function () {
                    if (self.openInfoWindow) {
                      self.openInfoWindow(marker, self.createInfoWindowContent(selectedPoint), selectedPoint);
                    }
                  }, 200);
                } else if (fallbackIsLeafletMap) {
                  // Defensive: marker provider mismatch — use Leaflet API with coords.
                  mapInstance.setView([selectedLat, selectedLng], 16);
                } else if (fallbackIsGoogleMap && typeof google !== "undefined" && typeof google.maps !== "undefined") {
                  // Defensive: marker provider mismatch — use Google API with coords.
                  mapInstance.setCenter(new google.maps.LatLng(selectedLat, selectedLng));
                  mapInstance.setZoom(17);
                }
              }
            }
          }
        });
      }

      // Final fallback: if still no marker found, center directly on coordinates and open InfoWindow
      if (!preserveViewport && !selectedMarker && selectedPoint && selectedPoint.latitude && selectedPoint.longitude) {
        var selectedLat = parseFloat(selectedPoint.latitude);
        var selectedLng = parseFloat(selectedPoint.longitude);

        // Check if it's Google Maps or Leaflet
        if (typeof google !== "undefined" && typeof google.maps !== "undefined" &&
            mapInstance.getZoom && typeof mapInstance.getZoom === "function") {
          // Google Maps
          var position = new google.maps.LatLng(selectedLat, selectedLng);
          mapInstance.setCenter(position);
          mapInstance.setZoom(17);

          // Try to find marker again after centering, or create InfoWindow directly
          setTimeout(function () {
            // Try to find the marker one more time
            var foundMarker = null;
            self.markers.forEach(function (marker) {
              var point;
              if (marker.getLatLng) {
                point = marker.pickupPoint;
              } else if (window.innosendMarkerData && window.innosendMarkerData.has(marker)) {
                point = window.innosendMarkerData.get(marker);
              } else {
                point = marker.pickupPoint || (marker.options && marker.options.pickupPoint);
              }

              if (point && point.id && selectedPoint.id && String(point.id) === String(selectedPoint.id)) {
                foundMarker = marker;
              }
            });

            if (foundMarker && self.openInfoWindow) {
              // Found marker, open InfoWindow
              self.openInfoWindow(foundMarker, self.createInfoWindowContent(selectedPoint), selectedPoint);
            } else if (self.openInfoWindow && self.markers.length > 0) {
              // Marker not found, but we have markers - try to find by coordinates
              var closestMarker = null;
              var minDistance = Infinity;

              self.markers.forEach(function (marker) {
                if (marker.getPosition && typeof marker.getPosition === "function") {
                  var markerPos = marker.getPosition();
                  var distance = Math.abs(markerPos.lat() - selectedLat) + Math.abs(markerPos.lng() - selectedLng);
                  if (distance < minDistance) {
                    minDistance = distance;
                    closestMarker = marker;
                  }
                }
              });

              if (closestMarker && minDistance < 0.001) {
                // Found marker by coordinates, open InfoWindow
                self.openInfoWindow(closestMarker, self.createInfoWindowContent(selectedPoint), selectedPoint);
              }
            }
          }, 300);
        } else {
          // Leaflet
          mapInstance.setView([selectedLat, selectedLng], 16);
        }
      }

      // Spiderfy / cluster animations can run after openPopup — re-apply filter once more
      if (markerClusterGroup) {
        window.setTimeout(function () {
          self.applyCarrierFilterVisibilityToAllMarkers(self._lastCarrierFilteredPoints);
        }, 450);
      }
    },

    /**
     * Set map view to specific location
     */
    setMapView: function (center, zoom) {
      if (!mapInstance) {
        return;
      }

      if (typeof google !== "undefined" && typeof google.maps !== "undefined" &&
          mapInstance.getZoom && typeof mapInstance.getZoom === "function") {
        // Google Maps
        mapInstance.setCenter(new google.maps.LatLng(center[0], center[1]));
        mapInstance.setZoom(zoom || 17);
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
     * Current map center (WGS84). Used to pick/sort nearest pickup points to the visible map area.
     *
     * @returns {{lat: number, lng: number}|null}
     */
    getMapCenter: function () {
      if (!mapInstance || typeof mapInstance.getCenter !== "function") {
        return null;
      }

      var c = mapInstance.getCenter();
      if (!c) {
        return null;
      }

      var lat = typeof c.lat === "function" ? c.lat() : c.lat;
      var lng = typeof c.lng === "function" ? c.lng() : c.lng;

      if (lat === undefined || lng === undefined || lat === null || lng === null) {
        return null;
      }

      lat = parseFloat(lat);
      lng = parseFloat(lng);
      if (isNaN(lat) || isNaN(lng)) {
        return null;
      }

      return { lat: lat, lng: lng };
    },

    /**
     * Refresh map viewport after the container was hidden or resized (modal reopen, list toggle).
     * Leaflet: invalidateSize + optional setView; Google: resize event + optional setCenter.
     *
     * @param {Object|null} selectedPoint - When set, recenter on this point; when null, only refresh size.
     */
    refreshMapViewport: function (selectedPoint) {
      this.invalidateSizeAndRecenter(selectedPoint);
    },

    /**
     * Invalidate map size (after container resize) and optionally recenter on selected point.
     * Call after list toggle so the map redraws correctly when the map container grows or shrinks.
     * Zoom level is preserved when recentering (no fitBounds when list is shown again).
     *
     * @param {Object|null} selectedPoint - Pickup point with latitude, longitude (optional). When null, only invalidateSize is called (zoom/center unchanged).
     */
    invalidateSizeAndRecenter: function (selectedPoint) {
      if (!mapInstance) {
        return;
      }

      var isLeaflet = typeof L !== "undefined" && mapInstance.invalidateSize;
      var isGoogle = typeof google !== "undefined" && typeof google.maps !== "undefined" &&
          mapInstance.getZoom && typeof mapInstance.getZoom === "function";

      // Capture current zoom BEFORE invalidateSize/resize so it is not lost or changed by the library
      var currentZoom = null;
      if (isLeaflet && mapInstance.getZoom) {
        currentZoom = mapInstance.getZoom();
      } else if (isGoogle) {
        currentZoom = mapInstance.getZoom();
      }

      if (isLeaflet) {
        mapInstance.invalidateSize();
        if (selectedPoint && selectedPoint.latitude != null && selectedPoint.longitude != null) {
          var lat = parseFloat(selectedPoint.latitude);
          var lng = parseFloat(selectedPoint.longitude);
          var zoom = currentZoom !== null && currentZoom !== undefined ? currentZoom : 16;
          mapInstance.setView([lat, lng], zoom);
        }
        // When list is visible again (no selectedPoint): do not fitBounds - keep current view/zoom
      } else if (isGoogle) {
        google.maps.event.trigger(mapInstance, "resize");
        if (selectedPoint && selectedPoint.latitude != null && selectedPoint.longitude != null) {
          var position = new google.maps.LatLng(
            parseFloat(selectedPoint.latitude),
            parseFloat(selectedPoint.longitude)
          );
          mapInstance.setCenter(position);
          if (currentZoom !== null && currentZoom !== undefined) {
            mapInstance.setZoom(currentZoom);
          } else if (mapInstance.getZoom() < 17) {
            mapInstance.setZoom(17);
          }
        }
      }
    },

    /**
     * Destroy map instance completely. Call only when switching provider, replacing the map DOM node,
     * or disposing the checkout component — not when the pickup modal is merely closed/hidden.
     */
    destroyMap: function () {
      if (this.infoWindow) {
        try {
          if (this.infoWindow.close) {
            this.infoWindow.close();
          }
        } catch (e) {}
        this.infoWindow = null;
      }
      activeInfoPoint = null;
      activeInfoMarker = null;

      if (mapInstance) {
        try {
          var isGoogleMap =
            typeof google !== "undefined" &&
            typeof google.maps !== "undefined" &&
            mapInstance instanceof google.maps.Map;

          if (isGoogleMap) {
            if (this.markers && Array.isArray(this.markers)) {
              this.markers.forEach(function (marker) {
                if (!marker) {
                  return;
                }
                if (marker.map !== undefined) {
                  marker.map = null;
                }
                if (typeof marker.setMap === "function") {
                  marker.setMap(null);
                }
              });
            }
            google.maps.event.clearInstanceListeners(mapInstance);
            mapInstance = null;
          } else {
            if (mapInstance.off) {
              mapInstance.off();
            }
            if (mapInstance.eachLayer) {
              mapInstance.eachLayer(function (layer) {
                mapInstance.removeLayer(layer);
              });
            }
            if (mapInstance.remove) {
              mapInstance.remove();
            }
            mapInstance = null;
          }
        } catch (e) {
          mapInstance = null;
        }
      }

      mapProvider = null;
      this.markers = [];

      // Clear marker cluster group
      if (markerClusterGroup) {
        try {
          markerClusterGroup.clearLayers();
          markerClusterGroup.off();
        } catch (e) {}
        markerClusterGroup = null;
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
