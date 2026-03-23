/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
    "jquery",
    "uiComponent",
    "ko",
    "Magento_Checkout/js/model/quote",
    "Magento_Checkout/js/model/resource-url-manager",
    "mage/storage",
    "Innosend_PickupPoints/js/pickup-points-map",
    "mage/translate",
], function ($, Component, ko, quote, resourceUrl, storage, mapComponent, $t) {
    "use strict";

    return Component.extend({
        defaults: {
            template: "Innosend_PickupPoints/pickup-points/modal",
            ajaxUrl: "",
            saveUrl: "",
            showMap: false,
            showMapMobile: false,
            mapType: "open_maps",
            googleMapsApiKey: "",
            googleMapsMapId: "",
            openMapsApiKey: "",
            allowedCarriers: [],
        },

        /**
         * Get template for selected pickup point
         */
        getSelectedTemplate: function () {
            return "Innosend_PickupPoints/pickup-points/selected";
        },

        /**
         * Initialize component
         */
        initialize: function () {
            this._super();
            this.selectedPickupPoint = ko.observable(null);
            this.selectedPickupPointDisplay = ko.observable(null);
            this.pickupPoints = ko.observableArray([]);
            this.isLoading = ko.observable(false);
            this.isPickupPointsMethodAvailable = ko.observable(false); // Track if method exists in rates (prefetch)
            this.isModalVisible = ko.observable(false);
            this.showBusinessHours = ko.observable(false);
            this.showBusinessHoursForPoint = {}; // Track business hours visibility per point ID
            this.mapInitialized = false;
            this.errorMessage = ko.observable(null);
            this.apiRequestUrl = ko.observable(null);
            this.showList = ko.observable(true);
            this.selectedCarriers = ko.observableArray([]);
            this.shippingAddressDisplay = ko.observable("");
            this.mapSearchQuery = ko.observable("");
            this.filteredPickupPointsComputed = null;
            this.mapBounds = null;
            this.originalAddress = null; // Store original address for reset
            // Geocoded shipping address only; list distance uses this, never map center / manual search position
            this.originalShippingCoordinates = null;
            this.manualSearchCoordinates = null; // Store manual map search coordinates, detached from shipping address
            this.isLoadingFromMapBounds = ko.observable(false); // Track if loading from map bounds
            this.mapMoveDebounceTimer = null; // Debounce timer for map movement
            this.isUpdatingMap = false; // Flag to prevent recursive map updates
            this.lastUserSelection = null; // Store timestamp of last user selection to prevent auto-reset
            this.lastMapCenter = null; // Store last map center to detect significant movement
            this.lastMapZoom = null; // Store last map zoom level
            this.pickupPointsLoadDebounceTimer = null; // Debounce timer for address-based loading
            this.lastPickupPointsLookupKey = null; // Prevent repeated loading for same address key
            this.skipNextMapMove = false; // When true, onMapMove returns early (used after list toggle)

            // Initialize filteredPickupPoints computed observable after all observables are set up
            // This ensures it has access to all the observables it depends on
            if (!this.filteredPickupPoints) {
                this.filteredPickupPoints = ko.pureComputed(function () {
                    // Use 'this' directly - ko.pureComputed with context binding
                    // Check if component is fully initialized
                    if (!this) {
                        return [];
                    }

                    // Check if pickupPoints observable exists and is initialized
                    if (!this.pickupPoints || typeof this.pickupPoints !== "function") {
                        return [];
                    }

                    try {
                        let rawPoints = [];
                        try {
                            rawPoints = this.pickupPoints() || [];
                        } catch (e) {
                            return [];
                        }

                        if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
                            return [];
                        }

                        let selectedCarriers = [];
                        try {
                            if (this.selectedCarriers && typeof this.selectedCarriers === "function") {
                                selectedCarriers = this.selectedCarriers() || [];
                            }
                        } catch (e) {
                            selectedCarriers = [];
                        }

                        if (selectedCarriers.length === 0) {
                            return [];
                        }

                        const filtered = rawPoints.filter(function (point) {
                            if (!point.carrier) {
                                return false;
                            }
                            const pointCarrier = point.carrier.toLowerCase();
                            return selectedCarriers.indexOf(pointCarrier) > -1;
                        });

                        const ref =
                            this.getReferenceLatLngForShippingDistance &&
                            typeof this.getReferenceLatLngForShippingDistance === "function"
                                ? this.getReferenceLatLngForShippingDistance()
                                : null;

                        let ordered;
                        if (ref) {
                            ordered = filtered.slice().sort(
                                function (a, b) {
                                    return (
                                        this.distanceKmFromReference(ref, a) - this.distanceKmFromReference(ref, b)
                                    );
                                }.bind(this)
                            );
                        } else {
                            ordered = filtered.slice().sort(function (a, b) {
                                const distA = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                                const distB = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
                                return distA - distB;
                            });
                        }

                        const selectedPoint = this.selectedPickupPoint();
                        const selectedId = selectedPoint ? String(selectedPoint.id) : null;

                        return ordered.map(
                            function (point) {
                                const row = {
                                    isSelected: selectedId !== null && String(point.id) === selectedId,
                                };
                                if (ref) {
                                    let dKm = this.distanceKmFromReference(ref, point);
                                    if (dKm === 999999 && point.distance != null && point.distance !== "") {
                                        const fallback = parseFloat(point.distance);
                                        if (!isNaN(fallback)) {
                                            dKm = fallback;
                                        }
                                    }
                                    row.distance = dKm;
                                }
                                return Object.assign({}, point, row);
                            }.bind(this)
                        );
                    } catch (e) {
                        return [];
                    }
                }, this);
            }

            // Observable to track window width for responsive behavior
            this.windowWidth = ko.observable(window.innerWidth);

            // Update window width on resize
            var self = this;
            var resizeTimeout;
            window.addEventListener("resize", function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function () {
                    self.windowWidth(window.innerWidth);
                }, 100);
            });

            // Computed observable to determine if map should be shown
            // Takes into account mobile/desktop and showMapMobile setting
            this.shouldShowMap = ko.pureComputed(function () {
                if (!this.showMap) {
                    return false;
                }

                // Check if device is mobile (max 768px width)
                var isMobile =
                    this.windowWidth() <= 768 ||
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

                // On mobile (max 768px), check showMapMobile setting
                if (isMobile) {
                    return this.showMapMobile === true;
                }

                // On desktop (> 768px), show map if showMap is true
                return true;
            }, this);

            // Computed observable to determine if toggle list button should be shown
            // On desktop: always visible, on mobile: only when showMapMobile is enabled
            this.shouldShowToggleButton = ko.pureComputed(function () {
                // Check if device is mobile (max 768px width)
                var isMobile =
                    this.windowWidth() <= 768 ||
                    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

                // On desktop (> 768px), always show toggle button
                if (!isMobile) {
                    return true;
                }

                // On mobile (<= 768px), only show if showMapMobile is enabled
                return this.showMapMobile === true;
            }, this);

            // Watch for shouldShowMap changes (e.g., when window is resized)
            this.shouldShowMap.subscribe(function (shouldShow) {
                // Update CSS class on modal for mobile map visibility
                var modalElement = document.querySelector(".innosend-pickup-points-modal");
                if (modalElement) {
                    if (shouldShow && this.windowWidth() <= 768) {
                        modalElement.classList.add("show-map-mobile");
                    } else {
                        modalElement.classList.remove("show-map-mobile");
                    }
                }

                // Do not destroy the map when the modal closes; refresh when the map becomes visible again.
                if (this.isModalVisible() && shouldShow) {
                    this.initializeMap();
                }
            }, this);

            // Watch for shipping method changes
            quote.shippingMethod.subscribe(this.onShippingMethodChange.bind(this), this);

            // Watch for shipping address changes
            quote.shippingAddress.subscribe(this.onShippingAddressChange.bind(this), this);

            // Also watch for shipping rates to detect when methods become available
            if (typeof require !== "undefined") {
                require(["Magento_Checkout/js/model/shipping-service"], function (shippingService) {
                    shippingService.getShippingRates().subscribe(
                        function (rates) {
                            // Check if our method is in the available rates
                            const hasOurMethod = rates.some(function (rate) {
                                return rate.carrier_code === "innosend_pickup_points";
                            });

                            this.isPickupPointsMethodAvailable(!!hasOurMethod);

                            // Prefetch pickup points when method is available (even if not selected yet)
                            if (hasOurMethod) {
                                const currentAddress = quote.shippingAddress();
                                const isSelected = this.isPickupPointsShippingMethodSelected();
                                // Prefetch only: do not auto-select/save until method is selected
                                this.maybeLoadPickupPointsForAddress(currentAddress, 0, {prefetchOnly: !isSelected});
                            }

                            // Check if our method is available and selected
                            const currentMethod = quote.shippingMethod();
                            if (currentMethod) {
                                const carrierCode =
                                    currentMethod.carrier_code ||
                                    (currentMethod.method_code && currentMethod.method_code.split("_")[0]) ||
                                    null;
                                const methodCode = currentMethod.method_code || "";
                                const isOurMethod =
                                    carrierCode === "innosend_pickup_points" ||
                                    methodCode === "innosend_pickup_points" ||
                                    methodCode.indexOf("innosend_pickup_points") === 0;
                                if (isOurMethod) {
                                    this.onShippingMethodChange(currentMethod);
                                }
                            }
                        }.bind(this),
                        this
                    );
                }.bind(this));
            }

            // Initialize with current shipping method and address
            const currentMethod = quote.shippingMethod();
            const currentAddress = quote.shippingAddress();

            if (currentMethod) {
                this.onShippingMethodChange(currentMethod);
            } else if (currentAddress) {
                // If address is set but no method yet, wait for method selection
            }

            // Guest NL UX: prefetch pickup points as soon as address is filled (even before rates include our method)
            // This makes the nearest pickup point immediately available when the customer selects the method.
            if (currentAddress && this.getCountryIdForAddress(currentAddress) === "NL") {
                this.maybeLoadPickupPointsForAddress(currentAddress, 0, {prefetchOnly: true});
            }

            return this;
        },

        /**
         * Check if Innosend Pickup Points shipping method is selected
         */
        isPickupPointsShippingMethodSelected: ko.pureComputed(function () {
            const shippingMethod = quote.shippingMethod();
            if (!shippingMethod) {
                return false;
            }

            // Check carrier code - can be in different formats
            const carrierCode =
                shippingMethod.carrier_code || (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) || null;

            // Also check if method_code contains our carrier code
            const methodCode = shippingMethod.method_code || "";
            const isOurMethod =
                carrierCode === "innosend_pickup_points" ||
                methodCode === "innosend_pickup_points" ||
                methodCode.indexOf("innosend_pickup_points") === 0;

            return isOurMethod;
        }, this),

        /**
         * Get first street line from a Magento address object
         */
        getStreetLine0: function (address) {
            if (!address || !address.street) {
                return "";
            }

            if (Array.isArray(address.street)) {
                return (address.street[0] || "").trim();
            }

            return String(address.street || "").trim();
        },

        /**
         * Get countryId from address or checkout defaults (if available)
         */
        getCountryIdForAddress: function (address) {
            if (address && address.countryId) {
                return address.countryId;
            }

            if (typeof window !== "undefined" && window.checkoutConfig && window.checkoutConfig.defaultCountryId) {
                return window.checkoutConfig.defaultCountryId;
            }

            return "";
        },

        /**
         * Load pickup points as soon as street[0], postcode and city are filled.
         * Uses a debounce to avoid API calls on every keystroke.
         */
        maybeLoadPickupPointsForAddress: function (address, debounceMs) {
            const street0 = this.getStreetLine0(address);
            const postcode = address && address.postcode ? String(address.postcode).trim() : "";
            const city = address && address.city ? String(address.city).trim() : "";
            const countryId = this.getCountryIdForAddress(address);

            // Requirement: start loading as soon as these 3 fields are filled
            if (!street0 || !postcode || !city) {
                return;
            }

            const options = arguments.length > 2 ? arguments[2] : null;
            const prefetchOnly = !!(options && typeof options === "object" && options.prefetchOnly);

            const lookupKey = [street0, postcode, city, countryId].join("|").toLowerCase();
            if (this.lastPickupPointsLookupKey === lookupKey) {
                return;
            }

            // Update display for search bar (use street[0] explicitly)
            this.shippingAddressDisplay([street0, postcode, city].filter(Boolean).join(", "));

            // Debounce to avoid repeated calls while typing
            const delay = typeof debounceMs === "number" ? debounceMs : 300;
            clearTimeout(this.pickupPointsLoadDebounceTimer);
            this.pickupPointsLoadDebounceTimer = setTimeout(
                function () {
                    // Re-check address values at execution time (quote may have changed)
                    const currentAddress = quote.shippingAddress();
                    const currentStreet0 = this.getStreetLine0(currentAddress);
                    const currentPostcode =
                        currentAddress && currentAddress.postcode ? String(currentAddress.postcode).trim() : "";
                    const currentCity = currentAddress && currentAddress.city ? String(currentAddress.city).trim() : "";
                    const currentCountryId = this.getCountryIdForAddress(currentAddress);

                    if (!currentStreet0 || !currentPostcode || !currentCity) {
                        return;
                    }

                    const currentKey = [currentStreet0, currentPostcode, currentCity, currentCountryId].join("|").toLowerCase();
                    if (this.lastPickupPointsLookupKey === currentKey) {
                        return;
                    }

                    this.lastPickupPointsLookupKey = currentKey;
                    this.loadPickupPoints(currentAddress, {prefetchOnly: prefetchOnly});
                }.bind(this),
                delay
            );
        },

        /**
         * Ensure a pickup point is selected (nearest) when our method is selected.
         * Useful when pickup points were prefetched before selection.
         */
        ensureNearestPickupPointSelectedForCurrentAddress: function () {
            if (!this.isPickupPointsShippingMethodSelected()) {
                return;
            }

            const address = quote.shippingAddress();
            const street0 = this.getStreetLine0(address);
            const postcode = address && address.postcode ? String(address.postcode).trim() : "";
            const city = address && address.city ? String(address.city).trim() : "";
            const countryId = this.getCountryIdForAddress(address);

            if (!street0 || !postcode || !city) {
                return;
            }

            const lookupKey = [street0, postcode, city, countryId].join("|").toLowerCase();
            if (this.lastPickupPointsLookupKey !== lookupKey) {
                return;
            }

            // If already selected, just ensure display is set
            const currentSelected = this.selectedPickupPoint();
            if (currentSelected) {
                this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(currentSelected));
                return;
            }

            const points = this.pickupPoints() || [];
            if (!Array.isArray(points) || points.length === 0) {
                return;
            }

            // Backend returns nearest first; we keep them sorted client-side too
            const nearestPoint = points[0];
            this.selectedPickupPoint(nearestPoint);
            this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(nearestPoint));
            this.savePickupPoint(nearestPoint);
        },

        /**
         * Handle shipping method change
         */
        onShippingMethodChange: function (shippingMethod) {
            if (!shippingMethod) {
                this.selectedPickupPointDisplay(null);
                this.pickupPoints([]);
                return;
            }

            // Check carrier code - can be in different formats
            const carrierCode =
                shippingMethod.carrier_code || (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) || null;

            // Also check method_code directly
            const methodCode = shippingMethod.method_code || "";

            // Only show pickup points for Innosend Pickup Points shipping method
            const isOurMethod =
                carrierCode === "innosend_pickup_points" ||
                methodCode === "innosend_pickup_points" ||
                methodCode.indexOf("innosend_pickup_points") === 0;

            if (isOurMethod) {
                const address = quote.shippingAddress();

                // Update shipping address display for search bar
                if (address) {
                    const street0 = this.getStreetLine0(address);
                    const addressString = [street0, address.postcode, address.city].filter(Boolean).join(", ");
                    this.shippingAddressDisplay(addressString);
                    // Store original address for reset functionality
                    this.originalAddress = {
                        street: address.street,
                        postcode: address.postcode,
                        city: address.city,
                        countryId: this.getCountryIdForAddress(address),
                        addressString: addressString,
                    };
                }

                // Load nearest pickup point as soon as street[0], postcode and city are filled
                this.maybeLoadPickupPointsForAddress(address, 0);

                // If pickup points were prefetched earlier, select nearest now (and save)
                this.ensureNearestPickupPointSelectedForCurrentAddress();
            } else {
                this.selectedPickupPointDisplay(null);
            }
        },

        /**
         * Handle shipping address change
         */
        onShippingAddressChange: function (address) {
            const shippingMethod = quote.shippingMethod();

            const isOurMethod = shippingMethod
                ? (function () {
                    const carrierCode =
                        shippingMethod.carrier_code ||
                        (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) ||
                        null;
                    const methodCode = shippingMethod.method_code || "";
                    return (
                        carrierCode === "innosend_pickup_points" ||
                        methodCode === "innosend_pickup_points" ||
                        methodCode.indexOf("innosend_pickup_points") === 0
                    );
                })()
                : false;

            if (isOurMethod) {
                // Load nearest pickup point as soon as street[0], postcode and city are filled
                this.maybeLoadPickupPointsForAddress(address, 350);
            } else {
                // Guest NL UX: prefetch as soon as address is filled, regardless of whether rates already contain the method.
                const countryId = this.getCountryIdForAddress(address);
                if (countryId === "NL") {
                    this.maybeLoadPickupPointsForAddress(address, 350, {prefetchOnly: true});
                } else if (this.isPickupPointsMethodAvailable && this.isPickupPointsMethodAvailable()) {
                    // Other countries: prefetch only when the method is actually available in rates
                    this.maybeLoadPickupPointsForAddress(address, 350, {prefetchOnly: true});
                }
            }
        },

        /**
         * Load pickup points
         */
        loadPickupPoints: function (address, options) {
            options = options || {};
            const prefetchOnly = !!options.prefetchOnly;
            const detachFromShippingAddress = !!options.detachFromShippingAddress;

            if (this.isLoading()) {
                return;
            }

            this.isLoading(true);

            const carriers = this.getAllowedCarriers();
            const streetValue = this.getStreetLine0(address);
            const countryId = this.getCountryIdForAddress(address);

            const requestData = {
                street: streetValue,
                postcode: address.postcode || "",
                city: address.city || "",
                country_code: countryId || "",
            };

            // Add couriers array if available (WordPress plugin format)
            // Convert all couriers to uppercase for API consistency
            if (carriers.length > 0) {
                requestData.couriers = carriers.map(function (carrier) {
                    return String(carrier).toUpperCase().trim();
                });
            }

            // Store coordinates for distance calculation.
            if (address.latitude && address.longitude) {
                requestData.latitude = address.latitude;
                requestData.longitude = address.longitude;

                if (detachFromShippingAddress) {
                    this.manualSearchCoordinates = {
                        latitude: address.latitude,
                        longitude: address.longitude,
                    };
                } else {
                    this.manualSearchCoordinates = null;
                    this.originalShippingCoordinates = {
                        latitude: address.latitude,
                        longitude: address.longitude,
                    };
                }
            }

            // When location-search is used, keep the search origin detached from shipping address.
            if (detachFromShippingAddress && this.manualSearchCoordinates) {
                requestData.search_latitude = this.manualSearchCoordinates.latitude;
                requestData.search_longitude = this.manualSearchCoordinates.longitude;
            } else if (this.originalShippingCoordinates) {
                requestData.search_latitude = this.originalShippingCoordinates.latitude;
                requestData.search_longitude = this.originalShippingCoordinates.longitude;
            }

            // Clear previous errors (only when method is selected / visible)
            if (!prefetchOnly && this.isPickupPointsShippingMethodSelected()) {
                this.errorMessage(null);
                this.apiRequestUrl(null);
            }

            const queryParts = [];
            for (const key in requestData) {
                if (requestData.hasOwnProperty(key)) {
                    const value = requestData[key];
                    if (Array.isArray(value)) {
                        // For arrays, add each item separately: couriers=value1&couriers=value2
                        value.forEach(function (item) {
                            queryParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(item)));
                        });
                    } else {
                        queryParts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(value)));
                    }
                }
            }

            // Build full request URL for debugging
            const requestUrl = this.ajaxUrl + (queryParts.length > 0 ? "?" + queryParts.join("&") : "");
            this.apiRequestUrl(requestUrl);

            $.ajax({
                url: this.ajaxUrl,
                type: "POST",
                data: requestData,
                dataType: "json",
                traditional: true, // Use traditional array serialization (couriers=value1&couriers=value2)
                success: function (response) {
                    const isSelectedNow = this.isPickupPointsShippingMethodSelected();

                    // Clear any previous errors (only when visible)
                    if (isSelectedNow) {
                        this.errorMessage(null);
                    }

                    // Store backend geocoded coordinates only for shipping-address driven lookups.
                    if (
                        !detachFromShippingAddress &&
                        response.search_latitude &&
                        response.search_longitude &&
                        !this.originalShippingCoordinates
                    ) {
                        this.originalShippingCoordinates = {
                            latitude: response.search_latitude,
                            longitude: response.search_longitude,
                        };
                    }

                    if (response.success && response.data && response.data.length > 0) {
                        // Log carriers in response
                        const carriersInResponse = [
                            ...new Set(
                                response.data
                                    .map(function (point) {
                                        return point.carrier;
                                    })
                                    .filter(Boolean)
                            ),
                        ];

                        // Initialize selectedCarriers with all carriers if empty
                        // Normalize to lowercase for consistent comparison
                        // This ensures all pickup points are shown by default
                        if (this.selectedCarriers().length === 0 && carriersInResponse.length > 0) {
                            const normalizedCarriers = carriersInResponse
                                .map(function (carrier) {
                                    return carrier ? carrier.toLowerCase() : null;
                                })
                                .filter(Boolean);
                            this.selectedCarriers(normalizedCarriers);
                        } else {
                        }

                        // Data is already sorted by distance on the backend (nearest first)
                        // But we'll sort again client-side as a safety measure
                        const sorted = response.data.sort(function (a, b) {
                            const distA = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                            const distB = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
                            return distA - distB;
                        });

                        this.pickupPoints(sorted);

                        // Log immediately - computed observables will be evaluated by Knockout automatically

                        // If the customer has (now) selected the pickup points method, we can auto-select/save.
                        // This also covers the case where a prefetch request completes after selection.
                        const shouldAutoSelectAndSave = isSelectedNow;

                        // Always auto-select first (nearest) pickup point only when method is selected
                        const currentSelected = this.selectedPickupPoint();
                        if (shouldAutoSelectAndSave && !currentSelected && sorted.length > 0) {
                            const nearestPoint = sorted[0];

                            // Verify that we're using the pickup point address, not the shipping address

                            // Ensure we're displaying the pickup point address, not shipping address
                            if (!nearestPoint.address && nearestPoint.street) {
                                // Build address from pickup point components if not set
                                nearestPoint.address = [nearestPoint.street, nearestPoint.postcode, nearestPoint.city]
                                    .filter(Boolean)
                                    .join(", ");
                            }

                            this.selectedPickupPoint(nearestPoint);
                            this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(nearestPoint));
                            this.savePickupPoint(nearestPoint);
                        } else if (currentSelected) {
                            // User has manually selected a point, try to preserve it in new results
                            const preservedPoint = sorted.find(function (point) {
                                return String(point.id) === String(currentSelected.id);
                            });

                            if (preservedPoint) {
                                // Update the selected point with fresh data but keep the selection
                                this.selectedPickupPoint(preservedPoint);
                                if (shouldAutoSelectAndSave) {
                                    this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(preservedPoint));
                                }
                            } else {
                                // Selected point no longer in results - keep current selection, user can manually change
                            }
                        }

                        // Address-based loads (e.g. "Verplaats Positie") update the list here but did not refresh map
                        // markers; bounds-based loads do that in loadPickupPointsForBounds.
                        if (!prefetchOnly && this.mapInitialized && mapComponent) {
                            this.isUpdatingMap = true;
                            const filteredPoints = this.filteredPickupPoints();
                            mapComponent.updateMap(
                                sorted,
                                this.selectedPickupPoint(),
                                filteredPoints,
                                { preserveViewport: true }
                            );
                            setTimeout(
                                function () {
                                    this.isUpdatingMap = false;
                                }.bind(this),
                                200
                            );
                        }
                    } else {
                        this.pickupPoints([]);
                        if (isSelectedNow) {
                            // Show error message with API URL
                            const errorMsg = response.message || "No pickup points found for this address.";
                            const apiUrl = response.api_url || this.apiRequestUrl() || "Unknown";
                            this.errorMessage(errorMsg + " (API URL: " + apiUrl + ")");

                            // Clear selection when visible
                            this.selectedPickupPoint(null);
                            this.selectedPickupPointDisplay(null);
                            this.storePickupPointGlobally(null);
                        }
                        if (!prefetchOnly && this.mapInitialized && mapComponent) {
                            this.isUpdatingMap = true;
                            mapComponent.updateMap([], null, [], { preserveViewport: true });
                            setTimeout(
                                function () {
                                    this.isUpdatingMap = false;
                                }.bind(this),
                                200
                            );
                        }
                    }
                }.bind(this),
                error: function (xhr, status, error) {
                    // Try to parse error response
                    let errorMsg = "Unable to load pickup points.";
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        if (errorResponse.message) {
                            errorMsg = errorResponse.message;
                        }
                    } catch (e) {
                        // Use default error message
                    }

                    this.pickupPoints([]);
                    if (this.isPickupPointsShippingMethodSelected()) {
                        // Show error message with API URL
                        const apiUrl = this.apiRequestUrl() || "Unknown";
                        this.errorMessage(errorMsg + " (API URL: " + apiUrl + ")");

                        // Clear selection when visible
                        this.selectedPickupPoint(null);
                        this.selectedPickupPointDisplay(null);
                    }
                    if (!prefetchOnly && this.mapInitialized && mapComponent) {
                        this.isUpdatingMap = true;
                        mapComponent.updateMap([], null, [], { preserveViewport: true });
                        setTimeout(
                            function () {
                                this.isUpdatingMap = false;
                            }.bind(this),
                            200
                        );
                    }
                }.bind(this),
                complete: function () {
                    this.isLoading(false);
                }.bind(this),
            });
        },

        /**
         * Clear error message
         */
        clearError: function () {
            this.errorMessage(null);
        },

        /**
         * Get sorted pickup points (by distance)
         */
        sortedPickupPoints: ko.pureComputed(function () {
            // Safely get pickup points with null check
            if (!this || !this.pickupPoints) {
                return [];
            }

            const points = this.pickupPoints() || [];
            const selectedId = this.selectedPickupPoint() ? String(this.selectedPickupPoint().id) : null;

            if (!Array.isArray(points) || points.length === 0) {
                return [];
            }

            return points
                .slice()
                .sort(function (a, b) {
                    const distA = a.distance || 999999;
                    const distB = b.distance || 999999;
                    return distA - distB;
                })
                .map(function (point) {
                    // Add isSelected property (not computed, just a boolean check)
                    point.isSelected = selectedId !== null && String(point.id) === selectedId;
                    return point;
                });
        }, this),

        /**
         * Check if a pickup point is selected (helper function for templates)
         * This function is safe to call from templates without causing recursion
         */
        isPickupPointSelected: function (point) {
            if (!point || !point.id) {
                return false;
            }
            const selected = this.selectedPickupPoint();
            if (!selected || !selected.id) {
                return false;
            }
            // Use strict comparison to avoid type coercion issues
            return String(selected.id) === String(point.id);
        },

        /**
         * Format pickup point for display
         */
        formatPickupPointForDisplay: function (point) {
            if (!point) {
                return null;
            }

            // Normalize opening hours to ensure consistent format
            // Backend already processes and merges opening hours, so we just pass through
            let openingHours = [];
            if (point.opening_hours && Array.isArray(point.opening_hours)) {
                openingHours = point.opening_hours.map(function (hours) {
                    if (typeof hours === "object" && hours !== null) {
                        return {
                            day_of_week: hours.day_of_week || hours.day || "",
                            day_name_short: hours.day_name_short || "",
                            day_name_long: hours.day_name_long || "",
                            hours: hours.hours || "", // Merged hours string from backend
                            opens: hours.opens || "", // Keep for backward compatibility
                            closes: hours.closes || "", // Keep for backward compatibility
                        };
                    }
                    return hours;
                });
            }

            // Coordinates are required for map markers and for distanceKmFromReference() in filteredPickupPoints
            // when the map provides a reference (bounds reload used formatPickupPointForDisplay without lat/lng → 999999 km).
            const lat =
                point.latitude != null && point.latitude !== ""
                    ? point.latitude
                    : point.lat != null && point.lat !== ""
                      ? point.lat
                      : null;
            const lng =
                point.longitude != null && point.longitude !== ""
                    ? point.longitude
                    : point.lng != null && point.lng !== ""
                      ? point.lng
                      : null;

            return {
                id: point.id,
                name: point.name,
                address: point.address || [point.street, point.postcode, point.city].filter(Boolean).join(", "),
                distance: point.distance,
                carrier: point.carrier,
                logo: point.logo || this.getCarrierLogoUrl(point.carrier), // Small image for lists/filters
                mark_image: point.mark_image || point.logo || this.getCarrierLogoUrl(point.carrier), // Mark image for map markers
                opening_hours: openingHours,
                latitude: lat,
                longitude: lng,
            };
        },

        /**
         * Format distance - show meters if under 1km, otherwise show km
         */
        formatDistance: function (distance) {
            if (distance === null || distance === undefined || distance === "") {
                return "";
            }
            const dist = parseFloat(distance);
            if (isNaN(dist)) {
                return "";
            }
            if (dist < 1) {
                // Convert to meters and round to nearest integer
                const meters = Math.round(dist * 1000);
                return meters + " m";
            }
            // Round to 2 decimal places for km
            return dist.toFixed(2) + " km";
        },

        /**
         * Get carrier logo URL (fallback if not in API response)
         */
        getCarrierLogoUrl: function (carrier) {
            if (!carrier) {
                return null;
            }
            // Return path to carrier logo if stored locally
            // For now, return null - logos should come from API
            return null;
        },

        /**
         * Get allowed carriers - use carriers from pickup points if available, otherwise use config
         */
        getAllowedCarriers: function () {
            // Get unique carriers from pickup points (normalized to uppercase for display)
            const points = this.pickupPoints() || [];
            if (points.length > 0) {
                const carriersFromPoints = [
                    ...new Set(
                        points
                            .map(function (point) {
                                return point.carrier ? point.carrier.toUpperCase() : null;
                            })
                            .filter(Boolean)
                    ),
                ];
                if (carriersFromPoints.length > 0) {
                    return carriersFromPoints.sort();
                }
            }
            // Fallback to config carriers
            return this.allowedCarriers || [];
        },

        /**
         * Get carrier logo URL from pickup points (uses mark_image like map pins)
         */
        getCarrierLogoForFilter: function (carrier) {
            if (!carrier) {
                return null;
            }
            // Find first pickup point with this carrier to get mark_image (same as map pins)
            const points = this.pickupPoints() || [];
            const normalizedCarrier = carrier.toLowerCase();
            for (let i = 0; i < points.length; i++) {
                if (points[i].carrier && points[i].carrier.toLowerCase() === normalizedCarrier) {
                    // Use mark_image (same as map pins) with fallback to logo
                    if (points[i].mark_image) {
                        return points[i].mark_image;
                    }
                    if (points[i].logo) {
                        return points[i].logo;
                    }
                }
            }
            // Fallback to getCarrierLogoUrl if no image found in points
            return this.getCarrierLogoUrl(carrier);
        },

        /**
         * Toggle list visibility
         */
        toggleList: function () {
            this.showList(!this.showList());

            // Leaflet popup auto-pan needs to know whether the list column is visible.
            // Otherwise the popup can pan the map in a way that pushes the selected pin off-canvas.
            if (this.mapInitialized && mapComponent && typeof mapComponent.setListVisible === "function") {
                try {
                    mapComponent.setListVisible(this.showList());
                } catch (e) {}
            }

            // After CSS transition (300ms), recalc map size and recenter so map and close button are correct
            var self = this;
            setTimeout(function () {
                if (!self.mapInitialized || !mapComponent) {
                    return;
                }
                if (typeof mapComponent.invalidateSizeAndRecenter !== "function") {
                    return;
                }
                // Skip the next onMapMove so programmatic setView does not trigger reload/zoom
                self.skipNextMapMove = true;
                var selectedPoint = self.showList() ? null : self.selectedPickupPoint();
                mapComponent.invalidateSizeAndRecenter(selectedPoint || null);

                // Desktop-only: when list is closed, show a choose button in the Leaflet popup
                if (typeof mapComponent.setChooseButtonEnabled === "function") {
                    var shouldShowChooseButton = self.windowWidth() > 768 && !self.showList();
                    mapComponent.setChooseButtonEnabled(shouldShowChooseButton);
                }
                // Clear skip flag after moveend would have fired (prevents reload from this toggle)
                setTimeout(function () {
                    self.skipNextMapMove = false;
                }, 600);
            }, 350);
        },

        /**
         * Toggle carrier filter (case-insensitive)
         */
        toggleCarrierFilter: function (carrier) {
            if (!carrier) {
                return;
            }
            const normalizedCarrier = carrier.toLowerCase();
            const selected = this.selectedCarriers();
            const index = selected.indexOf(normalizedCarrier);
            const wasSelected = index > -1;

            if (wasSelected) {
                // Carrier is being deselected
                selected.splice(index, 1);
            } else {
                // Carrier is being selected
                selected.push(normalizedCarrier);
            }
            this.selectedCarriers(selected);

            // After toggling, always select nearest pickup point from all enabled carriers
            this.selectNearestFromEnabledCarriers();

            // Update markers/selection without recentering — keep the user's map position
            if (this.mapInitialized) {
                this.updateMap(undefined, undefined, { preserveViewport: true });
            }
        },

        /**
         * Handle map movement - load pickup points for visible bounds (with debouncing)
         */
        onMapMove: function (bounds) {
            // Skip when this move was caused by list toggle (invalidateSizeAndRecenter setView)
            if (this.skipNextMapMove || this.isUpdatingMap || !bounds || !this.mapInitialized) {
                return;
            }

            // Prevent resetting selection if user just selected a point (within last 3 seconds)
            if (this.lastUserSelection && Date.now() - this.lastUserSelection < 3000) {
                return;
            }

            // Update map bounds observable immediately for filtering
            this.mapBounds = bounds;

            // Clear existing debounce timer (legacy)
            if (this.mapMoveDebounceTimer) {
                clearTimeout(this.mapMoveDebounceTimer);
                this.mapMoveDebounceTimer = null;
            }

            // No debounce: handle immediately on user moveend/zoomend
            const center = bounds.getCenter ? bounds.getCenter() : null;
            if (!center) {
                return;
            }

            const currentZoom = mapComponent && mapComponent.getMapZoom ? mapComponent.getMapZoom() : null;

            // Check if map has moved significantly (> 500m) or zoomed out significantly
            let shouldReload = false;

            if (this.lastMapCenter && this.lastMapZoom !== null && currentZoom !== null) {
                const lat1 = this.lastMapCenter.lat || this.lastMapCenter.lat();
                const lng1 = this.lastMapCenter.lng || this.lastMapCenter.lng();
                const lat2 = center.lat || center.lat();
                const lng2 = center.lng || center.lng();

                // Calculate distance in meters (rough approximation)
                const R = 6371000; // Earth radius in meters
                const dLat = ((lat2 - lat1) * Math.PI) / 180;
                const dLng = ((lng2 - lng1) * Math.PI) / 180;
                const a =
                    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                const distance = R * c;

                // Reload if moved more than 500m or zoomed out significantly (zoom level decreased by 2+)
                if (distance > 500 || this.lastMapZoom - currentZoom >= 2) {
                    shouldReload = true;
                }
            } else {
                // First time, always reload
                shouldReload = true;
            }

            if (shouldReload) {
                const currentSelected = this.selectedPickupPoint();
                const selectedId = currentSelected ? String(currentSelected.id) : null;
                this.loadPickupPointsForBounds(bounds, center, selectedId);
                this.lastMapCenter = center;
                this.lastMapZoom = currentZoom;
            }
        },

        /**
         * Load pickup points for map bounds (latitude/longitude based)
         */
        loadPickupPointsForBounds: function (bounds, center, preserveSelectedId) {
            if (!bounds || !center) {
                return;
            }

            // Don't show loading spinner for map bounds updates (only show for initial load)
            // this.isLoadingFromMapBounds(true);
            // this.isLoading(true);

            const latitude = center.lat || center.lat();
            const longitude = center.lng || center.lng();

            // Get allowed carriers
            const carriers = this.getAllowedCarriers();
            const normalizedCarriers = carriers.map(function (c) {
                return c.toLowerCase();
            });

            // Build request data with coordinates instead of address
            // Use map center for fetching pickup points in visible area
            // But always use original shipping coordinates for distance calculation
            const requestData = {
                latitude: latitude,
                longitude: longitude,
                country_code: this.originalAddress ? this.originalAddress.countryId : this.getCountryIdForAddress(null) || "NL",
                couriers: normalizedCarriers,
            };

            // Use manual map-search coordinates when available, otherwise use shipping-origin coordinates.
            const activeSearchCoordinates = this.manualSearchCoordinates || this.originalShippingCoordinates;
            if (activeSearchCoordinates) {
                requestData.search_latitude = activeSearchCoordinates.latitude;
                requestData.search_longitude = activeSearchCoordinates.longitude;
            }

            $.ajax({
                url: this.ajaxUrl,
                type: "POST",
                data: requestData,
                dataType: "json",
                traditional: true,
                success: function (response) {
                    this.errorMessage(null);

                    if (response.success && response.data && response.data.length > 0) {
                        // Format and sort pickup points
                        const formatted = response.data.map(
                            function (point) {
                                return this.formatPickupPointForDisplay(point);
                            }.bind(this)
                        );

                        // Sort by distance
                        const sorted = formatted.slice().sort(function (a, b) {
                            const distA = a.distance || 999999;
                            const distB = b.distance || 999999;
                            return distA - distB;
                        });

                        // Update pickup points
                        this.pickupPoints(sorted);

                        // Initialize selectedCarriers with all carriers if empty
                        const carriersInResponse = [
                            ...new Set(
                                sorted
                                    .map(function (point) {
                                        return point.carrier;
                                    })
                                    .filter(Boolean)
                            ),
                        ];
                        if (this.selectedCarriers().length === 0 && carriersInResponse.length > 0) {
                            const normalizedCarriers = carriersInResponse
                                .map(function (carrier) {
                                    return carrier ? carrier.toLowerCase() : null;
                                })
                                .filter(Boolean);
                            this.selectedCarriers(normalizedCarriers);
                        }

                        // Preserve selected pickup point if it still exists in new results
                        // Only auto-select nearest if no manual selection was made
                        // IMPORTANT: Don't override selection if user just made a selection (within last 3 seconds)
                        const recentUserSelection = this.lastUserSelection && Date.now() - this.lastUserSelection < 3000;

                        // IMPORTANT: don't let a delayed bounds refresh overwrite a newer user selection
                        const currentSelectedAtSuccess = this.selectedPickupPoint();
                        const currentSelectedIdAtSuccess = currentSelectedAtSuccess ? String(currentSelectedAtSuccess.id) : null;
                        const canApplyPreserve = !currentSelectedIdAtSuccess || currentSelectedIdAtSuccess === preserveSelectedId;

                        if (preserveSelectedId && canApplyPreserve && !recentUserSelection) {
                            const preservedPoint = sorted.find(function (point) {
                                return String(point.id) === preserveSelectedId;
                            });

                            if (preservedPoint) {
                                // Update the selected point with fresh data but keep the selection
                                this.selectedPickupPoint(preservedPoint);
                                this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(preservedPoint));
                            } else {
                                // Selected point no longer in bounds - don't auto-select, let user choose
                                // Only clear if it was auto-selected, otherwise keep current selection
                                const currentSelected = this.selectedPickupPoint();
                                if (!currentSelected || String(currentSelected.id) !== preserveSelectedId) {
                                    // Only auto-select if there was no previous manual selection
                                    // For now, we'll keep the current selection even if not in bounds
                                    // User can manually select a new one
                                }
                            }
                        } else if (!preserveSelectedId && !recentUserSelection) {
                            // No preserveSelectedId means this is initial load or no selection exists
                            // Only auto-select nearest if there's no current selection
                            const currentSelected = this.selectedPickupPoint();
                            if (!currentSelected && sorted.length > 0) {
                                // No previous selection, select nearest
                                this.selectedPickupPoint(sorted[0]);
                                this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(sorted[0]));
                            }
                        } else if (recentUserSelection) {
                            // User just made a selection - don't override it
                        }

                        // Update map with new points (don't reinitialize, just update markers)
                        if (this.mapInitialized && mapComponent) {
                            this.isUpdatingMap = true; // Prevent recursive calls

                            // Update map with new points
                            const filteredPoints = this.filteredPickupPoints();
                            // Keep viewport stable after pan/zoom; still pass selected point so .selected is re-applied.
                            // Passing null removed .selected from every marker then returned early (no highlight).
                            const selectedForMap = this.selectedPickupPoint();
                            mapComponent.updateMap(sorted, selectedForMap, filteredPoints, { preserveViewport: true });
                            // Release the guard after the map finished updating; never overwrite a newer manual selection
                            setTimeout(
                                function () {
                                    this.isUpdatingMap = false;
                                }.bind(this),
                                200
                            );
                        }
                    } else {
                        this.errorMessage($t("No pickup points found in this area"));
                        this.pickupPoints([]);
                    }

                    // Don't reset loading state for map bounds updates (silent updates)
                    // this.isLoading(false);
                    // this.isLoadingFromMapBounds(false);
                }.bind(this),
                error: function (xhr, status, error) {
                    this.errorMessage($t("Failed to load pickup points for this area"));
                    this.isLoading(false);
                    this.isLoadingFromMapBounds(false);
                }.bind(this),
            });
        },

        /**
         * Geocode a free text location query.
         *
         * @param {string} query
         * @returns {Promise<{lat: number, lng: number}>}
         */
        geocodeLocationQuery: function (query) {
            return $.ajax({
                url: "https://nominatim.openstreetmap.org/search",
                type: "GET",
                dataType: "json",
                data: {
                    q: query,
                    format: "json",
                    limit: 1,
                    addressdetails: 1,
                },
                headers: {
                    Accept: "application/json",
                },
            }).then(function (data) {
                if (!Array.isArray(data) || data.length === 0) {
                    return $.Deferred().reject(new Error($t("No locations found for this search query"))).promise();
                }

                const lat = parseFloat(data[0].lat);
                const lng = parseFloat(data[0].lon);
                if (Number.isNaN(lat) || Number.isNaN(lng)) {
                    return $.Deferred().reject(new Error($t("Could not determine map coordinates"))).promise();
                }

                return {
                    lat: lat,
                    lng: lng,
                };
            });
        },

        /**
         * Move the pickup points search center from the map search form.
         *
         * @param {HTMLElement} formElement
         * @param {Event} event
         * @returns {boolean}
         */
        submitMapLocationSearch: function (formElement, event) {
            if (event && typeof event.preventDefault === "function") {
                event.preventDefault();
            }

            const query = (this.mapSearchQuery() || "").trim();
            if (!query) {
                return false;
            }

            this.errorMessage(null);
            this.isLoading(true);

            this.geocodeLocationQuery(query)
                .done(
                    function (coords) {
                        const countryId = this.getCountryIdForAddress(quote.shippingAddress()) || "NL";

                        if (this.mapInitialized && mapComponent) {
                            mapComponent.setMapView([coords.lat, coords.lng], 14);
                        }

                        // Reset loading state from geocoding so loadPickupPoints can run.
                        // loadPickupPoints manages its own loading lifecycle.
                        this.isLoading(false);

                        this.loadPickupPoints(
                            {
                                street: [""],
                                postcode: "",
                                city: "",
                                countryId: countryId,
                                latitude: coords.lat,
                                longitude: coords.lng,
                            },
                            {
                                detachFromShippingAddress: true,
                                prefetchOnly: !this.isPickupPointsShippingMethodSelected(),
                            }
                        );
                    }.bind(this)
                )
                .fail(
                    function () {
                        this.isLoading(false);
                        this.errorMessage($t("Could not find this location on the map"));
                    }.bind(this)
                );

            return false;
        },

        /**
         * Reset to original address and reload pickup points
         */
        resetToOriginalAddress: function () {
            if (!this.originalAddress) {
                return;
            }

            // Clear map bounds filter
            this.mapBounds = null;

            // Reload pickup points for original address
            const address = quote.shippingAddress();
            if (address) {
                this.loadPickupPoints(address);
            }

            // Reset map view to original location if map is initialized
            if (this.mapInitialized) {
                require(["Innosend_PickupPoints/js/pickup-points-map"], function (mapComponent) {
                    // Get original address coordinates or center on pickup points
                    const points = this.pickupPoints();
                    if (points && points.length > 0) {
                        // Center on first point (nearest)
                        const firstPoint = points[0];
                        if (firstPoint.latitude && firstPoint.longitude) {
                            mapComponent.setMapView([parseFloat(firstPoint.latitude), parseFloat(firstPoint.longitude)], 13);
                        }
                    }
                }.bind(this));
            }
        },

        /**
         * Haversine distance in km (aligned with PHP DistanceCalculator, Earth radius 6371 km).
         *
         * @param {number} lat1
         * @param {number} lng1
         * @param {number} lat2
         * @param {number} lng2
         * @returns {number}
         */
        haversineDistanceKm: function (lat1, lng1, lat2, lng2) {
            const r1 = (lat1 * Math.PI) / 180;
            const r2 = (lat2 * Math.PI) / 180;
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLng = ((lng2 - lng1) * Math.PI) / 180;
            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(r1) * Math.cos(r2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return Math.round(6371 * c * 100) / 100;
        },

        /**
         * Distance from reference coordinates to a pickup point (km), or large value if coords missing.
         *
         * @param {{lat: number, lng: number}} ref
         * @param {Object} point
         * @returns {number}
         */
        distanceKmFromReference: function (ref, point) {
            if (!ref || ref.lat == null || ref.lng == null) {
                return 999999;
            }
            const lat = parseFloat(point.latitude);
            const lng = parseFloat(point.longitude);
            if (isNaN(lat) || isNaN(lng)) {
                return 999999;
            }
            return this.haversineDistanceKm(ref.lat, ref.lng, lat, lng);
        },

        /**
         * Reference point for pickup distance in the list: always the shipping address, never map pan / "Verplaats Positie".
         * Map position and bounds reload only change which points are shown, not the distance label.
         *
         * @returns {{lat: number, lng: number}|null}
         */
        getReferenceLatLngForShippingDistance: function () {
            if (this.originalShippingCoordinates) {
                const lat = parseFloat(this.originalShippingCoordinates.latitude);
                const lng = parseFloat(this.originalShippingCoordinates.longitude);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return { lat: lat, lng: lng };
                }
            }
            if (typeof quote !== "undefined" && quote.shippingAddress) {
                const addr = quote.shippingAddress();
                if (addr && addr.latitude != null && addr.longitude != null) {
                    const plat = parseFloat(addr.latitude);
                    const plng = parseFloat(addr.longitude);
                    if (!isNaN(plat) && !isNaN(plng)) {
                        return { lat: plat, lng: plng };
                    }
                }
            }
            return null;
        },

        /**
         * Select nearest pickup point from enabled carriers
         */
        selectNearestFromEnabledCarriers: function () {
            const enabledCarriers = this.selectedCarriers() || [];
            if (enabledCarriers.length === 0) {
                // No carriers enabled, clear selection
                this.selectedPickupPoint(null);
                this.selectedPickupPointDisplay(null);
                return;
            }

            const allPoints = this.pickupPoints() || [];
            if (allPoints.length === 0) {
                return;
            }

            const ref = this.getReferenceLatLngForShippingDistance();

            let enabledPoints = allPoints.filter(function (point) {
                if (!point.carrier) {
                    return false;
                }
                const pointCarrier = point.carrier.toLowerCase();
                return enabledCarriers.indexOf(pointCarrier) > -1;
            });

            if (ref) {
                enabledPoints = enabledPoints.sort(
                    function (a, b) {
                        return this.distanceKmFromReference(ref, a) - this.distanceKmFromReference(ref, b);
                    }.bind(this)
                );
            } else {
                enabledPoints = enabledPoints.sort(function (a, b) {
                    const distA = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                    const distB = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
                    return distA - distB;
                });
            }

            if (enabledPoints.length > 0) {
                const nearestPoint = enabledPoints[0];

                this.selectedPickupPoint(nearestPoint);
                this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(nearestPoint));

                // Scroll to selected point in list (map update is done by toggleCarrierFilter)
                this.scrollToSelectedPoint();
            } else {
                // No points available for enabled carriers, clear selection
                this.selectedPickupPoint(null);
                this.selectedPickupPointDisplay(null);
            }
        },

        /**
         * Check if carrier is selected in filter (case-insensitive)
         */
        isCarrierSelected: function (carrier) {
            if (!carrier) {
                return false;
            }
            const normalizedCarrier = carrier.toLowerCase();
            const selected = this.selectedCarriers() || [];
            return selected.indexOf(normalizedCarrier) > -1;
        },

        /**
         * Get filtered pickup points based on selected carriers
         * This is initialized in the initialize() function to ensure all observables are ready
         */
        filteredPickupPoints: null,

        /**
         * Toggle business hours display
         */
        toggleBusinessHours: function () {
            this.showBusinessHours(!this.showBusinessHours());
        },

        /**
         * Toggle business hours visibility for a specific pickup point in the list
         */
        toggleBusinessHoursForPoint: function (point, event) {
            if (event) {
                if (typeof event.preventDefault === "function") {
                    event.preventDefault();
                }
                if (typeof event.stopPropagation === "function") {
                    event.stopPropagation();
                }
            }
            const pointId = String(point.id);
            if (!this.showBusinessHoursForPoint[pointId]) {
                this.showBusinessHoursForPoint[pointId] = ko.observable(false);
            }
            const currentValue = this.showBusinessHoursForPoint[pointId]();
            this.showBusinessHoursForPoint[pointId](!currentValue);
            return false; // Additional safeguard to prevent default behavior
        },

        /**
         * Check if business hours are visible for a specific pickup point
         */
        isBusinessHoursVisibleForPoint: function (point) {
            if (!point || !point.id) {
                return ko.observable(false);
            }
            const pointId = String(point.id);
            if (!this.showBusinessHoursForPoint[pointId]) {
                this.showBusinessHoursForPoint[pointId] = ko.observable(false);
            }
            return this.showBusinessHoursForPoint[pointId];
        },

        /**
         * Open modal
         */
        openModal: function () {
            // Initialize selected carriers with all allowed carriers
            // Initialize selectedCarriers with carriers from pickup points (normalized to lowercase)
            const points = this.pickupPoints() || [];
            if (points.length > 0) {
                const carriersFromPoints = [
                    ...new Set(
                        points
                            .map(function (point) {
                                return point.carrier ? point.carrier.toLowerCase() : null;
                            })
                            .filter(Boolean)
                    ),
                ];
                this.selectedCarriers(carriersFromPoints);

                // Ensure nearest point is selected when opening modal
                // Always select nearest point when opening modal, even if one is already selected
                if (points.length > 0) {
                    // Sort by distance to get nearest
                    const sorted = points.slice().sort(function (a, b) {
                        const distA = a.distance || 999999;
                        const distB = b.distance || 999999;
                        return distA - distB;
                    });
                    const nearestPoint = sorted[0];
                    this.selectedPickupPoint(nearestPoint);
                }
            } else {
                const allowedCarriers = this.getAllowedCarriers();
                const normalizedAllowed = allowedCarriers.map(function (c) {
                    return c.toLowerCase();
                });
                this.selectedCarriers(normalizedAllowed.length > 0 ? normalizedAllowed : []);
            }

            this.isModalVisible(true);

            // Use setTimeout to ensure modal is fully rendered before initializing/resizing the map
            setTimeout(
                function () {
                    // Apply mobile map visibility class once modal is in the DOM (fixes first-open on mobile)
                    var modalElement = document.querySelector(".innosend-pickup-points-modal");
                    if (modalElement) {
                        if (this.shouldShowMap() && this.windowWidth() <= 768) {
                            modalElement.classList.add("show-map-mobile");
                        } else {
                            modalElement.classList.remove("show-map-mobile");
                        }
                    }

                    // Double-check that map element exists before initializing
                    const mapElement = document.getElementById("innosend-pickup-points-map");
                    if (!mapElement) {
                        // Retry after a longer delay
                        setTimeout(
                            function () {
                                this.initializeMap();
                                this.scrollToSelectedPoint();
                            }.bind(this),
                            200
                        );
                        return;
                    }

                    // Ensure map element is visible and has dimensions
                    if (mapElement.offsetWidth === 0 || mapElement.offsetHeight === 0) {
                        setTimeout(
                            function () {
                                this.initializeMap();
                                this.scrollToSelectedPoint();
                            }.bind(this),
                            200
                        );
                        return;
                    }

                    this.initializeMap();
                    // Scroll to selected point in list after map is initialized
                    this.scrollToSelectedPoint();
                }.bind(this),
                300
            );
        },

        /**
         * Close modal
         */
        closeModal: function () {
            this.isModalVisible(false);
        },

        /**
         * Select pickup point (in modal)
         */
        selectPickupPoint: function (point) {
            // Store timestamp of user selection to prevent auto-reset
            this.lastUserSelection = Date.now();

            // Check if this point is already selected - if so, don't update map
            const currentSelected = this.selectedPickupPoint();
            const isAlreadySelected =
                currentSelected && currentSelected.id && String(currentSelected.id) === String(point.id);

            // Cancel pending map-move debounce (prevents late reset back to previous selection)
            if (this.mapMoveDebounceTimer) {
                clearTimeout(this.mapMoveDebounceTimer);
                this.mapMoveDebounceTimer = null;
            }

            // Guard against programmatic map centering (setView/setCenter triggers moveend)
            this.isUpdatingMap = true;

            this.selectedPickupPoint(point);

            // Don't save here - only save when user clicks "Kies dit afhaalpunt" (confirmPickupPoint)
            // This prevents unnecessary API calls when browsing through pickup points

            // Initialize business hours observable for this point if it doesn't exist
            if (point && point.id) {
                const pointId = String(point.id);
                if (!this.showBusinessHoursForPoint[pointId]) {
                    this.showBusinessHoursForPoint[pointId] = ko.observable(false);
                }
            }

            // Only update map and filteredPickupPoints if this is a new selection (not already selected)
            // This prevents unnecessary map updates when toggling business hours
            if (!isAlreadySelected) {
                // Force re-evaluation of filteredPickupPoints by reading it
                // This ensures the isSelected properties are updated
                if (this.filteredPickupPoints) {
                    this.filteredPickupPoints();
                }

                // Update map with the clicked point explicitly so map centers on new pin (avoids stale selection)
                if (this.mapInitialized) {
                    this.updateMap(undefined, point);
                }
            }

            // Release the guard shortly after map update
            setTimeout(
                function () {
                    this.isUpdatingMap = false;
                }.bind(this),
                1000
            );

            // Scroll to selected point in list
            this.scrollToSelectedPoint();
        },

        /**
         * Confirm pickup point selection
         */
        confirmPickupPoint: function (point) {
            this.selectedPickupPoint(point);
            this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(point));
            this.savePickupPoint(point);
            this.closeModal();
        },

        /**
         * Save pickup point to quote (PostNL method - via backend controller)
         */
        savePickupPoint: function (point) {
            if (!point) {
                return;
            }

            const shippingMethod = quote.shippingMethod();
            if (!shippingMethod) {
                return;
            }

            const carrierCode =
                shippingMethod.carrier_code || (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) || null;
            const methodCode = shippingMethod.method_code || "";
            const isOurMethod =
                carrierCode === "innosend_pickup_points" ||
                methodCode === "innosend_pickup_points" ||
                methodCode.indexOf("innosend_pickup_points") === 0;

            if (!isOurMethod) {
                return;
            }

            // Extract only the required fields for the payload
            var pickupPointData = {
                pickup_point_id: String(point.id),
                pickup_point_name: point.name,
                pickup_point_address:
                    point.address || [point.street, point.postcode || point.zip_code, point.city].filter(Boolean).join(", "),
                pickup_point_carrier: point.carrier || "",
            };

            // Also set in frontend for immediate UI updates
            const address = quote.shippingAddress();
            if (!address.extensionAttributes) {
                address.extensionAttributes = {};
            }
            address.extensionAttributes.innosend_pickup_point = pickupPointData;
            quote.shippingAddress(address);

            // Store pickup point data globally so it can be restored after setShippingInformation
            // This is needed because Magento refreshes the shipping address and loses extension attributes
            this.storePickupPointGlobally(pickupPointData);

            // Save to backend via REST API (recommended method)
            // Use REST API for better security and support for guest/customer contexts
            var isGuest = resourceUrl.getCheckoutMethod() === "guest";
            var cartId = quote.getQuoteId(); // This is the masked ID for guests, or internal ID for customers

            var urls = {
                guest: "/guest-carts/" + cartId + "/save-pickup-point",
                customer: "/carts/mine/save-pickup-point",
            };

            var params = isGuest ? {quoteId: cartId} : {};
            var url = resourceUrl.getUrl(urls, params);

            // Convert pickupPointData to array format for REST API
            // Magento REST API expects array parameter to be wrapped with parameter name
            var pickupPointArray = {
                pickup_point_id: pickupPointData.pickup_point_id || "",
                pickup_point_name: pickupPointData.pickup_point_name || "",
                pickup_point_address: pickupPointData.pickup_point_address || "",
                pickup_point_carrier: pickupPointData.pickup_point_carrier || "",
            };

            // Wrap in object with parameter name for Magento REST API
            var pickupPointPayload = {
                pickupPoint: pickupPointArray,
            };

            var self = this;
            storage
                .post(url, JSON.stringify(pickupPointPayload), false)
                .done(function (response) {
                    // REST API returns boolean true on success
                    if (response === true || response === "true") {
                    } else {
                    }
                })
                .fail(function (xhr, status, error) {
                    // Fallback to AJAX controller if REST API fails
                    self.savePickupPointViaAjax(pickupPointData);
                });
        },

        /**
         * Save pickup point via AJAX controller (fallback method)
         */
        savePickupPointViaAjax: function (pickupPointData) {
            // Get save URL from window.checkoutConfig (set by ConfigProvider)
            var saveUrl = null;
            if (
                window.checkoutConfig &&
                window.checkoutConfig.shipping &&
                window.checkoutConfig.shipping.innosend_pickup_points &&
                window.checkoutConfig.shipping.innosend_pickup_points.urls &&
                window.checkoutConfig.shipping.innosend_pickup_points.urls.savePickupPoint
            ) {
                saveUrl = window.checkoutConfig.shipping.innosend_pickup_points.urls.savePickupPoint;
            }

            // Fallback to this.saveUrl if available (for backwards compatibility)
            if (!saveUrl && this.saveUrl) {
                saveUrl = this.saveUrl;
            }

            if (!saveUrl) {
                return;
            }

            var self = this;
            $.ajax({
                method: "POST",
                url: saveUrl,
                data: {
                    pickup_point: pickupPointData,
                },
                dataType: "json",
            })
                .done(function (response) {
                    if (response.success) {
                    } else {
                    }
                })
                .fail(function (xhr, status, error) {
                });
        },
        /**
         * Initialize map
         */
        initializeMap: function () {
            // Prevent recursive calls during map updates
            if (this.isUpdatingMap) {
                return;
            }

            // Check if map should be shown
            if (!this.shouldShowMap || !this.shouldShowMap()) {
                return;
            }

            // Set flag to prevent recursive calls
            this.isUpdatingMap = true;

            const points = this.pickupPoints();
            const selected = this.selectedPickupPoint();

            if (points.length === 0) {
                this.isUpdatingMap = false;
                return;
            }

            const filteredPoints = this.filteredPickupPoints ? this.filteredPickupPoints() : points;

            mapComponent.initMap("innosend-pickup-points-map", points, selected, {
                mapType: this.mapType,
                listVisible: this.showList(),
                filteredPickupPoints: filteredPoints,
                googleMapsApiKey: this.googleMapsApiKey,
                googleMapsMapId: this.googleMapsMapId,
                openMapsApiKey: this.openMapsApiKey,
                onMarkerClick: this.selectPickupPoint.bind(this),
                // Only show the choose button on desktop when list is closed (full screen map).
                showChooseButton: this.windowWidth() > 768 && !this.showList(),
                onChoosePickupPoint: this.confirmPickupPoint.bind(this),
                onMapMove: this.onMapMove.bind(this),
            });

            this.mapInitialized = true;
            this.isUpdatingMap = false; // Reset flag after initialization
        },

        /**
         * Scroll to selected point in list
         */
        scrollToSelectedPoint: function () {
            const selected = this.selectedPickupPoint();
            if (!selected) {
                return;
            }

            // Use setTimeout to ensure DOM is rendered
            setTimeout(function () {
                const selectedCard = document.querySelector(".pickup-point-card.selected");
                if (selectedCard) {
                    selectedCard.scrollIntoView({behavior: "smooth", block: "center"});
                }
            }, 100);
        },

        /**
         * Update map with current selection.
         * @param {Array|null} overridePoints - If provided, use instead of pickupPoints()
         * @param {Object|null} overrideSelected - If provided, use as selected point (e.g. clicked pin) so map centers on it immediately
         * @param {{preserveViewport?: boolean}|undefined} options - When preserveViewport is true, markers/selection update without panning/zooming the map
         */
        updateMap: function (overridePoints, overrideSelected, options) {
            if (!this.mapInitialized) {
                return;
            }

            const points = overridePoints !== undefined && overridePoints !== null ? overridePoints : this.pickupPoints();
            const selected = overrideSelected !== undefined && overrideSelected !== null ? overrideSelected : this.selectedPickupPoint();
            const filtered = this.filteredPickupPoints ? this.filteredPickupPoints() : points;

            mapComponent.updateMap(points, selected, filtered, options);
        },

        /**
         * Store pickup point data globally so it can be restored after setShippingInformation
         * This is needed because Magento refreshes the shipping address and loses extension attributes
         */
        storePickupPointGlobally: function (pickupPointData) {
            if (!window.innosendPickupPointStorage) {
                window.innosendPickupPointStorage = {};
            }
            if (pickupPointData) {
                window.innosendPickupPointStorage.pickupPoint = pickupPointData;
            } else {
                delete window.innosendPickupPointStorage.pickupPoint;
            }
        },
    });
});
