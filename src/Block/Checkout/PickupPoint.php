<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Block\Checkout;

use Innosend\PickupPoints\ViewModel\Checkout\PickupPointsConfig;
use Magento\Framework\View\Element\Template;

/**
 * Pickup point block for checkout
 */
class PickupPoint extends Template
{
    /**
     * @var PickupPointsConfig
     */
    private $configViewModel;

    /**
     * @param Template\Context $context
     * @param PickupPointsConfig $configViewModel
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        PickupPointsConfig $configViewModel,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->configViewModel = $configViewModel;
    }

    /**
     * Get configuration ViewModel
     *
     * @return PickupPointsConfig
     */
    public function getConfigViewModel(): PickupPointsConfig
    {
        return $this->configViewModel;
    }

    /**
     * Check if pickup points are enabled
     *
     * @return bool
     */
    public function isEnabled(): bool
    {
        return $this->configViewModel->isEnabled();
    }

    /**
     * Check if map should be shown
     *
     * @return bool
     */
    public function isMapEnabled(): bool
    {
        return $this->configViewModel->isMapEnabled();
    }

    /**
     * Get AJAX URL for fetching pickup points
     *
     * @return string
     */
    public function getAjaxUrl(): string
    {
        return $this->configViewModel->getAjaxUrl();
    }

    /**
     * Get map type configuration
     *
     * @return string
     */
    public function getMapType(): string
    {
        return $this->configViewModel->getMapType();
    }

    /**
     * Get Google Maps API Key
     *
     * @return string
     */
    public function getGoogleMapsApiKey(): string
    {
        return $this->configViewModel->getGoogleMapsApiKey();
    }

    /**
     * Get Google Maps Map ID
     *
     * @return string
     */
    public function getGoogleMapsMapId(): string
    {
        return $this->configViewModel->getGoogleMapsMapId();
    }

    /**
     * Get Open Maps API Key
     *
     * @return string
     */
    public function getOpenMapsApiKey(): string
    {
        return $this->configViewModel->getOpenMapsApiKey();
    }

    /**
     * Get allowed carriers configuration
     *
     * @return array
     */
    public function getAllowedCarriers(): array
    {
        return $this->configViewModel->getAllowedCarriers();
    }
}
