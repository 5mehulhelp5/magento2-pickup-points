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
        $id = $this->getData('id');
        if ($id === null) {
            return null;
        }
        // Convert to string if it's an integer (API may return int)
        return (string) $id;
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
     * Get address (full formatted address)
     *
     * @return string|null
     */
    public function getAddress(): ?string
    {
        $address = $this->getData('address');
        if ($address) {
            return $address;
        }
        
        // Build address from components if not set
        $parts = array_filter([
            $this->getStreet(),
            $this->getPostcode(),
            $this->getCity()
        ]);
        
        return !empty($parts) ? implode(', ', $parts) : null;
    }

    /**
     * Get street
     *
     * @return string|null
     */
    public function getStreet(): ?string
    {
        return $this->getData('street') ?? $this->getData('street_address');
    }

    /**
     * Get postal code
     *
     * @return string|null
     */
    public function getPostcode(): ?string
    {
        return $this->getData('postcode') ?? $this->getData('zip_code');
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
     * Get carrier logo URL (small image for lists/filters)
     *
     * @return string|null
     */
    public function getLogo(): ?string
    {
        return $this->getData('logo');
    }

    /**
     * Get carrier mark image URL (for map markers)
     *
     * @return string|null
     */
    public function getMarkImage(): ?string
    {
        return $this->getData('mark_image');
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
