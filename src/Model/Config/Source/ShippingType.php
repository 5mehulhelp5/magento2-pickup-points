<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */
namespace Innosend\PickupPoints\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

/**
 * Shipping Type source model
 */
class ShippingType implements OptionSourceInterface
{
    /**
     * Return array of options as value-label pairs
     *
     * @return array
     */
    public function toOptionArray()
    {
        return [
            ['value' => '', 'label' => __('None')],
            ['value' => 'O', 'label' => __('Per Order')],
            ['value' => 'I', 'label' => __('Per Item')]
        ];
    }
}


