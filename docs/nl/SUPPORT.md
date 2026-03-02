# Innosend Pickup Points – Support

## Contact

Zie de [supportdocumentatie van de Integration module](../../magento2-integration/docs/nl/SUPPORT.md) voor contactgegevens.

## Voordat je een ticket opent

1. Controleer of het API Token geldig is via **Test API Token Connection** in de Integration-configuratie.
2. Open de browserconsole en het DevTools-networkpaneel, reproduceer het probleem en noteer eventuele fouten.
3. Bekijk `var/log/system.log` op backend-API-fouten.

## Te vermelden informatie

| Gegeven | Hoe te vinden |
|---|---|
| Magento-versie | `php bin/magento --version` |
| PHP-versie | `php -v` |
| Moduleversie | `composer show innosend/magento2-pickup-points` |
| Browser + versie | Browser → Help → Info |
| Netwerkverzoek naar `/innosend/ajax/getPickupPoints` | Kopieer uit DevTools → Netwerk → Response |
| Fout uit `system.log` | `tail -n 100 var/log/system.log` |
| Stappen om te reproduceren | — |

## Veelvoorkomende problemen

| Symptoom | Waarschijnlijke oorzaak | Oplossing |
|---|---|---|
| Geen afhaalpunten getoond | Ongeldig of verlopen API Token | Verbinding testen in Integration-configuratie |
| Lege carrier-dropdown (admin) | Token ongeldig; carrierlijst kan niet worden opgehaald | Token repareren, cache legen |
| Kaart toont maar geen markers | Afhaalpunten hebben geen coördinaten | Innosend API-probleem; neem contact op met Innosend |
| Google Maps-waarschuwing in console | Ontbrekende Map ID | Map ID toevoegen in Pickup Points-configuratie |
| Afhaalpunt verloren na bestelling | Observer niet geactiveerd | Controleer `fm_innosend_order`-tabel; verifieer dat module actief is |
