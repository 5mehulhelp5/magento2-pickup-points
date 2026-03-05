# Innosend Pickup Points – Benutzerhandbuch

## Übersicht

Das Innosend Pickup Points Modul ermöglicht es Kunden, während des Checkouts eine Abholstelle auszuwählen. Basierend auf der Versandadresse werden nahegelegene Abholstellen in Echtzeit über die Innosend API abgerufen. Das Modul bietet sowohl eine Listenansicht als auch eine interaktive Karte.

## Voraussetzungen

- `Innosend_Integration` Modul (v1.1.0 oder neuer) — **muss zuerst installiert und konfiguriert werden**
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

## Schritt 1 – API Token konfigurieren (Integration-Modul)

Konfigurieren Sie zunächst den API Token im Integration-Modul:

1. Gehen Sie zu **Stores → Configuration → Innosend → API Configuration**
2. Setzen Sie **Enable API connection** auf **Yes**
3. Wählen Sie den **Mode**: `Test` oder `Production`
4. Geben Sie den **API Token** aus Ihrem [Innosend Dashboard](https://dashboard.innosend.eu) → **Settings → API Keys** ein
5. Klicken Sie auf **Save Config**
6. Klicken Sie auf **Test API Token Connection** zur Überprüfung

## Schritt 2 – Abholstellen konfigurieren

Gehen Sie zu **Stores → Configuration → Innosend → Pickup Points**.

| Feld | Beschreibung |
|---|---|
| **Enable Pickup Points** | Zeigt die Abholstellen-Auswahl beim Checkout |
| **Shipping Methods** | Versandmethoden, die die Abholstellen-Auswahl aktivieren |
| **Allowed Carriers** | Carrier für die Abholstellen-Abfrage (z.B. DHL, PostNL) |
| **Show Map** | Karte im Abholstellen-Modal ein-/ausschalten |
| **Map Type** | `OpenStreetMap` (Standard) oder `Google Maps` |

### Google Maps (optional)

Falls Sie Google Maps gegenüber OpenStreetMap bevorzugen:

#### 1. API-Schlüssel erstellen

1. Öffnen Sie die [Google Cloud Console](https://console.cloud.google.com/)
2. Aktivieren Sie **Maps JavaScript API** unter **APIs & Services → Library**
3. Erstellen Sie eine Berechtigung unter **APIs & Services → Credentials → Create Credentials → API Key**
4. Beschränken Sie den Schlüssel auf **HTTP referrers** und **Maps JavaScript API**

#### 2. Map-ID erstellen

1. Öffnen Sie [Google Maps Studio](https://console.cloud.google.com/google/maps-apis/studio)
2. Gehen Sie zu **Map Management → New Map ID**
3. Vergeben Sie einen Namen (z.B. "Innosend Pickup Points"), wählen Sie einen Stil und speichern Sie
4. Kopieren Sie die Map-ID (z.B. `dcb608c5c97aca25820c1c5d`)

#### 3. In Magento konfigurieren

1. Setzen Sie **Map Type** auf **Google Maps**
2. Geben Sie **Google Maps API Key** ein
3. Geben Sie **Google Maps Map ID** ein
4. Speichern und Cache leeren

> Ohne Map-ID funktioniert die Karte noch, aber `AdvancedMarkerElement` ist nicht verfügbar (Browser-Konsolen-Warnung).

## Ablauf für den Kunden

1. Kunde gibt eine Versandadresse beim Checkout ein
2. Das Modul ruft automatisch nahegelegene Abholstellen ab
3. Die nächste Abholstelle ist vorausgewählt
4. Der Kunde kann auf **Ändern** klicken, um das Modal zu öffnen
5. Das Modal zeigt eine Liste und (optional) eine Karte mit nahegelegenen Stellen
6. Der Kunde wählt eine Stelle aus und bestätigt
7. Die Auswahl wird mit dem Warenkorb und der Bestellung gespeichert

## Admin

Die ausgewählte Abholstelle wird als Order Extension Attribute gespeichert und ist sichtbar in:

- Bestelldetailseite
- Bestellübersicht (konfigurierbare Spalte)
- Rechnungen und Lieferscheinen (via PDF-Plugin)
- REST-API-Antworten (`GET /rest/V1/orders/:id`)

## Fehlerbehebung

### Abholstellen werden nicht geladen

- Überprüfen Sie, ob der API Token gültig ist (**Test API Token Connection** in der Integration-Konfiguration).
- Öffnen Sie die Browser-Konsole und prüfen Sie auf JavaScript-Fehler.
- Stellen Sie sicher, dass die Versandadresse vollständig ist (Straße, PLZ, Stadt, Land).
- Prüfen Sie Netzwerkanfragen in den Browser-DevTools — der AJAX-Aufruf geht an `/innosend/ajax/getPickupPoints`.
- Prüfen Sie `var/log/system.log` auf Backend-Fehler.

### Karte wird nicht angezeigt

- Stellen Sie sicher, dass **Show Map** aktiviert ist.
- OpenStreetMap: Überprüfen Sie, ob der Browser Internetzugang hat (Kacheln werden von `tile.openstreetmap.org` geladen).
- Google Maps: Überprüfen Sie API-Schlüssel und Map-ID.

### Carrier erscheint nicht in der Dropdown-Liste

- Carrier werden über die Innosend API (`/v1/pickup-point/courier`) abgerufen.
- Der API Token muss gültig sein, damit die Carrier-Liste geladen werden kann.
- Leeren Sie den Magento-Cache nach dem Speichern eines neuen Tokens: `php bin/magento cache:flush`

## Support

Kontaktieren Sie uns unter support@innosend.eu oder konsultieren Sie die Integration-Modul-Dokumentation.
