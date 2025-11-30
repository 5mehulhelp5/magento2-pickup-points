/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
    'jquery'
], function ($) {
    'use strict';

    return {
        /**
         * Initialize OpenStreetMap
         */
        initMap: function (elementId, pickupPoints, selectedPoint) {
            if (typeof L === 'undefined') {
                // Load Leaflet (OpenStreetMap library)
                this.loadLeaflet(function () {
                    this.renderMap(elementId, pickupPoints, selectedPoint);
                }.bind(this));
            } else {
                this.renderMap(elementId, pickupPoints, selectedPoint);
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
         * Render map with pickup points
         */
        renderMap: function (elementId, pickupPoints, selectedPoint) {
            if (!pickupPoints || pickupPoints.length === 0) {
                return;
            }

            var map = L.map(elementId).setView([52.3676, 4.9041], 13); // Default to Amsterdam

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);

            var bounds = [];
            pickupPoints.forEach(function (point) {
                if (point.latitude && point.longitude) {
                    var marker = L.marker([point.latitude, point.longitude])
                        .addTo(map)
                        .bindPopup('<strong>' + point.name + '</strong><br>' + point.address);

                    if (selectedPoint && selectedPoint.id === point.id) {
                        marker.openPopup();
                    }

                    bounds.push([point.latitude, point.longitude]);
                }
            });

            if (bounds.length > 0) {
                map.fitBounds(bounds, { padding: [50, 50] });
            }
        }
    };
});



