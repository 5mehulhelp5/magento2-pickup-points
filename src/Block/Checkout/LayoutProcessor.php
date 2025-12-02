<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Block\Checkout;

use Innosend\PickupPoints\ViewModel\Checkout\LayoutProcessorConfig;
use Magento\Checkout\Block\Checkout\LayoutProcessorInterface;
use Psr\Log\LoggerInterface;

/**
 * Layout processor to add pickup points component to checkout
 */
class LayoutProcessor implements LayoutProcessorInterface
{
    /**
     * @var LayoutProcessorConfig
     */
    private $configViewModel;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param LayoutProcessorConfig $configViewModel
     * @param LoggerInterface $logger
     */
    public function __construct(
        LayoutProcessorConfig $configViewModel,
        LoggerInterface $logger
    ) {
        $this->configViewModel = $configViewModel;
        $this->logger = $logger;
    }

    /**
     * Process js Layout of block
     *
     * @param array $jsLayout
     * @return array
     */
    public function process($jsLayout)
    {
        // Only add if pickup points are enabled
        if (!$this->configViewModel->isEnabled()) {
            $this->logger->info('Innosend Pickup Points: Module is disabled, skipping component addition');
            return $jsLayout;
        }

        // Ensure shippingAdditional region exists
        if (!isset($jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']['children']['shippingAddress']['children']['shippingAdditional'])) {
            $jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']['children']['shippingAddress']['children']['shippingAdditional'] = [
                'component' => 'uiComponent',
                'displayArea' => 'shippingAdditional',
                'children' => []
            ];
        }

        // Get configuration from ViewModel
        $config = $this->configViewModel->getJsLayoutConfig();

        // Add pickup points component
        $jsLayout['components']['checkout']['children']['steps']['children']['shipping-step']['children']['shippingAddress']['children']['shippingAdditional']['children']['innosend-pickup-points'] = [
            'component' => 'Innosend_PickupPoints/js/pickup-points',
            'config' => array_merge(
                ['template' => 'Innosend_PickupPoints/pickup-points/wrapper'],
                $config
            )
        ];

        $this->logger->info('Innosend Pickup Points: Component added to jsLayout', [
            'ajaxUrl' => $config['ajaxUrl'],
            'showMap' => $config['showMap'],
            'mapType' => $config['mapType']
        ]);

        return $jsLayout;
    }
}

