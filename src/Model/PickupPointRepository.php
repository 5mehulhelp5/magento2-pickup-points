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
     * @param ClientInterface $apiClient
     * @param LoggerInterface $logger
     */
    public function __construct(
        ClientInterface $apiClient,
        LoggerInterface $logger
    ) {
        $this->apiClient = $apiClient;
        $this->logger = $logger;
    }

    /**
     * Get pickup points by address
     *
     * @param string $street Street address
     * @param string $postcode Postal code
     * @param string $city City
     * @param string $countryCode Country code (ISO 3166-1 alpha-2)
     * @param string|null $carrier Carrier code (optional)
     * @return PickupPoint[]
     * @throws LocalizedException
     */
    public function getPickupPoints(
        string $street,
        string $postcode,
        string $city,
        string $countryCode,
        ?string $carrier = null
    ): array {
        if (!$this->apiClient->isEnabled()) {
            throw new LocalizedException(__('Innosend API is not enabled.'));
        }

        try {
            $params = [
                'street' => $street,
                'postcode' => $postcode,
                'city' => $city,
                'country' => $countryCode,
            ];

            if ($carrier) {
                $params['carrier'] = $carrier;
            }

            $response = $this->apiClient->get('pickup-points', $params);

            $pickupPoints = [];
            if (isset($response['data']) && is_array($response['data'])) {
                foreach ($response['data'] as $pointData) {
                    $pickupPoint = new PickupPoint($pointData);
                    $pickupPoints[] = $pickupPoint;
                }
            }

            return $pickupPoints;
        } catch (\Exception $e) {
            $this->logger->error('Error fetching pickup points: ' . $e->getMessage());
            throw new LocalizedException(
                __('Unable to fetch pickup points: %1', $e->getMessage())
            );
        }
    }
}



