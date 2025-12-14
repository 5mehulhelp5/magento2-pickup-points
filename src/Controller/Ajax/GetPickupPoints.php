<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Controller\Ajax;

use Innosend\PickupPoints\Helper\Geocoder;
use Innosend\PickupPoints\Helper\DistanceCalculator;
use Innosend\PickupPoints\Helper\DayConverter;
use Innosend\PickupPoints\Model\PickupPointRepository;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Magento\Store\Model\ScopeInterface;
use Psr\Log\LoggerInterface;

/**
 * AJAX controller for fetching pickup points
 */
class GetPickupPoints implements HttpPostActionInterface
{
    /**
     * @var JsonFactory
     */
    private $resultJsonFactory;

    /**
     * @var PickupPointRepository
     */
    private $pickupPointRepository;

    /**
     * @var RequestInterface
     */
    private $request;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var Geocoder
     */
    private $geocoder;

    /**
     * @var DistanceCalculator
     */
    private $distanceCalculator;

    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @var DayConverter
     */
    private $dayConverter;

    /**
     * @param JsonFactory $resultJsonFactory
     * @param PickupPointRepository $pickupPointRepository
     * @param RequestInterface $request
     * @param LoggerInterface $logger
     * @param Geocoder $geocoder
     * @param DistanceCalculator $distanceCalculator
     * @param ScopeConfigInterface $scopeConfig
     * @param DayConverter $dayConverter
     */
    public function __construct(
        JsonFactory $resultJsonFactory,
        PickupPointRepository $pickupPointRepository,
        RequestInterface $request,
        LoggerInterface $logger,
        Geocoder $geocoder,
        DistanceCalculator $distanceCalculator,
        ScopeConfigInterface $scopeConfig,
        DayConverter $dayConverter
    ) {
        $this->resultJsonFactory = $resultJsonFactory;
        $this->pickupPointRepository = $pickupPointRepository;
        $this->request = $request;
        $this->logger = $logger;
        $this->geocoder = $geocoder;
        $this->distanceCalculator = $distanceCalculator;
        $this->scopeConfig = $scopeConfig;
        $this->dayConverter = $dayConverter;
    }

    /**
     * Execute
     *
     * @return Json
     */
    public function execute(): Json
    {
        $result = $this->resultJsonFactory->create();

        try {
            $street = (string) $this->request->getParam('street', '');
            $postcode = (string) $this->request->getParam('postcode', '');
            $city = (string) $this->request->getParam('city', '');
            $countryCode = (string) $this->request->getParam('country_code', '');
            
            // Get couriers from POST data - handle duplicate parameters
            // Magento's getParam() only returns the last value for duplicate keys
            // So we need to parse the raw POST data or query string
            $carriers = [];
            $postData = $this->request->getPostValue();
            if (isset($postData['couriers'])) {
                if (is_array($postData['couriers'])) {
                    $carriers = $postData['couriers'];
                } else {
                    $carriers = [$postData['couriers']];
                }
            } else {
                // Fallback to getParam if not in POST data
                $carriersParam = $this->request->getParam('couriers', $this->request->getParam('carriers'));
                if ($carriersParam) {
                    $carriers = is_array($carriersParam) ? $carriersParam : [$carriersParam];
                }
            }
            
            // Also check query string for couriers (in case they're sent as query params)
            if (empty($carriers)) {
                $queryString = $this->request->getQueryValue();
                if (isset($queryString['couriers'])) {
                    if (is_array($queryString['couriers'])) {
                        $carriers = $queryString['couriers'];
                    } else {
                        $carriers = [$queryString['couriers']];
                    }
                }
            }
            
            // Parse raw POST body content for couriers=value1&couriers=value2 format
            // This handles duplicate query parameters that getParam() doesn't support
            if (empty($carriers) || count($carriers) === 1) {
                // Try to get raw content from request
                if (method_exists($this->request, 'getContent')) {
                    $content = $this->request->getContent();
                    if (!empty($content)) {
                        // Extract all couriers from raw string using regex
                        preg_match_all('/couriers=([^&]+)/', $content, $matches);
                        if (!empty($matches[1])) {
                            $carriers = array_map('urldecode', $matches[1]);
                            $this->logger->debug('Extracted couriers from raw POST content', [
                                'carriers' => $carriers,
                                'raw_content' => substr($content, 0, 200) // Log first 200 chars
                            ]);
                        }
                    }
                }
                
                // Also check $_POST superglobal as fallback
                if ((empty($carriers) || count($carriers) === 1) && isset($_POST['couriers'])) {
                    if (is_array($_POST['couriers'])) {
                        $carriers = $_POST['couriers'];
                    } else {
                        // Check if there are multiple couriers in the raw POST string
                        $rawPost = file_get_contents('php://input');
                        if (!empty($rawPost)) {
                            preg_match_all('/couriers=([^&]+)/', $rawPost, $matches);
                            if (!empty($matches[1])) {
                                $carriers = array_map('urldecode', $matches[1]);
                            } else {
                                $carriers = [$_POST['couriers']];
                            }
                        } else {
                            $carriers = [$_POST['couriers']];
                        }
                    }
                }
            }

            // Support both address-based and coordinate-based requests
            $latitude = $this->request->getParam('latitude');
            $longitude = $this->request->getParam('longitude');
            
            // Validate: either address info OR coordinates must be provided
            $hasAddressInfo = !empty($street) && !empty($postcode) && !empty($city) && !empty($countryCode);
            $hasCoordinates = !empty($latitude) && !empty($longitude) && !empty($countryCode);
            
            if (!$hasAddressInfo && !$hasCoordinates) {
                return $result->setData([
                    'success' => false,
                    'message' => __('Missing required address information or coordinates'),
                ])->setHttpResponseCode(400);
            }

            // Support 'couriers' array parameter (WordPress plugin format)
            // Map uppercase carrier codes to API-expected case (e.g. "POSTNL" -> "PostNL")
            $carrierCaseMap = [
                'POSTNL' => 'PostNL',
                'DPD' => 'DPD',
                'DHL' => 'DHL',
                'GLS' => 'GLS',
            ];
            
            $carriersParam = null;
            if (!empty($carriers)) {
                // Trim and map to correct case for API
                $carriersParam = array_map(function($carrier) use ($carrierCaseMap) {
                    $trimmed = trim($carrier);
                    $upper = strtoupper($trimmed);
                    return $carrierCaseMap[$upper] ?? $trimmed; // Use mapped case or original if not in map
                }, $carriers);
                
                $this->logger->debug('Extracted couriers from request', [
                    'carriers' => $carriersParam,
                    'count' => count($carriersParam),
                    'original' => $carriers
                ]);
            } else {
                // If no carriers provided in request, use allowed carriers from configuration
                $allowedCarriersConfig = $this->scopeConfig->getValue(
                    'innosend/pickup_points/allowed_carriers',
                    ScopeInterface::SCOPE_STORE
                );
                
                if (!empty($allowedCarriersConfig)) {
                    $configCarriers = [];
                    if (is_string($allowedCarriersConfig)) {
                        $configCarriers = array_filter(array_map('trim', explode(',', $allowedCarriersConfig)));
                    } elseif (is_array($allowedCarriersConfig)) {
                        $configCarriers = array_filter(array_map('trim', $allowedCarriersConfig));
                    }
                    
                    // Map to correct case for API
                    $carriersParam = array_map(function($carrier) use ($carrierCaseMap) {
                        $upper = strtoupper(trim($carrier));
                        return $carrierCaseMap[$upper] ?? $carrier; // Use mapped case or original if not in map
                    }, $configCarriers);
                    
                    if (!empty($carriersParam)) {
                        $this->logger->debug('Using allowed carriers from configuration', [
                            'carriers' => $carriersParam,
                            'original_config' => $configCarriers
                        ]);
                    }
                }
            }

            // Get coordinates for distance calculation
            // Priority: search_latitude/search_longitude (for distance) > latitude/longitude (for API call)
            $searchLatitude = $this->request->getParam('search_latitude');
            $searchLongitude = $this->request->getParam('search_longitude');
            
            // Fallback to latitude/longitude if search_latitude/search_longitude not provided
            if ($searchLatitude === null) {
                $searchLatitude = $this->request->getParam('latitude');
            }
            if ($searchLongitude === null) {
                $searchLongitude = $this->request->getParam('longitude');
            }
            
            $searchLat = $searchLatitude ? (float) $searchLatitude : null;
            $searchLng = $searchLongitude ? (float) $searchLongitude : null;

            // If coordinates provided directly, use them for API call
            // Otherwise, if address provided, geocode it
            if ($hasCoordinates) {
                // Use provided coordinates directly
                $this->logger->info('Using provided coordinates for API call', [
                    'latitude' => $searchLat,
                    'longitude' => $searchLng,
                    'country' => $countryCode
                ]);
                
                // For coordinate-based requests, pass empty strings for address fields
                $pickupPoints = $this->pickupPointRepository->getPickupPointsByCoordinates(
                    $searchLat,
                    $searchLng,
                    $countryCode,
                    $carriersParam,
                    $searchLat,
                    $searchLng
                );
            } else {
                // Address-based request: geocode if coordinates not provided
                if ($searchLat === null || $searchLng === null) {
                    $this->logger->info('Geocoding address for distance calculation', [
                        'street' => $street,
                        'postcode' => $postcode,
                        'city' => $city,
                        'country' => $countryCode
                    ]);

                    $coordinates = $this->geocoder->geocodeAddress($street, $postcode, $city, $countryCode);
                    if ($coordinates !== null) {
                        $searchLat = $coordinates['latitude'];
                        $searchLng = $coordinates['longitude'];
                        $this->logger->info('Address geocoded successfully', [
                            'latitude' => $searchLat,
                            'longitude' => $searchLng
                        ]);
                    } else {
                        $this->logger->warning('Failed to geocode address, distance calculation will be skipped');
                    }
                }

                $pickupPoints = $this->pickupPointRepository->getPickupPoints(
                    $street,
                    $postcode,
                    $city,
                    $countryCode,
                    $carriersParam,
                    $searchLat,
                    $searchLng
                );
            }

            // Calculate distances for all pickup points if we have coordinates
            if ($searchLat !== null && $searchLng !== null) {
                foreach ($pickupPoints as $point) {
                    if ($point->getLatitude() !== null && $point->getLongitude() !== null) {
                        // Only calculate if not already set
                        if ($point->getDistance() === null) {
                            $distance = $this->distanceCalculator->calculateDistance(
                                $searchLat,
                                $searchLng,
                                $point->getLatitude(),
                                $point->getLongitude()
                            );
                            $point->setData('distance', $distance);
                        }
                    }
                }

                // Sort pickup points by distance (nearest first)
                usort($pickupPoints, function ($a, $b) {
                    $distA = $a->getDistance() ?? 999999;
                    $distB = $b->getDistance() ?? 999999;
                    return $distA <=> $distB;
                });
            }

            $data = [];
            foreach ($pickupPoints as $point) {
                // Convert opening hours day numbers to day names, sort by day, and merge multiple times per day
                $openingHours = $this->processOpeningHours($point->getOpeningHours());

                $data[] = [
                    'id' => $point->getId(),
                    'name' => $point->getName(),
                    'address' => $point->getAddress(),
                    'street' => $point->getStreet(),
                    'postcode' => $point->getPostcode(),
                    'city' => $point->getCity(),
                    'country_code' => $point->getCountryCode(),
                    'latitude' => $point->getLatitude(),
                    'longitude' => $point->getLongitude(),
                    'carrier' => $point->getCarrier(),
                    'logo' => $point->getLogo(),
                    'mark_image' => $point->getMarkImage(), // Mark image from courier.images.mark
                    'distance' => $point->getDistance(),
                    'opening_hours' => $openingHours,
                ];
            }

            // Get API request URL for debugging (from repository)
            $apiRequestUrl = $this->pickupPointRepository->getLastApiRequestUrl();

            if (empty($data)) {
                return $result->setData([
                    'success' => false,
                    'message' => __('No pickup points found for this address.'),
                    'api_url' => $apiRequestUrl,
                    'data' => []
                ]);
            }

            // Include search coordinates in response so frontend can store them for future distance calculations
            $responseData = [
                'success' => true,
                'data' => $data,
                'api_url' => $apiRequestUrl
            ];
            
            // Add search coordinates if available (for distance calculation)
            if ($searchLat !== null && $searchLng !== null) {
                $responseData['search_latitude'] = $searchLat;
                $responseData['search_longitude'] = $searchLng;
            }
            
            return $result->setData($responseData);
        } catch (LocalizedException $e) {
            $this->logger->error('Error fetching pickup points: ' . $e->getMessage());
            return $result->setData([
                'success' => false,
                'message' => $e->getMessage(),
            ])->setHttpResponseCode(400);
        } catch (\Exception $e) {
            $this->logger->error('Unexpected error fetching pickup points: ' . $e->getMessage());
            return $result->setData([
                'success' => false,
                'message' => __('An error occurred while fetching pickup points'),
            ])->setHttpResponseCode(500);
        }
    }

    /**
     * Process opening hours: sort by day (1-7) and merge multiple times per day
     *
     * @param array|null $rawOpeningHours
     * @return array
     */
    private function processOpeningHours(?array $rawOpeningHours): array
    {
        if (!is_array($rawOpeningHours) || empty($rawOpeningHours)) {
            return [];
        }

        // Group by day_of_week
        $groupedByDay = [];
        foreach ($rawOpeningHours as $hours) {
            if (!is_array($hours)) {
                continue;
            }

            $dayNumber = $hours['day_of_week'] ?? null;
            if ($dayNumber === null) {
                continue;
            }

            $opens = $hours['opens'] ?? '';
            $closes = $hours['closes'] ?? '';

            if (!isset($groupedByDay[$dayNumber])) {
                $groupedByDay[$dayNumber] = [];
            }

            $groupedByDay[$dayNumber][] = [
                'opens' => $opens,
                'closes' => $closes
            ];
        }

        // Sort by day number (1-7) and merge times per day
        $processedHours = [];
        for ($day = 1; $day <= 7; $day++) {
            if (!isset($groupedByDay[$day])) {
                continue;
            }

            $timesForDay = $groupedByDay[$day];
            $mergedTimes = [];

            foreach ($timesForDay as $time) {
                $opens = $time['opens'];
                $closes = $time['closes'];

                // Convert N/A values to "Closed"
                $opensNormalized = strtoupper(trim($opens));
                $closesNormalized = strtoupper(trim($closes));
                
                if ($opensNormalized === 'N/A' || $closesNormalized === 'N/A' || 
                    (empty($opens) && empty($closes))) {
                    $closedPhrase = __('Closed');
                    $closedText = $closedPhrase instanceof \Magento\Framework\Phrase ? (string) $closedPhrase : $closedPhrase;
                    $mergedTimes[] = $closedText;
                } else {
                    $mergedTimes[] = $opens . ' - ' . $closes;
                }
            }

            // Join multiple times with " / "
            $mergedTimeString = implode(' / ', $mergedTimes);

            $processedHours[] = [
                'day_of_week' => $day,
                'day_name_short' => $this->dayConverter->getDayNameShort($day),
                'day_name_long' => $this->dayConverter->getDayNameLong($day),
                'hours' => $mergedTimeString
            ];
        }

        return $processedHours;
    }
}
