<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\ViewModel\Checkout;

use Innosend\PickupPoints\Helper\DayConverter;
use Magento\Framework\View\Element\Block\ArgumentInterface;

/**
 * ViewModel for processing opening hours
 */
class OpeningHours implements ArgumentInterface
{
    /**
     * @var DayConverter
     */
    private $dayConverter;

    /**
     * @param DayConverter $dayConverter
     */
    public function __construct(
        DayConverter $dayConverter
    ) {
        $this->dayConverter = $dayConverter;
    }

    /**
     * Process opening hours: sort by day (1-7) and merge multiple times per day
     *
     * @param array|null $rawOpeningHours
     * @return array
     */
    public function processOpeningHours(?array $rawOpeningHours): array
    {
        if (!is_array($rawOpeningHours) || empty($rawOpeningHours)) {
            return [];
        }

        // Group by day_of_week
        $groupedByDay = [];
        foreach ($rawOpeningHours as $hours) {
            if (!is_array($hours)) {
                continue;
            }

            $dayNumber = $hours['day_of_week'] ?? null;
            if ($dayNumber === null) {
                continue;
            }

            $opens = $hours['opens'] ?? '';
            $closes = $hours['closes'] ?? '';

            if (!isset($groupedByDay[$dayNumber])) {
                $groupedByDay[$dayNumber] = [];
            }

            $groupedByDay[$dayNumber][] = [
                'opens' => $opens,
                'closes' => $closes
            ];
        }

        // Sort by day number (1-7) and merge times per day
        $processedHours = [];
        for ($day = 1; $day <= 7; $day++) {
            if (!isset($groupedByDay[$day])) {
                continue;
            }

            $timesForDay = $groupedByDay[$day];
            $mergedTimes = [];

            foreach ($timesForDay as $time) {
                $opens = $time['opens'];
                $closes = $time['closes'];

                // Convert N/A values to "Closed"
                $opensNormalized = strtoupper(trim($opens));
                $closesNormalized = strtoupper(trim($closes));
                
                if ($opensNormalized === 'N/A' || $closesNormalized === 'N/A' || 
                    (empty($opens) && empty($closes))) {
                    $mergedTimes[] = __('Closed');
                } else {
                    $mergedTimes[] = $opens . ' - ' . $closes;
                }
            }

            // Join multiple times with " / "
            $mergedTimeString = implode(' / ', $mergedTimes);

            $processedHours[] = [
                'day_of_week' => $day,
                'day_name_short' => $this->dayConverter->getDayNameShort($day),
                'day_name_long' => $this->dayConverter->getDayNameLong($day),
                'hours' => $mergedTimeString
            ];
        }

        return $processedHours;
    }
}

