<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Block\Checkout;

use Magento\Checkout\Block\Checkout\LayoutProcessorInterface;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\View\Element\Template;
use Magento\Store\Model\ScopeInterface;

/**
 * Pickup point block for checkout
 */
class PickupPoint extends Template
{
    /**
     * @var ScopeConfigInterface
     */
    private $scopeConfig;

    /**
     * @param Template\Context $context
     * @param ScopeConfigInterface $scopeConfig
     * @param array $data
     */
    public function __construct(
        Template\Context $context,
        ScopeConfigInterface $scopeConfig,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->scopeConfig = $scopeConfig;
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
     * Get AJAX URL for fetching pickup points
     *
     * @return string
     */
    public function getAjaxUrl(): string
    {
        return $this->getUrl('innosend/ajax/getPickupPoints');
    }
}



