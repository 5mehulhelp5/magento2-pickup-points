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
            $carriers = $this->request->getParam('couriers', $this->request->getParam('carriers'));

            if (empty($street) || empty($postcode) || empty($city) || empty($countryCode)) {
                return $result->setData([
                    'success' => false,
                    'message' => __('Missing required address information'),
                ])->setHttpResponseCode(400);
            }

            // Support 'couriers' array parameter (WordPress plugin format)
            // Convert all couriers to uppercase for API consistency
            $carriersParam = null;
            if ($carriers) {
                if (is_array($carriers)) {
                    $carriersParam = array_map('strtoupper', array_map('trim', $carriers));
                } else {
                    $carriersParam = [strtoupper(trim((string) $carriers))];
                }
            } else {
                // If no carriers provided in request, use allowed carriers from configuration
                $allowedCarriersConfig = $this->scopeConfig->getValue(
                    'innosend/pickup_points/allowed_carriers',
                    ScopeInterface::SCOPE_STORE
                );
                
                if (!empty($allowedCarriersConfig)) {
                    if (is_string($allowedCarriersConfig)) {
                        $carriersParam = array_filter(array_map('strtoupper', array_map('trim', explode(',', $allowedCarriersConfig))));
                    } elseif (is_array($allowedCarriersConfig)) {
                        $carriersParam = array_filter(array_map('strtoupper', array_map('trim', $allowedCarriersConfig)));
                    }
                    
                    if (!empty($carriersParam)) {
                        $this->logger->debug('Using allowed carriers from configuration', [
                            'carriers' => $carriersParam
                        ]);
                    }
                }
            }

            // Get coordinates for distance calculation
            // First try to get from request (if provided by frontend)
            $searchLatitude = $this->request->getParam('latitude');
            $searchLongitude = $this->request->getParam('longitude');
            $searchLat = $searchLatitude ? (float) $searchLatitude : null;
            $searchLng = $searchLongitude ? (float) $searchLongitude : null;

            // If not provided, geocode the address
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

            return $result->setData([
                'success' => true,
                'data' => $data,
                'api_url' => $apiRequestUrl
            ]);
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

