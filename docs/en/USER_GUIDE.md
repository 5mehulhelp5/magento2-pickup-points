# Innosend Pickup Points – User Guide

## Overview

The Innosend Pickup Points module lets customers select a pickup point during checkout. It fetches nearby pickup points in real time from the Innosend API based on the shipping address, and offers both a list view and an interactive map.

## Requirements

- `Innosend_Integration` module (v1.1.0 or newer) — **must be installed and configured first**
- Magento 2.4.x
- PHP 8.1 – 8.3

## Installation

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento cache:flush
```

## Step 1 – Configure the API Token (Integration module)

Before configuring pickup points, make sure the API Token is set up in the Integration module:

1. Go to **Stores → Configuration → Innosend → API Configuration**
2. Set **Enable API connection** to **Yes**
3. Select **Mode**: `Test` or `Production`
4. Enter the **API Token** from your [Innosend Dashboard](https://dashboard.innosend.eu) → **Settings → API Keys**
5. Click **Save Config**
6. Click **Test API Token Connection** to verify

## Step 2 – Configure Pickup Points

Go to **Stores → Configuration → Innosend → Pickup Points**.

| Field | Description |
|---|---|
| **Enable Pickup Points** | Show the pickup point selector at checkout |
| **Shipping Methods** | Shipping method(s) that trigger pickup point selection |
| **Allowed Carriers** | Carriers to fetch pickup points for (e.g. DHL, PostNL) |
| **Show Map** | Enable/disable the map in the pickup point modal |
| **Map Type** | `OpenStreetMap` (default) or `Google Maps` |

### Google Maps (optional)

If you prefer Google Maps over OpenStreetMap:

#### 1. Create an API Key

1. Open the [Google Cloud Console](https://console.cloud.google.com/)
2. Enable **Maps JavaScript API** under **APIs & Services → Library**
3. Create a credential under **APIs & Services → Credentials → Create Credentials → API Key**
4. Restrict the key to **HTTP referrers** and **Maps JavaScript API**

#### 2. Create a Map ID

1. Open [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Go to **Map Management → New Map ID**
3. Name it (e.g. "Innosend Pickup Points"), choose a style, and save
4. Copy the Map ID (e.g. `dcb608c5c97aca25820c1c5d`)

#### 3. Configure in Magento

1. Set **Map Type** to **Google Maps**
2. Enter **Google Maps API Key**
3. Enter **Google Maps Map ID**
4. Save and flush cache

> Without a Map ID the map still works but `AdvancedMarkerElement` is unavailable (browser console warning).

## Customer flow

1. Customer enters a shipping address in checkout
2. The module automatically fetches nearby pickup points
3. The nearest pickup point is pre-selected
4. The customer can click **Change** to open the modal
5. The modal shows a list and (optional) map of nearby points
6. The customer selects a point and confirms
7. The selection is saved with the quote and transferred to the order

## Admin

The selected pickup point is saved as an order extension attribute and is visible in:

- Order detail page
- Order list (configurable column)
- Invoices and packing slips (via PDF plugin)
- REST API responses (`GET /rest/V1/orders/:id`)

## Troubleshooting

### Pickup points not loading

- Confirm the API Token is valid (**Test API Token Connection** in Integration config).
- Check the browser console for JavaScript errors.
- Ensure the shipping address is complete (street, postcode, city, country).
- Inspect network requests in browser DevTools — the AJAX call goes to `/innosend/ajax/getPickupPoints`.
- Check `var/log/system.log` for backend errors.

### Map not displaying

- Confirm **Show Map** is enabled.
- For OpenStreetMap: verify the browser has internet access (tiles load from `tile.openstreetmap.org`).
- For Google Maps: verify API Key and Map ID are correctly set.

### Carrier not listed in dropdown

- Carriers are fetched from the Innosend API (`/v1/pickup-point/courier`).
- The API Token must be valid for the carrier list to load.
- Flush the Magento cache after saving a new token: `php bin/magento cache:flush`.

## Support

See [SUPPORT.md](SUPPORT.md) or the Integration module support documentation.
