<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Webapi;

use Innosend\PickupPoints\Api\Webapi\SavePickupPointInterface;
use Innosend\PickupPoints\Helper\PickupPointSave;
use Magento\Framework\Webapi\Rest\Request as WebapiRequest;
use Magento\Quote\Api\CartRepositoryInterface;
use Psr\Log\LoggerInterface;

/**
 * Save pickup point for customer cart
 */
class SavePickupPoint implements SavePickupPointInterface
{
    /**
     * @var CartRepositoryInterface
     */
    private $cartRepository;

    /**
     * @var PickupPointSave
     */
    private $pickupPointSave;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var WebapiRequest
     */
    private $request;

    /**
     * @var \Magento\Framework\Serialize\Serializer\Json
     */
    private $json;

    /**
     * @param CartRepositoryInterface $cartRepository
     * @param PickupPointSave $pickupPointSave
     * @param LoggerInterface $logger
     * @param WebapiRequest $request
     * @param \Magento\Framework\Serialize\Serializer\Json $json
     */
    public function __construct(
        CartRepositoryInterface $cartRepository,
        PickupPointSave $pickupPointSave,
        LoggerInterface $logger,
        WebapiRequest $request,
        \Magento\Framework\Serialize\Serializer\Json $json
    ) {
        $this->cartRepository = $cartRepository;
        $this->pickupPointSave = $pickupPointSave;
        $this->logger = $logger;
        $this->request = $request;
        $this->json = $json;
    }

    /**
     * {@inheritDoc}
     */
    public function save(string $cartId, array $pickupPoint = null): bool
    {
        // For "mine", getActive() will get the customer's active cart
        $quote = $this->cartRepository->getActive($cartId);

        // Read pickup point data from request body
        // In WebAPI, getBodyParams() returns the parsed JSON body
        // Also normalize the parameter if it was auto-mapped by Magento WebAPI
        $pickupPointData = $this->getPickupPointFromRequest($pickupPoint);

        if (!is_array($pickupPointData) || empty($pickupPointData)) {
            $this->logger->error('Innosend Pickup Points: No pickup point data found in request', [
                'cart_id' => $cartId,
                'quote_id' => $quote->getId(),
                'body_params' => $this->request->getBodyParams(),
                'raw_content' => $this->request->getContent(),
                'parameter_type' => gettype($pickupPoint),
                'parameter_class' => is_object($pickupPoint) ? get_class($pickupPoint) : null
            ]);
            throw new \Magento\Framework\Exception\InputException(__('Pickup point data is required'));
        }

        $this->logger->debug('Innosend Pickup Points: Saving pickup point via WebAPI', [
            'cart_id' => $cartId,
            'quote_id' => $quote->getId(),
            'pickup_point_id' => $pickupPointData['pickup_point_id'] ?? null
        ]);

        $this->pickupPointSave->setByQuoteId($quote->getId(), $pickupPointData);

        return true;
    }

    /**
     * Extract pickup point data from request
     *
     * @param array|null $pickupPoint
     * @return array|null
     */
    private function getPickupPointFromRequest($pickupPoint): ?array
    {
        $data = null;

        // Try to get from body params (WebAPI automatically parses JSON body)
        $bodyParams = $this->request->getBodyParams();
        if (is_array($bodyParams) && !empty($bodyParams)) {
            // Check for 'pickupPoint' key (as sent from frontend)
            if (isset($bodyParams['pickupPoint'])) {
                $data = $bodyParams['pickupPoint'];
            } elseif (isset($bodyParams['pickup_point_id']) || isset($bodyParams['pickupPointId'])) {
                // If body is already the pickup point array, use it directly
                $data = $bodyParams;
            }
        }

        // Fallback: try to parse raw content
        if ($data === null) {
            $rawContent = $this->request->getContent();
            if ($rawContent) {
                try {
                    $bodyData = $this->json->unserialize($rawContent);
                    if (is_array($bodyData)) {
                        if (isset($bodyData['pickupPoint'])) {
                            $data = $bodyData['pickupPoint'];
                        } elseif (isset($bodyData['pickup_point_id']) || isset($bodyData['pickupPointId'])) {
                            $data = $bodyData;
                        }
                    }
                } catch (\Exception $e) {
                    $this->logger->warning('Innosend Pickup Points: Failed to parse request body', [
                        'error' => $e->getMessage(),
                        'content' => $rawContent
                    ]);
                }
            }
        }

        // Normalize data to ensure it's a plain array with string values
        return $this->normalizePickupPointData($data);
    }

    /**
     * Normalize pickup point data to plain array
     *
     * @param mixed $data
     * @return array|null
     */
    private function normalizePickupPointData(mixed $data): ?array
    {
        if ($data === null) {
            return null;
        }

        // If it's already a plain array, normalize the values
        if (is_array($data)) {
            $normalized = [];

            // Handle nested objects or arrays
            foreach ($data as $key => $value) {
                if (is_object($value)) {
                    // If it's an object, try to extract the value
                    if (method_exists($value, 'getPickupPointId')) {
                        // It's a PickupPoint object - extract all values
                        $normalized['pickup_point_id'] = $this->extractStringValue($value, 'getPickupPointId');
                        $normalized['pickup_point_name'] = $this->extractStringValue($value, 'getPickupPointName');
                        $normalized['pickup_point_address'] = $this->extractStringValue($value, 'getPickupPointAddress');
                        $normalized['pickup_point_carrier'] = $this->extractStringValue($value, 'getPickupPointCarrier');
                        return $normalized;
                    } else {
                        // Generic object - try to convert to string
                        $normalized[$key] = (string)$value;
                    }
                } elseif (is_array($value)) {
                    // Recursively normalize nested arrays
                    $normalized[$key] = $this->normalizePickupPointData($value);
                } else {
                    // Convert to string
                    $normalized[$key] = $value !== null ? (string)$value : null;
                }
            }

            // Ensure we have the expected keys
            if (isset($normalized['pickup_point_id']) || isset($normalized['pickupPointId'])) {
                return [
                    'pickup_point_id' => $normalized['pickup_point_id'] ?? $normalized['pickupPointId'] ?? null,
                    'pickup_point_name' => $normalized['pickup_point_name'] ?? $normalized['pickupPointName'] ?? null,
                    'pickup_point_address' => $normalized['pickup_point_address'] ?? $normalized['pickupPointAddress'] ?? null,
                    'pickup_point_carrier' => $normalized['pickup_point_carrier'] ?? $normalized['pickupPointCarrier'] ?? null,
                ];
            }

            return $normalized;
        }

        // If it's an object, try to extract data
        if (is_object($data)) {
            if (method_exists($data, 'getPickupPointId')) {
                return [
                    'pickup_point_id' => $this->extractStringValue($data, 'getPickupPointId'),
                    'pickup_point_name' => $this->extractStringValue($data, 'getPickupPointName'),
                    'pickup_point_address' => $this->extractStringValue($data, 'getPickupPointAddress'),
                    'pickup_point_carrier' => $this->extractStringValue($data, 'getPickupPointCarrier'),
                ];
            }
        }

        return null;
    }

    /**
     * Extract string value from object method
     *
     * @param object $object
     * @param string $method
     * @return string|null
     */
    private function extractStringValue(object $object, string $method): ?string
    {
        if (method_exists($object, $method)) {
            $value = $object->$method();
            return $value !== null ? (string)$value : null;
        }
        return null;
    }
}
