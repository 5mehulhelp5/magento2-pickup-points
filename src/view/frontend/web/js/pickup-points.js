/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
    'jquery',
    'uiComponent',
    'ko',
    'Magento_Checkout/js/model/quote',
    'Innosend_PickupPoints/js/pickup-points-map',
    'mage/translate'
], function ($, Component, ko, quote, mapComponent, $t) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Innosend_PickupPoints/pickup-points/modal',
            ajaxUrl: '',
            showMap: false,
            mapType: 'open_maps',
            googleMapsApiKey: '',
            openMapsApiKey: '',
            allowedCarriers: []
        },

        /**
         * Get template for selected pickup point
         */
        getSelectedTemplate: function () {
            return 'Innosend_PickupPoints/pickup-points/selected';
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
            this.mapInitialized = false;
            this.errorMessage = ko.observable(null);
            this.apiRequestUrl = ko.observable(null);

            console.log('Innosend Pickup Points: Component initialized', {
                ajaxUrl: this.ajaxUrl,
                showMap: this.showMap,
                mapType: this.mapType
            });

            // Watch for shipping method changes
            quote.shippingMethod.subscribe(this.onShippingMethodChange.bind(this), this);
            
            // Watch for shipping address changes
            quote.shippingAddress.subscribe(this.onShippingAddressChange.bind(this), this);

            // Also watch for shipping rates to detect when methods become available
            if (typeof require !== 'undefined') {
                require(['Magento_Checkout/js/model/shipping-service'], function (shippingService) {
                    shippingService.getShippingRates().subscribe(function (rates) {
                        console.log('Innosend Pickup Points: Shipping rates updated', rates);
                        
                        // Check if our method is in the available rates
                        const hasOurMethod = rates.some(function(rate) {
                            return rate.carrier_code === 'innosend_pickup_points';
                        });
                        
                        if (hasOurMethod) {
                            console.log('Innosend Pickup Points: Our shipping method is available in rates');
                        }
                        
                        // Check if our method is available and selected
                        const currentMethod = quote.shippingMethod();
                        if (currentMethod) {
                            const carrierCode = currentMethod.carrier_code || 
                                             (currentMethod.method_code && currentMethod.method_code.split('_')[0]) ||
                                             null;
                            const methodCode = currentMethod.method_code || '';
                            const isOurMethod = carrierCode === 'innosend_pickup_points' || 
                                             methodCode === 'innosend_pickup_points' ||
                                             methodCode.indexOf('innosend_pickup_points') === 0;
                            if (isOurMethod) {
                                console.log('Innosend Pickup Points: Our method is selected, checking address');
                                this.onShippingMethodChange(currentMethod);
                            }
                        }
                    }.bind(this), this);
                }.bind(this));
            }

            // Initialize with current shipping method and address
            const currentMethod = quote.shippingMethod();
            const currentAddress = quote.shippingAddress();
            
            if (currentMethod) {
                console.log('Innosend Pickup Points: Initial shipping method', currentMethod);
                this.onShippingMethodChange(currentMethod);
            } else if (currentAddress) {
                // If address is set but no method yet, wait for method selection
                console.log('Innosend Pickup Points: Address available, waiting for shipping method');
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
            const carrierCode = shippingMethod.carrier_code || 
                               (shippingMethod.method_code && shippingMethod.method_code.split('_')[0]) ||
                               null;
            
            // Also check if method_code contains our carrier code
            const methodCode = shippingMethod.method_code || '';
            const isOurMethod = carrierCode === 'innosend_pickup_points' || 
                               methodCode === 'innosend_pickup_points' ||
                               methodCode.indexOf('innosend_pickup_points') === 0;
            
            return isOurMethod;
        }, this),

        /**
         * Handle shipping method change
         */
        onShippingMethodChange: function (shippingMethod) {
            console.log('Innosend Pickup Points: Shipping method changed', shippingMethod);
            
            if (!shippingMethod) {
                console.log('Innosend Pickup Points: No shipping method selected');
                this.selectedPickupPointDisplay(null);
                this.pickupPoints([]);
                return;
            }

            // Check carrier code - can be in different formats
            const carrierCode = shippingMethod.carrier_code || 
                               (shippingMethod.method_code && shippingMethod.method_code.split('_')[0]) ||
                               null;
            
            // Also check method_code directly
            const methodCode = shippingMethod.method_code || '';
            
            console.log('Innosend Pickup Points: Carrier code', carrierCode, 'Method code', methodCode);

            // Only show pickup points for Innosend Pickup Points shipping method
            const isOurMethod = carrierCode === 'innosend_pickup_points' || 
                               methodCode === 'innosend_pickup_points' ||
                               methodCode.indexOf('innosend_pickup_points') === 0;
            
            if (isOurMethod) {
                console.log('Innosend Pickup Points: Our shipping method selected, loading pickup points');
                const address = quote.shippingAddress();
                console.log('Innosend Pickup Points: Shipping address', address);
                
                if (address && address.street && address.postcode && address.city && address.countryId) {
                    this.loadPickupPoints(address);
                } else {
                    console.log('Innosend Pickup Points: Address incomplete, creating fallback', {
                        hasStreet: !!address?.street,
                        hasPostcode: !!address?.postcode,
                        hasCity: !!address?.city,
                        hasCountry: !!address?.countryId
                    });
                    // Create fallback pickup point even with incomplete address
                    this.createFallbackPickupPoint(address || {});
                }
            } else {
                console.log('Innosend Pickup Points: Different shipping method selected, hiding pickup points');
                this.selectedPickupPointDisplay(null);
                this.pickupPoints([]);
            }
        },

        /**
         * Handle shipping address change
         */
        onShippingAddressChange: function (address) {
            console.log('Innosend Pickup Points: Shipping address changed', address);
            
            const shippingMethod = quote.shippingMethod();
            if (!shippingMethod) {
                return;
            }
            
            const carrierCode = shippingMethod.carrier_code || 
                               (shippingMethod.method_code && shippingMethod.method_code.split('_')[0]) ||
                               null;
            const methodCode = shippingMethod.method_code || '';
            const isOurMethod = carrierCode === 'innosend_pickup_points' || 
                               methodCode === 'innosend_pickup_points' ||
                               methodCode.indexOf('innosend_pickup_points') === 0;
            
            if (isOurMethod) {
                console.log('Innosend Pickup Points: Our method is selected, checking address');
                
                // Check if address is complete
                const streetValue = address && address.street ? 
                    (Array.isArray(address.street) ? address.street.join(' ') : address.street) : '';
                
                if (address && streetValue && address.postcode && address.city && address.countryId) {
                    console.log('Innosend Pickup Points: Address complete, loading pickup points');
                    this.loadPickupPoints(address);
                } else {
                    console.log('Innosend Pickup Points: Address incomplete, creating fallback', {
                        hasStreet: !!streetValue,
                        hasPostcode: !!address?.postcode,
                        hasCity: !!address?.city,
                        hasCountry: !!address?.countryId
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
                console.log('Innosend Pickup Points: Already loading, skipping');
                return;
            }

            console.log('Innosend Pickup Points: Loading pickup points for address', address);
            this.isLoading(true);

            const carriers = this.getAllowedCarriers();
            const streetValue = Array.isArray(address.street) ? address.street.join(' ') : (address.street || '');

            const requestData = {
                street: streetValue,
                postcode: address.postcode || '',
                city: address.city || '',
                country_code: address.countryId || ''
            };

            // Add couriers array if available (WordPress plugin format)
            // Convert all couriers to uppercase for API consistency
            if (carriers.length > 0) {
                requestData.couriers = carriers.map(function(carrier) {
                    return String(carrier).toUpperCase().trim();
                });
            }

            // Add coordinates for distance calculation if available
            if (address.latitude && address.longitude) {
                requestData.latitude = address.latitude;
                requestData.longitude = address.longitude;
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
                        value.forEach(function(item) {
                            queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(item)));
                        });
                    } else {
                        queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
                    }
                }
            }
            
            // Build full request URL for debugging
            const requestUrl = this.ajaxUrl + (queryParts.length > 0 ? '?' + queryParts.join('&') : '');
            this.apiRequestUrl(requestUrl);
            
            console.log('Innosend Pickup Points: AJAX request', {
                url: this.ajaxUrl,
                fullUrl: requestUrl,
                data: requestData
            });

            $.ajax({
                url: this.ajaxUrl,
                type: 'POST',
                data: requestData,
                dataType: 'json',
                traditional: true, // Use traditional array serialization (couriers=value1&couriers=value2)
                success: function (response) {
                    console.log('Innosend Pickup Points: AJAX success', response);
                    
                    // Clear any previous errors
                    this.errorMessage(null);
                    
                    if (response.success && response.data && response.data.length > 0) {
                        // Data is already sorted by distance on the backend (nearest first)
                        // But we'll sort again client-side as a safety measure
                        const sorted = response.data.sort(function (a, b) {
                            const distA = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                            const distB = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
                            return distA - distB;
                        });
                        
                        console.log('Innosend Pickup Points: Loaded ' + sorted.length + ' pickup points', {
                            nearest: sorted[0] ? {
                                name: sorted[0].name,
                                distance: sorted[0].distance
                            } : null
                        });
                        this.pickupPoints(sorted);
                        
                        // Select nearest (first) pickup point - this is the closest one based on shipping address
                        if (sorted.length > 0) {
                            const nearestPoint = sorted[0];
                            
                            // Verify that we're using the pickup point address, not the shipping address
                            console.log('Innosend Pickup Points: Selected nearest pickup point', {
                                id: nearestPoint.id,
                                name: nearestPoint.name,
                                pickup_point_address: nearestPoint.address,
                                pickup_point_street: nearestPoint.street,
                                pickup_point_postcode: nearestPoint.postcode,
                                pickup_point_city: nearestPoint.city,
                                distance: nearestPoint.distance,
                                shipping_address_street: address.street,
                                shipping_address_postcode: address.postcode,
                                shipping_address_city: address.city
                            });
                            
                            // Ensure we're displaying the pickup point address, not shipping address
                            if (!nearestPoint.address && nearestPoint.street) {
                                // Build address from pickup point components if not set
                                nearestPoint.address = [
                                    nearestPoint.street,
                                    nearestPoint.postcode,
                                    nearestPoint.city
                                ].filter(Boolean).join(', ');
                            }
                            
                            this.selectedPickupPoint(nearestPoint);
                            this.selectedPickupPointDisplay(this.formatPickupPointForDisplay(nearestPoint));
                            this.savePickupPoint(nearestPoint);
                        }
                    } else {
                        console.warn('Innosend Pickup Points: No pickup points returned', response);
                        
                        // Show error message with API URL
                        const errorMsg = response.message || 'No pickup points found for this address.';
                        const apiUrl = response.api_url || this.apiRequestUrl() || 'Unknown';
                        this.errorMessage(errorMsg + ' (API URL: ' + apiUrl + ')');
                        
                        // Clear pickup points
                        this.pickupPoints([]);
                        this.selectedPickupPoint(null);
                        this.selectedPickupPointDisplay(null);
                    }
                }.bind(this),
                error: function (xhr, status, error) {
                    console.error('Innosend Pickup Points: AJAX error', {
                        status: status,
                        error: error,
                        responseText: xhr.responseText,
                        statusCode: xhr.status,
                        requestUrl: this.apiRequestUrl()
                    });
                    
                    // Try to parse error response
                    let errorMsg = 'Unable to load pickup points.';
                    try {
                        const errorResponse = JSON.parse(xhr.responseText);
                        if (errorResponse.message) {
                            errorMsg = errorResponse.message;
                        }
                    } catch (e) {
                        // Use default error message
                    }
                    
                    // Show error message with API URL
                    const apiUrl = this.apiRequestUrl() || 'Unknown';
                    this.errorMessage(errorMsg + ' (API URL: ' + apiUrl + ')');
                    
                    // Clear pickup points
                    this.pickupPoints([]);
                    this.selectedPickupPoint(null);
                    this.selectedPickupPointDisplay(null);
                }.bind(this),
                complete: function () {
                    this.isLoading(false);
                    console.log('Innosend Pickup Points: Loading complete');
                }.bind(this)
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
            const points = this.pickupPoints();
            return points.slice().sort(function (a, b) {
                const distA = a.distance || 999999;
                const distB = b.distance || 999999;
                return distA - distB;
            });
        }, this),

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
                openingHours = point.opening_hours.map(function(hours) {
                    if (typeof hours === 'object' && hours !== null) {
                        return {
                            day_of_week: hours.day_of_week || hours.day || '',
                            day_name_short: hours.day_name_short || '',
                            day_name_long: hours.day_name_long || '',
                            hours: hours.hours || '', // Merged hours string from backend
                            opens: hours.opens || '', // Keep for backward compatibility
                            closes: hours.closes || '' // Keep for backward compatibility
                        };
                    }
                    return hours;
                });
            }

            return {
                id: point.id,
                name: point.name,
                address: point.address || [point.street, point.postcode, point.city].filter(Boolean).join(', '),
                distance: point.distance,
                carrier: point.carrier,
                logo: point.logo || this.getCarrierLogoUrl(point.carrier),
                opening_hours: openingHours
            };
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
         * Get allowed carriers
         */
        getAllowedCarriers: function () {
            return this.allowedCarriers || [];
        },

        /**
         * Toggle business hours display
         */
        toggleBusinessHours: function () {
            this.showBusinessHours(!this.showBusinessHours());
        },

        /**
         * Open modal
         */
        openModal: function () {
            this.isModalVisible(true);
            
            // Initialize map when modal opens
            if (this.showMap && !this.mapInitialized) {
                this.initializeMap();
            } else if (this.showMap && this.mapInitialized) {
                this.updateMap();
            }
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
            this.selectedPickupPoint(point);
            
            // Update map to center on selected point
            if (this.showMap && this.mapInitialized) {
                this.updateMap();
            }
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
            
            const carrierCode = shippingMethod.carrier_code || 
                               (shippingMethod.method_code && shippingMethod.method_code.split('_')[0]) ||
                               null;
            const methodCode = shippingMethod.method_code || '';
            const isOurMethod = carrierCode === 'innosend_pickup_points' || 
                               methodCode === 'innosend_pickup_points' ||
                               methodCode.indexOf('innosend_pickup_points') === 0;
            
            if (!isOurMethod) {
                return;
            }

            // Use Magento's shipping information save mechanism
            require(['Magento_Checkout/js/action/set-shipping-information'], function (setShippingInformation) {
                const address = quote.shippingAddress();
                
                setShippingInformation({
                    'shipping_address': address,
                    'shipping_method_code': shippingMethod.method_code,
                    'shipping_carrier_code': shippingMethod.carrier_code,
                    'extension_attributes': {
                        'innosend_pickup_point': {
                            'pickup_point_id': point.id,
                            'pickup_point_name': point.name,
                            'pickup_point_address': point.address || [point.street, point.postcode, point.city].filter(Boolean).join(', '),
                            'pickup_point_carrier': point.carrier,
                            'pickup_point_distance': point.distance
                        }
                    }
                });
            });
        },

        /**
         * Initialize map
         */
        initializeMap: function () {
            if (!this.showMap) {
                return;
            }

            const points = this.pickupPoints();
            const selected = this.selectedPickupPoint();

            if (points.length === 0) {
                return;
            }

            mapComponent.initMap(
                'innosend-pickup-points-map',
                points,
                selected,
                {
                    mapType: this.mapType,
                    googleMapsApiKey: this.googleMapsApiKey,
                    openMapsApiKey: this.openMapsApiKey,
                    onMarkerClick: this.selectPickupPoint.bind(this)
                }
            );

            this.mapInitialized = true;
        },

        /**
         * Update map with current selection
         */
        updateMap: function () {
            if (!this.mapInitialized || !this.showMap) {
                return;
            }

            const points = this.pickupPoints();
            const selected = this.selectedPickupPoint();

            mapComponent.updateMap(points, selected);
        }
    });
});
