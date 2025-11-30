<?php
/**
 * @package     Innosend_PickupPoints
 * @author      Henk Valk (henk@falconmedia.nl)
 * @version     1.0.0
 * @date        2025-11-28
 *
 * Copyright (c) 2025 Falcon Media (www.falconmedia.nl)
 */

declare(strict_types=1);

namespace Innosend\PickupPoints\Model\Config\Source;

use Innosend\Base\Api\CarrierInterface;
use Magento\Framework\App\Cache\Type\Config as CacheTypeConfig;
use Magento\Framework\App\CacheInterface;
use Magento\Framework\Data\OptionSourceInterface;
use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Serialize\Serializer\Json;
use Psr\Log\LoggerInterface;

/**
 * Carriers source model - fetches carriers from Innosend API
 */
class Carriers implements OptionSourceInterface
{
    /**
     * Cache key for carriers
     */
    private const CACHE_KEY = 'innosend_carriers';
    
    /**
     * Cache lifetime (1 day)
     */
    private const CACHE_LIFETIME = 86400;

    /**
     * @var CarrierInterface
     */
    private $carrierApi;

    /**
     * @var CacheInterface
     */
    private $cache;

    /**
     * @var Json
     */
    private $json;

    /**
     * @var LoggerInterface
     */
    private $logger;

    /**
     * @param CarrierInterface $carrierApi
     * @param CacheInterface $cache
     * @param Json $json
     * @param LoggerInterface $logger
     */
    public function __construct(
        CarrierInterface $carrierApi,
        CacheInterface $cache,
        Json $json,
        LoggerInterface $logger
    ) {
        $this->carrierApi = $carrierApi;
        $this->cache = $cache;
        $this->json = $json;
        $this->logger = $logger;
    }

    /**
     * Return array of options as value-label pairs
     *
     * @return array
     */
    public function toOptionArray(): array
    {
        $options = [];
        
        try {
            $carriers = $this->getCarriers();
            
            $this->logger->info('Processing ' . count($carriers) . ' carriers for option array');
            
            foreach ($carriers as $carrier) {
                // Handle string carriers (simple array of names like ["PostNL", "DHL"])
                if (is_string($carrier)) {
                    $code = strtolower($carrier);
                    $name = $carrier;
                    $options[] = [
                        'value' => $code,
                        'label' => $name
                    ];
                    $this->logger->debug('Added string carrier: ' . $name . ' (code: ' . $code . ')');
                    continue;
                }
                
                if (!is_array($carrier)) {
                    $this->logger->warning('Carrier is not an array or string: ' . json_encode($carrier));
                    continue;
                }
                
                // Try different field names for code/id
                $code = $carrier['code'] ?? $carrier['id'] ?? $carrier['courier_code'] ?? $carrier['courier_id'] ?? '';
                
                // Try different field names for name/title
                $name = $carrier['name'] ?? $carrier['title'] ?? $carrier['courier_name'] ?? $carrier['label'] ?? $code;
                
                if (empty($code)) {
                    $this->logger->warning('Carrier missing code/id: ' . json_encode($carrier));
                    continue;
                }
                
                $options[] = [
                    'value' => (string) $code,
                    'label' => (string) $name
                ];
                
                $this->logger->debug('Added carrier object: ' . $name . ' (code: ' . $code . ')');
            }
            
            $this->logger->info('Created ' . count($options) . ' carrier options');
            
            if (empty($options)) {
                $this->logger->warning('No carrier options created - carriers array: ' . json_encode($carriers));
            }
        } catch (LocalizedException $e) {
            $this->logger->error('Error loading carriers: ' . $e->getMessage(), [
                'exception' => $e->getTraceAsString()
            ]);
            // Return empty array if API is not available
        } catch (\Exception $e) {
            $this->logger->error('Unexpected error loading carriers: ' . $e->getMessage(), [
                'exception' => $e->getTraceAsString()
            ]);
        }

        return $options;
    }

    /**
     * Get carriers from API with caching
     *
     * @return array
     * @throws LocalizedException
     */
    private function getCarriers(): array
    {
        // Try to get from cache first
        $cached = $this->cache->load(self::CACHE_KEY);
        if ($cached) {
            try {
                $carriers = $this->json->unserialize($cached);
                if (is_array($carriers) && !empty($carriers)) {
                    $this->logger->debug('Loaded ' . count($carriers) . ' carriers from cache');
                    return $carriers;
                }
            } catch (\Exception $e) {
                // Cache is corrupted, continue to fetch from API
                $this->logger->warning('Failed to unserialize cached carriers: ' . $e->getMessage());
            }
        }

        // Fetch from API
        try {
            $carriers = $this->carrierApi->getCarriers();
            $this->logger->info('Fetched ' . count($carriers) . ' carriers from API');

            // Store in cache
            if (!empty($carriers)) {
                try {
                    $this->cache->save(
                        $this->json->serialize($carriers),
                        self::CACHE_KEY,
                        [CacheTypeConfig::TYPE_IDENTIFIER],
                        self::CACHE_LIFETIME
                    );
                    $this->logger->debug('Cached ' . count($carriers) . ' carriers');
                } catch (\Exception $e) {
                    $this->logger->warning('Failed to cache carriers: ' . $e->getMessage());
                }
            } else {
                $this->logger->warning('No carriers returned from API');
            }
        } catch (LocalizedException $e) {
            $this->logger->error('Failed to fetch carriers from API: ' . $e->getMessage());
            throw $e;
        }

        return $carriers;
    }

    /**
     * Clear carriers cache
     *
     * @return void
     */
    public function clearCache(): void
    {
        $this->cache->remove(self::CACHE_KEY);
    }
}
