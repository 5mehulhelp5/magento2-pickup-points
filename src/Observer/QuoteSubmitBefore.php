<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Observer;

use Innosend\PickupPoints\Api\Data\OrderPickupPointInterfaceFactory;
use Innosend\PickupPoints\Api\Data\QuotePickupPointInterfaceFactory;
use Innosend\PickupPoints\Helper\PickupPointSave;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Model\Quote;
use Magento\Sales\Api\Data\OrderExtensionFactory;
use Magento\Sales\Model\Order;
use Psr\Log\LoggerInterface;

/**
 * Observer to transfer pickup point from quote to order
 */
class QuoteSubmitBefore implements ObserverInterface
{
    /**
     * @var OrderExtensionFactory
     */
    private $orderExtensionFactory;

    /**
     * @var CartRepositoryInterface
     */
    private $quoteRepository;

    /**
     * @var PickupPointSave
     */
    private $pickupPointSave;

    /**
     * @var QuotePickupPointInterfaceFactory
     */
    private $quotePickupPointFactory;

    /**
     * @var OrderPickupPointInterfaceFactory
     */
    private $orderPickupPointFactory;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param OrderExtensionFactory $orderExtensionFactory
     * @param CartRepositoryInterface $quoteRepository
     * @param PickupPointSave $pickupPointSave
     * @param QuotePickupPointInterfaceFactory $quotePickupPointFactory
     * @param OrderPickupPointInterfaceFactory $orderPickupPointFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        OrderExtensionFactory $orderExtensionFactory,
        CartRepositoryInterface $quoteRepository,
        PickupPointSave $pickupPointSave,
        QuotePickupPointInterfaceFactory $quotePickupPointFactory,
        OrderPickupPointInterfaceFactory $orderPickupPointFactory,
        LoggerInterface $logger
    ) {
        $this->orderExtensionFactory = $orderExtensionFactory;
        $this->quoteRepository = $quoteRepository;
        $this->pickupPointSave = $pickupPointSave;
        $this->quotePickupPointFactory = $quotePickupPointFactory;
        $this->orderPickupPointFactory = $orderPickupPointFactory;
        $this->logger = $logger;
    }

    /**
     * Transfer pickup point data from quote to order
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        $this->logger->info('Innosend Pickup Points: QuoteSubmitBefore observer triggered');

        /** @var Quote $quote */
        $quote = $observer->getEvent()->getQuote();
        /** @var Order $order */
        $order = $observer->getEvent()->getOrder();

        if (!$quote || !$order) {
            $this->logger->warning('Innosend Pickup Points: Quote or Order is null in QuoteSubmitBefore observer', [
                'has_quote' => $quote !== null,
                'has_order' => $order !== null,
            ]);
            return;
        }

        $this->logger->info('Innosend Pickup Points: QuoteSubmitBefore processing', [
            'quote_id' => $quote->getId(),
            'order_id' => $order->getId(),
            'order_increment_id' => $order->getIncrementId(),
        ]);

        // Always try to get pickup point via helper first
        // Magento doesn't automatically load complex extension attributes from database
        // The helper will reload the quote and check for extension attributes
        $pickupPoint = null;
        $pickupPointData = null;
        
        try {
            $this->logger->debug('Innosend Pickup Points: Getting pickup point via helper', ['quote_id' => $quote->getId()]);
            $pickupPointDataFromHelper = $this->pickupPointSave->getByQuoteId($quote->getId());
            
            if ($pickupPointDataFromHelper) {
                $this->logger->info('Innosend Pickup Points: Found pickup point data via helper', [
                    'quote_id' => $quote->getId(),
                    'pickup_point_data' => $pickupPointDataFromHelper,
                ]);
                
                // Create pickup point object from data
                $pickupPoint = $this->quotePickupPointFactory->create();
                $pickupPoint->setPickupPointId($pickupPointDataFromHelper['pickup_point_id'] ?? null);
                $pickupPoint->setPickupPointName($pickupPointDataFromHelper['pickup_point_name'] ?? null);
                $pickupPoint->setPickupPointAddress($pickupPointDataFromHelper['pickup_point_address'] ?? null);
                $pickupPoint->setPickupPointCarrier($pickupPointDataFromHelper['pickup_point_carrier'] ?? null);
                
                $pickupPointData = $pickupPointDataFromHelper;
            } else {
                $this->logger->warning('Innosend Pickup Points: No pickup point found via helper', [
                    'quote_id' => $quote->getId(),
                ]);
            }
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Error getting pickup point via helper', [
                'quote_id' => $quote->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
        } catch (\Throwable $e) {
            $this->logger->error('Innosend Pickup Points: Fatal error getting pickup point via helper', [
                'quote_id' => $quote->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ]);
        }

        // If no pickup point found, skip transfer
        if (!$pickupPoint) {
            $this->logger->warning('Innosend Pickup Points: No pickup point found in quote shipping address - skipping transfer', [
                'quote_id' => $quote->getId(),
            ]);
            return;
        }

        $this->logger->info('Innosend Pickup Points: Quote shipping address pickup point check', [
            'quote_id' => $quote->getId(),
            'has_pickup_point' => true,
            'pickup_point_data' => $pickupPointData,
        ]);

        // Safety check: ensure pickupPoint is set before using it
        if (!$pickupPoint) {
            $this->logger->warning('Innosend Pickup Points: Pickup point is null after all attempts - skipping transfer', [
                'quote_id' => $quote->getId(),
            ]);
            return;
        }

        // Get or create order extension attributes
        $orderExtensionAttributes = $order->getExtensionAttributes();
        if (!$orderExtensionAttributes) {
            $orderExtensionAttributes = $this->orderExtensionFactory->create();
        }

        // Create or get order pickup point
        $orderPickupPoint = $orderExtensionAttributes->getInnosendPickupPoint();
        if (!$orderPickupPoint) {
            $orderPickupPoint = $this->orderPickupPointFactory->create();
        }

        // Transfer data from quote pickup point to order pickup point
        try {
            $orderPickupPoint->setPickupPointId($pickupPoint->getPickupPointId());
            $orderPickupPoint->setPickupPointName($pickupPoint->getPickupPointName());
            $orderPickupPoint->setPickupPointAddress($pickupPoint->getPickupPointAddress());
            $orderPickupPoint->setCourierCode($pickupPoint->getPickupPointCarrier());
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Error setting order pickup point data', [
                'quote_id' => $quote->getId(),
                'order_id' => $order->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            // Don't fail the order placement, just log the error
            return;
        }

        // Set pickup point to order extension attributes (for backward compatibility)
        $orderExtensionAttributes->setInnosendPickupPoint($orderPickupPoint);
        $order->setExtensionAttributes($orderExtensionAttributes);

        $this->logger->info('Innosend Pickup Points: Transferred pickup point from quote to order extension attributes', [
            'quote_id' => $quote->getId(),
            'order_id' => $order->getId(),
            'order_increment_id' => $order->getIncrementId(),
            'pickup_point_id' => $pickupPoint->getPickupPointId(),
        ]);
    }
}
