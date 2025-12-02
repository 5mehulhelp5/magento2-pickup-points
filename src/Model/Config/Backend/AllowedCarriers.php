<?php
/**
 * Copyright (c) Falcon Media (info@falconmedia.nl)
 *
 * @author Falcon Media
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Config\Backend;

use Magento\Framework\App\Config\Value;

/**
 * Backend model for allowed carriers configuration
 * Converts carrier values to uppercase before saving
 */
class AllowedCarriers extends Value
{
    /**
     * Process data before save
     *
     * @return $this
     */
    public function beforeSave()
    {
        $value = $this->getValue();
        
        // Handle null or empty values
        if ($value === null || $value === '') {
            return parent::beforeSave();
        }
        
        // Magento multiselect fields are stored as comma-separated string
        // Convert to array, uppercase, and convert back to comma-separated string
        if (is_string($value)) {
            $carriers = array_filter(array_map('trim', explode(',', $value)));
            if (!empty($carriers)) {
                $carriers = array_map('strtoupper', $carriers);
                $this->setValue(implode(',', $carriers));
            } else {
                // Empty array after filtering, set to empty string
                $this->setValue('');
            }
        } elseif (is_array($value)) {
            // If somehow it's an array, convert to uppercase and then to comma-separated string
            $carriers = array_filter(array_map('trim', $value));
            if (!empty($carriers)) {
                $carriers = array_map('strtoupper', $carriers);
                $this->setValue(implode(',', $carriers));
            } else {
                // Empty array after filtering, set to empty string
                $this->setValue('');
            }
        }
        
        return parent::beforeSave();
    }
    
    /**
     * Process data after load
     * Ensure value is always a string (comma-separated) for multiselect fields
     *
     * @return $this
     */
    public function afterLoad()
    {
        $value = $this->getValue();
        
        // Ensure value is always a string, even if it's null or array
        if ($value === null || $value === false) {
            $this->setValue('');
        } elseif (is_array($value)) {
            // Convert array to comma-separated string, filter out null/empty values
            $filtered = array_filter($value, function($item) {
                return $item !== null && $item !== '' && $item !== false;
            });
            $this->setValue(implode(',', $filtered));
        } elseif (!is_string($value)) {
            // If it's not a string and not null/array, convert to string
            $this->setValue((string) $value);
        }
        
        return parent::afterLoad();
    }
}

