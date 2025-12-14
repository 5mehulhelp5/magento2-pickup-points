<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Quote\Model\Quote;
use Magento\Sales\Model\Order;

/**
 * Observer to transfer pickup point from quote to order
 */
class QuoteSubmitBefore implements ObserverInterface
{
    /**
     * Transfer pickup point data from quote to order
     *
     * @param Observer $observer
     * @return void
     */
    public function execute(Observer $observer): void
    {
        /** @var Quote $quote */
        $quote = $observer->getEvent()->getQuote();
        /** @var Order $order */
        $order = $observer->getEvent()->getOrder();

        $shippingAddress = $quote->getShippingAddress();
        if (!$shippingAddress) {
            return;
        }

        $extensionAttributes = $shippingAddress->getExtensionAttributes();
        if (!$extensionAttributes || !$extensionAttributes->getInnosendPickupPoint()) {
            return;
        }

        $pickupPoint = $extensionAttributes->getInnosendPickupPoint();
        $orderExtensionAttributes = $order->getExtensionAttributes();

        if ($orderExtensionAttributes) {
            $orderPickupPoint = $orderExtensionAttributes->getInnosendPickupPoint();
            if (!$orderPickupPoint) {
                $orderPickupPoint = \Magento\Framework\App\ObjectManager::getInstance()
                    ->create(\Innosend\PickupPoints\Api\Data\OrderPickupPointInterface::class);
            }

            $orderPickupPoint->setPickupPointId($pickupPoint->getPickupPointId());
            $orderPickupPoint->setPickupPointName($pickupPoint->getPickupPointName());
            $orderPickupPoint->setPickupPointAddress($pickupPoint->getPickupPointAddress());

            $orderExtensionAttributes->setInnosendPickupPoint($orderPickupPoint);
            $order->setExtensionAttributes($orderExtensionAttributes);
        }
    }
}









