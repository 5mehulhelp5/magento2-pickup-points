# Innosend Pickup Points Module - Gebruikershandleiding

## Overzicht

De Innosend Pickup Points module stelt klanten in staat om afhaalpunten te selecteren tijdens het afrekenen. Het toont nabijgelegen afhaalpunten op basis van het verzendadres en biedt zowel lijst- als kaartweergave.

## Installatie

### Via Composer

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento cache:flush
```

## Configuratie

1. Ga naar **Stores > Configuration > Innosend > Pickup Points**
2. **Enable Pickup Points**
3. **Show Map** - Inschakelen/uitschakelen kaartweergave in modal
4. **Default Carrier** - Optionele carrier code voor filtering

## Functionaliteiten

- Automatisch ophalen van afhaalpunten op basis van verzendadres
- Modal met lijst- en kaartweergave (OpenStreetMap)
- Selectie en opslag van afhaalpunt
- Gegevens opgeslagen in quote en order
- Carrier filtering ondersteuning

## Gebruik

### Klantervaring

1. Klant voert verzendadres in tijdens checkout
2. Afhaalpunten worden automatisch geladen
3. Standaard afhaalpunt is vooraf geselecteerd
4. Klant kan klikken om afhaalpunt te wijzigen
5. Modal opent met lijst- en kaartweergave
6. Klant selecteert voorkeursafhaalpunt
7. Selectie wordt opgeslagen met order

### Admin

Afhaalpunt informatie wordt opgeslagen in order extension attributes en kan worden bekeken in:
- Order details
- Order grid (met aangepaste kolom)
- Order API responses

## Probleemoplossing

### Afhaalpunten Worden Niet Geladen

- Verifieer API-configuratie in Base module
- Controleer browser console op JavaScript-fouten
- Verifieer dat verzendadres compleet is
- Controleer netwerkrequests in browser dev tools

### Kaart Wordt Niet Weergegeven

- Zorg dat "Show Map" is ingeschakeld in configuratie
- Controleer browser console op Leaflet library-fouten
- Verifieer internetverbinding (kaarttegels vereisen externe toegang)

## Support

Voor technische ondersteuning, raadpleeg de Technische Gids of neem contact op met support@innosend.com



