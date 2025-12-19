<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Controller\Ajax;

use Innosend\PickupPoints\Helper\PickupPointSave;
use Magento\Framework\App\Action\HttpPostActionInterface;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\Controller\Result\Json;
use Magento\Framework\Controller\Result\JsonFactory;
use Magento\Framework\Exception\LocalizedException;
use Psr\Log\LoggerInterface;

/**
 * AJAX controller for saving pickup point to quote
 */
class SavePickupPoint implements HttpPostActionInterface
{
    /**
     * @var JsonFactory
     */
    private $resultJsonFactory;

    /**
     * @var PickupPointSave
     */
    private $pickupPointSave;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var RequestInterface
     */
    private $request;

    /**
     * @param JsonFactory $resultJsonFactory
     * @param PickupPointSave $pickupPointSave
     * @param LoggerInterface $logger
     * @param RequestInterface $request
     */
    public function __construct(
        JsonFactory $resultJsonFactory,
        PickupPointSave $pickupPointSave,
        LoggerInterface $logger,
        RequestInterface $request
    ) {
        $this->resultJsonFactory = $resultJsonFactory;
        $this->pickupPointSave = $pickupPointSave;
        $this->logger = $logger;
        $this->request = $request;
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
            // Use getPostValue() for POST requests to properly handle nested arrays
            $postData = $this->request->getPostValue();
            $params = $postData ?: $this->request->getParams();

            if (!isset($params['pickup_point'])) {
                return $result->setData([
                    'success' => false,
                    'message' => __('No pickup point data provided'),
                ])->setHttpResponseCode(400);
            }

            $pickupPointData = $params['pickup_point'];

            // Validate required fields
            if (empty($pickupPointData['pickup_point_id'])) {
                return $result->setData([
                    'success' => false,
                    'message' => __('Pickup point ID is required'),
                ])->setHttpResponseCode(400);
            }

            // Save pickup point to quote
            $this->pickupPointSave->set($pickupPointData);

            $this->logger->debug('Innosend Pickup Points: Saved pickup point to quote', [
                'pickup_point_id' => $pickupPointData['pickup_point_id'] ?? null,
                'pickup_point_name' => $pickupPointData['pickup_point_name'] ?? null,
            ]);

            return $result->setData([
                'success' => true,
                'message' => __('Pickup point saved successfully'),
            ]);
        } catch (LocalizedException $e) {
            $this->logger->error('Error saving pickup point: ' . $e->getMessage(), [
                'exception' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $result->setData([
                'success' => false,
                'message' => $e->getMessage(),
            ])->setHttpResponseCode(400);
        } catch (\Exception $e) {
            $this->logger->error('Unexpected error saving pickup point: ' . $e->getMessage(), [
                'exception' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $result->setData([
                'success' => false,
                'message' => __('An error occurred while saving pickup point'),
            ])->setHttpResponseCode(500);
        }
    }
}
