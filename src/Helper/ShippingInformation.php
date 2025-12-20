<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Helper;

use Magento\Framework\Serialize\Serializer\Json;

/**
 * Helper to build and parse shipping information JSON
 */
class ShippingInformation
{
    /**
     * @var Json
     */
    private $json;

    /**
     * @param Json $json
     */
    public function __construct(
        Json $json
    ) {
        $this->json = $json;
    }

    /**
     * Parse shipping method string to get carrier and method
     *
     * @param string|null $shippingMethod
     * @return array{carrier: string|null, method: string|null}
     */
    public function parseShippingMethod(?string $shippingMethod): array
    {
        if (!$shippingMethod) {
            return ['carrier' => null, 'method' => null];
        }

        // Magento shipping method format: {carrier}_{method}
        $parts = explode('_', $shippingMethod, 2);
        
        if (count($parts) === 2) {
            return [
                'carrier' => $parts[0],
                'method' => $parts[1],
            ];
        }

        return [
            'carrier' => $shippingMethod,
            'method' => null,
        ];
    }

    /**
     * Build shipping information JSON structure
     *
     * @param string|null $shippingMethod
     * @param array|null $pickupPointData
     * @return string
     */
    public function buildShippingInformation(?string $shippingMethod, ?array $pickupPointData = null): string
    {
        $parsed = $this->parseShippingMethod($shippingMethod);
        
        $shippingInformation = [
            'shipping_method' => $shippingMethod,
            'shipping_carrier' => $parsed['carrier'],
            'pickup_point' => false,
        ];

        if ($pickupPointData && !empty($pickupPointData['pickup_point_id'])) {
            $shippingInformation['pickup_point'] = [
                'id' => $pickupPointData['pickup_point_id'] ?? null,
                'courier' => $pickupPointData['pickup_point_carrier'] ?? null,
                'name' => $pickupPointData['pickup_point_name'] ?? null,
                'address' => $pickupPointData['pickup_point_address'] ?? null,
            ];
        }

        return $this->json->serialize($shippingInformation);
    }

    /**
     * Parse shipping information JSON structure
     *
     * @param string|null $shippingInformationJson
     * @return array|null
     */
    public function parseShippingInformation(?string $shippingInformationJson): ?array
    {
        if (!$shippingInformationJson) {
            return null;
        }

        try {
            return $this->json->unserialize($shippingInformationJson);
        } catch (\Exception $e) {
            return null;
        }
    }

    /**
     * Extract pickup point data from shipping information
     *
     * @param array|null $shippingInformation
     * @return array|null
     */
    public function extractPickupPoint(?array $shippingInformation): ?array
    {
        if (!$shippingInformation || !isset($shippingInformation['pickup_point'])) {
            return null;
        }

        $pickupPoint = $shippingInformation['pickup_point'];
        
        if ($pickupPoint === false || !is_array($pickupPoint)) {
            return null;
        }

        return [
            'pickup_point_id' => $pickupPoint['id'] ?? null,
            'pickup_point_carrier' => $pickupPoint['courier'] ?? null,
            'pickup_point_name' => $pickupPoint['name'] ?? null,
            'pickup_point_address' => $pickupPoint['address'] ?? null,
        ];
    }
}
