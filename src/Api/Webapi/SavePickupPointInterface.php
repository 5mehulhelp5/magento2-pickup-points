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
 * Interface for saving pickup point to customer cart
 */
interface SavePickupPointInterface
{
    /**
     * Save pickup point to cart
     *
     * @param string $cartId Cart ID (will be "mine" for logged-in customers)
     * @param QuotePickupPointInterface $pickupPoint
     * @return bool
     * @throws LocalizedException
     * @throws NoSuchEntityException
     */
    public function save(string $cartId, array $pickupPoint = null): bool;
}
