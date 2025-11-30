<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Controller\Ajax;

use Innosend\PickupPoints\Model\PickupPointRepository;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
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
     * @param JsonFactory $resultJsonFactory
     * @param PickupPointRepository $pickupPointRepository
     * @param RequestInterface $request
     * @param LoggerInterface $logger
     */
    public function __construct(
        JsonFactory $resultJsonFactory,
        PickupPointRepository $pickupPointRepository,
        RequestInterface $request,
        LoggerInterface $logger
    ) {
        $this->resultJsonFactory = $resultJsonFactory;
        $this->pickupPointRepository = $pickupPointRepository;
        $this->request = $request;
        $this->logger = $logger;
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
            $carrier = $this->request->getParam('carrier');

            if (empty($street) || empty($postcode) || empty($city) || empty($countryCode)) {
                return $result->setData([
                    'success' => false,
                    'message' => __('Missing required address information'),
                ])->setHttpResponseCode(400);
            }

            $pickupPoints = $this->pickupPointRepository->getPickupPoints(
                $street,
                $postcode,
                $city,
                $countryCode,
                $carrier
            );

            $data = [];
            foreach ($pickupPoints as $point) {
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
                    'distance' => $point->getDistance(),
                    'opening_hours' => $point->getOpeningHours(),
                ];
            }

            return $result->setData([
                'success' => true,
                'data' => $data,
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
}

