/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define(["ko", "Magento_Checkout/js/model/quote"], function (ko, quote) {
    "use strict";

    return function (target) {
        return target.extend({
            /**
             * Check if shipping method is Innosend Pickup Points
             */
            isInnosendPickupPointMethod: function () {
                var shippingMethod = quote.shippingMethod();
                if (!shippingMethod) {
                    return false;
                }

                var carrierCode =
                    shippingMethod.carrier_code ||
                    (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) ||
                    null;
                var methodCode = shippingMethod.method_code || "";

                return (
                    carrierCode === "innosend_pickup_points" ||
                    methodCode === "innosend_pickup_points" ||
                    methodCode.indexOf("innosend_pickup_points") === 0
                );
            },

            /**
             * Check if pickup point is selected
             */
            hasPickupPoint: function () {
                if (!this.isInnosendPickupPointMethod()) {
                    return false;
                }

                var shippingAddress = quote.shippingAddress();
                if (!shippingAddress) {
                    return false;
                }

                var extensionAttributes = shippingAddress.extensionAttributes;
                return (
                    extensionAttributes &&
                    extensionAttributes.innosend_pickup_point &&
                    extensionAttributes.innosend_pickup_point.pickup_point_id
                );
            },

            /**
             * Get pickup point data
             */
            getPickupPoint: function () {
                var shippingAddress = quote.shippingAddress();
                if (!shippingAddress) {
                    return null;
                }

                var extensionAttributes = shippingAddress.extensionAttributes;
                if (extensionAttributes && extensionAttributes.innosend_pickup_point) {
                    return extensionAttributes.innosend_pickup_point;
                }

                return null;
            },

            /**
             * Get formatted address (first comma = <br>, remove second comma)
             */
            getFormattedAddress: function () {
                var pickupPoint = this.getPickupPoint();
                if (!pickupPoint || !pickupPoint.pickup_point_address) {
                    return "";
                }

                var address = pickupPoint.pickup_point_address;

                // Split by comma
                var parts = address.split(",");

                if (parts.length === 0) {
                    return "";
                }

                // First part (before first comma)
                var formattedAddress = parts[0].trim();

                // If there's a second part (after first comma), add <br> and join remaining parts without commas
                if (parts.length > 1) {
                    var remainingParts = parts.slice(1).join(",").trim();
                    // Remove all commas from remaining parts
                    remainingParts = remainingParts.replace(/,/g, "").trim();
                    if (remainingParts) {
                        formattedAddress += "<br>" + remainingParts;
                    }
                }

                return formattedAddress;
            },

            /**
             * Get carrier logo URL
             */
            getCarrierLogoUrl: function () {
                var pickupPoint = this.getPickupPoint();
                if (!pickupPoint) {
                    return null;
                }

                var carrier = pickupPoint.pickup_point_carrier || pickupPoint.carrier;
                if (!carrier) {
                    return null;
                }

                var carrierLower = carrier.toLowerCase();

                // Generate logo URL using require.toUrl()
                if (typeof require !== "undefined" && typeof require.toUrl === "function") {
                    var logoPath = "Innosend_PickupPoints/images/carriers/" + carrierLower + ".svg";
                    return require.toUrl(logoPath);
                }

                return null;
            },

            /**
             * Get formatted carrier name
             */
            getFormattedCarrierName: function () {
                var pickupPoint = this.getPickupPoint();
                if (!pickupPoint) {
                    return "";
                }

                var carrier = pickupPoint.pickup_point_carrier || pickupPoint.carrier;
                if (!carrier) {
                    return "";
                }

                // Format: capitalize first letter, rest lowercase
                return carrier.charAt(0).toUpperCase() + carrier.slice(1).toLowerCase();
            },

            /**
             * Override isVisible to show shipping address or pickup point
             */
            initObservable: function () {
                this._super();

                var self = this;

                // Safety check: ensure quote is available
                if (!quote || typeof quote.shippingMethod !== "function") {
                    return this;
                }

                // Store original isVisible if it exists
                var originalIsVisible = this.isVisible;

                // Subscribe to shipping method changes
                var shippingMethodSubscription = quote.shippingMethod.subscribe(function () {
                    self.updateVisibility();
                });

                // Subscribe to shipping address changes
                var shippingAddressSubscription = quote.shippingAddress.subscribe(function () {
                    self.updateVisibility();
                });

                // Store subscriptions for cleanup
                this._innosendSubscriptions = [shippingMethodSubscription, shippingAddressSubscription];

                // Override isVisible computed only if it exists
                if (originalIsVisible && ko.isObservable(originalIsVisible)) {
                    // Wrap original in a computed that shows either shipping address or pickup point
                    this.isVisible = ko.computed(function () {
                        // If pickup point is selected, show the component (to display pickup point info)
                        if (self.hasPickupPoint()) {
                            return true;
                        }
                        // Otherwise use original visibility logic
                        try {
                            return originalIsVisible();
                        } catch (e) {
                            // Fallback if original observable has issues
                            return true;
                        }
                    });
                } else if (!this.isVisible) {
                    // If isVisible doesn't exist, create it
                    this.isVisible = ko.computed(function () {
                        return true; // Always show, template will decide what to display
                    });
                }

                return this;
            },

            /**
             * Update visibility
             */
            updateVisibility: function () {
                // Trigger recomputation safely
                if (this.isVisible && ko.isObservable(this.isVisible)) {
                    try {
                        this.isVisible.notifySubscribers();
                    } catch (e) {
                        // Silently handle errors
                    }
                }
            },
        });
    };
});
