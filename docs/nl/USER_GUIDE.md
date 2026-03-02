# Innosend Pickup Points – Gebruikershandleiding

## Overzicht

De Innosend Pickup Points module stelt klanten in staat om tijdens het afrekenen een afhaalpunt te kiezen. Op basis van het verzendadres worden nabijgelegen afhaalpunten real-time opgehaald via de Innosend API. De module biedt zowel een lijst- als een interactieve kaartweergave.

## Vereisten

- `Innosend_Integration` module (v1.1.0 of nieuwer) — **moet als eerste worden geïnstalleerd en geconfigureerd**
- Magento 2.4.x
- PHP 8.1 – 8.3

## Installatie

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento setup:di:compile
php bin/magento cache:flush
```

## Stap 1 – API Token instellen (Integration module)

Stel het API Token in de Integration module in voordat je afhaalpunten configureert:

1. Ga naar **Stores → Configuration → Innosend → API Configuration**
2. Zet **Enable API connection** op **Yes**
3. Kies **Mode**: `Test` of `Production`
4. Vul het **API Token** in vanuit je [Innosend Dashboard](https://dashboard.innosend.eu) → **Settings → API Keys**
5. Klik op **Save Config**
6. Klik op **Test API Token Connection** ter verificatie

## Stap 2 – Afhaalpunten configureren

Ga naar **Stores → Configuration → Innosend → Pickup Points**.

| Veld | Omschrijving |
|---|---|
| **Enable Pickup Points** | Toont de afhaalpuntenselectie bij het afrekenen |
| **Shipping Methods** | Verzendmethode(n) die de afhaalpuntenselectie activeren |
| **Allowed Carriers** | Carriers waarvoor afhaalpunten worden opgehaald (bijv. DHL, PostNL) |
| **Show Map** | Kaart in- of uitschakelen in de afhaalpuntenmodal |
| **Map Type** | `OpenStreetMap` (standaard) of `Google Maps` |

### Google Maps (optioneel)

Als je Google Maps verkiest boven OpenStreetMap:

#### 1. API Key aanmaken

1. Open de [Google Cloud Console](https://console.cloud.google.com/)
2. Schakel **Maps JavaScript API** in via **APIs & Services → Library**
3. Maak een credential aan via **APIs & Services → Credentials → Create Credentials → API Key**
4. Beperk de sleutel tot **HTTP referrers** en **Maps JavaScript API**

#### 2. Map ID aanmaken

1. Open [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Ga naar **Map Management → New Map ID**
3. Geef een naam op (bijv. "Innosend Pickup Points"), kies een stijl en sla op
4. Kopieer de Map ID (bijv. `dcb608c5c97aca25820c1c5d`)

#### 3. Configureren in Magento

1. Zet **Map Type** op **Google Maps**
2. Vul **Google Maps API Key** in
3. Vul **Google Maps Map ID** in
4. Sla op en leeg de cache

> Zonder Map ID werkt de kaart nog wel, maar is `AdvancedMarkerElement` niet beschikbaar (waarschuwing in browserconsole).

## Klantervaring

1. Klant vult een verzendadres in bij het afrekenen
2. De module haalt automatisch nabijgelegen afhaalpunten op
3. Het dichtstbijzijnde afhaalpunt is standaard geselecteerd
4. De klant kan op **Wijzigen** klikken om de modal te openen
5. De modal toont een lijst en (optioneel) een kaart van nabijgelegen punten
6. De klant selecteert een punt en bevestigt
7. De keuze wordt opgeslagen bij de offerte en overgedragen naar de bestelling

## Admin

Het geselecteerde afhaalpunt wordt opgeslagen als een order extension attribute en is zichtbaar in:

- Orderdetailpagina
- Orderoverzicht (instelbare kolom)
- Facturen en pakbonnen (via PDF-plugin)
- REST API-responses (`GET /rest/V1/orders/:id`)

## Probleemoplossing

### Afhaalpunten worden niet geladen

- Controleer of het API Token geldig is (**Test API Token Connection** in Integration-configuratie).
- Controleer de browserconsole op JavaScript-fouten.
- Zorg dat het verzendadres volledig is (straat, postcode, stad, land).
- Bekijk de netwerkverzoeken in browser DevTools — de AJAX-call gaat naar `/innosend/ajax/getPickupPoints`.
- Controleer `var/log/system.log` op backend-fouten.

### Kaart wordt niet weergegeven

- Controleer of **Show Map** is ingeschakeld.
- OpenStreetMap: zorg dat de browser internettoegang heeft (tegels worden geladen vanaf `tile.openstreetmap.org`).
- Google Maps: controleer API Key en Map ID.

### Carrier verschijnt niet in dropdown

- Carriers worden opgehaald via de Innosend API (`/v1/pickup-point/courier`).
- Het API Token moet geldig zijn om de carrierlijst te laden.
- Leeg de Magento-cache na het opslaan van een nieuw token: `php bin/magento cache:flush`.

## Support

Zie [SUPPORT.md](SUPPORT.md) of de supportdocumentatie van de Integration module.
