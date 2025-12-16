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
  "Innosend_PickupPoints/js/pickup-points-map",
  "mage/translate",
], function ($, Component, ko, quote, mapComponent, $t) {
  "use strict";

  return Component.extend({
    defaults: {
      template: "Innosend_PickupPoints/pickup-points/modal",
      ajaxUrl: "",
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

            console.log("Innosend Pickup Points: filteredPickupPoints - raw points", {
              count: rawPoints.length,
              isArray: Array.isArray(rawPoints),
              sample: rawPoints.slice(0, 2),
            });

            if (!Array.isArray(rawPoints) || rawPoints.length === 0) {
              console.log("Innosend Pickup Points: filteredPickupPoints - no raw points available");
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
            console.error("Innosend Pickup Points: Error processing pickup points", e);
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

          console.log("Innosend Pickup Points: filteredPickupPoints - filtering", {
            pointsCount: points.length,
            selectedCarriers: selectedCarriers,
            selectedCarriersLength: selectedCarriers.length,
            sampleCarriers: points.slice(0, 3).map(function (p) {
              return p.carrier;
            }),
          });

          if (!Array.isArray(points) || points.length === 0) {
            console.log("Innosend Pickup Points: filteredPickupPoints - no points after processing");
            return [];
          }

          // If no carriers selected, show no points (all filters are off)
          if (selectedCarriers.length === 0) {
            console.log("Innosend Pickup Points: filteredPickupPoints - no carriers selected, showing no points", {
              count: points.length,
            });
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

          console.log("Innosend Pickup Points: filteredPickupPoints - filtered result", {
            totalPoints: points.length,
            filteredCount: filtered.length,
            selectedCarriers: selectedCarriers,
            sampleFiltered: filtered.slice(0, 3).map(function (p) {
              return {
                id: p.id,
                name: p.name,
                carrier: p.carrier,
                carrierLower: p.carrier ? p.carrier.toLowerCase() : null,
                matches: p.carrier ? selectedCarriers.indexOf(p.carrier.toLowerCase()) > -1 : false,
              };
            }),
          });

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

      console.log("Innosend Pickup Points: Component initialized", {
        ajaxUrl: this.ajaxUrl,
        showMap: this.showMap,
        showMapMobile: this.showMapMobile,
        mapType: this.mapType,
        hasFilteredPickupPoints: !!this.filteredPickupPoints,
        shouldShowMap: this.shouldShowMap(),
        windowWidth: this.windowWidth(),
      });

      // Watch for shouldShowMap changes (e.g., when window is resized)
      this.shouldShowMap.subscribe(function (shouldShow) {
        console.log("Innosend Pickup Points: shouldShowMap changed", {
          shouldShow: shouldShow,
          windowWidth: this.windowWidth(),
          isModalVisible: this.isModalVisible(),
        });

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
              console.log("Innosend Pickup Points: Map destroyed because shouldShowMap is now false");
            } catch (e) {
              console.warn("Innosend Pickup Points: Error destroying map", e);
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
              console.log("Innosend Pickup Points: Shipping rates updated", rates);

              // Check if our method is in the available rates
              const hasOurMethod = rates.some(function (rate) {
                return rate.carrier_code === "innosend_pickup_points";
              });

              if (hasOurMethod) {
                console.log("Innosend Pickup Points: Our shipping method is available in rates");
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
                  console.log("Innosend Pickup Points: Our method is selected, checking address");
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
        console.log("Innosend Pickup Points: Initial shipping method", currentMethod);
        this.onShippingMethodChange(currentMethod);
      } else if (currentAddress) {
        // If address is set but no method yet, wait for method selection
        console.log("Innosend Pickup Points: Address available, waiting for shipping method");
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
     * Handle shipping method change
     */
    onShippingMethodChange: function (shippingMethod) {
      console.log("Innosend Pickup Points: Shipping method changed", shippingMethod);

      if (!shippingMethod) {
        console.log("Innosend Pickup Points: No shipping method selected");
        this.selectedPickupPointDisplay(null);
        this.pickupPoints([]);
        return;
      }

      // Check carrier code - can be in different formats
      const carrierCode =
        shippingMethod.carrier_code || (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) || null;

      // Also check method_code directly
      const methodCode = shippingMethod.method_code || "";

      console.log("Innosend Pickup Points: Carrier code", carrierCode, "Method code", methodCode);

      // Only show pickup points for Innosend Pickup Points shipping method
      const isOurMethod =
        carrierCode === "innosend_pickup_points" ||
        methodCode === "innosend_pickup_points" ||
        methodCode.indexOf("innosend_pickup_points") === 0;

      if (isOurMethod) {
        console.log("Innosend Pickup Points: Our shipping method selected, loading pickup points");
        const address = quote.shippingAddress();

        // Update shipping address display for search bar
        if (address) {
          const addressParts = [address.street, address.postcode, address.city].filter(Boolean);
          const addressString = addressParts.join(", ");
          this.shippingAddressDisplay(addressString);
          // Store original address for reset functionality
          this.originalAddress = {
            street: address.street,
            postcode: address.postcode,
            city: address.city,
            countryId: address.countryId,
            addressString: addressString,
          };
        }
        console.log("Innosend Pickup Points: Shipping address", address);

        if (address && address.street && address.postcode && address.city && address.countryId) {
          this.loadPickupPoints(address);
        } else {
          console.log("Innosend Pickup Points: Address incomplete, creating fallback", {
            hasStreet: !!address?.street,
            hasPostcode: !!address?.postcode,
            hasCity: !!address?.city,
            hasCountry: !!address?.countryId,
          });
          // Create fallback pickup point even with incomplete address
          this.createFallbackPickupPoint(address || {});
        }
      } else {
        console.log("Innosend Pickup Points: Different shipping method selected, hiding pickup points");
        this.selectedPickupPointDisplay(null);
        this.pickupPoints([]);
      }
    },

    /**
     * Handle shipping address change
     */
    onShippingAddressChange: function (address) {
      console.log("Innosend Pickup Points: Shipping address changed", address);

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
        console.log("Innosend Pickup Points: Our method is selected, checking address");

        // Check if address is complete
        const streetValue =
          address && address.street ? (Array.isArray(address.street) ? address.street.join(" ") : address.street) : "";

        if (address && streetValue && address.postcode && address.city && address.countryId) {
          console.log("Innosend Pickup Points: Address complete, loading pickup points");
          this.loadPickupPoints(address);
        } else {
          console.log("Innosend Pickup Points: Address incomplete, creating fallback", {
            hasStreet: !!streetValue,
            hasPostcode: !!address?.postcode,
            hasCity: !!address?.city,
            hasCountry: !!address?.countryId,
          });
          // Create fallback pickup point even with incomplete address
          this.createFallbackPickupPoint(address || {});
        }
      }
    },

    /**
     * Load pickup points
     */
    loadPickupPoints: function (address) {
      if (this.isLoading()) {
        console.log("Innosend Pickup Points: Already loading, skipping");
        return;
      }

      console.log("Innosend Pickup Points: Loading pickup points for address", address);
      this.isLoading(true);

      const carriers = this.getAllowedCarriers();
      const streetValue = Array.isArray(address.street) ? address.street.join(" ") : address.street || "";

      const requestData = {
        street: streetValue,
        postcode: address.postcode || "",
        city: address.city || "",
        country_code: address.countryId || "",
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

      console.log("Innosend Pickup Points: AJAX request", {
        url: this.ajaxUrl,
        fullUrl: requestUrl,
        data: requestData,
      });

      $.ajax({
        url: this.ajaxUrl,
        type: "POST",
        data: requestData,
        dataType: "json",
        traditional: true, // Use traditional array serialization (couriers=value1&couriers=value2)
        success: function (response) {
          console.log("Innosend Pickup Points: AJAX success", response);

          // Clear any previous errors
          this.errorMessage(null);

          // Store geocoded coordinates from backend response if available and not already stored
          // This ensures we always have coordinates for distance calculation
          if (response.search_latitude && response.search_longitude && !this.originalShippingCoordinates) {
            this.originalShippingCoordinates = {
              latitude: response.search_latitude,
              longitude: response.search_longitude,
            };
            console.log("Innosend Pickup Points: Stored geocoded coordinates from backend", {
              latitude: response.search_latitude,
              longitude: response.search_longitude,
            });
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
            console.log("Innosend Pickup Points: Carriers in response", {
              carriers: carriersInResponse,
              count: carriersInResponse.length,
              requestedCarriers: requestData.couriers || [],
            });

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
              console.log("Innosend Pickup Points: Initialized selectedCarriers with all carriers", {
                original: carriersInResponse,
                normalized: normalizedCarriers,
                selectedCarriersAfter: this.selectedCarriers(),
              });
            } else {
              console.log("Innosend Pickup Points: selectedCarriers already set", {
                current: this.selectedCarriers(),
                carriersInResponse: carriersInResponse,
              });
            }

            // Data is already sorted by distance on the backend (nearest first)
            // But we'll sort again client-side as a safety measure
            const sorted = response.data.sort(function (a, b) {
              const distA = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
              const distB = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
              return distA - distB;
            });

            console.log("Innosend Pickup Points: Loaded " + sorted.length + " pickup points", {
              nearest: sorted[0]
                ? {
                    name: sorted[0].name,
                    distance: sorted[0].distance,
                    carrier: sorted[0].carrier,
                  }
                : null,
              carriers: carriersInResponse,
              allPoints: sorted,
              selectedCarriers: this.selectedCarriers(),
            });
            this.pickupPoints(sorted);

            // Log immediately - computed observables will be evaluated by Knockout automatically
            console.log("Innosend Pickup Points: pickupPoints observable updated", {
              count: this.pickupPoints().length,
              points: this.pickupPoints(),
              selectedCarriers: this.selectedCarriers(),
            });

            // Always auto-select first (nearest) pickup point if no manual selection exists
            // This ensures the first point is always selected by default (Paazl behavior)
            const currentSelected = this.selectedPickupPoint();
            if (!currentSelected && sorted.length > 0) {
              const nearestPoint = sorted[0];

              // Verify that we're using the pickup point address, not the shipping address
              console.log("Innosend Pickup Points: Auto-selected first (nearest) pickup point", {
                id: nearestPoint.id,
                name: nearestPoint.name,
                pickup_point_address: nearestPoint.address,
                pickup_point_street: nearestPoint.street,
                pickup_point_postcode: nearestPoint.postcode,
                pickup_point_city: nearestPoint.city,
                distance: nearestPoint.distance,
                shipping_address_street: address.street,
                shipping_address_postcode: address.postcode,
                shipping_address_city: address.city,
              });

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
                console.log("Innosend Pickup Points: Preserved user's selected pickup point", {
                  id: preservedPoint.id,
                  name: preservedPoint.name,
                });
              } else {
                // Selected point no longer in results - keep current selection, user can manually change
                console.log(
                  "Innosend Pickup Points: User's selected pickup point not in new results, keeping current selection",
                  {
                    currentId: currentSelected.id,
                  }
                );
              }
            }
          } else {
            console.warn("Innosend Pickup Points: No pickup points returned", response);

            // Show error message with API URL
            const errorMsg = response.message || "No pickup points found for this address.";
            const apiUrl = response.api_url || this.apiRequestUrl() || "Unknown";
            this.errorMessage(errorMsg + " (API URL: " + apiUrl + ")");

            // Clear pickup points
            this.pickupPoints([]);
            this.selectedPickupPoint(null);
            this.selectedPickupPointDisplay(null);
          }
        }.bind(this),
        error: function (xhr, status, error) {
          console.error("Innosend Pickup Points: AJAX error", {
            status: status,
            error: error,
            responseText: xhr.responseText,
            statusCode: xhr.status,
            requestUrl: this.apiRequestUrl(),
          });

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
          console.log("Innosend Pickup Points: Loading complete");
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
        console.log("Innosend Pickup Points: Ignoring map move - recent user selection");
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
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) *
            Math.sin(dLng / 2);
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
        country_code: this.originalAddress ? this.originalAddress.countryId : "NL",
        couriers: normalizedCarriers,
      };

      // Always use original shipping coordinates for distance calculation
      if (this.originalShippingCoordinates) {
        requestData.search_latitude = this.originalShippingCoordinates.latitude;
        requestData.search_longitude = this.originalShippingCoordinates.longitude;
      }

      console.log("Innosend Pickup Points: Loading pickup points for map bounds", {
        latitude: latitude,
        longitude: longitude,
        bounds: bounds,
        carriers: normalizedCarriers,
      });

      $.ajax({
        url: this.ajaxUrl,
        type: "POST",
        data: requestData,
        dataType: "json",
        traditional: true,
        success: function (response) {
          console.log("Innosend Pickup Points: AJAX success for map bounds", response);

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
              console.log("Innosend Pickup Points: Preserving recent user selection during map reload");
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
          console.error("Innosend Pickup Points: AJAX error for map bounds", {
            status: status,
            error: error,
            response: xhr.responseText,
          });

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

      console.log("Innosend Pickup Points: Resetting to original address", this.originalAddress);

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
        console.log("Innosend Pickup Points: Auto-selecting nearest point from enabled carriers", {
          id: nearestPoint.id,
          name: nearestPoint.name,
          carrier: nearestPoint.carrier,
          distance: nearestPoint.distance,
          enabledCarriers: enabledCarriers,
        });

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
      console.log("Innosend Pickup Points: Opening modal", {
        pickupPointsCount: this.pickupPoints().length,
        pickupPoints: this.pickupPoints(),
        showMap: this.showMap,
        mapInitialized: this.mapInitialized,
      });

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
        console.log("Innosend Pickup Points: Initialized selectedCarriers from pickup points", {
          carriers: carriersFromPoints,
          count: carriersFromPoints.length,
        });

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
          console.log("Innosend Pickup Points: Auto-selected nearest point when opening modal", {
            id: nearestPoint.id,
            name: nearestPoint.name,
            distance: nearestPoint.distance,
            carrier: nearestPoint.carrier,
          });
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
          console.warn("Innosend Pickup Points: Error destroying existing map", e);
        }
      }

      // Use setTimeout to ensure modal is fully rendered before initializing map
      setTimeout(
        function () {
          // Double-check that map element exists before initializing
          const mapElement = document.getElementById("innosend-pickup-points-map");
          if (!mapElement) {
            console.warn("Innosend Pickup Points: Map element not found, retrying...");
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
            console.warn("Innosend Pickup Points: Map element has no dimensions, retrying...");
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

      console.log("Innosend Pickup Points: Selecting pickup point", {
        id: point.id,
        name: point.name,
        currentSelected: currentSelected ? currentSelected.id : null,
        isAlreadySelected: isAlreadySelected,
      });

      // Cancel pending map-move debounce (prevents late reset back to previous selection)
      if (this.mapMoveDebounceTimer) {
        clearTimeout(this.mapMoveDebounceTimer);
        this.mapMoveDebounceTimer = null;
      }

      // Guard against programmatic map centering (setView/setCenter triggers moveend)
      this.isUpdatingMap = true;

      this.selectedPickupPoint(point);

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
     * Save pickup point to quote
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

      // Use Magento's shipping information save mechanism
      require(["Magento_Checkout/js/action/set-shipping-information"], function (setShippingInformation) {
        const address = quote.shippingAddress();

        setShippingInformation({
          shipping_address: address,
          shipping_method_code: shippingMethod.method_code,
          shipping_carrier_code: shippingMethod.carrier_code,
          extension_attributes: {
            innosend_pickup_point: {
              pickup_point_id: point.id,
              pickup_point_name: point.name,
              pickup_point_address:
                point.address || [point.street, point.postcode, point.city].filter(Boolean).join(", "),
              pickup_point_carrier: point.carrier,
              pickup_point_distance: point.distance,
            },
          },
        });
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
        console.log("Innosend Pickup Points: Map not shown due to configuration or device type");
        return;
      }

      // Set flag to prevent recursive calls
      this.isUpdatingMap = true;

      const points = this.pickupPoints();
      const selected = this.selectedPickupPoint();

      console.log("Innosend Pickup Points: Initializing map", {
        pointsCount: points.length,
        points: points,
        selected: selected,
        mapElement: document.getElementById("innosend-pickup-points-map"),
        shouldShowMap: this.shouldShowMap(),
      });

      if (points.length === 0) {
        console.warn("Innosend Pickup Points: Cannot initialize map - no pickup points available");
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
      console.log("Innosend Pickup Points: Map initialized");
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
  });
});
