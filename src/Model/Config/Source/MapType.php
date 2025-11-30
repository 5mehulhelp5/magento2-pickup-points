<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */
namespace Innosend\PickupPoints\Model\Config\Source;

use Magento\Framework\Data\OptionSourceInterface;

/**
 * Map Type source model
 */
class MapType implements OptionSourceInterface
{
    /**
     * Return array of options as value-label pairs
     *
     * @return array
     */
    public function toOptionArray()
    {
        return [
            ['value' => 'google_maps', 'label' => __('Google Maps')],
            ['value' => 'open_maps', 'label' => __('Open Maps')]
        ];
    }
}


