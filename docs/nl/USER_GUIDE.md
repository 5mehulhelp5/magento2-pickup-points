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
4. **Map Type** - Selecteer de kaartprovider (Google Maps of OpenStreetMap)
5. **Default Carrier** - Optionele carrier code voor filtering

### Google Maps Configuratie

Als je Google Maps als kaartprovider gebruikt, moet je een Google Maps API key en Map ID configureren:

#### Stap 1: Google Maps API Key aanmaken

1. Ga naar [Google Cloud Console](https://console.cloud.google.com/)
2. Selecteer je project of maak een nieuw project aan
3. Ga naar **APIs & Services > Library**
4. Zoek naar **Maps JavaScript API** en klik op **Enable**
5. Ga naar **APIs & Services > Credentials**
6. Klik op **Create Credentials > API Key**
7. Kopieer de API key en voer deze in bij Stap 3.3.
8. (Optioneel) Beperk de API key:
   - Klik op de API key om deze te bewerken
   - **Belangrijk**: Zorg dat **"Authenticate API calls through a service account"** UIT staat (dit is alleen nodig voor server-side API calls zoals Vertex AI, niet voor browser-side Maps JavaScript API)
   - Bij **Application restrictions** selecteer **HTTP referrers (web sites)**
   - Voeg je domein toe: `https://jouwdomein.nl/*` of `https://*.jouwdomein.nl/*` voor meerdere subdomeinen
   - Bij **API restrictions** selecteer **Restrict key** en kies **Maps JavaScript API**

#### Stap 2: Map ID aanmaken

1. Ga naar [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Zorg dat je het juiste project hebt geselecteerd
3. Klik op **Map Management** in de sidebar
4. Klik op **Create Map ID** of **New Map ID**
5. Geef een naam op (bijv. "Innosend Pickup Points")
6. Kies een mapstijl (bijv. "Default")
7. Klik op **Create**
8. Kopieer de Map ID (bijv. `dcb608c5c97aca25820c1c5d`) en voer deze in bij Stap 3.4.

#### Stap 3: Configureren in Magento

1. Ga naar **Stores > Configuration > Innosend > Pickup Points**
2. Zorg dat **Map Type** is ingesteld op **Google Maps**
3. Vul **Google Maps API Key** in met de API key die je hebt gekopieerd
4. Vul **Google Maps Map ID** in met de Map ID die je hebt gekopieerd
5. Klik op **Save Config**
6. Clear cache: **System > Cache Management > Flush Cache Storage**

**Let op**: Zonder Map ID kunnen AdvancedMarkerElement markers niet worden gebruikt en krijg je een waarschuwing in de browser console.

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

- Verifieer API-configuratie in Integration module
- Controleer browser console op JavaScript-fouten
- Verifieer dat verzendadres compleet is
- Controleer netwerkrequests in browser dev tools

### Kaart Wordt Niet Weergegeven

- Zorg dat "Show Map" is ingeschakeld in configuratie
- Controleer browser console op Leaflet library-fouten
- Verifieer internetverbinding (kaarttegels vereisen externe toegang)

## Support

Voor technische ondersteuning, raadpleeg de Technische Gids of neem contact op met support@innosend.com
