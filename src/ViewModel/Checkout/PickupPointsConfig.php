<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\ViewModel\Checkout;

use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\Encryption\EncryptorInterface;
use Magento\Framework\UrlInterface;
use Magento\Framework\View\Element\Block\ArgumentInterface;
use Magento\Store\Model\ScopeInterface;

/**
 * ViewModel for pickup points configuration in checkout
 */
class PickupPointsConfig implements ArgumentInterface
{
    /**
     * @var ScopeConfigInterface
     */
    private ScopeConfigInterface $scopeConfig;

    /**
     * @var EncryptorInterface
     */
    private EncryptorInterface $encryptor;

    /**
     * @var UrlInterface
     */
    private UrlInterface $urlBuilder;

    /**
     * @param ScopeConfigInterface $scopeConfig
     * @param EncryptorInterface $encryptor
     * @param UrlInterface $urlBuilder
     */
    public function __construct(
        ScopeConfigInterface $scopeConfig,
        EncryptorInterface $encryptor,
        UrlInterface $urlBuilder
    ) {
        $this->scopeConfig = $scopeConfig;
        $this->encryptor = $encryptor;
        $this->urlBuilder = $urlBuilder;
    }

    /**
     * Check if pickup points are enabled
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return (bool) $this->scopeConfig->getValue(
            'innosend/pickup_points/enabled',
            ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * Check if map should be shown
     *
     * @return bool
     */
    public function isMapEnabled(): bool
    {
        return (bool) $this->scopeConfig->getValue(
            'innosend/pickup_points/show_map',
            ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * Check if map should be shown on mobile devices
     *
     * @return bool
     */
    public function isMapEnabledOnMobile(): bool
    {
        return (bool) $this->scopeConfig->getValue(
            'innosend/pickup_points/show_map_mobile',
            ScopeInterface::SCOPE_STORE
        );
    }

    /**
     * Get AJAX URL for fetching pickup points
     *
     * @return string
     */
    public function getAjaxUrl(): string
    {
        return $this->urlBuilder->getUrl('innosend/ajax/getPickupPoints');
    }

    /**
     * Get map type configuration
     *
     * @return string
     */
    public function getMapType(): string
    {
        return (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/map_type',
            ScopeInterface::SCOPE_STORE
        ) ?: 'open_maps';
    }

    /**
     * Get Google Maps API Key
     *
     * @return string
     */
    public function getGoogleMapsApiKey(): string
    {
        $encryptedKey = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/google_maps_api_key',
            ScopeInterface::SCOPE_STORE
        );

        if (empty($encryptedKey)) {
            return '';
        }

        try {
            return $this->encryptor->decrypt($encryptedKey);
        } catch (\Exception $e) {
            return $encryptedKey;
        }
    }

    /**
     * Get Google Maps Map ID
     *
     * @return string
     */
    public function getGoogleMapsMapId(): string
    {
        return (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/google_maps_map_id',
            ScopeInterface::SCOPE_STORE
        ) ?: '';
    }

    /**
     * Get Open Maps API Key
     *
     * @return string
     */
    public function getOpenMapsApiKey(): string
    {
        $encryptedKey = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/open_maps_api_key',
            ScopeInterface::SCOPE_STORE
        );

        if (empty($encryptedKey)) {
            return '';
        }

        try {
            return $this->encryptor->decrypt($encryptedKey);
        } catch (\Exception $e) {
            return $encryptedKey;
        }
    }

    /**
     * Get allowed carriers configuration
     *
     * @return array
     */
    public function getAllowedCarriers(): array
    {
        $carriers = $this->scopeConfig->getValue(
            'innosend/pickup_points/allowed_carriers',
            ScopeInterface::SCOPE_STORE
        );

        if (empty($carriers)) {
            return [];
        }

        // Convert to array and uppercase all carriers
        if (is_string($carriers)) {
            $carriersArray = explode(',', $carriers);
        } else {
            $carriersArray = is_array($carriers) ? $carriers : [];
        }

        return array_map('strtoupper', array_map('trim', $carriersArray));
    }
}
