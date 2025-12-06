<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Api\Data;

use Magento\Framework\Api\ExtensibleDataInterface;

/**
 * Order pickup point extension attribute interface
 *
 * @api
 */
interface OrderPickupPointInterface extends ExtensibleDataInterface
{
    /**
     * Constants for field names
     */
    public const PICKUP_POINT_ID = 'pickup_point_id';
    public const PICKUP_POINT_NAME = 'pickup_point_name';
    public const PICKUP_POINT_ADDRESS = 'pickup_point_address';

    /**
     * Get pickup point ID
     *
     * @return string|null
     */
    public function getPickupPointId(): ?string;

    /**
     * Set pickup point ID
     *
     * @param string|null $pickupPointId
     * @return $this
     */
    public function setPickupPointId(?string $pickupPointId): OrderPickupPointInterface;

    /**
     * Get pickup point name
     *
     * @return string|null
     */
    public function getPickupPointName(): ?string;

    /**
     * Set pickup point name
     *
     * @param string|null $name
     * @return $this
     */
    public function setPickupPointName(?string $name): OrderPickupPointInterface;

    /**
     * Get pickup point address
     *
     * @return string|null
     */
    public function getPickupPointAddress(): ?string;

    /**
     * Set pickup point address
     *
     * @param string|null $address
     * @return $this
     */
    public function setPickupPointAddress(?string $address): OrderPickupPointInterface;

    /**
     * Get extension attributes
     *
     * @return \Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface|null
     */
    public function getExtensionAttributes(): ?OrderPickupPointExtensionInterface;

    /**
     * Set extension attributes
     *
     * @param \Innosend\PickupPoints\Api\Data\OrderPickupPointExtensionInterface $extensionAttributes
     * @return $this
     */
    public function setExtensionAttributes(OrderPickupPointExtensionInterface $extensionAttributes): OrderPickupPointInterface;
}







