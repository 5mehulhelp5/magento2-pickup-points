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
    private const CONFIG_PATH_BUTTON_LOADING_TEXT = 'innosend/pickup_points/button_loading_text';
    private const CONFIG_PATH_MISSING_FIELDS_TEXT = 'innosend/pickup_points/missing_fields_text';
    private const CONFIG_PATH_LOADING_FAILED_TEXT = 'innosend/pickup_points/loading_failed_text';

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

        $showMapMobile = (bool) $this->scopeConfig->getValue(
            'innosend/pickup_points/show_map_mobile',
            ScopeInterface::SCOPE_STORE
        );

        $mapType = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/map_type',
            ScopeInterface::SCOPE_STORE
        ) ?: 'open_maps';

        $googleMapsApiKey = $this->getDecryptedApiKey('innosend/pickup_points/google_maps_api_key');
        $googleMapsMapId = (string) $this->scopeConfig->getValue(
            'innosend/pickup_points/google_maps_map_id',
            ScopeInterface::SCOPE_STORE
        ) ?: '';
        $openMapsApiKey = $this->getDecryptedApiKey('innosend/pickup_points/open_maps_api_key');

        $allowedCarriers = $this->getAllowedCarriers();

        return [
            'ajaxUrl' => $this->urlBuilder->getUrl('innosend/ajax/getPickupPoints'),
            'showMap' => $showMap,
            'showMapMobile' => $showMapMobile,
            'mapType' => $mapType,
            'googleMapsApiKey' => $googleMapsApiKey,
            'googleMapsMapId' => $googleMapsMapId,
            'openMapsApiKey' => $openMapsApiKey,
            'allowedCarriers' => $allowedCarriers,
            'buttonLoadingText' => $this->getConfigText(self::CONFIG_PATH_BUTTON_LOADING_TEXT),
            'missingFieldsText' => $this->getConfigText(self::CONFIG_PATH_MISSING_FIELDS_TEXT),
            'loadingFailedText' => $this->getConfigText(self::CONFIG_PATH_LOADING_FAILED_TEXT),
            'defaultButtonLoadingText' => (string) __('Load pickup points'),
            'defaultMissingFieldsText' => (string) __('Enter street, postcode and city to load pickup points.'),
            'defaultLoadingFailedText' => (string) __('Unable to load pickup points.')
        ];
    }

    /**
     * Get configurable checkout text.
     *
     * @param string $configPath
     * @return string
     */
    private function getConfigText(string $configPath): string
    {
        $value = trim((string) $this->scopeConfig->getValue(
            $configPath,
            ScopeInterface::SCOPE_STORE
        ));

        return $value !== '' ? (string) __($value) : '';
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
