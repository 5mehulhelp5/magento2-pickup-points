# Innosend Pickup Points – Technische Gids

## Architectuur

De module breidt de Magento-checkout uit met afhaalpuntselectie. Voor API-connectiviteit is hij volledig afhankelijk van `Innosend_Integration` en gebruikt hij Bearer-tokenauthenticatie via de gedeelde `ClientInterface`.

## API-endpoint

```
GET https://api.innosend.eu/v1/pickup-point/
Authorization: Bearer {API_TOKEN}
```

Parameters (op basis van adres):

| Parameter | Type | Voorbeeld |
|---|---|---|
| `country_code` | string | `NL` |
| `city` | string | `Amsterdam` |
| `street` | string | `Damrak` |
| `zip_code` | string | `1012` |
| `couriers[]` | array | `DHL`, `PostNL` |

Parameters (op basis van coördinaten):

| Parameter | Type | Voorbeeld |
|---|---|---|
| `country_code` | string | `NL` |
| `latitude` | float | `52.3676` |
| `longitude` | float | `4.9041` |
| `couriers[]` | array | `DHL` |

Beschikbare carriers-endpoint:

```
GET https://api.innosend.eu/v1/pickup-point/courier/
Authorization: Bearer {API_TOKEN}
```

## Modulecomponenten

### Models

| Klasse | Doel |
|---|---|
| `Model\PickupPoint` | Value-object voor één afhaalpunt |
| `Model\PickupPointRepository` | Roept API aan en converteert responses naar `PickupPoint`-objecten |
| `Model\Quote\PickupPoint` | Quote extension attribute |
| `Model\Order\PickupPoint` | Order extension attribute |
| `Model\Carrier\PickupPoints` | Aangepaste verzendcarrier (berekent tarief) |
| `Model\Config\Source\Carriers` | Haalt carrierlijst op van de API voor admin-dropdown |

### Controllers

| Route | Klasse | Omschrijving |
|---|---|---|
| `POST /innosend/ajax/getPickupPoints` | `Controller\Ajax\GetPickupPoints` | Retourneert nabijgelegen afhaalpunten als JSON |
| `POST /innosend/ajax/savePickupPoint` | `Controller\Ajax\SavePickupPoint` | Slaat selectie op in de huidige offerte |

### Observers / Plugins

| Klasse | Event / doel | Doel |
|---|---|---|
| `Observer\QuoteSubmitBefore` | `sales_model_service_quote_submit_before` | Kopieert afhaalpunt van offerte naar bestelling |
| `Observer\SalesOrderPlaceAfter` | `sales_order_place_after` | Slaat afhaalpuntdata op in de `fm_innosend_order`-tabel |
| `Plugin\Sales\Model\Order\Pdf\InvoicePlugin` | `Magento\Sales\Model\Order\Pdf\Invoice` | Voegt afhaalpuntinfo toe aan factuur-PDF |

## `PickupPointRepository`

```php
// Op basis van adres
$punten = $repository->getPickupPoints(
    street: 'Damrak',
    postcode: '1012',
    city: 'Amsterdam',
    countryCode: 'NL',
    carriers: ['DHL', 'PostNL'],   // optioneel
    searchLatitude: 52.37,          // optioneel, voor afstandsortering
    searchLongitude: 4.89
);

// Op basis van coördinaten
$punten = $repository->getPickupPointsByCoordinates(
    latitude: 52.37,
    longitude: 4.89,
    countryCode: 'NL',
    carriers: ['DHL'],
);
```

Beide methoden roepen eerst `$apiClient->isEnabled()` aan en gooien een `LocalizedException` als de API niet geconfigureerd is.

Bij meerdere carriers wordt **per carrier een aparte API-call** gedaan om problemen met dubbele `couriers[]`-parameters in de query string te vermijden.

## Extension attributes

### Quote

```php
$afhaalpunt = $quote->getShippingAddress()
    ->getExtensionAttributes()
    ->getInnosendPickupPoint();

$afhaalpunt->getPickupPointId();      // string
$afhaalpunt->getCourierCode();        // string, bijv. 'dhl'
$afhaalpunt->getPickupPointName();    // string
$afhaalpunt->getPickupPointAddress(); // string
```

### Bestelling

```php
$afhaalpunt = $order->getExtensionAttributes()
    ->getInnosendPickupPoint();
```

## Databasetabel

| Tabel | Sleutelkolommen |
|---|---|
| `fm_innosend_order` | `order_id`, `shipping_information` (JSON) |

## AJAX-responsformaat

`POST /innosend/ajax/getPickupPoints` retourneert:

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
                { "day_of_week": 1, "day_name_short": "Ma", "hours": "09:00 - 18:00" }
            ]
        }
    ],
    "search_latitude": 52.3676,
    "search_longitude": 4.9041
}
```

## Aanpassingen

### Template overschrijven

```
app/design/frontend/Vendor/Theme/Innosend_PickupPoints/templates/
```

### CSS overschrijven

```
app/design/frontend/Vendor/Theme/Innosend_PickupPoints/web/css/pickup-points.css
```

### Aangepaste carrierlijst

Implementeer `Innosend\Integration\Api\CarrierInterface` en registreer het via `etc/di.xml`.

## Unit tests

```bash
vendor/bin/phpunit package-source/innosend/magento2-pickup-points/tests/Unit
```

## Vereisten

- `Innosend_Integration` ≥ 1.1.0
- Magento 2.4.x
- PHP 8.1 – 8.3
