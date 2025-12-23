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
 * Quote pickup point extension attribute interface
 *
 * @api
 */
interface QuotePickupPointInterface extends ExtensibleDataInterface
{
    /**
     * Constants for field names
     */
    public const PICKUP_POINT_ID = 'pickup_point_id';
    public const PICKUP_POINT_NAME = 'pickup_point_name';
    public const PICKUP_POINT_ADDRESS = 'pickup_point_address';
    public const PICKUP_POINT_CARRIER = 'pickup_point_carrier';


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
    public function setPickupPointId(?string $pickupPointId): QuotePickupPointInterface;

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
    public function setPickupPointName(?string $name): QuotePickupPointInterface;

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
    public function setPickupPointAddress(?string $address): QuotePickupPointInterface;

    /**
     * Get pickup point carrier
     *
     * @return string|null
     */
    public function getPickupPointCarrier(): ?string;

    /**
     * Set pickup point carrier
     *
     * @param string|null $carrier
     * @return $this
     */
    public function setPickupPointCarrier(?string $carrier): QuotePickupPointInterface;

    /**
     * Get extension attributes

     *
     * @return \Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface|null
     */
    public function getExtensionAttributes(): ?QuotePickupPointExtensionInterface;

    /**
     * Set extension attributes
     *
     * @param \Innosend\PickupPoints\Api\Data\QuotePickupPointExtensionInterface $extensionAttributes
     * @return $this
     */
    public function setExtensionAttributes(QuotePickupPointExtensionInterface $extensionAttributes): QuotePickupPointInterface;
}















