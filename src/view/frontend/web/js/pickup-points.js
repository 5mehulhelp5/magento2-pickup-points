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
    'Magento_Checkout/js/model/shipping-service'
], function ($, Component, ko, quote, shippingService) {
    'use strict';

    return Component.extend({
        defaults: {
            template: 'Innosend_PickupPoints/pickup-points/modal',
            ajaxUrl: '',
            showMap: false
        },

        /**
         * Initialize component
         */
        initialize: function () {
            this._super();
            this.selectedPickupPoint = ko.observable(null);
            this.pickupPoints = ko.observableArray([]);
            this.isLoading = ko.observable(false);
            this.isModalVisible = ko.observable(false);

            // Watch for shipping address changes
            quote.shippingAddress.subscribe(this.onShippingAddressChange.bind(this), this);

            return this;
        },

        /**
         * Handle shipping address change
         */
        onShippingAddressChange: function (address) {
            if (address && address.street && address.postcode && address.city && address.countryId) {
                this.loadPickupPoints(address);
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

            $.ajax({
                url: this.ajaxUrl,
                type: 'POST',
                data: {
                    street: address.street.join(' '),
                    postcode: address.postcode,
                    city: address.city,
                    country_code: address.countryId
                },
                dataType: 'json',
                success: function (response) {
                    if (response.success && response.data) {
                        this.pickupPoints(response.data);
                        if (response.data.length > 0) {
                            this.selectedPickupPoint(response.data[0]);
                        }
                    }
                }.bind(this),
                error: function () {
                    console.error('Error loading pickup points');
                },
                complete: function () {
                    this.isLoading(false);
                }.bind(this)
            });
        },

        /**
         * Open modal
         */
        openModal: function () {
            this.isModalVisible(true);
        },

        /**
         * Close modal
         */
        closeModal: function () {
            this.isModalVisible(false);
        },

        /**
         * Select pickup point
         */
        selectPickupPoint: function (point) {
            this.selectedPickupPoint(point);
            this.savePickupPoint(point);
        },

        /**
         * Save pickup point to quote
         */
        savePickupPoint: function (point) {
            // Save to quote extension attributes via AJAX
            $.ajax({
                url: '/rest/default/V1/carts/mine/shipping-information',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({
                    addressInformation: {
                        shipping_address: quote.shippingAddress(),
                        shipping_method_code: quote.shippingMethod()?.method_code,
                        shipping_carrier_code: quote.shippingMethod()?.carrier_code,
                        extension_attributes: {
                            innosend_pickup_point: {
                                pickup_point_id: point.id,
                                pickup_point_name: point.name,
                                pickup_point_address: point.address
                            }
                        }
                    }
                }),
                success: function () {
                    // Trigger totals update
                    quote.shippingAddress.valueHasMutated();
                }
            });
        }
    });
});



