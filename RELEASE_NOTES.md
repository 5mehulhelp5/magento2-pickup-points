# Release Notes - Innosend Pickup Points Module v1.0.3

## Overview
The Innosend Pickup Points module enables customers to select pickup points during checkout. It displays nearby pickup points based on the shipping address and provides both list and interactive map views.

## Version 1.0.3

### Features

#### Core Functionality
- **Pickup Point Selection in Checkout**
  - Automatic pickup point fetching based on shipping address
  - Modal interface with list and map views
  - Default pickup point pre-selection
  - Real-time pickup point search and filtering

#### Map Integration
- **Dual Map Provider Support**
  - Google Maps integration with AdvancedMarkerElement support
  - OpenStreetMap/Leaflet integration (default, no API key required)
  - Configurable map type selection
  - Mobile-responsive map display with optional mobile map toggle

#### Data Management
- **Extension Attributes**
  - Quote extension attributes for pickup point data during checkout
  - Order extension attributes for persistent pickup point storage
  - REST API support for pickup point data retrieval
  - Guest checkout support via WebAPI

#### Order Integration
- **PDF Documents**
  - Pickup point information in invoice PDFs
  - Pickup point information in shipment PDFs
  - Custom PDF templates with pickup point details

- **Email Templates**
  - Pickup point data available in email template variables
  - Automatic pickup point information injection in order emails

- **Admin Interface**
  - Pickup point information display in order details
  - Custom order grid column for pickup point data
  - Admin order view with pickup point information

#### Configuration Options
- Enable/disable pickup points per store view
- Map display toggle (desktop and mobile)
- Map type selection (Google Maps or OpenStreetMap)
- Google Maps API key and Map ID configuration
- Carrier filtering (allowed carriers configuration)
- Delivery method configuration
- Custom shipping carrier integration

#### API Integration
- **AJAX Endpoints**
  - `/innosend/ajax/getPickupPoints` - Fetch pickup points by address
  - `/innosend/ajax/savePickupPoint` - Save selected pickup point to quote

- **REST API**
  - Guest and authenticated pickup point save endpoints
  - Pickup point data in order API responses

#### Geocoding Support
- Google Maps Geocoding API integration (when API key configured)
- OpenStreetMap Nominatim fallback (free, no API key required)
- Automatic address geocoding for map display

### Technical Details

#### Dependencies
- **Required Modules**
  - `Innosend_Integration` >= 1.0.0
  - `Innosend_OrderConnector` >= 1.0.2
  - `Magento_Checkout` >= 100.0.0
  - `Magento_Quote` >= 101.0.0
  - `Magento_Sales` >= 102.0.0

- **PHP Compatibility**: PHP 7.3, 7.4, 8.1, 8.2, 8.3
- **Magento Compatibility**: Magento 2.4.2+ (Framework >=102.0.0)

#### Frontend Components
- **JavaScript Libraries**
  - Leaflet 1.9.4 (for OpenStreetMap)
  - Leaflet MarkerCluster plugin
  - Custom pickup points component
  - Google Maps JavaScript API (when configured)

- **UI Components**
  - Knockout.js integration
  - Responsive modal design
  - Touch-friendly interface
  - Accessibility support

#### Database Schema
- Extension attributes for quote and order entities
- Pickup point data stored in order extension attributes
- No additional database tables required

### Installation

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento cache:flush
```

### Configuration

Navigate to **Stores > Configuration > Innosend > Pickup Points** to configure:

1. **Enable Pickup Points** - Enable/disable the feature
2. **Show Map** - Toggle map display on desktop
3. **Show Map Mobile** - Toggle map display on mobile devices
4. **Map Type** - Select Google Maps or OpenStreetMap
5. **Google Maps API Key** - (Optional) For Google Maps integration
6. **Google Maps Map ID** - (Optional) For AdvancedMarkerElement support
7. **Allowed Carriers** - Filter pickup points by carrier codes
8. **Delivery Method** - Configure delivery method settings

#### Google Maps Setup (Optional)

If using Google Maps:

1. Create a Google Maps API key in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Maps JavaScript API
3. Create a Map ID in [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
4. Configure both in Magento admin

### Usage

#### Customer Experience
1. Customer enters shipping address in checkout
2. Pickup points automatically load based on address
3. Default pickup point is pre-selected
4. Customer can click to change pickup point
5. Modal opens with list and map view
6. Customer selects preferred pickup point
7. Selection is saved with order

#### Developer Usage

**Access Pickup Point in Quote:**
```php
$quote->getShippingAddress()
    ->getExtensionAttributes()
    ->getInnosendPickupPoint()
    ->getPickupPointId();
```

**Access Pickup Point in Order:**
```php
$order->getExtensionAttributes()
    ->getInnosendPickupPoint()
    ->getPickupPointId();
```

### Known Limitations
- Map display requires internet connection (for tile loading)
- Google Maps requires valid API key and Map ID for full functionality
- Pickup points are fetched from Innosend API (requires API configuration)

### Troubleshooting

#### Pickup Points Not Loading
- Verify API configuration in Integration module
- Check browser console for JavaScript errors
- Verify shipping address is complete
- Check network requests in browser dev tools

#### Map Not Displaying
- Ensure "Show Map" is enabled in configuration
- Check browser console for map library errors
- Verify internet connection (map tiles require external access)
- For Google Maps: verify API key and Map ID are configured correctly

### Support

For technical support, please refer to the Technical Guide in `docs/en/TECHNICAL_GUIDE.md` or contact support@innosend.com

### Documentation

- User Guide: `docs/en/USER_GUIDE.md`
- Technical Guide: `docs/en/TECHNICAL_GUIDE.md`
- Support: `docs/en/SUPPORT.md`
