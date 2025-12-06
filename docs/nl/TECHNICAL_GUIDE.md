# Innosend Pickup Points Module - Technische Gids

## Architectuur

De module breidt het checkoutproces uit met afhaalpuntselectiefunctionaliteit.

## Componenten

### Models

- `PickupPoint` - Data model voor afhaalpunt informatie
- `PickupPointRepository` - Repository voor ophalen afhaalpunten via API
- `Quote\PickupPoint` - Quote extension attribute model
- `Order\PickupPoint` - Order extension attribute model

### Controllers

- `Ajax\GetPickupPoints` - AJAX endpoint voor ophalen afhaalpunten

### Frontend

- JavaScript component: `pickup-points.js`
- Kaart component: `pickup-points-map.js`
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

## API Integratie

De module gebruikt de Base module's API client om afhaalpunten op te halen:

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

### Component Initialisatie

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

## Kaart Integratie

De module gebruikt Leaflet (OpenStreetMap) voor kaartweergave:

- Library: Leaflet 1.9.4
- Tiles: OpenStreetMap
- Automatisch geladen wanneer kaart is ingeschakeld

## Aanpassingen

### Aangepast Template

Overschrijf template in uw thema:
`app/design/frontend/YourVendor/YourTheme/Innosend_PickupPoints/templates/pickup-points/checkout.phtml`

### Aangepaste Stijlen

Overschrijf CSS in uw thema:
`app/design/frontend/YourVendor/YourTheme/Innosend_PickupPoints/web/css/pickup-points.css`

## Vereisten

- Innosend_Base module
- Magento 2.4.x
- PHP 7.3 - 8.3







