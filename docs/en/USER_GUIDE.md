# Innosend Pickup Points Module - User Guide

## Overview

The Innosend Pickup Points module allows customers to select pickup points during checkout. It displays nearby pickup points based on the shipping address and provides both list and map views.

## Installation

### Via Composer

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento cache:flush
```

## Configuration

1. Navigate to **Stores > Configuration > Innosend > Pickup Points**
2. **Enable Pickup Points**
3. **Show Map** - Enable/disable map view in modal
4. **Default Carrier** - Optional carrier code for filtering

## Features

- Automatic pickup point fetching based on shipping address
- Modal with list and map view (OpenStreetMap)
- Pickup point selection and storage
- Data stored in quote and order
- Carrier filtering support

## Usage

### Customer Experience

1. Customer enters shipping address in checkout
2. Pickup points are automatically loaded
3. Default pickup point is pre-selected
4. Customer can click to change pickup point
5. Modal opens with list and map view
6. Customer selects preferred pickup point
7. Selection is saved with order

### Admin

Pickup point information is stored in order extension attributes and can be viewed in:
- Order details
- Order grid (with custom column)
- Order API responses

## Troubleshooting

### Pickup Points Not Loading

- Verify API configuration in Base module
- Check browser console for JavaScript errors
- Verify shipping address is complete
- Check network requests in browser dev tools

### Map Not Displaying

- Ensure "Show Map" is enabled in configuration
- Check browser console for Leaflet library errors
- Verify internet connection (map tiles require external access)

## Support

For technical support, please refer to the Technical Guide or contact support@innosend.com














