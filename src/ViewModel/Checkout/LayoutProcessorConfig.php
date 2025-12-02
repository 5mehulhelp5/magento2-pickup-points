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
 * ViewModel for layout processor configuration
 */
class LayoutProcessorConfig implements ArgumentInterface
{
    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @var EncryptorInterface
     */
    private $encryptor;

    /**
     * @var UrlInterface
     */
    private $urlBuilder;

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
     * Get configuration array for jsLayout
     *
     * @return array
     */
    public function getJsLayoutConfig(): array
    {
        $showMap = (bool) $this->scopeConfig->getValue(
            'innosend/pickup_points/show_map',
            ScopeInterface::SCOPE_STORE
        );

        $mapType = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/map_type',
            ScopeInterface::SCOPE_STORE
        ) ?: 'open_maps';

        $googleMapsApiKey = $this->getDecryptedApiKey('innosend/pickup_points/google_maps_api_key');
        $openMapsApiKey = $this->getDecryptedApiKey('innosend/pickup_points/open_maps_api_key');

        $allowedCarriers = $this->getAllowedCarriers();

        return [
            'ajaxUrl' => $this->urlBuilder->getUrl('innosend/ajax/getPickupPoints'),
            'showMap' => $showMap,
            'mapType' => $mapType,
            'googleMapsApiKey' => $googleMapsApiKey,
            'openMapsApiKey' => $openMapsApiKey,
            'allowedCarriers' => $allowedCarriers
        ];
    }

    /**
     * Get decrypted API key
     *
     * @param string $configPath
     * @return string
     */
    private function getDecryptedApiKey(string $configPath): string
    {
        $encryptedKey = (string) $this->scopeConfig->getValue(
            $configPath,
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
    private function getAllowedCarriers(): array
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
