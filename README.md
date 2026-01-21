# Innosend Pickup Points Module for Magento 2

This module provides pickup points selection functionality in the Magento 2 checkout.

## Installation

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento cache:flush
```

## Configuration

1. Navigate to **Stores > Configuration > Innosend > Pickup Points**
2. Enable pickup points
3. Configure map display (optional)
4. Set default carrier (optional)

## Features

- Pickup points selection in checkout
- Modal with list and map view (OpenStreetMap)
- Automatic pickup point fetching based on shipping address
- Carrier filtering support
- Pickup point data stored in quote and order

## Requirements

- Magento 2.4.x
- PHP 7.3 - 8.3
- Innosend_Integration module

## Support

For support, please refer to the documentation in the `docs/` directory.



