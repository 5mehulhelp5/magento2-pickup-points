/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

define([
  "mage/utils/wrapper",
  "Magento_Checkout/js/model/quote",
  "Magento_Checkout/js/model/resource-url-manager",
  "mage/storage",
], function (wrapper, quote, resourceUrlManager, storage) {
  "use strict";

  return function (setShippingInformationAction) {
    return wrapper.wrap(setShippingInformationAction, function (originalAction) {
      var shippingMethod = quote.shippingMethod();

      // Check if this is our shipping method
      if (!shippingMethod) {
        return originalAction();
      }

      var carrierCode =
        shippingMethod.carrier_code || (shippingMethod.method_code && shippingMethod.method_code.split("_")[0]) || null;
      var methodCode = shippingMethod.method_code || "";

      var isPickupPointMethod =
        carrierCode === "innosend_pickup_points" ||
        methodCode === "innosend_pickup_points" ||
        methodCode.indexOf("innosend_pickup_points") === 0;

      if (!isPickupPointMethod) {
        return originalAction();
      }

      // Get pickup point data from global storage (set when pickup point is saved)
      // This is more reliable than reading from quote.shippingAddress() which may be refreshed
      var currentPickupPoint = null;
      if (window.innosendPickupPointStorage && window.innosendPickupPointStorage.pickupPoint) {
        currentPickupPoint = window.innosendPickupPointStorage.pickupPoint;
      } else {
        // Fallback: try to get from quote.shippingAddress()
        var currentShippingAddress = quote.shippingAddress();
        if (
          currentShippingAddress &&
          currentShippingAddress.extensionAttributes &&
          currentShippingAddress.extensionAttributes.innosend_pickup_point
        ) {
          currentPickupPoint = currentShippingAddress.extensionAttributes.innosend_pickup_point;
        } else {
        }
      }

      // Call original action first
      return originalAction().done(function (response) {
        // After shipping information is set, restore pickup point data
        // if it was set before, as the response might have cleared it
        try {
          var shippingAddress = quote.shippingAddress();

          if (!shippingAddress) {
            return;
          }

          // If we had pickup point data before, restore it
          if (currentPickupPoint) {
            // Ensure extensionAttributes exists
            if (!shippingAddress.extensionAttributes) {
              shippingAddress.extensionAttributes = {};
            }

            // Restore pickup point data
            shippingAddress.extensionAttributes.innosend_pickup_point = currentPickupPoint;

            // Update quote with restored address
            // Use quote.shippingAddress() setter to trigger KnockoutJS subscriptions
            quote.shippingAddress(shippingAddress);

            // Force trigger subscription by setting the address again after a small delay
            // This ensures all components that subscribe to shippingAddress are notified
            setTimeout(function () {
              var updatedAddress = quote.shippingAddress();
              if (updatedAddress) {
                // Create a new object reference to trigger the subscription
                var newAddress = Object.assign({}, updatedAddress);
                if (!newAddress.extensionAttributes) {
                  newAddress.extensionAttributes = {};
                }
                if (currentPickupPoint) {
                  newAddress.extensionAttributes.innosend_pickup_point = currentPickupPoint;
                }
                quote.shippingAddress(newAddress);
              }
            }, 100);
          } else {
          }
        } catch (e) {}
      });
    });
  };
});

