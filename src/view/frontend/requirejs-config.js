var config = {
  paths: {
    leaflet: "Innosend_PickupPoints/js/leaflet",
    "leaflet-markercluster": "Innosend_PickupPoints/js/leaflet.markercluster",
  },
  shim: {
    "leaflet-markercluster": ["leaflet"],
  },
  config: {
    mixins: {
      "Magento_Checkout/js/view/shipping-information/address-renderer/default": {
        "Innosend_PickupPoints/js/view/shipping-information-mixin": true,
      },
      "Magento_Checkout/js/action/set-shipping-information": {
        "Innosend_PickupPoints/js/action/set-shipping-information-mixin": true,
      },
    },
  },
};
