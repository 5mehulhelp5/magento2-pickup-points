<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model;

use Innosend\Base\Api\ClientInterface;
use Innosend\Base\Api\PickupPointInterface;
use Innosend\PickupPoints\Helper\DistanceCalculator;
use Magento\Framework\Exception\LocalizedException;
use Psr\Log\LoggerInterface;

/**
 * Repository for fetching pickup points
 */
class PickupPointRepository
{
    /**
     * @var ClientInterface
     */
    private $apiClient;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var DistanceCalculator
     */
    private $distanceCalculator;

    /**
     * @var string|null
     */
    private $lastApiRequestUrl = null;

    /**
     * @param ClientInterface $apiClient
     * @param LoggerInterface $logger
     * @param DistanceCalculator $distanceCalculator
     */
    public function __construct(
        ClientInterface $apiClient,
        LoggerInterface $logger,
        DistanceCalculator $distanceCalculator
    ) {
        $this->apiClient = $apiClient;
        $this->logger = $logger;
        $this->distanceCalculator = $distanceCalculator;
    }

    /**
     * Get last API request URL (for debugging)
     *
     * @return string|null
     */
    public function getLastApiRequestUrl(): ?string
    {
        return $this->lastApiRequestUrl;
    }

    /**
     * Get pickup points by address
     *
     * @param string $street Street address
     * @param string $postcode Postal code
     * @param string $city City
     * @param string $countryCode Country code (ISO 3166-1 alpha-2)
     * @param string|array|null $carriers Carrier code(s) - can be single string or array (optional)
     * @param float|null $searchLatitude Latitude of search address for distance calculation (optional)
     * @param float|null $searchLongitude Longitude of search address for distance calculation (optional)
     * @return PickupPoint[]
     * @throws LocalizedException
     */
    public function getPickupPoints(
        string $street,
        string $postcode,
        string $city,
        string $countryCode,
        $carriers = null,
        ?float $searchLatitude = null,
        ?float $searchLongitude = null
    ): array {
        if (!$this->apiClient->isEnabled()) {
            throw new LocalizedException(__('Innosend API is not enabled.'));
        }

        try {
            // API uses zip_code and country_code (not postcode and country)
            $params = [
                'street' => $street,
                'zip_code' => $postcode,  // API parameter name is zip_code
                'city' => $city,
                'country_code' => $countryCode,  // API parameter name is country_code
            ];

            // WordPress plugin uses 'couriers' array format
            // Convert single carrier to array, or use array as-is
            // Convert all couriers to uppercase for API consistency
            if ($carriers) {
                if (is_array($carriers)) {
                    $params['couriers'] = array_map('strtoupper', array_map('trim', $carriers));
                } else {
                    $params['couriers'] = [strtoupper(trim((string) $carriers))];
                }
            }

            // WordPress plugin uses: /v1/pickup-point/ (with v1 prefix and trailing slash)
            // Match WordPress plugin endpoint exactly: https://api.innosend.eu/v1/pickup-point/
            // The API client will automatically add v1/ prefix for pickup-point endpoints
            $response = $this->apiClient->get('pickup-point/', $params);

            // Store the API request URL for debugging
            if (method_exists($this->apiClient, 'getLastRequestUrl')) {
                $this->lastApiRequestUrl = $this->apiClient->getLastRequestUrl();
            }

            $this->logger->debug('Pickup points API response', [
                'response_type' => gettype($response),
                'response_count' => is_array($response) ? count($response) : 0,
                'has_locations' => is_array($response) && !empty($response)
            ]);

            $pickupPoints = [];
            
            // API returns array of carrier responses, each with 'courier' and 'locations' keys
            // Format: [{"courier": {...}, "locations": [...]}, ...]
            if (is_array($response)) {
                foreach ($response as $carrierResponse) {
                    // Skip error responses
                    if (isset($carrierResponse['error'])) {
                        $this->logger->warning('Carrier API error', ['error' => $carrierResponse['error']]);
                        continue;
                    }
                    
                    // Extract locations from carrier response
                    if (isset($carrierResponse['locations']) && is_array($carrierResponse['locations'])) {
                        $carrierName = $carrierResponse['courier']['name'] ?? null;
                        // Extract logo URL from courier images array (WordPress plugin format)
                        $carrierImages = $carrierResponse['courier']['images'] ?? [];
                        $logoUrl = null;
                        if (!empty($carrierImages) && is_array($carrierImages)) {
                            // Get first element safely - could be numeric or associative array
                            $logoUrl = reset($carrierImages) ?: null;
                        }
                        
                        foreach ($carrierResponse['locations'] as $locationData) {
                            // Extract data according to API documentation structure
                            $address = $locationData['address'] ?? [];
                            $geo = $locationData['geo'] ?? [];
                            
                            // Build normalized location data for PickupPoint model
                            $normalizedData = [
                                'id' => $locationData['id'] ?? null,
                                'name' => $locationData['name'] ?? null,
                                'carrier' => $carrierName ? strtolower($carrierName) : null,
                                'logo' => $logoUrl,  // Courier logo URL from API
                                'street_address' => $address['street_address'] ?? null,
                                'street' => $address['street_address'] ?? null,  // Alias for compatibility
                                'zip_code' => $address['zip_code'] ?? null,
                                'postcode' => $address['zip_code'] ?? null,  // Alias for compatibility
                                'city' => $address['city'] ?? null,
                                'country_code' => $address['country_code'] ?? null,
                                'latitude' => $geo['latitude'] ?? null,
                                'longitude' => $geo['longitude'] ?? null,
                                'distance' => $locationData['distance'] ?? null,
                                'opening_hours' => $locationData['opening_hours'] ?? [],
                                'closure_periods' => $locationData['closure_periods'] ?? []
                            ];
                            
                            // Build full address string from pickup point address (NOT shipping address)
                            $addressParts = array_filter([
                                $normalizedData['street_address'],
                                $normalizedData['zip_code'],
                                $normalizedData['city']
                            ]);
                            $normalizedData['address'] = !empty($addressParts) ? implode(', ', $addressParts) : null;
                            
                            // Log for debugging - ensure we're using pickup point address, not shipping address
                            $this->logger->debug('Pickup point address extracted', [
                                'pickup_point_id' => $normalizedData['id'],
                                'pickup_point_name' => $normalizedData['name'],
                                'pickup_point_street' => $normalizedData['street_address'],
                                'pickup_point_postcode' => $normalizedData['zip_code'],
                                'pickup_point_city' => $normalizedData['city'],
                                'pickup_point_address' => $normalizedData['address']
                            ]);
                            
                            // Calculate distance if not provided and coordinates are available
                            if ($normalizedData['distance'] === null 
                                && $normalizedData['latitude'] !== null 
                                && $normalizedData['longitude'] !== null
                                && $searchLatitude !== null 
                                && $searchLongitude !== null
                            ) {
                                $normalizedData['distance'] = $this->distanceCalculator->calculateDistance(
                                    $searchLatitude,
                                    $searchLongitude,
                                    (float) $normalizedData['latitude'],
                                    (float) $normalizedData['longitude']
                                );
                            }
                            
                            $pickupPoint = new PickupPoint($normalizedData);
                            $pickupPoints[] = $pickupPoint;
                        }
                    }
                }
            }
            
            // Fallback: check for 'data' key (legacy format)
            if (empty($pickupPoints) && isset($response['data']) && is_array($response['data'])) {
                foreach ($response['data'] as $pointData) {
                    $pickupPoint = new PickupPoint($pointData);
                    $pickupPoints[] = $pickupPoint;
                }
            }

            $this->logger->info('Processed pickup points', ['count' => count($pickupPoints)]);

            return $pickupPoints;
        } catch (\Exception $e) {
            $this->logger->error('Error fetching pickup points: ' . $e->getMessage());
            throw new LocalizedException(
                __('Unable to fetch pickup points: %1', $e->getMessage())
            );
        }
    }
}



