# Innosend Pickup Points – Technical Guide

## Architecture

The module extends the Magento checkout with pickup point selection. It depends entirely on `Innosend_Integration` for API connectivity and uses Bearer token authentication via the shared `ClientInterface`.

## API endpoint

```
GET https://api.innosend.eu/v1/pickup-point/
Authorization: Bearer {API_TOKEN}
```

Parameters (address-based):

| Parameter | Type | Example |
|---|---|---|
| `country_code` | string | `NL` |
| `city` | string | `Amsterdam` |
| `street` | string | `Damrak` |
| `zip_code` | string | `1012` |
| `couriers[]` | array | `DHL`, `PostNL` |

Parameters (coordinate-based):

| Parameter | Type | Example |
|---|---|---|
| `country_code` | string | `NL` |
| `latitude` | float | `52.3676` |
| `longitude` | float | `4.9041` |
| `couriers[]` | array | `DHL` |

Available couriers endpoint:

```
GET https://api.innosend.eu/v1/pickup-point/courier/
Authorization: Bearer {API_TOKEN}
```

## Module components

### Models

| Class | Purpose |
|---|---|
| `Model\PickupPoint` | Value object for a single pickup point |
| `Model\PickupPointRepository` | Calls the API and maps responses to `PickupPoint` objects |
| `Model\Quote\PickupPoint` | Quote extension attribute |
| `Model\Order\PickupPoint` | Order extension attribute |
| `Model\Carrier\PickupPoints` | Custom shipping carrier (calculates rate) |
| `Model\Config\Source\Carriers` | Fetches carrier list from API for admin dropdown |

### Controllers

| Route | Class | Description |
|---|---|---|
| `POST /innosend/ajax/getPickupPoints` | `Controller\Ajax\GetPickupPoints` | Returns nearby pickup points as JSON |
| `POST /innosend/ajax/savePickupPoint` | `Controller\Ajax\SavePickupPoint` | Saves selection to the current quote |

### Observers / Plugins

| Class | Event / target | Purpose |
|---|---|---|
| `Observer\QuoteSubmitBefore` | `sales_model_service_quote_submit_before` | Copies pickup point from quote to order |
| `Observer\SalesOrderPlaceAfter` | `sales_order_place_after` | Persists pickup point data to `fm_innosend_order` table |
| `Plugin\Sales\Model\Order\Pdf\InvoicePlugin` | `Magento\Sales\Model\Order\Pdf\Invoice` | Appends pickup point info to invoice PDF |

## `PickupPointRepository`

```php
// Address-based
$points = $repository->getPickupPoints(
    street: 'Damrak',
    postcode: '1012',
    city: 'Amsterdam',
    countryCode: 'NL',
    carriers: ['DHL', 'PostNL'],       // optional
    searchLatitude: 52.37,              // optional, for distance sorting
    searchLongitude: 4.89
);

// Coordinate-based
$points = $repository->getPickupPointsByCoordinates(
    latitude: 52.37,
    longitude: 4.89,
    countryCode: 'NL',
    carriers: ['DHL'],
);
```

Both methods call `$apiClient->isEnabled()` first and throw `LocalizedException` when the API is not configured.

When multiple carriers are requested, a **separate API call is made per carrier** to avoid URL query-string parsing issues with duplicate `couriers[]` parameters.

## Extension attributes

### Quote

```php
$pickupPoint = $quote->getShippingAddress()
    ->getExtensionAttributes()
    ->getInnosendPickupPoint();

$pickupPoint->getPickupPointId();   // string
$pickupPoint->getCourierCode();     // string, e.g. 'dhl'
$pickupPoint->getPickupPointName(); // string
$pickupPoint->getPickupPointAddress(); // string
```

### Order

```php
$pickupPoint = $order->getExtensionAttributes()
    ->getInnosendPickupPoint();
```

## Database table

| Table | Key columns |
|---|---|
| `fm_innosend_order` | `order_id`, `shipping_information` (JSON) |

## AJAX response format

`POST /innosend/ajax/getPickupPoints` returns:

```json
{
    "success": true,
    "data": [
        {
            "id": "PP001",
            "name": "DHL ServicePoint",
            "address": "Damrak 1, 1012AB, Amsterdam",
            "street": "Damrak 1",
            "postcode": "1012AB",
            "city": "Amsterdam",
            "country_code": "NL",
            "latitude": 52.37,
            "longitude": 4.89,
            "carrier": "dhl",
            "logo": "https://...",
            "distance": 0.12,
            "opening_hours": [
                { "day_of_week": 1, "day_name_short": "Mon", "hours": "09:00 - 18:00" }
            ]
        }
    ],
    "search_latitude": 52.3676,
    "search_longitude": 4.9041
}
```

## Customisation

### Override template

```
app/design/frontend/Vendor/Theme/Innosend_PickupPoints/templates/
```

### Override CSS

```
app/design/frontend/Vendor/Theme/Innosend_PickupPoints/web/css/pickup-points.css
```

### Custom carrier list

Implement `Innosend\Integration\Api\CarrierInterface` and register it via `etc/di.xml`.

## Unit tests

```bash
vendor/bin/phpunit package-source/innosend/magento2-pickup-points/tests/Unit
```

## Requirements

- `Innosend_Integration` ≥ 1.1.0
- Magento 2.4.x
- PHP 8.1 – 8.3
