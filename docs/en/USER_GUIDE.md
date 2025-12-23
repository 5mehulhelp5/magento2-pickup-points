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
4. **Map Type** - Select the map provider (Google Maps or OpenStreetMap)
5. **Default Carrier** - Optional carrier code for filtering

### Google Maps Configuration

If you use Google Maps as the map provider, you need to configure a Google Maps API key and Map ID:

#### Step 1: Create Google Maps API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new project
3. Navigate to **APIs & Services > Library**
4. Search for **Maps JavaScript API** and click **Enable**
5. Go to **APIs & Services > Credentials**
6. Click **Create Credentials > API Key**
7. Copy the API key
8. (Optional) Restrict the API key:
   - Click on the API key to edit it
   - **Important**: Make sure **"Authenticate API calls through a service account"** is OFF (this is only needed for server-side API calls like Vertex AI, not for browser-side Maps JavaScript API)
   - Under **Application restrictions** select **HTTP referrers (web sites)**
   - Add your domain: `https://yourdomain.com/*`
   - Under **API restrictions** select **Restrict key** and choose **Maps JavaScript API**

#### Step 2: Create Map ID

1. Go to [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Make sure you have the correct project selected
3. Click on **Map Management** in the sidebar
4. Click **Create Map ID** or **New Map ID**
5. Enter a name (e.g., "Innosend Pickup Points")
6. Choose a map style (e.g., "Default")
7. Click **Create**
8. Copy the Map ID (e.g., `dcb608c5c97aca25820c1c5d`)

#### Step 3: Configure in Magento

1. Go to **Stores > Configuration > Innosend > Pickup Points**
2. Make sure **Map Type** is set to **Google Maps**
3. Enter **Google Maps API Key** with the API key you copied
4. Enter **Google Maps Map ID** with the Map ID you copied
5. Click **Save Config**
6. Clear cache: **System > Cache Management > Flush Cache Storage**

**Note**: Without a Map ID, AdvancedMarkerElement markers cannot be used and you will get a warning in the browser console.

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
