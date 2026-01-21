<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Order;

use Magento\Framework\Api\AbstractSimpleObject;
use Innosend\PickupPoints\Api\Data\OrderPickupPointInterface;

/**
 * Order pickup point extension attribute model
 */
class PickupPoint extends AbstractSimpleObject implements OrderPickupPointInterface
{
    /**
     * Get pickup point ID
     *
     * @return string|null
     */
    public function getPickupPointId(): ?string
    {
        return $this->_get(self::INNOSEND_PICKUP_POINT_ID);
    }

    /**
     * Set pickup point ID
     *
     * @param string|null $pickupPointId
     * @return $this
     */
    public function setPickupPointId(?string $pickupPointId): OrderPickupPointInterface
    {
        return $this->setData(self::INNOSEND_PICKUP_POINT_ID, $pickupPointId);
    }

    /**
     * Get pickup point name
     *
     * @return string|null
     */
    public function getPickupPointName(): ?string
    {
        return $this->_get(self::INNOSEND_PICKUP_POINT_NAME);
    }

    /**
     * Set pickup point name
     *
     * @param string|null $name
     * @return $this
     */
    public function setPickupPointName(?string $name): OrderPickupPointInterface
    {
        return $this->setData(self::INNOSEND_PICKUP_POINT_NAME, $name);
    }

    /**
     * Get pickup point address
     *
     * @return string|null
     */
    public function getPickupPointAddress(): ?string
    {
        return $this->_get(self::INNOSEND_PICKUP_POINT_ADDRESS);
    }

    /**
     * Set pickup point address
     *
     * @param string|null $address
     * @return $this
     */
    public function setPickupPointAddress(?string $address): OrderPickupPointInterface
    {
        return $this->setData(self::INNOSEND_PICKUP_POINT_ADDRESS, $address);
    }

    /**
     * Get courier code
     *
     * @return string|null
     */
    public function getCourierCode(): ?string
    {
        return $this->_get(self::INNOSEND_COURIER_CODE);
    }

    /**
     * Set courier code
     *
     * @param string|null $courierCode
     * @return $this
     */
    public function setCourierCode(?string $courierCode): OrderPickupPointInterface
    {
        return $this->setData(self::INNOSEND_COURIER_CODE, $courierCode);
    }

    /**
     * Get extension attributes
     *
     * @return \Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface|null
     */
    public function getExtensionAttributes(): ?\Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface
    {
        return $this->_get('extension_attributes');
    }

    /**
     * Set extension attributes
     *
     * @param \Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface $extensionAttributes
     * @return $this
     */
    public function setExtensionAttributes(
        \Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface $extensionAttributes
    ): OrderPickupPointInterface {
        return $this->setData('extension_attributes', $extensionAttributes);
    }
}
