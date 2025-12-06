<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Quote;

use Magento\Framework\Model\AbstractExtensibleModel;
use Innosend\PickupPoints\Api\Data\QuotePickupPointInterface;

/**
 * Quote pickup point extension attribute model
 */
class PickupPoint extends AbstractExtensibleModel implements QuotePickupPointInterface
{
    /**
     * Get pickup point ID
     *
     * @return string|null
     */
    public function getPickupPointId(): ?string
    {
        return $this->getData(self::PICKUP_POINT_ID);
    }

    /**
     * Set pickup point ID
     *
     * @param string|null $pickupPointId
     * @return $this
     */
    public function setPickupPointId(?string $pickupPointId): QuotePickupPointInterface
    {
        return $this->setData(self::PICKUP_POINT_ID, $pickupPointId);
    }

    /**
     * Get pickup point name
     *
     * @return string|null
     */
    public function getPickupPointName(): ?string
    {
        return $this->getData(self::PICKUP_POINT_NAME);
    }

    /**
     * Set pickup point name
     *
     * @param string|null $name
     * @return $this
     */
    public function setPickupPointName(?string $name): QuotePickupPointInterface
    {
        return $this->setData(self::PICKUP_POINT_NAME, $name);
    }

    /**
     * Get pickup point address
     *
     * @return string|null
     */
    public function getPickupPointAddress(): ?string
    {
        return $this->getData(self::PICKUP_POINT_ADDRESS);
    }

    /**
     * Set pickup point address
     *
     * @param string|null $address
     * @return $this
     */
    public function setPickupPointAddress(?string $address): QuotePickupPointInterface
    {
        return $this->setData(self::PICKUP_POINT_ADDRESS, $address);
    }

    /**
     * Get extension attributes
     *
     * @return \Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface|null
     */
    public function getExtensionAttributes(): ?\Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface
    {
        return $this->_getExtensionAttributes();
    }

    /**
     * Set extension attributes
     *
     * @param \Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface $extensionAttributes
     * @return $this
     */
    public function setExtensionAttributes(
        \Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface $extensionAttributes
    ): QuotePickupPointInterface {
        return $this->_setExtensionAttributes($extensionAttributes);
    }
}







