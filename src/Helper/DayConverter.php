<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Helper;

/**
 * Helper class for converting day numbers to day names
 */
class DayConverter
{
    /**
     * Day number to day name mapping (ISO 8601: Monday = 1, Sunday = 7)
     */
    private const DAY_MAP = [
        1 => 'Monday',
        2 => 'Tuesday',
        3 => 'Wednesday',
        4 => 'Thursday',
        5 => 'Friday',
        6 => 'Saturday',
        7 => 'Sunday',
    ];

    /**
     * Convert day number to day name (short format)
     *
     * @param int|string|null $dayNumber Day number (1-7, where 1 = Monday, 7 = Sunday)
     * @return string|null Translated day name in short format (e.g., "Mon", "Tue") or null if invalid
     */
    public function getDayNameShort($dayNumber): ?string
    {
        $dayNumber = $this->normalizeDayNumber($dayNumber);
        if ($dayNumber === null) {
            return null;
        }

        $dayName = self::DAY_MAP[$dayNumber] ?? null;
        if ($dayName === null) {
            return null;
        }

        // Return translation string for short day name
        // Translation will be handled by Magento's i18n system
        $phrase = __($dayName . ' (Short)');
        return $phrase instanceof \Magento\Framework\Phrase ? (string) $phrase : $phrase;
    }

    /**
     * Convert day number to day name (long format)
     *
     * @param int|string|null $dayNumber Day number (1-7, where 1 = Monday, 7 = Sunday)
     * @return string|null Translated day name in long format (e.g., "Monday", "Tuesday") or null if invalid
     */
    public function getDayNameLong($dayNumber): ?string
    {
        $dayNumber = $this->normalizeDayNumber($dayNumber);
        if ($dayNumber === null) {
            return null;
        }

        $dayName = self::DAY_MAP[$dayNumber] ?? null;
        if ($dayName === null) {
            return null;
        }

        // Return translation string for long day name
        $phrase = __($dayName);
        return $phrase instanceof \Magento\Framework\Phrase ? (string) $phrase : $phrase;
    }

    /**
     * Normalize day number to integer (1-7)
     *
     * @param int|string|null $dayNumber
     * @return int|null
     */
    private function normalizeDayNumber($dayNumber): ?int
    {
        if ($dayNumber === null || $dayNumber === '') {
            return null;
        }

        $dayNumber = (int) $dayNumber;
        if ($dayNumber < 1 || $dayNumber > 7) {
            return null;
        }

        return $dayNumber;
    }

    /**
     * Get all day names (for reference)
     *
     * @param bool $short If true, returns short format, otherwise long format
     * @return array Array of day names indexed by day number (1-7)
     */
    public function getAllDayNames(bool $short = false): array
    {
        $days = [];
        foreach (self::DAY_MAP as $number => $dayName) {
            $days[$number] = $short ? $this->getDayNameShort($number) : $this->getDayNameLong($number);
        }
        return $days;
    }
}

