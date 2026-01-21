# Innosend Pickup Points Modul - Benutzerhandbuch

## Übersicht

Das Innosend Pickup Points Modul ermöglicht es Kunden, Abholstellen während des Checkouts auszuwählen. Es zeigt nahegelegene Abholstellen basierend auf der Versandadresse an und bietet sowohl Listen- als auch Kartenansicht.

## Installation

### Über Composer

```bash
composer require innosend/magento2-pickup-points
php bin/magento module:enable Innosend_PickupPoints
php bin/magento setup:upgrade
php bin/magento cache:flush
```

## Konfiguration

1. Gehen Sie zu **Stores > Configuration > Innosend > Pickup Points**
2. **Enable Pickup Points**
3. **Show Map** - Kartenansicht im Modal ein-/ausschalten
4. **Map Type** - Wählen Sie den Kartenanbieter (Google Maps oder OpenStreetMap)
5. **Default Carrier** - Optionaler Carrier-Code für Filterung

### Google Maps Konfiguration

Wenn Sie Google Maps als Kartenanbieter verwenden, müssen Sie einen Google Maps API-Schlüssel und eine Map-ID konfigurieren:

#### Schritt 1: Google Maps API-Schlüssel erstellen

1. Gehen Sie zur [Google Cloud Console](https://console.cloud.google.com/)
2. Wählen Sie Ihr Projekt aus oder erstellen Sie ein neues Projekt
3. Gehen Sie zu **APIs & Services > Library**
4. Suchen Sie nach **Maps JavaScript API** und klicken Sie auf **Enable**
5. Gehen Sie zu **APIs & Services > Credentials**
6. Klicken Sie auf **Create Credentials > API Key**
7. Kopieren Sie den API-Schlüssel
8. (Optional) Beschränken Sie den API-Schlüssel:
   - Klicken Sie auf den API-Schlüssel, um ihn zu bearbeiten
   - **Wichtig**: Stellen Sie sicher, dass **"Authenticate API calls through a service account"** AUS ist (dies wird nur für serverseitige API-Aufrufe wie Vertex AI benötigt, nicht für browser-seitige Maps JavaScript API)
   - Wählen Sie unter **Application restrictions** die Option **HTTP referrers (web sites)**
   - Fügen Sie Ihre Domain hinzu: `https://ihredomain.com/*`
   - Wählen Sie unter **API restrictions** die Option **Restrict key** und wählen Sie **Maps JavaScript API**

#### Schritt 2: Map-ID erstellen

1. Gehen Sie zu [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Stellen Sie sicher, dass Sie das richtige Projekt ausgewählt haben
3. Klicken Sie in der Sidebar auf **Map Management**
4. Klicken Sie auf **Create Map ID** oder **New Map ID**
5. Geben Sie einen Namen ein (z.B. "Innosend Pickup Points")
6. Wählen Sie einen Kartenstil (z.B. "Default")
7. Klicken Sie auf **Create**
8. Kopieren Sie die Map-ID (z.B. `dcb608c5c97aca25820c1c5d`)

#### Schritt 3: In Magento konfigurieren

1. Gehen Sie zu **Stores > Configuration > Innosend > Pickup Points**
2. Stellen Sie sicher, dass **Map Type** auf **Google Maps** eingestellt ist
3. Geben Sie **Google Maps API Key** mit dem kopierten API-Schlüssel ein
4. Geben Sie **Google Maps Map ID** mit der kopierten Map-ID ein
5. Klicken Sie auf **Save Config**
6. Cache leeren: **System > Cache Management > Flush Cache Storage**

**Hinweis**: Ohne Map-ID können AdvancedMarkerElement-Marker nicht verwendet werden und Sie erhalten eine Warnung in der Browser-Konsole.

## Funktionen

- Automatisches Abrufen von Abholstellen basierend auf Versandadresse
- Modal mit Listen- und Kartenansicht (OpenStreetMap)
- Auswahl und Speicherung von Abholstellen
- Daten werden in Quote und Order gespeichert
- Carrier-Filterung unterstützt

## Verwendung

### Kundenerfahrung

1. Kunde gibt Versandadresse während des Checkouts ein
2. Abholstellen werden automatisch geladen
3. Standard-Abholstelle ist vorausgewählt
4. Kunde kann klicken, um Abholstelle zu ändern
5. Modal öffnet sich mit Listen- und Kartenansicht
6. Kunde wählt bevorzugte Abholstelle aus
7. Auswahl wird mit der Bestellung gespeichert

### Admin

Abholstellen-Informationen werden in Order Extension Attributes gespeichert und können eingesehen werden in:
- Bestelldetails
- Bestellraster (mit benutzerdefinierter Spalte)
- Order API-Antworten

## Fehlerbehebung

### Abholstellen werden nicht geladen

- Überprüfen Sie die API-Konfiguration im Integration-Modul
- Überprüfen Sie die Browser-Konsole auf JavaScript-Fehler
- Überprüfen Sie, ob die Versandadresse vollständig ist
- Überprüfen Sie Netzwerkanfragen in den Browser-Entwicklertools

### Karte wird nicht angezeigt

- Stellen Sie sicher, dass "Show Map" in der Konfiguration aktiviert ist
- Überprüfen Sie die Browser-Konsole auf Leaflet-Bibliotheksfehler
- Überprüfen Sie die Internetverbindung (Kartenkacheln erfordern externen Zugriff)

## Support

Für technischen Support konsultieren Sie bitte den Technischen Leitfaden oder kontaktieren Sie support@innosend.com
