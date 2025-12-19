<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Api\Webapi;

use Innosend\PickupPoints\Api\Data\QuotePickupPointInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Exception\NoSuchEntityException;

/**
 * Interface for saving pickup point to guest cart
 */
interface GuestSavePickupPointInterface
{
    /**
     * Save pickup point to guest cart
     *
     * @param string $cartId Masked cart ID
     * @param QuotePickupPointInterface $pickupPoint
     * @return bool
     * @throws LocalizedException
     * @throws NoSuchEntityException
     */
    public function save(string $cartId, array $pickupPoint = null): bool;
}
