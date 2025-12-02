/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
    'jquery'
], function ($) {
    'use strict';

    var mapInstance = null;
    var markers = [];
    var infoWindow = null;
    var mapConfig = {};

    return {
        /**
         * Initialize map
         */
        initMap: function (elementId, pickupPoints, selectedPoint, config) {
            mapConfig = config || {};
            var mapType = mapConfig.mapType || 'open_maps';

            if (mapType === 'google_maps') {
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
            var apiKey = mapConfig.googleMapsApiKey || '';

            if (!apiKey) {
                console.error('Google Maps API key is required');
                return;
            }

            // Load Google Maps API if not already loaded
            if (typeof google === 'undefined' || typeof google.maps === 'undefined') {
                var callbackName = 'initGoogleMapCallback_' + Date.now();
                var script = document.createElement('script');
                script.src = 'https://maps.googleapis.com/maps/api/js?key=' + apiKey + '&callback=' + callbackName;
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
                center = new google.maps.LatLng(
                    parseFloat(selectedPoint.latitude),
                    parseFloat(selectedPoint.longitude)
                );
            } else {
                center = new google.maps.LatLng(centerLat / validPoints, centerLng / validPoints);
            }

            // Create map
            mapInstance = new google.maps.Map(mapElement, {
                center: center,
                zoom: 13,
                mapTypeId: google.maps.MapTypeId.ROADMAP
            });

            // Fit bounds if multiple points
            if (validPoints > 1) {
                mapInstance.fitBounds(bounds);
            }

            // Create markers
            this.markers = [];
            var self = this;

            pickupPoints.forEach(function (point) {
                if (!point.latitude || !point.longitude) {
                    return;
                }

                var position = new google.maps.LatLng(
                    parseFloat(point.latitude),
                    parseFloat(point.longitude)
                );

                // Create custom icon if logo available
                var icon = null;
                if (point.logo) {
                    icon = {
                        url: point.logo,
                        scaledSize: new google.maps.Size(40, 40),
                        anchor: new google.maps.Point(20, 40)
                    };
                }

                var marker = new google.maps.Marker({
                    position: position,
                    map: mapInstance,
                    title: point.name,
                    icon: icon,
                    pickupPoint: point
                });

                // Create info window content
                var infoContent = this.createInfoWindowContent(point);

                // Add click listener
                marker.addListener('click', function () {
                    if (self.infoWindow) {
                        self.infoWindow.close();
                    }
                    self.infoWindow = new google.maps.InfoWindow({
                        content: infoContent
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
                        content: infoContent
                    });
                    self.infoWindow.open(mapInstance, marker);
                    mapInstance.setCenter(position);
                }

                this.markers.push(marker);
            }.bind(this));
        },

        /**
         * Initialize OpenStreetMap (Leaflet)
         */
        initOpenStreetMap: function (elementId, pickupPoints, selectedPoint, config) {
            if (typeof L === 'undefined') {
                this.loadLeaflet(function () {
                    this.renderOpenStreetMap(elementId, pickupPoints, selectedPoint);
                }.bind(this));
            } else {
                this.renderOpenStreetMap(elementId, pickupPoints, selectedPoint);
            }
        },

        /**
         * Load Leaflet library
         */
        loadLeaflet: function (callback) {
            // Load Leaflet CSS
            if (!$('#leaflet-css').length) {
                $('<link>')
                    .attr('id', 'leaflet-css')
                    .attr('rel', 'stylesheet')
                    .attr('href', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css')
                    .appendTo('head');
            }

            // Load Leaflet JS
            if (!$('#leaflet-js').length) {
                $.getScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', function () {
                    callback();
                });
            } else {
                callback();
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

            // Create map
            mapInstance = L.map(elementId).setView(center, 13);

            // Add tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(mapInstance);

            // Create markers
            this.markers = [];
            var self = this;

            pickupPoints.forEach(function (point) {
                if (!point.latitude || !point.longitude) {
                    return;
                }

                var position = [parseFloat(point.latitude), parseFloat(point.longitude)];

                // Create custom icon if logo available
                var icon = L.icon({
                    iconUrl: point.logo || 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
                    iconSize: [40, 40],
                    iconAnchor: [20, 40],
                    popupAnchor: [0, -40]
                });

                var marker = L.marker(position, { icon: icon })
                    .addTo(mapInstance)
                    .bindPopup(this.createInfoWindowContent(point));

                // Add click listener
                marker.on('click', function () {
                    // Trigger marker click callback
                    if (mapConfig.onMarkerClick) {
                        mapConfig.onMarkerClick(point);
                    }
                });

                // Open popup for selected point
                if (selectedPoint && selectedPoint.id === point.id) {
                    marker.openPopup();
                    mapInstance.setView(position, 13);
                }

                this.markers.push(marker);
            }.bind(this));

            // Fit bounds if multiple points
            if (bounds.length > 1) {
                mapInstance.fitBounds(bounds, { padding: [50, 50] });
            }
        },

        /**
         * Create info window/popup content
         */
        createInfoWindowContent: function (point) {
            var content = '<div class="pickup-point-info-window">';
            content += '<strong>' + this.escapeHtml(point.name || '') + '</strong><br>';
            content += '<span>' + this.escapeHtml(point.address || '') + '</span>';

            if (point.distance) {
                content += '<br><span>Distance: ' + point.distance + ' km</span>';
            }

            if (point.opening_hours && point.opening_hours.length > 0) {
                content += '<div class="business-hours-info">';
                content += '<table class="business-hours-table">';
                content += '<thead><tr><th>Day</th><th>Hours</th></tr></thead>';
                content += '<tbody>';
                point.opening_hours.forEach(function (hours) {
                    var day = hours.day || hours[0] || '';
                    var time = hours.hours || hours[1] || hours || '';
                    content += '<tr><td>' + this.escapeHtml(day) + '</td><td>' + this.escapeHtml(time) + '</td></tr>';
                }.bind(this));
                content += '</tbody></table>';
                content += '</div>';
            }

            content += '</div>';
            return content;
        },

        /**
         * Escape HTML
         */
        escapeHtml: function (text) {
            if (!text) {
                return '';
            }
            var map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, function (m) { return map[m]; });
        },

        /**
         * Update map with new selection
         */
        updateMap: function (pickupPoints, selectedPoint) {
            if (!mapInstance) {
                return;
            }

            // Close existing info windows
            if (this.infoWindow) {
                this.infoWindow.close();
            }

            // Find and highlight selected marker
            var self = this;
            this.markers.forEach(function (marker) {
                var point = marker.pickupPoint || marker.options.pickupPoint;
                if (point && selectedPoint && point.id === selectedPoint.id) {
                    // Open info window/popup for selected marker
                    if (mapInstance.getZoom) {
                        // Google Maps
                        var position = marker.getPosition();
                        mapInstance.setCenter(position);
                        if (self.infoWindow) {
                            self.infoWindow.close();
                        }
                        self.infoWindow = new google.maps.InfoWindow({
                            content: self.createInfoWindowContent(point)
                        });
                        self.infoWindow.open(mapInstance, marker);
                    } else {
                        // Leaflet
                        marker.openPopup();
                        mapInstance.setView(marker.getLatLng(), 13);
                    }
                }
            });
        }
    };
});
