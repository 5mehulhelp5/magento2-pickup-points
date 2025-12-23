/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
  "Magento_Checkout/js/view/shipping-information/address-renderer/default",
  "ko",
  "Magento_Checkout/js/model/quote",
  "Magento_Checkout/js/model/step-navigator",
  "Magento_Checkout/js/model/sidebar",
], function (Component, ko, quote, stepNavigator, sidebarModel) {
  "use strict";

  return Component.extend({
    defaults: {
      template: "Innosend_PickupPoints/shipping-information/pickup-point-address",
      isVisible: false,
      pickupPoint: null,
      isPickupPointMethod: false,
    },

    /**
     * Initialize observable
     */
    initObservable: function () {
      try {
        this._super();
        // Only observe pickupPoint - isVisible and isPickupPointMethod will be computed observables
        this.observe(["pickupPoint"]);
      } catch (e) {
        return this;
      }

      var self = this;

      // Safety check: ensure quote is available
      if (!quote || typeof quote.shippingMethod !== "function") {
        return this;
      }

      // Check if current shipping method is Innosend Pickup Points
      this.isPickupPointMethod = ko.computed(function () {
        try {
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
        } catch (e) {
          return false;
        }
      });

      // Initialize pickupPoint as observable (not computed) so we can update it
      this.pickupPoint(null);

      // Update pickup point when shipping method or address changes
      var updatePickupPoint = function () {
        try {
          var isPickupMethod = self.isPickupPointMethod();

          if (!isPickupMethod) {
            self.pickupPoint(null);
            return;
          }

          var shippingAddress = quote.shippingAddress();

          if (!shippingAddress) {
            self.pickupPoint(null);
            return;
          }

          var extensionAttributes = shippingAddress.extensionAttributes;

          if (extensionAttributes && extensionAttributes.innosend_pickup_point) {
            self.pickupPoint(extensionAttributes.innosend_pickup_point);
          } else {
            self.pickupPoint(null);
          }
        } catch (e) {
          self.pickupPoint(null);
        }
      };

      // Show pickup point info if method is pickup points and pickup point is selected
      this.isVisible = ko.computed(function () {
        try {
          return self.isPickupPointMethod() && self.pickupPoint() !== null;
        } catch (e) {
          return false;
        }
      });

      // Computed observable to format address
      // After first comma: add <br>, remove second comma
      this.formattedAddress = ko.computed(function () {
        try {
          var pickupPoint = self.pickupPoint();
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
        } catch (e) {
          return "";
        }
      });

      // Computed observable to get carrier logo URL
      // The carrier name should match the SVG filename (e.g., 'postnl' for postnl.svg)
      this.carrierLogoUrl = ko.computed(function () {
        try {
          var pickupPoint = self.pickupPoint();
          if (!pickupPoint) {
            return null;
          }

          // Get carrier name from pickup point
          var carrier = pickupPoint.pickup_point_carrier || pickupPoint.carrier;
          if (!carrier) {
            return null;
          }

          // Normalize carrier name to lowercase
          var carrierLower = carrier.toLowerCase();

          // Generate logo URL using require.toUrl() (Magento's way to get static file URLs)
          // The logo is in: Innosend_PickupPoints::images/carriers/{carrier}.svg
          if (typeof require !== "undefined" && typeof require.toUrl === "function") {
            var logoPath = "Innosend_PickupPoints/images/carriers/" + carrierLower + ".svg";
            return require.toUrl(logoPath);
          }

          // Fallback: return null if require.toUrl is not available
          return null;
        } catch (e) {
          return null;
        }
      });

      // Subscribe to shipping method changes
      var shippingMethodSubscription = quote.shippingMethod.subscribe(function (newMethod) {
        updatePickupPoint();
      });

      // Subscribe to shipping address changes
      var shippingAddressSubscription = quote.shippingAddress.subscribe(function (newAddress) {
        updatePickupPoint();
      });

      // Store subscriptions for potential cleanup
      this._innosendSubscriptions = [shippingMethodSubscription, shippingAddressSubscription];

      // Initial update
      updatePickupPoint();

      return this;
    },

    /**
     * Navigate back to shipping step
     */
    back: function () {
      sidebarModel.hide();
      stepNavigator.navigateTo("shipping");
    },
  });
});
