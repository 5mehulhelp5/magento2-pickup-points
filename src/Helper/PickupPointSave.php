<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Helper;

use Magento\Checkout\Model\Session;
use Magento\Framework\App\ResourceConnection;
use Magento\Quote\Api\CartRepositoryInterface;
use Magento\Quote\Api\Data\AddressExtensionFactory;
use Innosend\PickupPoints\Api\Data\QuotePickupPointInterfaceFactory;
use Innosend\PickupPoints\Helper\ShippingInformation;
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
     * @var ResourceConnection
     */
    private $resourceConnection;

    /**
     * @var ShippingInformation
     */
    private $shippingInformation;

    /**
     * @param Session $checkoutSession
     * @param CartRepositoryInterface $quoteRepository
     * @param AddressExtensionFactory $addressExtensionFactory
     * @param QuotePickupPointInterfaceFactory $pickupPointFactory
     * @param LoggerInterface $logger
     * @param ResourceConnection $resourceConnection
     * @param ShippingInformation $shippingInformation
     */
    public function __construct(
        Session $checkoutSession,
        CartRepositoryInterface $quoteRepository,
        AddressExtensionFactory $addressExtensionFactory,
        QuotePickupPointInterfaceFactory $pickupPointFactory,
        LoggerInterface $logger,
        ResourceConnection $resourceConnection,
        ShippingInformation $shippingInformation
    ) {
        $this->checkoutSession = $checkoutSession;
        $this->quoteRepository = $quoteRepository;
        $this->addressExtensionFactory = $addressExtensionFactory;
        $this->pickupPointFactory = $pickupPointFactory;
        $this->logger = $logger;
        $this->resourceConnection = $resourceConnection;
        $this->shippingInformation = $shippingInformation;
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

        // Set pickup point to address extension attributes (for backward compatibility)
        $addressExtensionAttributes->setInnosendPickupPoint($pickupPoint);
        $shippingAddress->setExtensionAttributes($addressExtensionAttributes);

        // Save the quote first
        try {
            $savedQuote = $this->quoteRepository->save($quote);
            
            if (!$savedQuote) {
                $this->logger->warning('Innosend Pickup Points: quoteRepository->save() returned null, trying to reload quote', [
                    'quote_id' => $quote->getId(),
                ]);
                
                // Try to reload the quote to see if it was actually saved
                try {
                    $reloadedQuote = $this->quoteRepository->get($quote->getId());
                    if ($reloadedQuote && $reloadedQuote->getId()) {
                        $this->logger->info('Innosend Pickup Points: Quote was saved but save() returned null, using reloaded quote', [
                            'quote_id' => $reloadedQuote->getId(),
                        ]);
                        $savedQuote = $reloadedQuote;
                    }
                } catch (\Exception $reloadException) {
                    $this->logger->error('Innosend Pickup Points: Failed to reload quote after null save result', [
                        'quote_id' => $quote->getId(),
                        'error' => $reloadException->getMessage(),
                    ]);
                }
                
                // If we still don't have a saved quote, throw an exception
                if (!$savedQuote) {
                    throw new \Magento\Framework\Exception\LocalizedException(__('Failed to save quote'));
                }
            }
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to save quote', [
                'quote_id' => $quote->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            throw $e;
        }

        // Save to fm_innosend_quote table
        try {
            $connection = $this->resourceConnection->getConnection();
            $tableName = $this->resourceConnection->getTableName('fm_innosend_quote');
            
            // Check if table exists
            if (!$connection->isTableExists($tableName)) {
                $this->logger->warning('Innosend Pickup Points: Table fm_innosend_quote does not exist yet, skipping database save', [
                    'quote_id' => $quote->getId(),
                    'table_name' => $tableName,
                ]);
                // Don't throw - extension attributes are still saved, table will be created on next setup:upgrade
                // Continue execution - extension attributes are already saved in the quote
                return;
            }
            
            // Get shipping method from address, or use default if not set yet
            // (pickup point might be saved before shipping method is selected)
            $shippingMethod = $shippingAddress->getShippingMethod();
            if (!$shippingMethod) {
                // If shipping method is not set, use the default pickup points shipping method
                // This happens when pickup point is saved before shipping method is selected
                $shippingMethod = 'innosend_pickup_points_innosend_pickup_points';
                $this->logger->debug('Innosend Pickup Points: Shipping method not set, using default', [
                    'quote_id' => $quote->getId(),
                ]);
            }
            
            $pickupPointData = [
                'pickup_point_id' => $pickupPoint->getPickupPointId(),
                'pickup_point_carrier' => $pickupPoint->getPickupPointCarrier(),
                'pickup_point_name' => $pickupPoint->getPickupPointName(),
                'pickup_point_address' => $pickupPoint->getPickupPointAddress(),
            ];
            
            $shippingInformationJson = $this->shippingInformation->buildShippingInformation(
                $shippingMethod,
                $pickupPointData
            );
            
            // Check if record exists
            $select = $connection->select()
                ->from($tableName, 'entity_id')
                ->where('quote_id = ?', $quote->getId());
            $existingId = $connection->fetchOne($select);
            
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
                        'quote_id' => $quote->getId(),
                        'shipping_information' => $shippingInformationJson,
                    ]
                );
            }
            
            $this->logger->info('Innosend Pickup Points: Saved pickup point to fm_innosend_quote table', [
                'pickup_point_id' => $pickupPoint->getPickupPointId(),
                'quote_id' => $quote->getId(),
            ]);
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to save pickup point to fm_innosend_quote table', [
                'quote_id' => $quote->getId(),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            // Don't throw - extension attributes are still saved
        }
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

    /**
     * Get pickup point data from quote shipping address extension attributes
     *
     * @param string|int $quoteId
     * @return array|null
     */
    public function getByQuoteId($quoteId): ?array
    {
        try {
            // Convert quote ID to int if it's a string (Magento quote IDs can be strings)
            $quoteId = is_string($quoteId) ? (int)$quoteId : $quoteId;
            
            $this->logger->debug('Innosend Pickup Points: getByQuoteId called', ['quote_id' => $quoteId]);
            
            $quote = $this->quoteRepository->get($quoteId);
            
            if (!$quote || !$quote->getId()) {
                $this->logger->debug('Innosend Pickup Points: Quote not found or has no ID', ['quote_id' => $quoteId]);
                return null;
            }

            $shippingAddress = $quote->getShippingAddress();
            
            if (!$shippingAddress) {
                $this->logger->debug('Innosend Pickup Points: No shipping address found', ['quote_id' => $quoteId]);
                return null;
            }

            // Try to get pickup point from fm_innosend_quote table first
            try {
                $connection = $this->resourceConnection->getConnection();
                $tableName = $this->resourceConnection->getTableName('fm_innosend_quote');
                
                $select = $connection->select()
                    ->from($tableName, 'shipping_information')
                    ->where('quote_id = ?', $quoteId);
                $shippingInformationJson = $connection->fetchOne($select);
                
                if ($shippingInformationJson) {
                    $shippingInformation = $this->shippingInformation->parseShippingInformation($shippingInformationJson);
                    $pickupPointData = $this->shippingInformation->extractPickupPoint($shippingInformation);
                    
                    if ($pickupPointData) {
                        $this->logger->debug('Innosend Pickup Points: Found pickup point in fm_innosend_quote table', [
                            'quote_id' => $quoteId,
                            'pickup_point_id' => $pickupPointData['pickup_point_id'],
                        ]);
                        
                        return $pickupPointData;
                    }
                }
            } catch (\Exception $e) {
                $this->logger->warning('Innosend Pickup Points: Failed to get pickup point from fm_innosend_quote table', [
                    'quote_id' => $quoteId,
                    'error' => $e->getMessage(),
                ]);
            }

            // Fallback: Try to get pickup point from extension attributes
            $extensionAttributes = $shippingAddress->getExtensionAttributes();
            $pickupPoint = null;

            if ($extensionAttributes) {
                $pickupPoint = $extensionAttributes->getInnosendPickupPoint();
            }

            // If we have pickup point from extension attributes, use it
            if ($pickupPoint) {
                $result = [
                    'pickup_point_id' => $pickupPoint->getPickupPointId(),
                    'pickup_point_name' => $pickupPoint->getPickupPointName(),
                    'pickup_point_address' => $pickupPoint->getPickupPointAddress(),
                    'pickup_point_carrier' => $pickupPoint->getPickupPointCarrier(),
                ];
                
                $this->logger->debug('Innosend Pickup Points: Successfully retrieved pickup point from extension attributes', [
                    'quote_id' => $quoteId,
                    'pickup_point_id' => $result['pickup_point_id'],
                ]);
                
                return $result;
            }

            // No pickup point found
            $this->logger->debug('Innosend Pickup Points: No pickup point found', ['quote_id' => $quoteId]);
            return null;
        } catch (\Exception $e) {
            $this->logger->error('Innosend Pickup Points: Failed to get pickup point from quote', [
                'quote_id' => $quoteId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return null;
        } catch (\Throwable $e) {
            $this->logger->error('Innosend Pickup Points: Fatal error getting pickup point from quote', [
                'quote_id' => $quoteId,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return null;
        }
    }
}
