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

