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
       * Override isVisible to hide shipping address when pickup point is selected
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
          // Wrap original in a computed that checks for pickup point
          this.isVisible = ko.computed(function () {
            // If pickup point is selected, hide the shipping address
            if (self.hasPickupPoint()) {
              return false;
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
            return !self.hasPickupPoint();
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

