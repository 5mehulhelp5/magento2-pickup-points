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
      this.isModalVisible = ko.observable(false);
      this.showBusinessHours = ko.observable(false);
      this.showBusinessHoursForPoint = {}; // Track business hours visibility per point ID
      this.mapInitialized = false;
      this.errorMessage = ko.observable(null);
      this.apiRequestUrl = ko.observable(null);
      this.showList = ko.observable(true);
      this.selectedCarriers = ko.observableArray([]);
      this.shippingAddressDisplay = ko.observable("");
      this.filteredPickupPointsComputed = null;
      this.mapBounds = null;
      this.originalAddress = null; // Store original address for reset
      this.originalShippingCoordinates = null; // Store original shipping coordinates for distance calculation
      this.isLoadingFromMapBounds = ko.observable(false); // Track if loading from map bounds
      this.mapMoveDebounceTimer = null; // Debounce timer for map movement
      this.isUpdatingMap = false; // Flag to prevent recursive map updates
      this.lastUserSelection = null; // Store timestamp of last user selection to prevent auto-reset
      this.lastMapCenter = null; // Store last map center to detect significant movement
      this.lastMapZoom = null; // Store last map zoom level
      this.pickupPointsLoadDebounceTimer = null; // Debounce timer for address-based loading
      this.lastPickupPointsLookupKey = null; // Prevent repeated loading for same address key

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

          // Get pickup points directly and sort them (don't depend on sortedPickupPoints)
          let points = [];
          try {
            // Safely get pickup points
            let rawPoints = [];
            try {
              rawPoints = this.pickupPoints() || [];
            } catch (e) {
              // pickupPoints might not be ready yet
              return [];
            }


            if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
              return [];
            }

            // Sort by distance
            // Read selectedPickupPoint to create dependency for automatic re-evaluation
            const selectedPoint = this.selectedPickupPoint();
            const selectedId = selectedPoint ? String(selectedPoint.id) : null;

            points = rawPoints
              .slice()
              .sort(function (a, b) {
                const distA = a.distance || 999999;
                const distB = b.distance || 999999;
                return distA - distB;
              })
              .map(function (point) {
                // Create a new object with isSelected property to ensure reactivity
                // Don't mutate the original point object
                return Object.assign({}, point, {
                  isSelected: selectedId !== null && String(point.id) === selectedId,
                });
              });
          } catch (e) {
            return [];
          }

          // Safely get selectedCarriers
          let selectedCarriers = [];
          try {
            if (this.selectedCarriers && typeof this.selectedCarriers === "function") {
              selectedCarriers = this.selectedCarriers() || [];
            }
          } catch (e) {
            // selectedCarriers might not be ready yet
            selectedCarriers = [];
          }


          if (!Array.isArray(points) || points.length === 0) {
            return [];
          }

          // If no carriers selected, show no points (all filters are off)
          if (selectedCarriers.length === 0) {
            return [];
          }

          // Filter by selected carriers (case-insensitive comparison)
          let filtered = points.filter(function (point) {
            if (!point.carrier) {
              return false;
            }
            // Normalize carrier name to lowercase for comparison
            const pointCarrier = point.carrier.toLowerCase();
            const isMatch = selectedCarriers.indexOf(pointCarrier) > -1;
            return isMatch;
          });

          // Note: We no longer filter by map bounds here because pickup points
          // are now loaded dynamically based on map bounds via onMapMove


          return filtered;
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


      // Watch for shouldShowMap changes (e.g., when window is resized)
      this.shouldShowMap.subscribe(function (shouldShow) {

        // Update CSS class on modal for mobile map visibility (similar to Paazl)
        var modalElement = document.querySelector(".innosend-pickup-points-modal");
        if (modalElement) {
          if (shouldShow && this.windowWidth() <= 768) {
            modalElement.classList.add("show-map-mobile");
          } else {
            modalElement.classList.remove("show-map-mobile");
          }
        }

        // If modal is visible and map should not be shown, destroy it
        if (this.isModalVisible() && !shouldShow && this.mapInitialized) {
          if (window.mapComponent && typeof window.mapComponent.destroyMap === "function") {
            try {
              window.mapComponent.destroyMap();
              this.mapInitialized = false;
            } catch (e) {
            }
          }
        }
        // If modal is visible and map should be shown, initialize it
        else if (this.isModalVisible() && shouldShow && !this.mapInitialized) {
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

              if (hasOurMethod) {
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
          const currentPostcode = currentAddress && currentAddress.postcode ? String(currentAddress.postcode).trim() : "";
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
          this.loadPickupPoints(currentAddress);
        }.bind(this),
        delay
      );
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
      } else {
        this.selectedPickupPointDisplay(null);
        this.pickupPoints([]);
      }
    },

    /**
     * Handle shipping address change
     */
    onShippingAddressChange: function (address) {

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

      if (isOurMethod) {
        // Load nearest pickup point as soon as street[0], postcode and city are filled
        this.maybeLoadPickupPointsForAddress(address, 350);
      }
    },

    /**
     * Load pickup points
     */
    loadPickupPoints: function (address) {
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

      // Store original shipping coordinates for distance calculation
      // These will always be used for distance calculation, even when map is moved
      if (address.latitude && address.longitude) {
        this.originalShippingCoordinates = {
          latitude: address.latitude,
          longitude: address.longitude,
        };
        requestData.latitude = address.latitude;
        requestData.longitude = address.longitude;
      }

      // Always use original shipping coordinates for distance calculation if available
      // If not available yet, backend will geocode and we'll store them from response
      if (this.originalShippingCoordinates) {
        requestData.search_latitude = this.originalShippingCoordinates.latitude;
        requestData.search_longitude = this.originalShippingCoordinates.longitude;
      }

      // Clear previous errors
      this.errorMessage(null);
      this.apiRequestUrl(null);

      // Build query string manually to match WordPress plugin format
      // WordPress plugin uses: couriers=value1&couriers=value2 (not couriers[]=value1)
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

          // Clear any previous errors
          this.errorMessage(null);

          // Store geocoded coordinates from backend response if available and not already stored
          // This ensures we always have coordinates for distance calculation
          if (response.search_latitude && response.search_longitude && !this.originalShippingCoordinates) {
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

            // Always auto-select first (nearest) pickup point if no manual selection exists
            // This ensures the first point is always selected by default (Paazl behavior)
            const currentSelected = this.selectedPickupPoint();
            if (!currentSelected && sorted.length > 0) {
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
                this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(preservedPoint));
              } else {
                // Selected point no longer in results - keep current selection, user can manually change
              }
            }
          } else {

            // Show error message with API URL
            const errorMsg = response.message || "No pickup points found for this address.";
            const apiUrl = response.api_url || this.apiRequestUrl() || "Unknown";
            this.errorMessage(errorMsg + " (API URL: " + apiUrl + ")");

            // Clear pickup points
            this.pickupPoints([]);
            this.selectedPickupPoint(null);
            this.selectedPickupPointDisplay(null);
            this.storePickupPointGlobally(null);
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

          // Show error message with API URL
          const apiUrl = this.apiRequestUrl() || "Unknown";
          this.errorMessage(errorMsg + " (API URL: " + apiUrl + ")");

          // Clear pickup points
          this.pickupPoints([]);
          this.selectedPickupPoint(null);
          this.selectedPickupPointDisplay(null);
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

      return {
        id: point.id,
        name: point.name,
        address: point.address || [point.street, point.postcode, point.city].filter(Boolean).join(", "),
        distance: point.distance,
        carrier: point.carrier,
        logo: point.logo || this.getCarrierLogoUrl(point.carrier), // Small image for lists/filters
        mark_image: point.mark_image || point.logo || this.getCarrierLogoUrl(point.carrier), // Mark image for map markers
        opening_hours: openingHours,
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
     * Get carrier logo URL from pickup points
     */
    getCarrierLogoForFilter: function (carrier) {
      if (!carrier) {
        return null;
      }
      // Find first pickup point with this carrier to get logo
      const points = this.pickupPoints() || [];
      const normalizedCarrier = carrier.toLowerCase();
      for (let i = 0; i < points.length; i++) {
        if (points[i].carrier && points[i].carrier.toLowerCase() === normalizedCarrier) {
          if (points[i].logo) {
            return points[i].logo;
          }
        }
      }
      // Fallback to getCarrierLogoUrl if no logo found in points
      return this.getCarrierLogoUrl(carrier);
    },

    /**
     * Toggle list visibility
     */
    toggleList: function () {
      this.showList(!this.showList());
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

      // Update map to show/hide markers based on filter
      if (this.mapInitialized) {
        this.updateMap();
      }
    },

    /**
     * Handle map movement - load pickup points for visible bounds (with debouncing)
     */
    onMapMove: function (bounds) {
      // Prevent recursive calls during map updates
      if (this.isUpdatingMap || !bounds || !this.mapInitialized) {
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

      const currentZoom =
        window.mapComponent && window.mapComponent.getMapZoom ? window.mapComponent.getMapZoom() : null;

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

      // Always use original shipping coordinates for distance calculation
      if (this.originalShippingCoordinates) {
        requestData.search_latitude = this.originalShippingCoordinates.latitude;
        requestData.search_longitude = this.originalShippingCoordinates.longitude;
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
            if (this.mapInitialized && window.mapComponent) {
              this.isUpdatingMap = true; // Prevent recursive calls

              // Store current selected point
              const currentSelected = this.selectedPickupPoint();

              // Update map with new points
              const filteredPoints = this.filteredPickupPoints();
              window.mapComponent.updateMap(sorted, currentSelected, filteredPoints);
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

      // Filter points by enabled carriers and sort by distance
      const enabledPoints = allPoints
        .filter(function (point) {
          if (!point.carrier) {
            return false;
          }
          const pointCarrier = point.carrier.toLowerCase();
          return enabledCarriers.indexOf(pointCarrier) > -1;
        })
        .sort(function (a, b) {
          const distA = a.distance || 999999;
          const distB = b.distance || 999999;
          return distA - distB;
        });

      if (enabledPoints.length > 0) {
        const nearestPoint = enabledPoints[0];

        this.selectedPickupPoint(nearestPoint);
        this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(nearestPoint));

        // Update map if initialized
        if (this.mapInitialized) {
          this.updateMap();
        }

        // Scroll to selected point in list
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

      // Update CSS class on modal for mobile map visibility (similar to Paazl)
      setTimeout(
        function () {
          var modalElement = document.querySelector(".innosend-pickup-points-modal");
          if (modalElement) {
            if (this.shouldShowMap() && this.windowWidth() <= 768) {
              modalElement.classList.add("show-map-mobile");
            } else {
              modalElement.classList.remove("show-map-mobile");
            }
          }
        }.bind(this),
        0
      );

      // Initialize map when modal opens (always show map in new layout)
      // Always reinitialize map when modal opens to ensure it's displayed correctly
      // Reset mapInitialized flag to force reinitialization
      this.mapInitialized = false;

      // Clear any existing map instance in mapComponent before reinitializing
      if (window.mapComponent && typeof window.mapComponent.destroyMap === "function") {
        try {
          window.mapComponent.destroyMap();
        } catch (e) {
        }
      }

      // Use setTimeout to ensure modal is fully rendered before initializing map
      setTimeout(
        function () {
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

      // Don't save here - only save when user clicks "Kies dit Afhaalpunt" (confirmPickupPoint)
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

        // Update map only if this is a new selection
        if (this.mapInitialized) {
          this.updateMap();
        }

        // Release the guard shortly after map update
        setTimeout(
          function () {
            this.isUpdatingMap = false;
          }.bind(this),
          1000
        );
      }

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

      var params = isGuest ? { quoteId: cartId } : {};
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
        return;
      }

      mapComponent.initMap("innosend-pickup-points-map", points, selected, {
        mapType: this.mapType,
        googleMapsApiKey: this.googleMapsApiKey,
        openMapsApiKey: this.openMapsApiKey,
        onMarkerClick: this.selectPickupPoint.bind(this),
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
          selectedCard.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    },

    /**
     * Update map with current selection
     */
    updateMap: function () {
      if (!this.mapInitialized) {
        return;
      }

      const points = this.pickupPoints();
      const selected = this.selectedPickupPoint();
      // Get filtered points to show/hide markers based on filter
      const filtered = this.filteredPickupPoints ? this.filteredPickupPoints() : points;

      mapComponent.updateMap(points, selected, filtered);
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
