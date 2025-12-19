<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Config\Provider;

use Magento\Checkout\Model\ConfigProviderInterface;
use Magento\Framework\UrlInterface;

/**
 * Checkout configuration provider for Pickup Points
 * Adds URLs to window.checkoutConfig.shipping.innosend_pickup_points.urls
 */
class CheckoutConfiguration implements ConfigProviderInterface
{
    /**
     * @var UrlInterface
     */
    private $urlBuilder;

    /**
     * @param UrlInterface $urlBuilder
     */
    public function __construct(
        UrlInterface $urlBuilder
    ) {
        $this->urlBuilder = $urlBuilder;
    }

    /**
     * Retrieve assoc array of checkout configuration
     *
     * @return array
     */
    public function getConfig(): array
    {
        return [
            'shipping' => [
                'innosend_pickup_points' => [
                    'urls' => [
                        'getPickupPoints' => $this->urlBuilder->getUrl('innosend/ajax/getPickupPoints', ['_secure' => true]),
                        'savePickupPoint' => $this->urlBuilder->getUrl('innosend/ajax/savePickupPoint', ['_secure' => true]),
                    ]
                ]
            ]
        ];
    }
}
