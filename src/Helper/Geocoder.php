<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Helper;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Encryption\EncryptorInterface;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * Helper class for geocoding addresses to coordinates
 */
class Geocoder
{
    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @var EncryptorInterface
     */
    private $encryptor;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param EncryptorInterface $encryptor
     * @param LoggerInterface $logger
     */
    public function __construct(
        ScopeConfigInterface $scopeConfig,
        EncryptorInterface $encryptor,
        LoggerInterface $logger
    ) {
        $this->scopeConfig = $scopeConfig;
        $this->encryptor = $encryptor;
        $this->logger = $logger;
    }

    /**
     * Geocode address to coordinates
     *
     * @param string $street Street address
     * @param string $postcode Postal code
     * @param string $city City
     * @param string $countryCode Country code (ISO 3166-1 alpha-2)
     * @return array|null Returns ['latitude' => float, 'longitude' => float] or null on failure
     */
    public function geocodeAddress(
        string $street,
        string $postcode,
        string $city,
        string $countryCode
    ): ?array {
        // Try Google Maps Geocoding API first if API key is configured
        $googleMapsApiKey = $this->getGoogleMapsApiKey();
        if (!empty($googleMapsApiKey)) {
            $coordinates = $this->geocodeWithGoogleMaps($street, $postcode, $city, $countryCode, $googleMapsApiKey);
            if ($coordinates !== null) {
                return $coordinates;
            }
        }

        // Fallback to OpenStreetMap Nominatim (free, no API key required)
        return $this->geocodeWithNominatim($street, $postcode, $city, $countryCode);
    }

    /**
     * Geocode using Google Maps Geocoding API
     *
     * @param string $street
     * @param string $postcode
     * @param string $city
     * @param string $countryCode
     * @param string $apiKey
     * @return array|null
     */
    private function geocodeWithGoogleMaps(
        string $street,
        string $postcode,
        string $city,
        string $countryCode,
        string $apiKey
    ): ?array {
        $address = implode(', ', array_filter([
            $street,
            $postcode,
            $city,
            $countryCode
        ]));

        $url = 'https://maps.googleapis.com/maps/api/geocode/json?' . http_build_query([
            'address' => $address,
            'key' => $apiKey
        ]);

        try {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                $this->logger->warning('Google Maps Geocoding API returned HTTP ' . $httpCode);
                return null;
            }

            $data = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE || !isset($data['status']) || $data['status'] !== 'OK') {
                $this->logger->warning('Google Maps Geocoding API error: ' . ($data['status'] ?? 'Unknown'));
                return null;
            }

            if (isset($data['results'][0]['geometry']['location'])) {
                $location = $data['results'][0]['geometry']['location'];
                return [
                    'latitude' => (float) $location['lat'],
                    'longitude' => (float) $location['lng']
                ];
            }
        } catch (\Exception $e) {
            $this->logger->error('Google Maps Geocoding error: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Geocode using OpenStreetMap Nominatim (free)
     *
     * @param string $street
     * @param string $postcode
     * @param string $city
     * @param string $countryCode
     * @return array|null
     */
    private function geocodeWithNominatim(
        string $street,
        string $postcode,
        string $city,
        string $countryCode
    ): ?array {
        $address = implode(', ', array_filter([
            $street,
            $postcode,
            $city,
            $countryCode
        ]));

        $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
            'q' => $address,
            'format' => 'json',
            'limit' => 1,
            'addressdetails' => 1
        ]);

        try {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            // Nominatim requires a User-Agent
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'User-Agent: Innosend-Magento2-PickupPoints/1.0'
            ]);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                $this->logger->warning('Nominatim Geocoding API returned HTTP ' . $httpCode);
                return null;
            }

            $data = json_decode($response, true);
            if (json_last_error() !== JSON_ERROR_NONE || !is_array($data) || empty($data)) {
                $this->logger->warning('Nominatim Geocoding API returned no results');
                return null;
            }

            if (isset($data[0]['lat']) && isset($data[0]['lon'])) {
                return [
                    'latitude' => (float) $data[0]['lat'],
                    'longitude' => (float) $data[0]['lon']
                ];
            }
        } catch (\Exception $e) {
            $this->logger->error('Nominatim Geocoding error: ' . $e->getMessage());
        }

        return null;
    }

    /**
     * Get Google Maps API Key
     *
     * @return string
     */
    private function getGoogleMapsApiKey(): string
    {
        $encryptedKey = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/google_maps_api_key',
            ScopeInterface::SCOPE_STORE
        );

        if (empty($encryptedKey)) {
            return '';
        }

        try {
            return $this->encryptor->decrypt($encryptedKey);
        } catch (\Exception $e) {
            return $encryptedKey;
        }
    }
}

