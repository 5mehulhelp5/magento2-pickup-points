<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model;

use Innosend\Integration\Api\ClientInterface;
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
    private ClientInterface $apiClient;

    /**
     * @var LoggerInterface
     */
    private LoggerInterface $logger;

    /**
     * @var DistanceCalculator
     */
    private DistanceCalculator $distanceCalculator;

    /**
     * @var string|null
     */
    private ?string $lastApiRequestUrl = null;

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
            throw new LocalizedException(__('Innosend Pickup Points API is not enabled. Please configure the API Token.'));
        }

        try {
            // API uses zip_code and country_code (not postcode and country)
            // For address-based requests
            $params = [
                'street' => $street,
                'zip_code' => $postcode,  // API parameter name is zip_code
                'city' => $city,
                'country_code' => $countryCode,  // API parameter name is country_code
            ];

            // Convert single carrier to array, or use array as-is
            // Keep original case for API calls (API may be case-sensitive, e.g. "PostNL" vs "POSTNL")
            $carriersArray = [];
            if ($carriers) {
                if (is_array($carriers)) {
                    // Trim but keep original case
                    $carriersArray = array_map('trim', $carriers);
                } else {
                    $carriersArray = [trim((string) $carriers)];
                }
            }

            // The API client will automatically add v1/ prefix for pickup-point endpoints

            // If multiple couriers, make separate API calls for each to avoid URL parsing issues
            // Some API parsers only use the last value when duplicate query parameters are present
            $allResponses = [];
            $apiUrls = [];
            if (count($carriersArray) > 1) {
                $this->logger->debug('Making separate API calls for each courier', [
                    'carriers' => $carriersArray,
                    'count' => count($carriersArray)
                ]);

                foreach ($carriersArray as $carrier) {
                    $carrierParams = $params;
                    $carrierParams['couriers'] = [$carrier];
                    $carrierResponse = $this->apiClient->get('pickup-point/', $carrierParams);

                    // Store API URL for this carrier
                    if (method_exists($this->apiClient, 'getLastRequestUrl')) {
                        $carrierUrl = $this->apiClient->getLastRequestUrl();
                        if ($carrierUrl) {
                            $apiUrls[] = $carrierUrl;
                        }
                    }

                    if (is_array($carrierResponse)) {
                        $allResponses = array_merge($allResponses, $carrierResponse);
                        $this->logger->debug('Carrier API call completed', [
                            'carrier' => $carrier,
                            'response_count' => count($carrierResponse),
                            'response_structure' => !empty($carrierResponse) ? array_keys($carrierResponse[0] ?? []) : [],
                            'url' => $carrierUrl ?? 'N/A'
                        ]);
                    } else {
                        $this->logger->warning('Carrier API call returned non-array response', [
                            'carrier' => $carrier,
                            'response_type' => gettype($carrierResponse),
                            'response_preview' => is_string($carrierResponse) ? substr($carrierResponse, 0, 200) : $carrierResponse,
                            'url' => $carrierUrl ?? 'N/A'
                        ]);
                    }
                }

                $response = $allResponses;

                // Combine all API URLs for debugging (show first URL as primary)
                $this->lastApiRequestUrl = !empty($apiUrls) ? $apiUrls[0] . ' (+ ' . (count($apiUrls) - 1) . ' more calls)' : null;
            } else {
                // Single carrier or no carriers specified - use original approach
                if (!empty($carriersArray)) {
                    $params['couriers'] = $carriersArray;
                }
                $response = $this->apiClient->get('pickup-point/', $params);

                // Store the API request URL for debugging
                if (method_exists($this->apiClient, 'getLastRequestUrl')) {
                    $this->lastApiRequestUrl = $this->apiClient->getLastRequestUrl();
                }
            }

            $this->logger->debug('Pickup points API response', [
                'response_type' => gettype($response),
                'response_count' => is_array($response) ? count($response) : 0,
                'has_locations' => is_array($response) && !empty($response),
                'requested_carriers' => $carriers
            ]);

            $pickupPoints = [];
            $processedCarriers = [];

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
                        $locationCount = count($carrierResponse['locations']);
                        $processedCarriers[] = [
                            'name' => $carrierName,
                            'location_count' => $locationCount
                        ];

                        $this->logger->debug('Processing carrier response', [
                            'carrier_name' => $carrierName,
                            'location_count' => $locationCount
                        ]);
                        // Extract images from courier images array
                        // API provides: images array with 'mark' (for map markers) and 'small' (for lists/filters)
                        $carrierImages = $carrierResponse['courier']['images'] ?? [];
                        $logoUrl = null; // Small image for lists/filters
                        $markImageUrl = null; // Mark image for map markers

                        if (!empty($carrierImages) && is_array($carrierImages)) {
                            // Check if images is associative array with 'mark' and 'small' keys
                            if (isset($carrierImages['small'])) {
                                $logoUrl = $carrierImages['small'];
                            }
                            if (isset($carrierImages['mark'])) {
                                $markImageUrl = $carrierImages['mark'];
                            }

                            // Fallback: if it's a numeric array, use first element as logo
                            if (!$logoUrl && !isset($carrierImages['small'])) {
                                $logoUrl = reset($carrierImages) ?: null;
                            }

                            // If no mark image found but logo exists, use logo as fallback
                            if (!$markImageUrl && $logoUrl) {
                                $markImageUrl = $logoUrl;
                            }
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
                                'logo' => $logoUrl,  // Small image for lists/filters
                                'mark_image' => $markImageUrl,  // Mark image for map markers
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

            $this->logger->info('Processed pickup points', [
                'count' => count($pickupPoints),
                'requested_carriers' => $carriers,
                'processed_carriers' => $processedCarriers,
                'carriers_in_results' => array_unique(array_map(function ($point) {
                    return $point->getCarrier();
                }, $pickupPoints))
            ]);

            return $pickupPoints;
        } catch (\Exception $e) {
            $this->logger->error('Error fetching pickup points: ' . $e->getMessage());
            throw new LocalizedException(
                __('Unable to fetch pickup points: %1', $e->getMessage())
            );
        }
    }

    /**
     * Get pickup points by coordinates
     *
     * @param float $latitude Latitude
     * @param float $longitude Longitude
     * @param string $countryCode Country code (ISO 3166-1 alpha-2)
     * @param string|array|null $carriers Carrier code(s) - can be single string or array (optional)
     * @param float|null $searchLatitude Latitude of search address for distance calculation (optional)
     * @param float|null $searchLongitude Longitude of search address for distance calculation (optional)
     * @return PickupPoint[]
     * @throws LocalizedException
     */
    public function getPickupPointsByCoordinates(
        float $latitude,
        float $longitude,
        string $countryCode,
        $carriers = null,
        ?float $searchLatitude = null,
        ?float $searchLongitude = null
    ): array {
        if (!$this->apiClient->isEnabled()) {
            throw new LocalizedException(__('Innosend Pickup Points API is not enabled. Please configure the API Token.'));
        }

        try {
            // API uses latitude and longitude for coordinate-based requests
            $params = [
                'latitude' => $latitude,
                'longitude' => $longitude,
                'country_code' => $countryCode,  // API parameter name is country_code
            ];

            // Convert single carrier to array, or use array as-is
            // Keep original case for API calls (API may be case-sensitive, e.g. "PostNL" vs "POSTNL")
            $carriersArray = [];
            if ($carriers) {
                if (is_array($carriers)) {
                    // Trim but keep original case
                    $carriersArray = array_map('trim', $carriers);
                } else {
                    $carriersArray = [trim((string) $carriers)];
                }
            }

            // The API client will automatically add v1/ prefix for pickup-point endpoints
            // If multiple couriers, make separate API calls for each to avoid URL parsing issues
            // Some API parsers only use the last value when duplicate query parameters are present
            $allResponses = [];
            $apiUrls = [];
            if (count($carriersArray) > 1) {
                $this->logger->debug('Making separate API calls for each courier (coordinate-based)', [
                    'carriers' => $carriersArray,
                    'count' => count($carriersArray),
                    'latitude' => $latitude,
                    'longitude' => $longitude
                ]);

                foreach ($carriersArray as $carrier) {
                    $carrierParams = $params;
                    $carrierParams['couriers'] = [$carrier];
                    $carrierResponse = $this->apiClient->get('pickup-point/', $carrierParams);

                    // Store API URL for this carrier
                    if (method_exists($this->apiClient, 'getLastRequestUrl')) {
                        $carrierUrl = $this->apiClient->getLastRequestUrl();
                        if ($carrierUrl) {
                            $apiUrls[] = $carrierUrl;
                        }
                    }

                    if (is_array($carrierResponse)) {
                        $allResponses = array_merge($allResponses, $carrierResponse);
                        $this->logger->debug('Carrier API call completed (coordinate-based)', [
                            'carrier' => $carrier,
                            'response_count' => count($carrierResponse),
                            'response_structure' => !empty($carrierResponse) ? array_keys($carrierResponse[0] ?? []) : [],
                            'url' => $carrierUrl ?? 'N/A'
                        ]);
                    } else {
                        $this->logger->warning('Carrier API call returned non-array response (coordinate-based)', [
                            'carrier' => $carrier,
                            'response_type' => gettype($carrierResponse),
                            'response_preview' => is_string($carrierResponse) ? substr($carrierResponse, 0, 200) : $carrierResponse,
                            'url' => $carrierUrl ?? 'N/A'
                        ]);
                    }
                }
            } else {
                // Single carrier or no carriers specified
                if (!empty($carriersArray)) {
                    $params['couriers'] = $carriersArray;
                }

                $allResponses = $this->apiClient->get('pickup-point/', $params);

                // Store API URL
                if (method_exists($this->apiClient, 'getLastRequestUrl')) {
                    $apiUrl = $this->apiClient->getLastRequestUrl();
                    if ($apiUrl) {
                        $apiUrls[] = $apiUrl;
                    }
                }

                if (!is_array($allResponses)) {
                    $this->logger->warning('API call returned non-array response (coordinate-based)', [
                        'response_type' => gettype($allResponses),
                        'response_preview' => is_string($allResponses) ? substr($allResponses, 0, 200) : $allResponses,
                        'url' => $apiUrl ?? 'N/A'
                    ]);
                    $allResponses = [];
                }
            }

            // Store combined API URLs for debugging
            if (!empty($apiUrls)) {
                $this->lastApiRequestUrl = implode(' (+ ' . (count($apiUrls) - 1) . ' more calls)', $apiUrls);
            }

            $pickupPoints = [];
            $processedCarriers = [];

            if (is_array($allResponses) && !empty($allResponses)) {
                foreach ($allResponses as $carrierResponse) {
                    if (!is_array($carrierResponse) || empty($carrierResponse['courier'])) {
                        continue;
                    }

                    $carrierName = $carrierResponse['courier']['name'] ?? null;
                    if ($carrierName) {
                        $processedCarriers[] = strtolower($carrierName);
                    }

                    // Extract images from courier images array
                    // API provides: images array with 'mark' (for map markers) and 'small' (for lists/filters)
                    $carrierImages = $carrierResponse['courier']['images'] ?? [];
                    $logoUrl = null; // Small image for lists/filters
                    $markImageUrl = null; // Mark image for map markers

                    if (!empty($carrierImages) && is_array($carrierImages)) {
                        // Check if images is associative array with 'mark' and 'small' keys
                        if (isset($carrierImages['small'])) {
                            $logoUrl = $carrierImages['small'];
                        }
                        if (isset($carrierImages['mark'])) {
                            $markImageUrl = $carrierImages['mark'];
                        }

                        // Fallback: if it's a numeric array, use first element as logo
                        if (!$logoUrl && !isset($carrierImages['small'])) {
                            $logoUrl = reset($carrierImages) ?: null;
                        }

                        // If no mark image found but logo exists, use logo as fallback
                        if (!$markImageUrl && $logoUrl) {
                            $markImageUrl = $logoUrl;
                        }
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
                            'logo' => $logoUrl,  // Small image for lists/filters
                            'mark_image' => $markImageUrl,  // Mark image for map markers
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
                            'closure_periods' => $locationData['closure_periods'] ?? [],
                        ];

                        // Build full address string
                        $addressParts = array_filter([
                            $normalizedData['street'],
                            $normalizedData['postcode'],
                            $normalizedData['city']
                        ]);
                        $normalizedData['address'] = !empty($addressParts) ? implode(', ', $addressParts) : null;

                        // Calculate distance if search coordinates provided
                        if ($searchLatitude !== null && $searchLongitude !== null &&
                            $normalizedData['latitude'] !== null && $normalizedData['longitude'] !== null) {
                            $distance = $this->distanceCalculator->calculateDistance(
                                $searchLatitude,
                                $searchLongitude,
                                (float) $normalizedData['latitude'],
                                (float) $normalizedData['longitude']
                            );
                            $normalizedData['distance'] = $distance;
                        }

                        $pickupPoint = new PickupPoint($normalizedData);
                        $pickupPoints[] = $pickupPoint;
                    }
                }
            }

            // Log processed carriers for debugging
            $uniqueCarriers = array_unique($processedCarriers);
            $this->logger->debug('Processed pickup points from API (coordinate-based)', [
                'total_points' => count($pickupPoints),
                'carriers_in_results' => $uniqueCarriers,
                'requested_carriers' => $carriersArray,
                'processed_carriers' => $processedCarriers,
                'api_url' => $this->lastApiRequestUrl
            ]);

            return $pickupPoints;
        } catch (\Exception $e) {
            $this->logger->error('Error fetching pickup points by coordinates: ' . $e->getMessage());
            throw new LocalizedException(
                __('Unable to fetch pickup points: %1', $e->getMessage())
            );
        }
    }
}
