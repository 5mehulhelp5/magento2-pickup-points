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
      console.log("Innosend Pickup Points: pickup-point-address component initializing...");

      try {
        this._super();
        console.log("Innosend Pickup Points: Called _super()");
        // Only observe pickupPoint - isVisible and isPickupPointMethod will be computed observables
        this.observe(["pickupPoint"]);
        console.log("Innosend Pickup Points: Component observables initialized");
      } catch (e) {
        console.error("Innosend Pickup Points: Error initializing observables", e, e.stack);
        return this;
      }

      var self = this;

      // Safety check: ensure quote is available
      if (!quote || typeof quote.shippingMethod !== "function") {
        console.warn("Innosend Pickup Points: Quote model not available, skipping initialization", {
          hasQuote: !!quote,
          hasShippingMethod: !!(quote && typeof quote.shippingMethod === "function"),
        });
        return this;
      }

      console.log("Innosend Pickup Points: pickup-point-address component initialized successfully");

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
          console.warn("Innosend Pickup Points: Error checking shipping method", e);
          return false;
        }
      });

      // Initialize pickupPoint as observable (not computed) so we can update it
      this.pickupPoint(null);

      // Update pickup point when shipping method or address changes
      var updatePickupPoint = function () {
        try {
          console.log("Innosend Pickup Points: updatePickupPoint called");

          var isPickupMethod = self.isPickupPointMethod();
          console.log("Innosend Pickup Points: isPickupPointMethod =", isPickupMethod);

          if (!isPickupMethod) {
            console.log("Innosend Pickup Points: Not a pickup point method, clearing pickup point");
            self.pickupPoint(null);
            return;
          }

          var shippingAddress = quote.shippingAddress();
          console.log("Innosend Pickup Points: shippingAddress =", shippingAddress);

          if (!shippingAddress) {
            console.log("Innosend Pickup Points: No shipping address, clearing pickup point");
            self.pickupPoint(null);
            return;
          }

          var extensionAttributes = shippingAddress.extensionAttributes;
          console.log("Innosend Pickup Points: extensionAttributes =", extensionAttributes);

          if (extensionAttributes && extensionAttributes.innosend_pickup_point) {
            console.log(
              "Innosend Pickup Points: Found pickup point in extension attributes",
              extensionAttributes.innosend_pickup_point
            );
            self.pickupPoint(extensionAttributes.innosend_pickup_point);
          } else {
            console.log("Innosend Pickup Points: No pickup point found in extension attributes", {
              hasExtensionAttributes: !!extensionAttributes,
              hasPickupPoint: !!(extensionAttributes && extensionAttributes.innosend_pickup_point),
              extensionAttributes: extensionAttributes,
              shippingAddressKeys: shippingAddress ? Object.keys(shippingAddress) : [],
            });
            self.pickupPoint(null);
          }
        } catch (e) {
          console.warn("Innosend Pickup Points: Error updating pickup point", e);
          self.pickupPoint(null);
        }
      };

      // Show pickup point info if method is pickup points and pickup point is selected
      this.isVisible = ko.computed(function () {
        try {
          var isVisible = self.isPickupPointMethod() && self.pickupPoint() !== null;
          console.log("Innosend Pickup Points: isVisible computed", {
            isPickupPointMethod: self.isPickupPointMethod(),
            hasPickupPoint: self.pickupPoint() !== null,
            pickupPoint: self.pickupPoint(),
            isVisible: isVisible,
          });
          return isVisible;
        } catch (e) {
          console.warn("Innosend Pickup Points: Error checking visibility", e);
          return false;
        }
      });

      // Subscribe to shipping method changes
      var shippingMethodSubscription = quote.shippingMethod.subscribe(function (newMethod) {
        console.log("Innosend Pickup Points: Shipping method subscription triggered", newMethod);
        updatePickupPoint();
      });

      // Subscribe to shipping address changes
      var shippingAddressSubscription = quote.shippingAddress.subscribe(function (newAddress) {
        console.log("Innosend Pickup Points: Shipping address subscription triggered", {
          hasAddress: !!newAddress,
          hasExtensionAttrs: !!(newAddress && newAddress.extensionAttributes),
          hasPickupPoint: !!(
            newAddress &&
            newAddress.extensionAttributes &&
            newAddress.extensionAttributes.innosend_pickup_point
          ),
        });
        updatePickupPoint();
      });

      // Store subscriptions for potential cleanup
      this._innosendSubscriptions = [shippingMethodSubscription, shippingAddressSubscription];

      // Initial update
      console.log("Innosend Pickup Points: Calling initial updatePickupPoint");
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
