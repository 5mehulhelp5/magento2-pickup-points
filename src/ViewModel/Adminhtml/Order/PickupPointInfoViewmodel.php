<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\ViewModel\Adminhtml\Order;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\App\RequestInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Sales\Api\OrderRepositoryInterface;
use Psr\Log\LoggerInterface;

/**
 * ViewModel to get pickup point information for admin order view
 */
class PickupPointInfoViewmodel implements ArgumentInterface
{
    /**
     * @var RequestInterface
     */
    private $request;

    /**
     * @var OrderRepositoryInterface
     */
    private $orderRepository;

    /**
     * @var ResourceConnection
     */
    private $resourceConnection;

    /**
     * @var ShippingInformation
     */
    private $shippingInformation;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var array|null
     */
    private $pickupPointData = null;

    /**
     * @var bool
     */
    private $isInitialized = false;

    /**
     * @param RequestInterface $request
     * @param OrderRepositoryInterface $orderRepository
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     * @param LoggerInterface $logger
     */
    public function __construct(
        RequestInterface $request,
        OrderRepositoryInterface $orderRepository,
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation,
        LoggerInterface $logger
    ) {
        $this->request = $request;
        $this->orderRepository = $orderRepository;
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
        $this->logger = $logger;
    }

    /**
     * Get order ID from request
     *
     * @return int|null
     */
    private function getOrderId(): ?int
    {
        $orderId = $this->request->getParam('order_id');
        return $orderId ? (int)$orderId : null;
    }

    /**
     * Initialize pickup point data from database
     *
     * @return void
     */
    private function initializePickupPointData(): void
    {
        if ($this->isInitialized) {
            return;
        }

        $this->isInitialized = true;
        $orderId = $this->getOrderId();

        if (!$orderId) {
            $this->logger->debug('Innosend Pickup Points: No order ID in request for pickup point info view model');
            return;
        }

        try {
            $order = $this->orderRepository->get($orderId);
            $shippingMethod = $order->getShippingMethod();

            // Only proceed if shipping method is innosend_pickup_points
            // Format: innosend_pickup_points_<carrier_code>
            if (!$shippingMethod || !preg_match('/^innosend_pickup_points/', $shippingMethod)) {
                $this->logger->debug('Innosend Pickup Points: Order does not use pickup points shipping method', [
                    'order_id' => $orderId,
                    'shipping_method' => $shippingMethod,
                ]);
                return;
            }

            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_order');

            if (!$connection->isTableExists($tableName)) {
                $this->logger->debug('Innosend Pickup Points: Table fm_innosend_order does not exist');
                return;
            }

            $select = $connection->select()
                ->from($tableName, 'shipping_information')
                ->where('order_id = ?', $orderId);
            $shippingInformationJson = $connection->fetchOne($select);

            if ($shippingInformationJson) {
                $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
                $this->pickupPointData = $this->shippingInformation->extractPickupPoint($shippingInformation);

                $this->logger->debug('Innosend Pickup Points: Loaded pickup point data for admin view', [
                    'order_id' => $orderId,
                    'has_pickup_point' => $this->pickupPointData !== null,
                ]);
            }
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to load pickup point data for admin view', [
                'order_id' => $orderId ?? null,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Check if pickup point data exists
     *
     * @return bool
     */
    public function hasPickupPoint(): bool
    {
        $this->initializePickupPointData();
        return $this->pickupPointData !== null && !empty($this->pickupPointData['pickup_point_id']);
    }

    /**
     * Get pickup point ID
     *
     * @return string|null
     */
    public function getPickupPointId(): ?string
    {
        $this->initializePickupPointData();
        return $this->pickupPointData['pickup_point_id'] ?? null;
    }

    /**
     * Get pickup point name
     *
     * @return string|null
     */
    public function getPickupPointName(): ?string
    {
        $this->initializePickupPointData();
        return $this->pickupPointData['pickup_point_name'] ?? null;
    }

    /**
     * Get pickup point address
     *
     * @return string|null
     */
    public function getPickupPointAddress(): ?string
    {
        $this->initializePickupPointData();
        return $this->pickupPointData['pickup_point_address'] ?? null;
    }

    /**
     * Get pickup point carrier (courier code)
     *
     * @return string|null
     */
    public function getPickupPointCarrier(): ?string
    {
        $this->initializePickupPointData();
        return $this->pickupPointData['pickup_point_carrier'] ?? null;
    }

    /**
     * Get formatted carrier name (capitalize first letter of each word)
     *
     * @return string|null
     */
    public function getFormattedCarrierName(): ?string
    {
        $carrier = $this->getPickupPointCarrier();
        if (!$carrier) {
            return null;
        }

        // Convert "postnl" to "PostNL", "dhl" to "DHL", etc.
        return strtoupper($carrier);
    }
}
