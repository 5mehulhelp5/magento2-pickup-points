<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model;

use Magento\Framework\DataObject;

/**
 * Pickup Point data model
 */
class PickupPoint extends DataObject
{
    /**
     * Get pickup point ID
     *
     * @return string|null
     */
    public function getId(): ?string
    {
        return $this->getData('id');
    }

    /**
     * Get pickup point name
     *
     * @return string|null
     */
    public function getName(): ?string
    {
        return $this->getData('name');
    }

    /**
     * Get address
     *
     * @return string|null
     */
    public function getAddress(): ?string
    {
        return $this->getData('address');
    }

    /**
     * Get street
     *
     * @return string|null
     */
    public function getStreet(): ?string
    {
        return $this->getData('street');
    }

    /**
     * Get postal code
     *
     * @return string|null
     */
    public function getPostcode(): ?string
    {
        return $this->getData('postcode');
    }

    /**
     * Get city
     *
     * @return string|null
     */
    public function getCity(): ?string
    {
        return $this->getData('city');
    }

    /**
     * Get country code
     *
     * @return string|null
     */
    public function getCountryCode(): ?string
    {
        return $this->getData('country_code');
    }

    /**
     * Get latitude
     *
     * @return float|null
     */
    public function getLatitude(): ?float
    {
        return $this->getData('latitude') ? (float) $this->getData('latitude') : null;
    }

    /**
     * Get longitude
     *
     * @return float|null
     */
    public function getLongitude(): ?float
    {
        return $this->getData('longitude') ? (float) $this->getData('longitude') : null;
    }

    /**
     * Get carrier code
     *
     * @return string|null
     */
    public function getCarrier(): ?string
    {
        return $this->getData('carrier');
    }

    /**
     * Get distance in kilometers
     *
     * @return float|null
     */
    public function getDistance(): ?float
    {
        return $this->getData('distance') ? (float) $this->getData('distance') : null;
    }

    /**
     * Get opening hours
     *
     * @return array|null
     */
    public function getOpeningHours(): ?array
    {
        return $this->getData('opening_hours');
    }
}



