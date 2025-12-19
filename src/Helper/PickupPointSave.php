<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Helper;

use Magento\Checkout\Model\Session;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressExtensionFactory;
use Innosend\PickupPoints\Api\Data\QuotePickupPointInterfaceFactory;
use Psr\Log\LoggerInterface;

/**
 * Helper to save pickup point data to quote (similar to PostNL's PickupAddress helper)
 */
class PickupPointSave
{
    /**
     * @var Session
     */
    private $checkoutSession;

    /**
     * @var CartRepositoryInterface
     */
    private $quoteRepository;

    /**
     * @var AddressExtensionFactory
     */
    private $addressExtensionFactory;

    /**
     * @var QuotePickupPointInterfaceFactory
     */
    private $pickupPointFactory;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param Session $checkoutSession
     * @param CartRepositoryInterface $quoteRepository
     * @param AddressExtensionFactory $addressExtensionFactory
     * @param QuotePickupPointInterfaceFactory $pickupPointFactory
     * @param LoggerInterface $logger
     */
    public function __construct(
        Session $checkoutSession,
        CartRepositoryInterface $quoteRepository,
        AddressExtensionFactory $addressExtensionFactory,
        QuotePickupPointInterfaceFactory $pickupPointFactory,
        LoggerInterface $logger
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->quoteRepository = $quoteRepository;
        $this->addressExtensionFactory = $addressExtensionFactory;
        $this->pickupPointFactory = $pickupPointFactory;
        $this->logger = $logger;
    }

    /**
     * Save pickup point data to quote shipping address extension attributes
     *
     * @param array $pickupPointData
     * @return void
     * @throws \Magento\Framework\Exception\LocalizedException
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function set(array $pickupPointData): void
    {
        $quote = $this->checkoutSession->getQuote();
        
        if (!$quote || !$quote->getId()) {
            throw new \Magento\Framework\Exception\LocalizedException(__('No active quote found'));
        }

        $this->setByQuoteId($quote->getId(), $pickupPointData);
    }
    /**
     * Save pickup point data to quote shipping address extension attributes by quote ID
     * Use this method for REST API endpoints where quote ID is explicitly provided
     *
     * @param string|int $quoteId
     * @param array $pickupPointData
     * @return void
     * @throws \Magento\Framework\Exception\LocalizedException
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function setByQuoteId($quoteId, array $pickupPointData): void
    {
        // Convert quote ID to int if it's a string (Magento quote IDs can be strings)
        $quoteId = is_string($quoteId) ? (int)$quoteId : $quoteId;
        $quote = $this->quoteRepository->get($quoteId);
        
        if (!$quote || !$quote->getId()) {
            throw new \Magento\Framework\Exception\LocalizedException(__('Quote not found'));
        }

        $shippingAddress = $quote->getShippingAddress();
        
        if (!$shippingAddress) {
            throw new \Magento\Framework\Exception\LocalizedException(__('No shipping address found'));
        }

        // Get or create extension attributes for shipping address
        $addressExtensionAttributes = $shippingAddress->getExtensionAttributes();
        if (!$addressExtensionAttributes) {
            $addressExtensionAttributes = $this->addressExtensionFactory->create();
        }

        // Create pickup point object
        $pickupPoint = $this->pickupPointFactory->create();
        
        // Extract only the required fields
        $pickupPoint->setPickupPointId($pickupPointData['pickup_point_id'] ?? null);
        $pickupPoint->setPickupPointName($pickupPointData['pickup_point_name'] ?? null);
        $pickupPoint->setPickupPointAddress($pickupPointData['pickup_point_address'] ?? null);
        $pickupPoint->setPickupPointCarrier($pickupPointData['pickup_point_carrier'] ?? null);

        // Set pickup point to address extension attributes
        $addressExtensionAttributes->setInnosendPickupPoint($pickupPoint);
        $shippingAddress->setExtensionAttributes($addressExtensionAttributes);

        // Save the quote to persist the extension attributes
        $this->quoteRepository->save($quote);

        $this->logger->debug('Innosend Pickup Points: Saved pickup point to quote', [
            'pickup_point_id' => $pickupPoint->getPickupPointId(),
            'quote_id' => $quote->getId()
        ]);
    }

    /**
     * Remove pickup point data from quote
     *
     * @return void
     * @throws \Magento\Framework\Exception\LocalizedException
     * @throws \Magento\Framework\Exception\NoSuchEntityException
     */
    public function remove(): void
    {
        $quote = $this->checkoutSession->getQuote();
        
        if (!$quote || !$quote->getId()) {
            return;
        }

        $shippingAddress = $quote->getShippingAddress();
        
        if (!$shippingAddress) {
            return;
        }

        // Get extension attributes
        $addressExtensionAttributes = $shippingAddress->getExtensionAttributes();
        if (!$addressExtensionAttributes) {
            return;
        }

        // Remove pickup point
        $addressExtensionAttributes->setInnosendPickupPoint(null);
        $shippingAddress->setExtensionAttributes($addressExtensionAttributes);

        // Save the quote
        $this->quoteRepository->save($quote);

        $this->logger->debug('Innosend Pickup Points: Removed pickup point from quote', [
            'quote_id' => $quote->getId()
        ]);
    }
}
