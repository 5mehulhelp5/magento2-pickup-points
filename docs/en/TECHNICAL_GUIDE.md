# Innosend Pickup Points Module - Technical Guide

## Architecture

The module extends the checkout process with pickup point selection functionality.

## Components

### Models

- `PickupPoint` - Data model for pickup point information
- `PickupPointRepository` - Repository for fetching pickup points via API
- `Quote\PickupPoint` - Quote extension attribute model
- `Order\PickupPoint` - Order extension attribute model

### Controllers

- `Ajax\GetPickupPoints` - AJAX endpoint for fetching pickup points

### Frontend

- JavaScript component: `pickup-points.js`
- Map component: `pickup-points-map.js`
- Templates: `checkout.phtml`, `modal.phtml`
- CSS: `pickup-points.css`

## Extension Attributes

### Quote

```php
$quote->getShippingAddress()
    ->getExtensionAttributes()
    ->getInnosendPickupPoint()
    ->getPickupPointId();
```

### Order

```php
$order->getExtensionAttributes()
    ->getInnosendPickupPoint()
    ->getPickupPointId();
```

## API Integration

The module uses the Base module's API client to fetch pickup points:

```php
$pickupPoints = $pickupPointRepository->getPickupPoints(
    $street,
    $postcode,
    $city,
    $countryCode,
    $carrier
);
```

## JavaScript API

### Component Initialization

```javascript
{
    "#innosend-pickup-points-container": {
        "Magento_Ui/js/core/app": {
            "components": {
                "innosendPickupPoints": {
                    "component": "Innosend_PickupPoints/js/pickup-points",
                    "config": {
                        "ajaxUrl": "/innosend/ajax/getPickupPoints",
                        "showMap": true
                    }
                }
            }
        }
    }
}
```

## Map Integration

The module uses Leaflet (OpenStreetMap) for map display:

- Library: Leaflet 1.9.4
- Tiles: OpenStreetMap
- Auto-loaded when map is enabled

## Customization

### Custom Template

Override template in your theme:
`app/design/frontend/YourVendor/YourTheme/Innosend_PickupPoints/templates/pickup-points/checkout.phtml`

### Custom Styles

Override CSS in your theme:
`app/design/frontend/YourVendor/YourTheme/Innosend_PickupPoints/web/css/pickup-points.css`

## Requirements

- Innosend_Base module
- Magento 2.4.x
- PHP 7.3 - 8.3



