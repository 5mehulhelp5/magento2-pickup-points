<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Observer;

use Innosend\PickupPoints\Helper\ShippingInformation;
use Magento\Framework\App\ResourceConnection;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * Observer to log order creation with pickup point data
 */
class SalesOrderPlaceAfter implements ObserverInterface
{
    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @var ResourceConnection
     */
    private $resourceConnection;

    /**
     * @var ShippingInformation
     */
    private $shippingInformation;

    /**
     * @param LoggerInterface $logger
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     */
    public function __construct(
        LoggerInterface $logger,
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation
    ) {
        $this->logger = $logger;
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
    }

    /**
     * Log order creation with pickup point data
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        /** @var Order $order */
        $order = $observer->getEvent()->getOrder();

        // Try to get order from event data if not available directly
        if (!$order) {
            $order = $observer->getEvent()->getData('order');
        }

        // If still no order, try to get from data_object (used in sales_order_save_after)
        if (!$order) {
            $dataObject = $observer->getEvent()->getData('data_object');
            if ($dataObject instanceof Order) {
                $order = $dataObject;
            }
        }

        if (!$order || !$order->getId()) {
            $this->logger->warning('Innosend Pickup Points: Order is null or has no ID in SalesOrderPlaceAfter observer', [
                'event_name' => $observer->getEvent()->getName(),
                'event_data_keys' => array_keys($observer->getEvent()->getData()),
            ]);
            return;
        }

        // Log basic order information
        $shippingMethod = $order->getShippingMethod();
        $this->logger->info('Innosend Pickup Points: Order created', [
            'order_id' => $order->getId(),
            'increment_id' => $order->getIncrementId(),
            'quote_id' => $order->getQuoteId(),
            'customer_id' => $order->getCustomerId(),
            'customer_email' => $order->getCustomerEmail(),
            'shipping_method' => $shippingMethod,
        ]);

        // Only process if shipping method is innosend_pickup_points
        // Shipping method format in Magento is: {carrier_code}_{method_code}
        // e.g., "innosend_pickup_points_innosend_pickup_points"
        if (!$shippingMethod || strpos($shippingMethod, 'innosend_pickup_points') !== 0) {
            $this->logger->debug('Innosend Pickup Points: Order does not use pickup points shipping method, skipping', [
                'order_id' => $order->getId(),
                'shipping_method' => $shippingMethod,
            ]);
            return;
        }

        // Try to get pickup point data from extension attributes first
        $extensionAttributes = $order->getExtensionAttributes();
        $pickupPointData = null;

        if ($extensionAttributes && $extensionAttributes->getInnosendPickupPoint()) {
            $pickupPoint = $extensionAttributes->getInnosendPickupPoint();
            $pickupPointData = [
                'pickup_point_id' => $pickupPoint->getPickupPointId(),
                'pickup_point_carrier' => $pickupPoint->getCourierCode(),
                'pickup_point_name' => $pickupPoint->getPickupPointName(),
                'pickup_point_address' => $pickupPoint->getPickupPointAddress(),
            ];
            
            $this->logger->debug('Innosend Pickup Points: Found pickup point in extension attributes', [
                'order_id' => $order->getId(),
                'pickup_point_id' => $pickupPointData['pickup_point_id'],
            ]);
        }

        // If no pickup point in extension attributes, try to get from fm_innosend_quote table
        if (!$pickupPointData && $order->getQuoteId()) {
            try {
                $connection = $this->resourceConnection->getConnection();
                $quoteTableName = $this->resourceConnection->getTableName('fm_innosend_quote');
                
                // Check if table exists
                if ($connection->isTableExists($quoteTableName)) {
                    $select = $connection->select()
                        ->from($quoteTableName, 'shipping_information')
                        ->where('quote_id = ?', $order->getQuoteId());
                    $shippingInformationJson = $connection->fetchOne($select);
                    
                    if ($shippingInformationJson) {
                        $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
                        $pickupPointData = $this->shippingInformation->extractPickupPoint($shippingInformation);
                        
                        if ($pickupPointData) {
                            $this->logger->info('Innosend Pickup Points: Found pickup point in fm_innosend_quote table', [
                                'order_id' => $order->getId(),
                                'quote_id' => $order->getQuoteId(),
                                'pickup_point_id' => $pickupPointData['pickup_point_id'],
                            ]);
                        }
                    }
                }
            } catch (\Exception $e) {
                $this->logger->warning('Innosend Pickup Points: Failed to get pickup point from fm_innosend_quote table', [
                    'order_id' => $order->getId(),
                    'quote_id' => $order->getQuoteId(),
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Save to fm_innosend_order table
        try {
            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_order');
            
            // Check if table exists
            if (!$connection->isTableExists($tableName)) {
                $this->logger->warning('Innosend Pickup Points: Table fm_innosend_order does not exist yet', [
                    'order_id' => $order->getId(),
                ]);
                return;
            }
            
            // Check if record already exists
            $select = $connection->select()
                ->from($tableName, 'entity_id')
                ->where('order_id = ?', $order->getId());
            $existingId = $connection->fetchOne($select);
            
            // Only proceed if we have pickup point data or if record doesn't exist yet
            if (!$pickupPointData && $existingId) {
                // No pickup point data and record already exists, skip
                $this->logger->debug('Innosend Pickup Points: No pickup point data and record already exists, skipping', [
                    'order_id' => $order->getId(),
                ]);
                return;
            }
            
            // Build shipping information JSON (shippingMethod already validated at start of method)
            $shippingInformationJson = $this->shippingInformation->buildShippingInformation(
                $shippingMethod,
                $pickupPointData
            );
            
            if ($existingId) {
                // Update existing record
                $connection->update(
                    $tableName,
                    ['shipping_information' => $shippingInformationJson],
                    ['entity_id = ?' => $existingId]
                );
            } else {
                // Insert new record
                $connection->insert(
                    $tableName,
                    [
                        'order_id' => $order->getId(),
                        'shipping_information' => $shippingInformationJson,
                    ]
                );
            }
            
            $this->logger->info('Innosend Pickup Points: Saved pickup point to fm_innosend_order table', [
                'order_id' => $order->getId(),
                'increment_id' => $order->getIncrementId(),
                'quote_id' => $order->getQuoteId(),
                'pickup_point_id' => $pickupPointData['pickup_point_id'] ?? null,
                'source' => $extensionAttributes && $extensionAttributes->getInnosendPickupPoint() ? 'extension_attributes' : 'fm_innosend_quote',
                'event_name' => $observer->getEvent()->getName(),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to save pickup point to fm_innosend_order table', [
                'order_id' => $order->getId(),
                'increment_id' => $order->getIncrementId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
        }
    }
}
